/**
 * Recordings: sessions a player saved, kept with their audio so they play back like a tape.
 *
 *   GET    /api/audio/:key?recording=:id   one line's audio (the recording's copy, else the day's copy)
 *   GET    /api/recordings                 the player's recordings, newest first
 *   POST   /api/recordings                 { id?, title, session }  save (or update) a recording -> { id, audio }
 *   GET    /api/recordings/:id             the recording, with its channel when it was a made one
 *   DELETE /api/recordings/:id
 */

import type { RecordingSummary, RecordingDetail, SavedRecording } from '../shared/recordings.ts'
import type { SignedChannel } from '../shared/channels.ts'
import { AUDIO_KEY, deletePrefix, keepAudio, savedKey, savedPrefix, tmpKey, type AudioEnv } from './audio.ts'
import { SESSION_ID, readSession, touchPlayer, type DbEnv } from './db.ts'
import { json } from './http.ts'

export interface RecordingsEnv extends DbEnv, AudioEnv {}

const RECORDING_ID = /^rec-[0-9a-f]{12}$/

/**
 * Who may save recordings. Everyone for now; later, only players with a paid account.
 * This is the one place to change.
 */
export async function canSave(_env: RecordingsEnv, _player: string): Promise<boolean> {
  return true
}

const num = (v: unknown) => Number(v ?? 0) || 0
const str = (v: unknown) => (typeof v === 'string' ? v : '')

const toSummary = (r: Record<string, unknown>): RecordingSummary => ({
  id: str(r.id),
  session: str(r.session),
  title: str(r.title),
  transmissions: num(r.transmissions),
  outcome: r.outcome == null ? null : str(r.outcome),
  elapsed: num(r.elapsed),
  audioLines: num(r.audio_lines),
  createdAt: num(r.created_at),
  updatedAt: num(r.updated_at),
})

export async function handleRecordings(request: Request, env: RecordingsEnv, path: string, player: string | null): Promise<Response> {
  const db = env.DB
  if (!db) return json({ error: 'No database' }, 503)
  if (!player) return json({ error: 'Missing player id' }, 400)
  const [, kind, raw] = path.split('/')
  const id = raw && decodeURIComponent(raw)
  const method = request.method

  if (kind === 'audio') {
    const bucket = env.AUDIO
    if (!bucket || !id || !AUDIO_KEY.test(id) || method !== 'GET') return json({ error: 'Not found' }, 404)
    const recording = new URL(request.url).searchParams.get('recording')
    const obj =
      (recording && RECORDING_ID.test(recording) ? await bucket.get(savedKey(player, recording, id)) : null) ?? (await bucket.get(tmpKey(player, id)))
    if (!obj) return json({ error: 'No audio' }, 404)
    return new Response(obj.body, {
      headers: { 'content-type': 'audio/wav', 'content-length': String(obj.size), 'cache-control': 'private, max-age=86400' },
    })
  }

  if (kind !== 'recordings') return json({ error: 'Not found' }, 404)

  if (!id) {
    if (method === 'GET') {
      const rows = await db
        .prepare(
          'SELECT id, session, title, transmissions, outcome, elapsed, audio_lines, created_at, updated_at FROM recordings WHERE player = ? ORDER BY updated_at DESC LIMIT 200',
        )
        .bind(player)
        .all()
      return json({ rows: rows.results.map(toSummary), canSave: await canSave(env, player) })
    }
    if (method !== 'POST') return json({ error: 'Method not allowed' }, 405)
    if (!(await canSave(env, player))) return json({ error: 'Saving recordings needs an account' }, 403)
    return save(request, env, player)
  }

  if (!RECORDING_ID.test(id)) return json({ error: 'Not found' }, 404)

  if (method === 'GET') {
    const r = await db
      .prepare(
        `SELECT r.*, c.bible, c.display, c.sig FROM recordings r
         LEFT JOIN channels c ON c.id = (CASE WHEN instr(r.session, '@') > 0 THEN substr(r.session, 1, instr(r.session, '@') - 1) ELSE r.session END)
         WHERE r.id = ? AND r.player = ?`,
      )
      .bind(id, player)
      .first()
    if (!r) return json({ error: 'Not found' }, 404)
    const channel: SignedChannel | null = r.bible ? { bible: JSON.parse(str(r.bible)), display: JSON.parse(str(r.display)), sig: str(r.sig) } : null
    return json({ ...toSummary(r), data: JSON.parse(str(r.data)), channel } satisfies RecordingDetail)
  }

  if (method === 'DELETE') {
    await db.prepare('DELETE FROM recordings WHERE id = ? AND player = ?').bind(id, player).run()
    if (env.AUDIO) await deletePrefix(env.AUDIO, savedPrefix(player, id))
    return json({ ok: true })
  }

  return json({ error: 'Method not allowed' }, 405)
}

/** Saves a recording (a new one, or updates the player's own), and keeps the audio of its lines. */
async function save(request: Request, env: RecordingsEnv, player: string): Promise<Response> {
  const db = env.DB!
  let body: SavedRecording
  try {
    body = (await request.json()) as SavedRecording
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }
  const session = body?.session as { scenarioId?: unknown; transcript?: { audio?: unknown }[] } | undefined
  const sessionId = typeof session?.scenarioId === 'string' && SESSION_ID.test(session.scenarioId) ? session.scenarioId : null
  const row = sessionId && readSession(JSON.stringify(session), sessionId)
  if (!sessionId || !row || !row.transmissions) return json({ error: 'Invalid session' }, 400)

  const now = Date.now()
  let id = typeof body.id === 'string' && RECORDING_ID.test(body.id) ? body.id : null
  if (id) {
    const own = await db.prepare('SELECT id FROM recordings WHERE id = ? AND player = ?').bind(id, player).first()
    if (!own) id = null
  }
  id ??= `rec-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`

  const keys = [...new Set((session!.transcript ?? []).map((e) => e?.audio).filter((k): k is string => typeof k === 'string' && AUDIO_KEY.test(k)))]
  const audio = env.AUDIO ? await keepAudio(env.AUDIO, player, id, keys) : { kept: 0, missing: keys.length }
  const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim().slice(0, 80) : sessionId
  const elapsed = num((session as { elapsed?: unknown }).elapsed)

  await db.batch([
    touchPlayer(db, player, now),
    db
      .prepare(
        `INSERT INTO recordings (id, player, session, title, data, transmissions, outcome, elapsed, audio_lines, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET title = excluded.title, data = excluded.data, transmissions = excluded.transmissions,
           outcome = excluded.outcome, elapsed = excluded.elapsed, audio_lines = excluded.audio_lines, updated_at = excluded.updated_at`,
      )
      .bind(id, player, sessionId, title, row.data, row.transmissions, row.outcome, elapsed, audio.kept, now, now),
  ])
  return json({ id, audio })
}
