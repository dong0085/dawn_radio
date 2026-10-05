import type { Segment, TimedWord } from '../../types'
import type { RadioAudio } from '../radioAudio'
import { estimateWords, scaleTo, spansFromChars, tokenize, type CharAlignment } from '../words'
import { TimeStretch } from './stretch'
import type { FinishReason, Playback } from './types'

/**
 * Audio and word timings for one line, filled in as the voice stream arrives.
 * Kept after it finishes, so replays cost nothing.
 */
export class StreamedClip {
  readonly sampleRate: number
  /** Decoded audio, in arrival order. */
  readonly chunks: Float32Array<ArrayBuffer>[] = []
  /** Total samples received so far. */
  samples = 0
  done = false
  failed = false
  /** Word list is fixed up front (from the text); timings fill in as they arrive. */
  readonly words: TimedWord[]

  private chars: string[] = []
  private starts: number[] = []
  private ends: number[] = []
  private leftover: number | null = null
  private listeners = new Set<() => void>()
  private segments: Segment[]

  constructor(segments: Segment[], sampleRate: number) {
    this.segments = segments
    this.sampleRate = sampleRate
    this.words = tokenize(segments).map((w) => ({ ...w, start: Infinity, end: Infinity }))
  }

  /** Seconds of audio received so far. */
  get duration() {
    return this.samples / this.sampleRate
  }

  /** Add 16-bit little-endian PCM bytes. */
  pushPcm(bytes: Uint8Array) {
    let data = bytes
    // A sample can be split across chunks; carry the odd byte over.
    if (this.leftover !== null) {
      data = new Uint8Array(bytes.length + 1)
      data[0] = this.leftover
      data.set(bytes, 1)
      this.leftover = null
    }
    if (data.length % 2) {
      this.leftover = data[data.length - 1]
      data = data.subarray(0, data.length - 1)
    }
    if (!data.length) return
    const view = new DataView(data.buffer, data.byteOffset, data.length)
    const out = new Float32Array(data.length / 2)
    for (let i = 0; i < out.length; i++) out[i] = view.getInt16(i * 2, true) / 32768
    this.chunks.push(out)
    this.samples += out.length
    this.emit()
  }

  /** Add character timings (absolute seconds from the start of the line). */
  pushAlignment(a: CharAlignment) {
    this.chars.push(...a.characters)
    this.starts.push(...a.character_start_times_seconds)
    this.ends.push(...a.character_end_times_seconds)
    this.updateWords(false)
  }

  finish(failed = false) {
    this.done = true
    this.failed = failed
    this.updateWords(true)
    this.emit()
  }

  onChange(fn: () => void) {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private emit() {
    this.listeners.forEach((fn) => fn())
  }

  private updateWords(final: boolean) {
    const spans = spansFromChars(this.chars, this.starts, this.ends, final)
    if (final && spans.length !== this.words.length) {
      // Word counts differ (text normalization): stretch an estimate over the real audio.
      scaleTo(estimateWords(this.segments), this.duration).forEach((w, i) => Object.assign(this.words[i], w))
      return
    }
    spans.slice(0, this.words.length).forEach(([start, end], i) => {
      this.words[i].start = start
      this.words[i].end = end
    })
  }
}

/**
 * Plays a clip through the radio, starting before it has fully arrived.
 * `speed` is read at each start and resume; positions stay in seconds of the original clip.
 */
export function playStream(audio: RadioAudio, clip: StreamedClip, speed: () => number = () => 1): Playback {
  const ctx = audio.context
  const rate = clip.sampleRate
  let stretch = new TimeStretch(1, rate)
  let flushed = false
  /** Seconds of the clip played before the current run started (after a resume). */
  let base = 0
  /** Context time at which `base` plays. */
  let startedAt = 0
  /** Next chunk to schedule, and the offset (in samples) into it. */
  let next = 0
  let nextOffset = 0
  /** Context time where the next chunk should start. */
  let nextTime = 0
  /** Seconds of the clip scheduled so far. */
  let scheduledTo = 0
  let sources: AudioBufferSourceNode[] = []
  let paused = false
  let done = false
  let unsubscribe = () => {}
  let endTimer: ReturnType<typeof setTimeout> | undefined
  let finish!: (r: FinishReason) => void
  const finished = new Promise<FinishReason>((r) => (finish = r))

  const end = (r: FinishReason) => {
    if (done) return
    done = true
    clearTimeout(endTimer)
    unsubscribe()
    finish(r)
  }

  const position = () =>
    paused ? base : Math.max(base, Math.min(scheduledTo, base + (ctx.currentTime - startedAt) * stretch.rate))

  const play = (data: Float32Array) => {
    if (!data.length) return
    // The stream fell behind playback: leave a short gap and shift the clock with it.
    const earliest = ctx.currentTime + 0.03
    if (nextTime < earliest) {
      startedAt += earliest - nextTime
      nextTime = earliest
    }
    const buffer = ctx.createBuffer(1, data.length, rate)
    buffer.copyToChannel(data as Float32Array<ArrayBuffer>, 0)
    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.connect(audio.input)
    src.start(nextTime)
    sources.push(src)
    nextTime += buffer.duration
    scheduledTo += buffer.duration * stretch.rate
  }

  const schedule = () => {
    if (paused || done) return
    while (next < clip.chunks.length) {
      const chunk = clip.chunks[next]
      play(stretch.push(nextOffset ? chunk.subarray(nextOffset) : chunk))
      next++
      nextOffset = 0
    }
    if (clip.done && !flushed) {
      flushed = true
      play(stretch.flush())
    }
    if (clip.done) {
      clearTimeout(endTimer)
      endTimer = setTimeout(() => !paused && end('ended'), Math.max(0, (nextTime - ctx.currentTime) * 1000) + 30)
    }
  }

  const run = (from: number) => {
    base = from
    scheduledTo = from
    // Find the chunk that contains `from`.
    let sample = Math.round(from * rate)
    next = 0
    while (next < clip.chunks.length && sample >= clip.chunks[next].length) {
      sample -= clip.chunks[next].length
      next++
    }
    nextOffset = sample
    stretch = new TimeStretch(speed(), rate)
    flushed = false
    startedAt = ctx.currentTime + 0.03
    nextTime = startedAt
    schedule()
  }

  const stopSources = () => {
    for (const s of sources) {
      try {
        s.stop()
      } catch {
        /* not started */
      }
    }
    sources = []
  }

  unsubscribe = clip.onChange(schedule)
  run(0)

  return {
    position,
    pause() {
      if (paused || done) return
      base = position()
      paused = true
      clearTimeout(endTimer)
      stopSources()
    },
    resume() {
      if (!paused || done) return
      paused = false
      run(base)
    },
    stop() {
      paused = true
      stopSources()
      end('stopped')
    },
    finished,
  }
}
