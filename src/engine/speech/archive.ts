import { apiFetch } from '../../api'
import { PLAYER_ID, type Line, type Party } from '../../types'
import type { RadioAudio } from '../radioAudio'
import { estimateWords, scaleTo } from '../words'
import { playBuffer } from './elevenlabs'
import type { FinishReason, Playback, PreparedSpeech, SpeechProvider } from './types'

export interface ArchiveSpeechOptions {
  /** A saved recording to play from; without it, the server's copies from the last day. */
  recording?: string
  /** Speaking speed, as for live lines. */
  speed?: () => number
}

/**
 * Plays lines again from the audio the server recorded when they first aired, so a replay
 * sounds the same and costs no new voice request. The player's own lines (no audio is kept)
 * play as a transmission of the same length between the push-to-talk beeps.
 */
export class ArchiveSpeech implements SpeechProvider {
  readonly id = 'elevenlabs' as const
  private audio: RadioAudio
  private opts: ArchiveSpeechOptions
  private buffers = new Map<string, Promise<AudioBuffer>>()

  constructor(audio: RadioAudio, options: ArchiveSpeechOptions = {}) {
    this.audio = audio
    this.opts = options
  }

  /** True when this provider can play the line. */
  handles(line: Line) {
    return !!line.audio || (line.speaker === PLAYER_ID && line.duration !== undefined)
  }

  async prepare(line: Line, _party: Party | undefined, _lang: string): Promise<PreparedSpeech> {
    if (line.speaker === PLAYER_ID) return this.silentTransmission(line)
    const full = await this.load(line.audio!)
    const buffer = line.cutAt !== undefined && line.cutAt < full.duration ? trim(this.audio.context, full, line.cutAt) : full
    return {
      engine: 'elevenlabs',
      words: scaleTo(estimateWords(line.segments), full.duration),
      duration: buffer.duration,
      filtered: true,
      archiveKey: line.audio,
      play: () => playBuffer(this.audio, buffer, this.opts.speed?.() ?? 1),
    }
  }

  private load(key: string) {
    let pending = this.buffers.get(key)
    if (!pending) {
      const query = this.opts.recording ? `?recording=${encodeURIComponent(this.opts.recording)}` : ''
      pending = apiFetch(`/audio/${key}${query}`)
        .then((res) => res.arrayBuffer())
        .then((bytes) => this.audio.context.decodeAudioData(bytes))
      this.buffers.set(key, pending)
      pending.catch(() => this.buffers.delete(key))
    }
    return pending
  }

  private silentTransmission(line: Line): PreparedSpeech {
    const estimate = estimateWords(line.segments)
    const duration = Math.min(30, Math.max(1, line.duration ?? estimate[estimate.length - 1]?.end ?? 2))
    const audio = this.audio
    return {
      engine: 'browser',
      words: scaleTo(estimate, duration),
      duration,
      filtered: false,
      play: () => {
        audio.beep('tx-start')
        const playback = timed(duration)
        void playback.finished.then((r) => r === 'ended' && audio.beep('tx-end'))
        return playback
      },
    }
  }
}

/** The first `seconds` of a buffer. */
function trim(ctx: BaseAudioContext, buffer: AudioBuffer, seconds: number) {
  const length = Math.max(1, Math.floor(seconds * buffer.sampleRate))
  const out = ctx.createBuffer(1, length, buffer.sampleRate)
  out.copyToChannel(buffer.getChannelData(0).subarray(0, length), 0)
  return out
}

/** A playback with no sound that lasts `duration` seconds. */
function timed(duration: number): Playback {
  let offset = 0
  let startedAt = performance.now()
  let paused = false
  let done = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let finish!: (r: FinishReason) => void
  const finished = new Promise<FinishReason>((r) => (finish = r))
  const end = (r: FinishReason) => {
    if (done) return
    done = true
    clearTimeout(timer)
    finish(r)
  }
  const position = () => (paused ? offset : Math.min(duration, offset + (performance.now() - startedAt) / 1000))
  const run = () => {
    startedAt = performance.now()
    timer = setTimeout(() => end('ended'), (duration - offset) * 1000)
  }
  run()
  return {
    position,
    pause() {
      if (paused || done) return
      offset = position()
      paused = true
      clearTimeout(timer)
    },
    resume() {
      if (!paused || done) return
      paused = false
      run()
    },
    stop() {
      paused = true
      end('stopped')
    },
    finished,
  }
}
