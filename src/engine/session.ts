import type { LogState, Scenario, ScenarioEnding, TranscriptEntry } from '../types'
import { dropSession, queueSession } from '../sync'

/** Everything needed to pick a channel back up after a reload. */
export interface SavedSession {
  v: 1
  scenarioId: string
  savedAt: number
  /** "ended" sessions reopen on the closing screen, with the transcript. */
  phase: 'running' | 'ended'
  /** Seconds on the channel so far. */
  elapsed: number
  transcript: TranscriptEntry[]
  log: LogState
  ending: ScenarioEnding | null
  /** The line source's own state (story memory, script position). */
  source?: unknown
  /** The player's language when the session started; it stays for the whole session. */
  nativeLang?: string
}

const key = (scenarioId: string) => `radio.session.${scenarioId}`

/** Where a scenario's progress is saved. */
export const sessionId = (scenario: Pick<Scenario, 'id' | 'session'>) => scenario.session ?? scenario.id

export function loadSession(scenarioId: string): SavedSession | null {
  try {
    const raw = localStorage.getItem(key(scenarioId))
    if (!raw) return null
    const saved = JSON.parse(raw) as SavedSession
    return saved.v === 1 && saved.scenarioId === scenarioId && Array.isArray(saved.transcript) ? saved : null
  } catch {
    return null
  }
}

export function saveSession(session: SavedSession) {
  try {
    localStorage.setItem(key(session.scenarioId), JSON.stringify(session))
  } catch {
    /* storage full or blocked; the session just won't survive a reload */
  }
  queueSession(session)
}

export function clearSession(scenarioId: string) {
  let existed = true
  try {
    existed = localStorage.getItem(key(scenarioId)) !== null
    localStorage.removeItem(key(scenarioId))
  } catch {
    /* ignore */
  }
  // A fresh start clears every second until the first line; only a real removal reaches the server.
  if (existed) dropSession(scenarioId)
}

/** Wipes a channel's progress, including sessions from when it could be heard in other languages ("id@lang"). */
export function clearChannelSessions(id: string) {
  clearSession(id)
  try {
    const prefix = key(`${id}@`)
    Object.keys(localStorage)
      .filter((k) => k.startsWith(prefix))
      .forEach((k) => clearSession(k.slice(key('').length)))
  } catch {
    /* ignore */
  }
}
