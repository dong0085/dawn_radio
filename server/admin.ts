/**
 * Admin API behind the ADMIN_TOKEN secret (sent as "Authorization: Bearer <token>").
 * Without the secret, or without a database, every admin route answers 404.
 *
 *   GET    /api/admin/overview
 *   GET    /api/admin/channels?q=&status=all|live|hidden|removed&limit=&offset=
 *   GET    /api/admin/channels/:id        PATCH { hidden }        DELETE (with its sessions)
 *   GET    /api/admin/sessions?q=&phase=&limit=&offset=
 *   GET    /api/admin/sessions/:player/:channel                   DELETE
 *   GET    /api/admin/players?q=&sort=seen|requests&limit=&offset=
 *   GET    /api/admin/players/:id         DELETE (everything stored for the player)
 */

import type {
  AdminChannel,
  AdminChannelRow,
  AdminOverview,
  AdminPage,
  AdminPlayer,
  AdminPlayerRow,
  AdminSession,
  AdminSessionRow,
} from '../shared/admin.ts'
import type { ChannelDisplay } from '../shared/channels.ts'
import { stories, type StoryBible } from '../shared/stories.ts'
import { CHANNEL_ID, SESSION_ID, baseChannel, dayOf, isPlayerId, type D1Database, type DbEnv } from './db.ts'
import { json } from './http.ts'

export interface AdminEnv extends DbEnv {
  /** At least 16 characters; shorter tokens leave the admin page off. */
  ADMIN_TOKEN?: string
}

const DAY = 86_400_000
/** Days covered by the overview and per-player usage. */
const SPAN = 14

const encoder = new TextEncoder()
const digest = async (s: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(s)))

/** Compares the sent token with ADMIN_TOKEN without leaking how much of it matched. */
async function authorized(request: Request, token: string) {
  const sent = /^Bearer (.+)$/.exec(request.headers.get('authorization') ?? '')?.[1] ?? ''
  const [a, b] = await Promise.all([digest(sent), digest(token)])
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

export const adminEnabled = (env: AdminEnv) => !!env.DB && (env.ADMIN_TOKEN?.length ?? 0) >= 16

export async function handleAdmin(request: Request, env: AdminEnv, path: string): Promise<Response> {
  if (!adminEnabled(env)) return json({ error: 'Not found' }, 404)
  if (!(await authorized(request, env.ADMIN_TOKEN!))) return json({ error: 'Wrong admin token' }, 401)
  const db = env.DB!
  const url = new URL(request.url)
  const [, , kind, a, b] = path.split('/').map((x) => x && decodeURIComponent(x)) // "", "admin", kind, ...
  const method = request.method

  if (kind === 'overview' && method === 'GET') return json(await overview(db))

  if (kind === 'channels') {
    if (!a && method === 'GET') return json(await listChannels(db, url.searchParams))
    if (!a || !CHANNEL_ID.test(a)) return json({ error: 'Not found' }, 404)
    if (method === 'GET') {
      const channel = await getChannel(db, a)
      return channel ? json(channel) : json({ error: 'Not found' }, 404)
    }
    if (method === 'PATCH') {
      const body = (await request.json().catch(() => null)) as { hidden?: unknown } | null
      if (typeof body?.hidden !== 'boolean') return json({ error: 'Send { hidden: true | false }' }, 400)
      await db.prepare('UPDATE channels SET hidden = ? WHERE id = ?').bind(body.hidden ? 1 : 0, a).run()
      return json({ ok: true })
    }
    if (method === 'DELETE') {
      await db.batch([
        db.prepare(`DELETE FROM sessions WHERE ${baseChannel('channel')} = ?`).bind(a),
        db.prepare('DELETE FROM channels WHERE id = ?').bind(a),
      ])
      return json({ ok: true })
    }
  }

  if (kind === 'sessions') {
    if (!a && method === 'GET') return json(await listSessions(db, url.searchParams))
    if (!a || !b || !isPlayerId(a) || !SESSION_ID.test(b)) return json({ error: 'Not found' }, 404)
    if (method === 'GET') {
      const session = await getSession(db, a, b)
      return session ? json(session) : json({ error: 'Not found' }, 404)
    }
    if (method === 'DELETE') {
      await db.prepare('DELETE FROM sessions WHERE player = ? AND channel = ?').bind(a, b).run()
      return json({ ok: true })
    }
  }

  if (kind === 'players') {
    if (!a && method === 'GET') return json(await listPlayers(db, url.searchParams))
    if (!a || !isPlayerId(a)) return json({ error: 'Not found' }, 404)
    if (method === 'GET') {
      const player = await getPlayer(db, a)
      return player ? json(player) : json({ error: 'Not found' }, 404)
    }
    if (method === 'DELETE') {
      await db.batch([
        db.prepare('DELETE FROM sessions WHERE player = ?').bind(a),
        db.prepare(`DELETE FROM sessions WHERE ${baseChannel('channel')} IN (SELECT id FROM channels WHERE owner = ?)`).bind(a),
        db.prepare('DELETE FROM channels WHERE owner = ?').bind(a),
        db.prepare('DELETE FROM usage WHERE player = ?').bind(a),
        db.prepare('DELETE FROM players WHERE id = ?').bind(a),
      ])
      return json({ ok: true })
    }
  }

  return json({ error: 'Not found' }, 404)
}

// ---- queries ----

const num = (v: unknown) => Number(v ?? 0) || 0
const str = (v: unknown) => (typeof v === 'string' ? v : '')

function paging(params: URLSearchParams) {
  const limit = Math.max(1, Math.min(100, Number(params.get('limit')) || 25))
  const offset = Math.max(0, Number(params.get('offset')) || 0)
  return { limit, offset }
}

/** A LIKE pattern matching the text anywhere, with % and _ taken literally. */
const like = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`

/** Title for a session's channel: stored title, else the built-in story's, else the id; plus the language it was heard in. */
function titleOf(session: string, stored: unknown) {
  const [id, lang] = session.split('@')
  const title = str(stored) || stories[id]?.title || id
  return lang ? `${title} · ${lang}` : title
}

async function overview(db: D1Database): Promise<AdminOverview> {
  const now = Date.now()
  const since = now - (SPAN - 1) * DAY
  const firstDay = dayOf(since)
  const [totals, perDayChannels, perDayRequests, routes] = await db.batch([
    db
      .prepare(
        `SELECT (SELECT COUNT(*) FROM players) AS players,
                (SELECT COUNT(*) FROM channels) AS channels,
                (SELECT COUNT(*) FROM channels WHERE hidden = 1) AS hidden,
                (SELECT COUNT(*) FROM sessions) AS sessions,
                (SELECT COUNT(*) FROM sessions WHERE phase = 'ended') AS ended,
                (SELECT COUNT(*) FROM players WHERE seen_at >= ?1) AS day,
                (SELECT COUNT(*) FROM players WHERE seen_at >= ?2) AS week`,
      )
      .bind(now - DAY, now - 7 * DAY),
    db
      .prepare(`SELECT strftime('%Y-%m-%d', created_at / 1000, 'unixepoch') AS day, COUNT(*) AS n FROM channels WHERE created_at >= ? GROUP BY day`)
      .bind(Date.parse(`${firstDay}T00:00:00Z`)),
    db.prepare('SELECT day, SUM(count) AS n FROM usage WHERE day >= ? GROUP BY day').bind(firstDay),
    db.prepare('SELECT route, SUM(count) AS n FROM usage WHERE day >= ? GROUP BY route ORDER BY n DESC').bind(firstDay),
  ])
  const t = totals.results[0] ?? {}
  const channelsBy = new Map(perDayChannels.results.map((r) => [str(r.day), num(r.n)]))
  const requestsBy = new Map(perDayRequests.results.map((r) => [str(r.day), num(r.n)]))
  const days = Array.from({ length: SPAN }, (_, i) => {
    const day = dayOf(since + i * DAY)
    return { day, channels: channelsBy.get(day) ?? 0, requests: requestsBy.get(day) ?? 0 }
  })
  return {
    totals: { players: num(t.players), channels: num(t.channels), sessions: num(t.sessions), hidden: num(t.hidden), endedSessions: num(t.ended) },
    active: { day: num(t.day), week: num(t.week) },
    days,
    routes: routes.results.map((r) => ({ route: str(r.route), count: num(r.n) })),
  }
}

const CHANNEL_COLUMNS = `c.id, c.owner, c.title, c.target_lang, c.level, json_extract(c.brief, '$.about') AS about,
  c.created_at, c.hidden, c.removed_at,
  (SELECT COUNT(*) FROM sessions s WHERE ${baseChannel('s.channel')} = c.id) AS sessions,
  (SELECT COALESCE(SUM(s.transmissions), 0) FROM sessions s WHERE ${baseChannel('s.channel')} = c.id) AS transmissions`

const toChannelRow = (r: Record<string, unknown>): AdminChannelRow => ({
  id: str(r.id),
  owner: str(r.owner),
  title: str(r.title),
  targetLang: str(r.target_lang),
  level: str(r.level),
  about: str(r.about),
  createdAt: num(r.created_at),
  hidden: num(r.hidden) === 1,
  removedAt: r.removed_at == null ? null : num(r.removed_at),
  sessions: num(r.sessions),
  transmissions: num(r.transmissions),
})

async function listChannels(db: D1Database, params: URLSearchParams): Promise<AdminPage<AdminChannelRow>> {
  const { limit, offset } = paging(params)
  const where: string[] = []
  const args: unknown[] = []
  const q = params.get('q')?.trim()
  if (q) {
    where.push(`(c.title LIKE ?1 ESCAPE '\\' OR c.id LIKE ?1 ESCAPE '\\' OR c.owner LIKE ?1 ESCAPE '\\' OR json_extract(c.brief, '$.about') LIKE ?1 ESCAPE '\\')`)
    args.push(like(q))
  }
  const status = params.get('status')
  if (status === 'live') where.push('c.hidden = 0 AND c.removed_at IS NULL')
  else if (status === 'hidden') where.push('c.hidden = 1')
  else if (status === 'removed') where.push('c.removed_at IS NOT NULL')
  const filter = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const [rows, total] = await db.batch([
    db.prepare(`SELECT ${CHANNEL_COLUMNS} FROM channels c ${filter} ORDER BY c.created_at DESC LIMIT ${limit} OFFSET ${offset}`).bind(...args),
    db.prepare(`SELECT COUNT(*) AS n FROM channels c ${filter}`).bind(...args),
  ])
  return { rows: rows.results.map(toChannelRow), total: num(total.results[0]?.n) }
}

async function getChannel(db: D1Database, id: string): Promise<AdminChannel | null> {
  const [row, sessions] = await db.batch([
    db.prepare(`SELECT ${CHANNEL_COLUMNS}, c.brief, c.bible, c.display FROM channels c WHERE c.id = ?`).bind(id),
    db.prepare(`${SESSION_SELECT} WHERE ${baseChannel('s.channel')} = ? ORDER BY s.updated_at DESC LIMIT 100`).bind(id),
  ])
  const r = row.results[0]
  if (!r) return null
  return {
    ...toChannelRow(r),
    brief: JSON.parse(str(r.brief) || '{}'),
    bible: JSON.parse(str(r.bible)) as StoryBible,
    display: JSON.parse(str(r.display)) as ChannelDisplay,
    sessionList: sessions.results.map(toSessionRow),
  }
}

const SESSIONS_JOIN = `sessions s LEFT JOIN channels c ON c.id = ${baseChannel('s.channel')}`
const SESSION_SELECT = `SELECT s.player, s.channel, c.title, s.phase, s.transmissions, s.outcome, s.updated_at FROM ${SESSIONS_JOIN}`

const toSessionRow = (r: Record<string, unknown>): AdminSessionRow => ({
  player: str(r.player),
  channel: str(r.channel),
  title: titleOf(str(r.channel), r.title),
  phase: r.phase === 'ended' ? 'ended' : 'running',
  transmissions: num(r.transmissions),
  outcome: r.outcome == null ? null : str(r.outcome),
  updatedAt: num(r.updated_at),
})

async function listSessions(db: D1Database, params: URLSearchParams): Promise<AdminPage<AdminSessionRow>> {
  const { limit, offset } = paging(params)
  const where: string[] = []
  const args: unknown[] = []
  const q = params.get('q')?.trim()
  if (q) {
    where.push(`(s.player LIKE ?1 ESCAPE '\\' OR s.channel LIKE ?1 ESCAPE '\\' OR c.title LIKE ?1 ESCAPE '\\')`)
    args.push(like(q))
  }
  const phase = params.get('phase')
  if (phase === 'running' || phase === 'ended') where.push(`s.phase = '${phase}'`)
  const filter = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const [rows, total] = await db.batch([
    db.prepare(`${SESSION_SELECT} ${filter} ORDER BY s.updated_at DESC LIMIT ${limit} OFFSET ${offset}`).bind(...args),
    db.prepare(`SELECT COUNT(*) AS n FROM ${SESSIONS_JOIN} ${filter}`).bind(...args),
  ])
  return { rows: rows.results.map(toSessionRow), total: num(total.results[0]?.n) }
}

async function getSession(db: D1Database, player: string, channel: string): Promise<AdminSession | null> {
  const r = await db
    .prepare(`SELECT s.player, s.channel, c.title, c.display, s.phase, s.transmissions, s.outcome, s.updated_at, s.data
      FROM ${SESSIONS_JOIN} WHERE s.player = ? AND s.channel = ?`)
    .bind(player, channel)
    .first()
  if (!r) return null
  const display = r.display ? (JSON.parse(str(r.display)) as ChannelDisplay) : null
  const parties = display?.parties.map((p) => ({ id: p.id, name: p.name })) ?? stories[channel.split('@')[0]]?.parties.map((p) => ({ id: p.id, name: p.name })) ?? []
  return { ...toSessionRow(r), data: JSON.parse(str(r.data)), parties }
}

const PLAYER_COLUMNS = (since: string) => `p.id, p.created_at, p.seen_at,
  (SELECT COUNT(*) FROM channels c WHERE c.owner = p.id) AS channels,
  (SELECT COUNT(*) FROM sessions s WHERE s.player = p.id) AS sessions,
  (SELECT COALESCE(SUM(u.count), 0) FROM usage u WHERE u.player = p.id AND u.day >= '${since}') AS requests`

const toPlayerRow = (r: Record<string, unknown>): AdminPlayerRow => ({
  id: str(r.id),
  createdAt: num(r.created_at),
  seenAt: num(r.seen_at),
  channels: num(r.channels),
  sessions: num(r.sessions),
  requests: num(r.requests),
})

async function listPlayers(db: D1Database, params: URLSearchParams): Promise<AdminPage<AdminPlayerRow>> {
  const { limit, offset } = paging(params)
  const q = params.get('q')?.trim()
  const filter = q ? `WHERE p.id LIKE ?1 ESCAPE '\\'` : ''
  const args = q ? [like(q)] : []
  const order = params.get('sort') === 'requests' ? 'requests DESC, p.seen_at DESC' : 'p.seen_at DESC'
  const [rows, total] = await db.batch([
    db.prepare(`SELECT ${PLAYER_COLUMNS(dayOf(Date.now() - 6 * DAY))} FROM players p ${filter} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`).bind(...args),
    db.prepare(`SELECT COUNT(*) AS n FROM players p ${filter}`).bind(...args),
  ])
  return { rows: rows.results.map(toPlayerRow), total: num(total.results[0]?.n) }
}

async function getPlayer(db: D1Database, id: string): Promise<AdminPlayer | null> {
  const [player, channels, sessions, usage] = await db.batch([
    db.prepare(`SELECT ${PLAYER_COLUMNS(dayOf(Date.now() - 6 * DAY))} FROM players p WHERE p.id = ?`).bind(id),
    db.prepare(`SELECT ${CHANNEL_COLUMNS} FROM channels c WHERE c.owner = ? ORDER BY c.created_at DESC LIMIT 100`).bind(id),
    db.prepare(`${SESSION_SELECT} WHERE s.player = ? ORDER BY s.updated_at DESC LIMIT 100`).bind(id),
    db
      .prepare('SELECT route, SUM(count) AS n FROM usage WHERE player = ? AND day >= ? GROUP BY route ORDER BY n DESC')
      .bind(id, dayOf(Date.now() - (SPAN - 1) * DAY)),
  ])
  const r = player.results[0]
  if (!r) return null
  return {
    ...toPlayerRow(r),
    channelList: channels.results.map(toChannelRow),
    sessionList: sessions.results.map(toSessionRow),
    usage: usage.results.map((u) => ({ route: str(u.route), count: num(u.n) })),
  }
}
