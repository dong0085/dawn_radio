/** Shapes for /api/recordings, shared by browser and server. */

import type { SignedChannel } from './channels.ts'

export interface RecordingSummary {
  id: string
  /** The session it was saved from: a channel id, plus "@<language>" when heard in another one. */
  session: string
  title: string
  transmissions: number
  outcome: string | null
  /** Seconds on the channel. */
  elapsed: number
  /** Lines whose audio was kept. */
  audioLines: number
  createdAt: number
  updatedAt: number
}

export interface RecordingDetail extends RecordingSummary {
  /** The session as the browser saved it (SavedSession). */
  data: unknown
  /** The channel, when the recording is of one made from a briefing. */
  channel: SignedChannel | null
}

/** POST /api/recordings */
export interface SavedRecording {
  /** Updates this recording instead of making a new one. */
  id?: string
  title: string
  session: unknown
}

export interface SaveResult {
  id: string
  /** Lines whose audio is kept, and lines whose audio was already gone. */
  audio: { kept: number; missing: number }
}
