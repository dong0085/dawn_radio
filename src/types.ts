import type { AmbienceSpec } from './engine/ambience'
import type { LinePause } from '../shared/api.ts'
/** The player is always the third participant on the channel. */
export const PLAYER_ID = 'player'

export type Side = 'left' | 'right'

export interface PartyVoice {
  /** ElevenLabs voice id. */
  elevenLabsVoiceId?: string
  /** Browser voice: preferred voice names, matched by substring, in order. */
  browserVoiceNames?: string[]
  /** Browser voice pitch (0–2). */
  browserPitch?: number
}

export interface Party {
  id: string
  /** Operational role shown on the radio, e.g. "Rescue Team". */
  name: string
  side: Side
  /** Light and label color. Any CSS color. */
  color: string
  voice: PartyVoice
  /** How this side sounds on the channel. */
  radio?: PartyRadio
}

export interface PartyRadio {
  /** Background sound at their end, heard through their radio. */
  ambience?: AmbienceSpec
  /** Usual signal strength, 0 (barely there) to 1 (clear). A line can override it. */
  signal?: number
}

export interface PlayerConfig {
  name: string
  /** Transmit light color. Any CSS color. */
  color: string
}

/** One sentence (or phrase) with its translation. */
export interface Segment {
  text: string
  translation: string
  /** The text as the voice performs it, with pause tags like [pause]. Defaults to text. */
  spoken?: string
}

export interface Line {
  id: string
  speaker: string
  segments: Segment[]
  /** How the line is performed, e.g. "urgent". Sent to the voice as a [tag], never shown. */
  delivery?: string
  /** Signal strength for this transmission, 0–1 (defaults to the party's). */
  signal?: number
  /** Silence before this transmission: "quick" answers at once, "long" keeps the channel quiet for a while. */
  pause?: LinePause
  /** Changes to the log, applied when this line starts playing. */
  log?: LogUpdate
}

// ---- Log: what has happened and what is going on now ----

/** How an entry's state reads at a glance. */
export type LogTone = 'active' | 'ok' | 'warn' | 'alert' | 'done'

/** One tracked thing: a person, place, item, hazard… */
export interface LogEntry {
  id: string
  /** Id of the LogSection this entry is listed under. */
  section: string
  label: Segment
  /** Current state, e.g. "Disparu" / "Missing". */
  state?: Segment
  tone?: LogTone
  /** Dot color, e.g. a party color. Any CSS color. */
  color?: string
  /** Log version when this entry last changed. */
  rev: number
}

export type LogEntryUpdate = Partial<Omit<LogEntry, 'rev'>> & { id: string }

export interface LogObjective extends Segment {
  done?: boolean
}

export interface LogEvent {
  id: string
  text: Segment
  /** Seconds since the session started. */
  at: number
  /** Line that caused this event, to find it in the transcript. */
  lineId?: string
}

export interface LogUpdate {
  objective?: LogObjective
  /** New entries, or changes merged into the entry with the same id. */
  entries?: LogEntryUpdate[]
  /** Ids of entries to drop. */
  remove?: string[]
  /** A key moment, added to the timeline. */
  event?: Segment
}

export interface LogState {
  objective: LogObjective | null
  entries: LogEntry[]
  events: LogEvent[]
  /** Goes up by one with every update. */
  version: number
}

export interface LogSection {
  id: string
  title: string
  /** list: rows with a state · route: places in order, as a path. */
  layout?: 'list' | 'route'
}

/** Labels and layout of the log panel. All text is shown to the player. */
export interface LogConfig {
  title: string
  nowTab?: string
  timelineTab?: string
  objectiveTitle?: string
  sections: LogSection[]
  /** Shown in a section with no entries yet. */
  emptySection?: string
  emptyTimeline?: string
  /** Tag on entries that changed since the panel was last opened. */
  newLabel?: string
  /** Flashed on the main screen when the log changes. */
  updatedNotice?: string
  /** Key that shows or hides the translations. */
  translationLabel?: string
  closeLabel?: string
  /** State of the log when the channel opens. */
  initial?: LogUpdate
}

export type Outcome = 'success' | 'failure' | 'other'

export interface ScenarioEnding {
  outcome: Outcome
  title: string
  summary: string
}

export interface Scenario {
  id: string
  incident: string
  title: string
  channel: string
  frequency: string
  /** BCP-47 tag of the language being learned, e.g. "fr-FR". */
  targetLang: string
  /** BCP-47 tag of the player's familiar language, e.g. "en-US". */
  nativeLang: string
  premise: string
  parties: [Party, Party]
  player: PlayerConfig
  /** Tracks people, places and events as they come up. Leave out to hide the log. */
  log?: LogConfig
  /** Key the progress is saved under (defaults to id), so each language keeps its own. */
  session?: string
}

/** A word with its timing inside a line's audio, in seconds. */
export interface TimedWord {
  text: string
  start: number
  end: number
  /** Index of the segment this word belongs to. */
  segment: number
}

export interface TranscriptEntry {
  id: string
  speaker: string
  segments: Segment[]
  /** Seconds since the session started. */
  at: number
  /** True when the line was cut off by the player transmitting. */
  interrupted?: boolean
  /** Player lines: the message as natural target-language speech. */
  rendering?: string
}
