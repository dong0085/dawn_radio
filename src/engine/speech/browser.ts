import type { Line, Party, TimedWord } from '../../types'
import { estimateWords, wordIndexAt } from '../words'
import type { FinishReason, Playback, PreparedSpeech, SpeechProvider } from './types'

export interface BrowserSpeechOptions {
  rate?: () => number
  volume?: () => number
  /** Characters per second at rate 1, used to guess word timings. */
  charsPerSecond?: number
}

/** Free fallback voice using the browser's built-in speech. No radio filter is possible. */
export class BrowserSpeech implements SpeechProvider {
  readonly id = 'browser' as const
  private voices: SpeechSynthesisVoice[] = []
  private opts: BrowserSpeechOptions

  constructor(options: BrowserSpeechOptions = {}) {
    this.opts = options
    if (!BrowserSpeech.supported()) return
    const load = () => (this.voices = speechSynthesis.getVoices())
    load()
    speechSynthesis.addEventListener?.('voiceschanged', load)
  }

  static supported() {
    return typeof window !== 'undefined' && 'speechSynthesis' in window
  }

  unlock() {
    if (!BrowserSpeech.supported()) return
    const u = new SpeechSynthesisUtterance(' ')
    u.volume = 0
    speechSynthesis.speak(u)
  }

  async prepare(line: Line, party: Party | undefined, lang: string): Promise<PreparedSpeech> {
    const rate = this.opts.rate?.() ?? 1
    const words = estimateWords(line.segments, { charsPerSecond: (this.opts.charsPerSecond ?? 13) * rate })
    const duration = words[words.length - 1]?.end ?? 0
    const voice = this.pickVoice(party, lang)
    return {
      engine: 'browser',
      words,
      duration,
      filtered: false,
      play: () =>
        speak(words, duration, {
          lang,
          voice,
          rate,
          pitch: party?.voice.browserPitch ?? 1,
          volume: this.opts.volume?.() ?? 1,
        }),
    }
  }

  private pickVoice(party: Party | undefined, lang: string) {
    const base = lang.split('-')[0].toLowerCase()
    const matching = this.voices.filter((v) => v.lang.toLowerCase().startsWith(base))
    for (const name of party?.voice.browserVoiceNames ?? []) {
      const v = matching.find((m) => m.name.includes(name))
      if (v) return v
    }
    // Give the two sides different voices when possible.
    const idx = party?.side === 'right' ? 1 : 0
    return matching[idx % Math.max(1, matching.length)]
  }
}

interface SpeakOptions {
  lang: string
  voice?: SpeechSynthesisVoice
  rate: number
  pitch: number
  volume: number
}

function speak(words: TimedWord[], duration: number, o: SpeakOptions): Playback {
  let paused = false
  let done = false
  let pausedAt = 0
  let anchorPos = 0
  let anchorAt = performance.now()
  let token = 0
  let finish!: (r: FinishReason) => void
  const finished = new Promise<FinishReason>((r) => (finish = r))
  let safety: ReturnType<typeof setTimeout> | undefined

  const end = (r: FinishReason) => {
    if (done) return
    done = true
    clearTimeout(safety)
    finish(r)
  }

  const position = () =>
    paused ? pausedAt : Math.min(duration, anchorPos + (performance.now() - anchorAt) / 1000)

  const speakFrom = (first: number) => {
    const my = ++token
    const slice = words.slice(first)
    const offsets: number[] = []
    let text = ''
    for (const w of slice) {
      if (text) text += ' '
      offsets.push(text.length)
      text += w.text
    }

    const u = new SpeechSynthesisUtterance(text)
    u.lang = o.lang
    if (o.voice) u.voice = o.voice
    u.rate = o.rate
    u.pitch = o.pitch
    u.volume = o.volume
    u.onboundary = (e) => {
      if (my !== token || e.name !== 'word') return
      let i = 0
      while (i + 1 < offsets.length && offsets[i + 1] <= e.charIndex) i++
      anchorPos = words[first + i].start
      anchorAt = performance.now()
    }
    u.onend = () => {
      if (my === token && !paused) end('ended')
    }
    u.onerror = (e) => {
      if (my !== token || e.error === 'interrupted' || e.error === 'canceled') return
      end('ended')
    }

    anchorPos = words[first]?.start ?? 0
    anchorAt = performance.now()
    clearTimeout(safety)
    // Some browsers never fire onend; don't let the conversation stall.
    safety = setTimeout(() => !paused && end('ended'), ((duration - anchorPos) * 2.5 + 3) * 1000)
    if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel()
    speechSynthesis.speak(u)
  }

  if (BrowserSpeech.supported() && words.length) speakFrom(0)
  else setTimeout(() => end('ended'), duration * 1000)

  return {
    position,
    pause() {
      if (paused || done) return
      pausedAt = position()
      paused = true
      token++
      clearTimeout(safety)
      speechSynthesis.cancel()
    },
    resume() {
      if (!paused || done) return
      paused = false
      speakFrom(Math.max(0, wordIndexAt(words, pausedAt)))
    },
    stop() {
      paused = true
      token++
      speechSynthesis.cancel()
      end('stopped')
    },
    finished,
  }
}
