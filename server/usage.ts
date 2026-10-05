import { countRequests, dayOf, touchPlayer, type D1Database, type WaitUntil } from './db.ts'

/**
 * Request counts kept in this server instance's memory and written to the database in one
 * batch at most every FLUSH_EVERY, instead of one write per request. "Last seen" goes in the
 * same batch. If Cloudflare shuts the instance down, the counts since the last write are lost:
 * fine for watching costs, not for billing.
 */

const FLUSH_EVERY = 30_000

/** "day|player|route" -> requests not written yet. */
const counts = new Map<string, number>()
/** Player ids seen since the last write, with when. */
const seen = new Map<string, number>()
/** 0, so a fresh instance writes its first request right away. */
let lastFlush = 0

export function countUsage(db: D1Database, player: string | null, route: string, waitUntil: WaitUntil, now = Date.now()) {
  const key = `${dayOf(now)}|${player ?? '-'}|${route}`
  counts.set(key, (counts.get(key) ?? 0) + 1)
  if (player) seen.set(player, now)
  if (now - lastFlush < FLUSH_EVERY) return
  lastFlush = now

  const batch = [...counts]
  const players = [...seen]
  counts.clear()
  seen.clear()
  const statements = [
    ...batch.map(([k, n]) => {
      const [day, p, r] = k.split('|')
      return countRequests(db, day, p, r, n)
    }),
    ...players.map(([p, at]) => touchPlayer(db, p, at)),
  ]
  waitUntil(
    db.batch(statements).catch((err) => {
      console.warn('[usage] not written; keeping the counts for next time', err)
      for (const [k, n] of batch) counts.set(k, (counts.get(k) ?? 0) + n)
      for (const [p, at] of players) seen.set(p, Math.max(at, seen.get(p) ?? 0))
    }),
  )
}
