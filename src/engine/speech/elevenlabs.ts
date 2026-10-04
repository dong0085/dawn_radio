import { TTS_STREAM_SAMPLE_RATE } from '../../../shared/api.ts'
import { apiFetch, ApiError, readNdjson } from '../../api'
import type { Line, Party } from '../../types'
import type { RadioAudio } from '../radioAudio'
import { lineText, wordsFromAlignment, type CharAlignment } from '../words'
import { playStream, StreamedClip } from './stream'
import type { FinishReason, Playback, PreparedSpeech, SpeechProvider } from './types'

export interface ElevenLabsOptions {
  /** API route (under /api) that holds the key and calls ElevenLabs. */
  endpoint?: string
  /** Speaking speed (ElevenLabs accepts about 0.7–1.2). */
  speed?: () => number
  /** Voice used when a party has none set. */
  fallbackVoiceId?: string
  /** Stream audio and start playing on the first chunk (default true). */
  stream?: boolean
  /** Seconds of audio to buffer before a streamed line can start. */
  preroll?: number
}

interface StreamChunk {
  audio_base64?: string
  alignment?: CharAlignment | null
}

const decodeBase64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))

interface TtsResponse {
  audio_base64: string
  alignment?: CharAlignment
  normalized_alignment?: CharAlignment
}

export class ElevenLabsSpeech implements SpeechProvider {
  readonly id = 'elevenlabs' as const
  private cache = new Map<string, Promise<{ buffer: AudioBuffer; data: TtsResponse }>>()
  /** Streamed lines, kept for replays and lines that come back after a cut-in. */
  private clips = new Map<string, { clip: StreamedClip; ready: Promise<void> }>()
  private audio: RadioAudio
  private opts: ElevenLabsOptions

  constructor(audio: RadioAudio, options: ElevenLabsOptions = {}) {
    this.audio = audio
    this.opts = options
  }

  async prepare(line: Line, party: Party | undefined, lang: string): Promise<PreparedSpeech> {
    const text = lineText(line.segments)
    const voiceId = party?.voice.elevenLabsVoiceId ?? this.opts.fallbackVoiceId ?? 'JBFqnCBsd6RMkjVDRZzb'
    const speed = this.opts.speed?.() ?? 1
    const key = `${voiceId}|${speed}|${line.delivery ?? ''}|${text}`

    if (this.opts.stream !== false) return this.prepareStream(key, line, voiceId, lang, speed)

    let pending = this.cache.get(key)
    if (!pending) {
      pending = this.fetchAudio(text, voiceId, lang, speed, line)
      this.cache.set(key, pending)
      pending.catch(() => this.cache.delete(key))
    }
    const { buffer, data } = await pending
    const alignment = data.alignment ?? data.normalized_alignment
    const words = alignment ? wordsFromAlignment(line.segments, alignment) : []

    return {
      engine: 'elevenlabs',
      words,
      duration: buffer.duration,
      filtered: true,
      play: () => playBuffer(this.audio, buffer),
    }
  }

  private async prepareStream(key: string, line: Line, voiceId: string, lang: string, speed: number): Promise<PreparedSpeech> {
    let entry = this.clips.get(key)
    if (!entry) {
      entry = this.startStream(line, voiceId, lang, speed)
      this.clips.set(key, entry)
      entry.ready.catch(() => this.clips.delete(key))
    }
    const { clip, ready } = entry
    await ready
    const audio = this.audio
    return {
      engine: 'elevenlabs',
      words: clip.words,
      get duration() {
        return clip.duration
      },
      filtered: true,
      play: () => playStream(audio, clip),
    }
  }

  /** Opens the voice stream; `ready` resolves once enough audio has arrived to start. */
  private startStream(line: Line, voiceId: string, lang: string, speed: number) {
    const clip = new StreamedClip(line.segments, TTS_STREAM_SAMPLE_RATE)
    const preroll = this.opts.preroll ?? 0.3
    const ready = new Promise<void>((resolve, reject) => {
      const off = clip.onChange(() => {
        if (clip.duration < preroll && !clip.done) return
        off()
        if (clip.samples) resolve()
        else reject(new ApiError(502, 'No audio received'))
      })
    })

    void (async () => {
      try {
        const res = await apiFetch(`${this.opts.endpoint ?? '/tts'}/stream`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(this.body(line, voiceId, lang, speed)),
        })
        await readNdjson<StreamChunk>(res, (chunk) => {
          if (chunk.alignment) clip.pushAlignment(chunk.alignment)
          if (chunk.audio_base64) clip.pushPcm(decodeBase64(chunk.audio_base64))
        })
        clip.finish()
      } catch (err) {
        console.warn('[elevenlabs] stream failed', err)
        clip.finish(true)
      }
    })()
    return { clip, ready }
  }

  private body(line: Line, voiceId: string, lang: string, speed: number) {
    return { text: lineText(line.segments), voiceId, languageCode: lang.split('-')[0], speed, delivery: line.delivery }
  }

  private async fetchAudio(text: string, voiceId: string, lang: string, speed: number, line?: Line) {
    const res = await apiFetch(this.opts.endpoint ?? '/tts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(line ? this.body(line, voiceId, lang, speed) : { text, voiceId, languageCode: lang.split('-')[0], speed }),
    })
    const data = (await res.json()) as TtsResponse
    const bytes = Uint8Array.from(atob(data.audio_base64), (c) => c.charCodeAt(0))
    const buffer = await this.audio.context.decodeAudioData(bytes.buffer)
    return { buffer, data }
  }
}

function playBuffer(audio: RadioAudio, buffer: AudioBuffer): Playback {
  const ctx = audio.context
  let offset = 0
  let startedAt = 0
  let source: AudioBufferSourceNode | null = null
  let paused = false
  let finish!: (r: FinishReason) => void
  let done = false
  const finished = new Promise<FinishReason>((r) => (finish = r))
  const end = (r: FinishReason) => {
    if (done) return
    done = true
    finish(r)
  }

  const start = () => {
    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.connect(audio.input)
    src.onended = () => {
      if (src === source && !paused) end('ended')
    }
    startedAt = ctx.currentTime - offset
    src.start(0, offset)
    source = src
  }

  const position = () => (paused || !source ? offset : Math.min(buffer.duration, ctx.currentTime - startedAt))

  start()

  return {
    position,
    pause() {
      if (paused || done) return
      offset = position()
      paused = true
      const s = source
      source = null
      s?.stop()
    },
    resume() {
      if (!paused || done) return
      paused = false
      start()
    },
    stop() {
      paused = true
      const s = source
      source = null
      s?.stop()
      end('stopped')
    },
    finished,
  }
}
