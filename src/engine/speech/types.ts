import type { Line, Party, TimedWord } from '../../types'

export type SpeechEngine = 'elevenlabs' | 'browser'

export type FinishReason = 'ended' | 'stopped'

export interface Playback {
  /** Seconds into the line. */
  position(): number
  pause(): void
  resume(): void
  stop(): void
  finished: Promise<FinishReason>
}

export interface PreparedSpeech {
  engine: SpeechEngine
  words: TimedWord[]
  /** Seconds. */
  duration: number
  /** True when the audio goes through the radio filter (and drives the waveform). */
  filtered: boolean
  /** Name of the server's recorded copy, when it kept one. */
  archiveKey?: string
  play(): Playback
}

export interface SpeechProvider {
  id: SpeechEngine
  prepare(line: Line, party: Party | undefined, lang: string): Promise<PreparedSpeech>
  /** Called from a user gesture so the browser allows audio later. */
  unlock?(): void
}
