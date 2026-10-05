/**
 * Cloudflare D1 (SQLite) storage: players, channels, sessions and usage.
 * Everything here is optional: without a DB binding the app runs on browser storage alone.
 * Schema: migrations/*.sql.
 */

import type { SignedChannel } from '../shared/channels.ts'

/** The parts of Cloudflare's D1 API this app uses. */
export interface D1Result<T = Record<string, unknown>> {
  results: T[]
  meta?: { changes?: number }
}
export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  first<T = Record<string, unknown>>(): Promise<T | null>
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>
  run(): Promise<D1Result>
}
export interface D1Database {
  prepare(sql: string): D1PreparedStatement
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>
}

export interface DbEnv {
  DB?: D1Database
}

/** Lets a write finish after the response has gone out. */
export type WaitUntil = (promise: Promise<unknown>) => void

const PLAYER = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
/** Preset ids (cave-rescue) and made channels (ch-1a2b3c4d). */
export const CHANNEL_ID = /^[a-z0-9][a-z0-9-]{0,40}$/
/** A session is filed under its channel id, plus "@<language>" when heard in another language (ch-1a2b3c4d@es-ES). */
export const SESSION_ID = /^[a-z0-9][a-z0-9-]{0,40}(@[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?)?$/

/** SQL: the channel id of a session column, without its language suffix. */
export const baseChannel = (col: string) => `(CASE WHEN instr(${col}, '@') > 0 THEN substr(${col}, 1, instr(${col}, '@') - 1) ELSE ${col} END)`

/** The anonymous player id the browser sends, or null. */
export function playerOf(request: Request): string | null {
  const id = request.headers.get('x-player')?.toLowerCase()
  return id && PLAYER.test(id) ? id : null
}

export const isPlayerId = (id: string) => PLAYER.test(id)

/** UTC day, e.g. 2026-10-04. */
export const dayOf = (ms = Date.now()) => new Date(ms).toISOString().slice(0, 10)

export function touchPlayer(db: D1Database, player: string, now = Date.now()) {
  return db
    .prepare('INSERT INTO players (id, created_at, seen_at) VALUES (?1, ?2, ?2) ON CONFLICT (id) DO UPDATE SET seen_at = excluded.seen_at')
    .bind(player, now)
}

/** Adds `count` requests on a route to a day's total. Requests without a player id count under "-". */
export function countRequests(db: D1Database, day: string, player: string, route: string, count: number) {
  return db
    .prepare('INSERT INTO usage (day, player, route, count) VALUES (?, ?, ?, ?) ON CONFLICT (day, player, route) DO UPDATE SET count = count + excluded.count')
    .bind(day, player, route, count)
}

/** Stores a channel as the server handed it out. An existing row keeps its owner and state. */
export function insertChannel(db: D1Database, owner: string, channel: SignedChannel, brief: unknown, createdAt = Date.now()) {
  const { bible, display, sig } = channel
  return db
    .prepare(
      `INSERT INTO channels (id, owner, title, target_lang, level, brief, bible, display, sig, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING`,
    )
    .bind(bible.id, owner, display.title, bible.targetLang, bible.level, JSON.stringify(brief ?? {}), JSON.stringify(bible), JSON.stringify(display), sig, createdAt)
}

/** Largest session the server keeps, in characters of JSON. */
export const SESSION_CHARS = 400_000

export interface SessionRow {
  data: string
  phase: string
  transmissions: number
  outcome: string | null
  updatedAt: number
}

/** Checks a saved session from the browser and pulls out the columns the admin lists. */
export function readSession(text: string, channel: string): SessionRow | null {
  if (text.length > SESSION_CHARS) return null
  let s: Record<string, unknown>
  try {
    s = JSON.parse(text)
  } catch {
    return null
  }
  if (!s || s.v !== 1 || s.scenarioId !== channel || !Array.isArray(s.transcript)) return null
  const ending = s.ending as { outcome?: unknown } | null
  return {
    data: text,
    phase: s.phase === 'ended' ? 'ended' : 'running',
    transmissions: s.transcript.length,
    outcome: typeof ending?.outcome === 'string' ? ending.outcome.slice(0, 10) : null,
    updatedAt: typeof s.savedAt === 'number' && Number.isFinite(s.savedAt) ? s.savedAt : Date.now(),
  }
}

export function upsertSession(db: D1Database, player: string, channel: string, row: SessionRow) {
  return db
    .prepare(
      `INSERT INTO sessions (player, channel, data, phase, transmissions, outcome, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (player, channel) DO UPDATE SET data = excluded.data, phase = excluded.phase,
         transmissions = excluded.transmissions, outcome = excluded.outcome, updated_at = excluded.updated_at
       WHERE excluded.updated_at >= sessions.updated_at`,
    )
    .bind(player, channel, row.data, row.phase, row.transmissions, row.outcome, row.updatedAt)
}
