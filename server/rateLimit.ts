/**
 * Per-visitor request limits, counted per minute.
 * Counts live in the server instance's memory, so they stop bursts and runaway clients,
 * not a determined attacker spread across many instances. Pair with spend limits
 * in the Anthropic, ElevenLabs and DeepL dashboards.
 */

/** Requests per minute per visitor. Normal listening uses a fraction of these. */
export const PER_MINUTE: Record<string, number> = {
  '/dialogue': 10,
  // Each new channel is a full Claude request with nothing else gating it, so keep this tight.
  '/channel': 2,
  '/tts': 40,
  '/tts/stream': 40,
  '/stt': 20,
  '/translate': 60,
  '/sessions': 60,
  '/channels': 20,
  '/sync': 5,
  // Also limits guessing the admin token.
  '/admin': 120,
}

const hits = new Map<string, number[]>()

/** Returns seconds to wait if the visitor is over the limit, else 0. */
export function rateLimit(visitor: string, path: string, now = Date.now()): number {
  const limit = PER_MINUTE[path]
  if (!limit) return 0
  const key = `${visitor}|${path}`
  const recent = (hits.get(key) ?? []).filter((t) => now - t < 60_000)
  if (recent.length >= limit) {
    hits.set(key, recent)
    return Math.ceil((60_000 - (now - recent[0])) / 1000)
  }
  recent.push(now)
  hits.set(key, recent)
  // Keep memory bounded.
  if (hits.size > 5000) for (const k of [...hits.keys()].slice(0, 1000)) hits.delete(k)
  return 0
}
