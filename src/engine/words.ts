import type { Segment, TimedWord } from '../types'

/** Character timing as returned by ElevenLabs `/with-timestamps`. */
export interface CharAlignment {
  characters: string[]
  character_start_times_seconds: number[]
  character_end_times_seconds: number[]
}

export const lineText = (segments: Segment[]) => segments.map((s) => s.text).join(' ')

/** Lone punctuation like the French " ?" joins the word before it. */
const isLonePunct = (t: string) => /^[?!:;»…]+$/.test(t)

export function tokenize(segments: Segment[]) {
  const out: { text: string; segment: number }[] = []
  segments.forEach((s, segment) => {
    for (const text of s.text.split(/\s+/).filter(Boolean)) {
      const prev = out[out.length - 1]
      if (prev && prev.segment === segment && isLonePunct(text)) prev.text += '\u00a0' + text
      else out.push({ text, segment })
    }
  })
  return out
}

export interface EstimateOptions {
  /** Speaking speed in characters per second. */
  charsPerSecond?: number
  /** Extra pause after a sentence end, in seconds. */
  sentencePause?: number
  /** Extra pause after a comma, in seconds. */
  commaPause?: number
}

/** Guess word timings from text length. Used when the voice gives no timing data. */
export function estimateWords(segments: Segment[], options: EstimateOptions = {}): TimedWord[] {
  const { charsPerSecond = 13, sentencePause = 0.3, commaPause = 0.12 } = options
  let t = 0
  return tokenize(segments).map((w) => {
    const start = t
    const end = start + (w.text.length + 1) / charsPerSecond
    t = end
    if (/[.!?…]$/.test(w.text)) t += sentencePause
    else if (/[,;:]$/.test(w.text)) t += commaPause
    return { ...w, start, end }
  })
}

/** Turn per-character timing into per-word timing. */
export function wordsFromAlignment(segments: Segment[], alignment: CharAlignment): TimedWord[] {
  const tokens = tokenize(segments)
  const { characters: chars, character_start_times_seconds: starts, character_end_times_seconds: ends } = alignment

  const spans: [number, number][] = []
  let open = -1
  for (let i = 0; i <= chars.length; i++) {
    const isSpace = i === chars.length || /\s/.test(chars[i])
    if (!isSpace && open < 0) open = i
    if (isSpace && open >= 0) {
      const text = chars.slice(open, i).join('')
      // Same merge rule as tokenize(), so counts line up.
      if (spans.length && isLonePunct(text)) spans[spans.length - 1][1] = ends[i - 1]
      else spans.push([starts[open], ends[i - 1]])
      open = -1
    }
  }

  if (spans.length === tokens.length) {
    return tokens.map((w, i) => ({ ...w, start: spans[i][0], end: spans[i][1] }))
  }

  // Word counts differ (text normalization). Stretch an estimate over the real duration.
  const total = ends[ends.length - 1] ?? 0
  return scaleTo(estimateWords(segments), total)
}

export function scaleTo(words: TimedWord[], duration: number): TimedWord[] {
  const last = words[words.length - 1]?.end ?? 0
  if (!last || !duration) return words
  const k = duration / last
  return words.map((w) => ({ ...w, start: w.start * k, end: w.end * k }))
}

/** Index of the word being spoken at time t (seconds), or -1 before the first word. */
export function wordIndexAt(words: TimedWord[], t: number) {
  let idx = -1
  for (let i = 0; i < words.length; i++) {
    if (words[i].start <= t) idx = i
    else break
  }
  return idx
}

export interface Page {
  /** Segment indexes shown on this page. */
  segments: number[]
}

/**
 * Group segments into screen pages so long lines fit the subtitle panel.
 * A page holds as many whole segments as fit in maxChars (at least one).
 */
export function paginate(segments: Segment[], maxChars: number): Page[] {
  const pages: Page[] = []
  let current: number[] = []
  let length = 0
  segments.forEach((s, i) => {
    const add = s.text.length + (current.length ? 1 : 0)
    if (current.length && length + add > maxChars) {
      pages.push({ segments: current })
      current = []
      length = 0
    }
    current.push(i)
    length += s.text.length + (current.length > 1 ? 1 : 0)
  })
  if (current.length) pages.push({ segments: current })
  return pages
}
