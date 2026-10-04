import type { Line, LogState, ScenarioEnding, TranscriptEntry } from '../../types'

export interface BatchRequest {
  /** Everything said so far, including the player's lines. */
  history: TranscriptEntry[]
  /** Lines already queued that will air before this batch. */
  upcoming?: Line[]
  /** Set when this batch answers a player transmission. */
  playerMessage?: string
  /** The field log as it stands. */
  log?: LogState
}

export interface Batch {
  lines: Line[]
  /** Set when the story is over after these lines. */
  ending?: ScenarioEnding
  /** The player's last message in the target language and in their own language. */
  player?: { target: string; native: string }
}

/** Where the dialogue comes from: a fixed script or the AI writers. */
export interface NextOptions {
  /** Called as each line becomes available, before the whole batch is done. */
  onLine?: (line: Line) => void
  /** Aborted when the player cuts in and the batch is no longer wanted. */
  signal?: AbortSignal
}

export interface LineSource {
  /** Resolves with every line of the batch (including any already passed to onLine). */
  next(request: BatchRequest, options?: NextOptions): Promise<Batch>
  /** Lines that were queued but never played (the player cut in). */
  discard?(lines: Line[]): void
  reset?(): void
}
