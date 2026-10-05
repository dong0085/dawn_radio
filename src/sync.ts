import { apiFetch, getConfig } from './api'
import { playerId } from './player'
import { loadChannels } from './channels/store'
import type { SavedSession } from './engine/session'

/**
 * Copies this browser's channels and sessions to the server when it has a database.
 * The browser stays the main copy: nothing here blocks or changes what the radio shows.
 */

/** A session is sent after this many new lines (one batch of exchanges from the writers)… */
const SEND_AFTER_LINES = 4
/** …or this long after it last changed, whichever comes first. */
const SEND_EVERY = 30_000
/** Browsers drop keepalive requests larger than 64 KB. */
const KEEPALIVE_MAX = 60_000
const UPLOADED_KEY = 'radio.sync.v1'

const pending = new Map<string, SavedSession>()
const timers = new Map<string, ReturnType<typeof setTimeout>>()
/** What the server last got for each session. */
const sent = new Map<string, { lines: number; phase: SavedSession['phase'] }>()

const enabled = () => getConfig().then((c) => c.db)
const quiet = (p: Promise<unknown>) => p.catch((err) => console.warn('[sync]', err))

function send(id: string) {
  clearTimeout(timers.get(id))
  timers.delete(id)
  const session = pending.get(id)
  pending.delete(id)
  if (!session) return
  sent.set(id, { lines: session.transcript.length, phase: session.phase })
  const body = JSON.stringify(session)
  void quiet(
    enabled().then((on) =>
      on
        ? apiFetch(`/sessions/${encodeURIComponent(id)}`, {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body,
            // Lets the last save go out while the page closes.
            keepalive: body.length < KEEPALIVE_MAX,
          })
        : null,
    ),
  )
}

/**
 * Called on every local save (up to once a second). Sends after every few new lines, when the
 * channel closes, and when the page is going away; otherwise within SEND_EVERY.
 */
export function queueSession(session: SavedSession) {
  const id = session.scenarioId
  pending.set(id, session)
  const last = sent.get(id)
  const due =
    (typeof document !== 'undefined' && document.visibilityState === 'hidden') ||
    (session.phase === 'ended' && last?.phase !== 'ended') ||
    session.transcript.length - (last?.lines ?? 0) >= SEND_AFTER_LINES
  if (due) return send(id)
  if (!timers.has(id)) timers.set(id, setTimeout(() => send(id), SEND_EVERY))
}

export function dropSession(id: string) {
  clearTimeout(timers.get(id))
  timers.delete(id)
  pending.delete(id)
  sent.delete(id)
  void quiet(enabled().then((on) => (on ? apiFetch(`/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' }) : null)))
}

/** The player deleted a channel they made. */
export function removeChannel(id: string) {
  void quiet(enabled().then((on) => (on ? apiFetch(`/channels/${encodeURIComponent(id)}`, { method: 'DELETE' }) : null)))
}

/** Once per browser: sends the channels and sessions made before the server had a database. */
export async function uploadOnce() {
  try {
    if (localStorage.getItem(UPLOADED_KEY) === playerId() || !(await enabled())) return
    const sessions: unknown[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key?.startsWith('radio.session.')) continue
      try {
        sessions.push(JSON.parse(localStorage.getItem(key) ?? 'null'))
      } catch {
        /* skip a broken save */
      }
    }
    const channels = loadChannels().map(({ bible, display, sig, createdAt }) => ({ bible, display, sig, createdAt }))
    if (channels.length || sessions.length) {
      await apiFetch('/sync', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ channels, sessions }) })
    }
    localStorage.setItem(UPLOADED_KEY, playerId())
  } catch (err) {
    console.warn('[sync] first upload failed; will retry next visit', err)
  }
}
