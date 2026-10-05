/**
 * Copies a player's channels and sessions to the database. The browser stays the main copy;
 * this keeps a server copy for the admin page and for moving between devices later.
 *
 *   PUT    /api/sessions/:channel   SavedSession          -> { ok }
 *   DELETE /api/sessions/:channel                         -> { ok }
 *   DELETE /api/channels/:id        (only the owner's)    -> { ok }
 *   POST   /api/sync                { channels, sessions } -> { channels, sessions }  (first upload from a browser)
 */

import type { SignedChannel } from '../shared/channels.ts'
import { verifyChannel, type ChannelEnv } from './channel.ts'
import { CHANNEL_ID, SESSION_ID, baseChannel, insertChannel, readSession, touchPlayer, upsertSession, type DbEnv } from './db.ts'
import { json } from './http.ts'

export interface SyncEnv extends DbEnv, ChannelEnv {}

/** Most channels and sessions accepted in one first upload. */
const UPLOAD_MAX = 50

export async function handleSync(request: Request, env: SyncEnv, path: string, player: string | null): Promise<Response> {
  const db = env.DB
  if (!db) return json({ error: 'No database' }, 503)
  if (!player) return json({ error: 'Missing player id' }, 400)

  const [, kind, raw] = path.split('/')
  const id = raw && decodeURIComponent(raw)
  const now = Date.now()

  if (kind === 'sessions' && id && SESSION_ID.test(id)) {
    if (request.method === 'DELETE') {
      await db.prepare('DELETE FROM sessions WHERE player = ? AND channel = ?').bind(player, id).run()
      return json({ ok: true })
    }
    if (request.method !== 'PUT') return json({ error: 'Method not allowed' }, 405)
    const row = readSession(await request.text(), id)
    if (!row) return json({ error: 'Invalid session' }, 400)
    await db.batch([touchPlayer(db, player, now), upsertSession(db, player, id, row)])
    return json({ ok: true })
  }

  if (kind === 'channels' && id && CHANNEL_ID.test(id)) {
    if (request.method !== 'DELETE') return json({ error: 'Method not allowed' }, 405)
    await db.batch([
      db.prepare('UPDATE channels SET removed_at = ? WHERE id = ? AND owner = ? AND removed_at IS NULL').bind(now, id, player),
      db.prepare(`DELETE FROM sessions WHERE player = ? AND ${baseChannel('channel')} = ?`).bind(player, id),
    ])
    return json({ ok: true })
  }

  if (kind === 'sync' && !id) {
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
    let body: { channels?: unknown; sessions?: unknown }
    try {
      body = (await request.json()) as typeof body
    } catch {
      return json({ error: 'Invalid JSON' }, 400)
    }
    const channels = Array.isArray(body.channels) ? body.channels.slice(0, UPLOAD_MAX) : []
    const sessions = Array.isArray(body.sessions) ? body.sessions.slice(0, UPLOAD_MAX) : []
    const statements = [touchPlayer(db, player, now)]

    // Only channels this server signed are kept, exactly as signed.
    let keptChannels = 0
    for (const raw of channels) {
      const c = raw as Partial<SignedChannel> & { createdAt?: number }
      const bible = await verifyChannel(env, { bible: c?.bible, sig: c?.sig })
      if (!bible || !c.display || !CHANNEL_ID.test(bible.id)) continue
      const createdAt = typeof c.createdAt === 'number' && c.createdAt <= now ? c.createdAt : now
      statements.push(insertChannel(db, player, { bible, display: c.display, sig: c.sig! }, {}, createdAt))
      keptChannels++
    }
    let keptSessions = 0
    for (const raw of sessions) {
      const channel = (raw as { scenarioId?: unknown })?.scenarioId
      if (typeof channel !== 'string' || !SESSION_ID.test(channel)) continue
      const row = readSession(JSON.stringify(raw), channel)
      if (!row) continue
      statements.push(upsertSession(db, player, channel, row))
      keptSessions++
    }
    await db.batch(statements)
    return json({ channels: keptChannels, sessions: keptSessions })
  }

  return json({ error: 'Not found' }, 404)
}
