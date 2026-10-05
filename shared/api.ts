/** Request and response shapes for the /api routes, shared by browser and server. */

import type { Outcome, StoryBible } from './stories.ts'

export interface ApiConfig {
  /** Claude is set up, so the AI can write the story. */
  dialogue: boolean
  /** ElevenLabs voices are set up. */
  tts: boolean
  /** ElevenLabs speech-to-text is set up. */
  stt: boolean
  /** DeepL translation is set up. */
  translate: boolean
  /** New channels can be made from a briefing (needs Claude). */
  channels: boolean
}

export interface StoryMemory {
  /** Short story-so-far covering everything that happened. */
  summary: string
  /** Things that must stay true (injuries, places, decisions, promises). */
  facts: string[]
}

export interface HistoryLine {
  /** Party id, or "player". */
  speaker: string
  text: string
  /** The player cut this line off mid-sentence. */
  interrupted?: boolean
}

/** Text in the target language with its translation. */
export interface Bilingual {
  text: string
  translation: string
}

export type LogTone = 'active' | 'ok' | 'warn' | 'alert' | 'done'

/** Same shape as the app's LogUpdate: changes to the field log, applied when a line starts playing. */
export interface DialogueLogUpdate {
  objective?: Bilingual & { done?: boolean }
  /** New entries need section + label; later updates merge by id. */
  entries?: { id: string; section?: string; label?: Bilingual; state?: Bilingual; tone?: LogTone }[]
  remove?: string[]
  event?: Bilingual
}

/** The field log as it stands, sent so the writers reuse entry ids. */
export interface LogSnapshot {
  objective?: string
  entries: { id: string; section: string; label: string; state?: string }[]
}

export interface DialogueRequest {
  /** A built-in story (shared/stories.ts)… */
  storyId?: string
  /** …or a channel made by /api/channel, with the server's signature. */
  channel?: { bible: StoryBible; sig: string }
  /** 0 for the opening batch. */
  batchIndex: number
  memory: StoryMemory
  /** Most recent lines, oldest first. */
  history: HistoryLine[]
  /** Set when this batch answers the player. */
  playerMessage?: string
  log?: LogSnapshot
}

export interface DialogueSegment {
  text: string
  translation: string
}

export interface DialogueLine {
  speaker: string
  /** How to perform the line (e.g. "urgent"), sent to the voice as a [tag]. */
  delivery?: string
  /** Radio signal quality of this transmission. */
  signal?: 'strong' | 'fair' | 'weak'
  segments: DialogueSegment[]
  log?: DialogueLogUpdate
}

/** /api/dialogue streams these, one JSON object per line of text. */
export type DialogueEvent =
  | { type: 'line'; line: DialogueLine }
  | DialogueDone
  | { type: 'error'; error: string; status: number }

export interface DialogueDone {
  type: 'done'
  memory: StoryMemory
  player?: { target: string; native: string }
  ending?: { outcome: Outcome; title: string; summary: string }
}

export interface DialogueResponse {
  lines: DialogueLine[]
  memory: StoryMemory
  /** The player's message in the target language and in their own language. */
  player?: { target: string; native: string }
  ending?: { outcome: Outcome; title: string; summary: string }
}

export interface TranslateResponse {
  translations: { text: string; detected?: string }[]
}

export interface SttResponse {
  text: string
  languageCode?: string
}

/** Sample rate of streamed voice audio (16-bit mono PCM). */
export const TTS_STREAM_SAMPLE_RATE = 24000

/** Server-side limits (the server enforces them; the client trims to match). */
export const LIMITS = {
  historyLines: 30,
  lineChars: 400,
  playerChars: 500,
  summaryChars: 1500,
  facts: 14,
  factChars: 200,
  ttsChars: 600,
  sttBytes: 6 * 1024 * 1024,
  logEntries: 40,
}
