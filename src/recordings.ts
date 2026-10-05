import type { RecordingDetail, RecordingSummary, SaveResult, SavedRecording } from '../shared/recordings.ts'
import { apiFetch } from './api'
import type { SavedSession } from './engine/session'

/** Recordings: sessions saved on the server with their audio, to play back like a tape. */

const LINKS_KEY = 'radio.recordings.v1'

/**
 * Which recording each session run was saved as, so saving again updates it.
 * A run is its session id plus its first line: starting fresh makes a new run (and a new recording).
 */
const runOf = (s: SavedSession) => `${s.scenarioId}|${s.transcript[0]?.id ?? ''}`

function links(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(LINKS_KEY) ?? '{}') as Record<string, string>
  } catch {
    return {}
  }
}

export function recordingOf(session: SavedSession): string | undefined {
  return links()[runOf(session)]
}

export async function saveRecording(session: SavedSession, title: string): Promise<SaveResult> {
  const body: SavedRecording = { id: recordingOf(session), title, session }
  const res = await apiFetch('/recordings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const result = (await res.json()) as SaveResult
  try {
    localStorage.setItem(LINKS_KEY, JSON.stringify({ ...links(), [runOf(session)]: result.id }))
  } catch {
    /* storage blocked: saving again makes a new recording */
  }
  return result
}

export const listRecordings = (): Promise<{ rows: RecordingSummary[]; canSave: boolean }> => apiFetch('/recordings').then((r) => r.json())

export const getRecording = (id: string): Promise<RecordingDetail> => apiFetch(`/recordings/${encodeURIComponent(id)}`).then((r) => r.json())

export const deleteRecording = (id: string) => apiFetch(`/recordings/${encodeURIComponent(id)}`, { method: 'DELETE' }).then(() => undefined)
