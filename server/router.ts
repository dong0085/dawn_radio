import type { ApiConfig } from '../shared/api.ts'
import { adminEnabled, handleAdmin, type AdminEnv } from './admin.ts'
import { handleChannel } from './channel.ts'
import { playerOf, type WaitUntil } from './db.ts'
import { handleDialogue, type DialogueEnv } from './dialogue.ts'
import { json } from './http.ts'
import { countUsage } from './usage.ts'
import { rateLimit } from './rateLimit.ts'
import { handleStt, type SttEnv } from './stt.ts'
import { handleRecordings, type RecordingsEnv } from './recordings.ts'
import { handleSfx, type SfxEnv } from './sfx.ts'
import { handleSync } from './sync.ts'
import { handleTranslate, type TranslateEnv } from './translate.ts'
import { handleTts, type TtsEnv } from './tts.ts'

export interface Env extends TtsEnv, SttEnv, DialogueEnv, TranslateEnv, AdminEnv, RecordingsEnv, SfxEnv {}

/** Routes whose requests are counted per player and day (they cost money). */
const COUNTED = new Set(['/dialogue', '/channel', '/tts', '/tts/stream', '/stt', '/translate', '/sfx'])

/** Paths with ids share one rate limit, e.g. /sessions/cave-rescue -> /sessions. */
const routeOf = (path: string) => (/^\/(admin|sessions|channels|recordings|audio)(\/|$)/.exec(path)?.[0].replace(/\/$/, '') ?? path)

/**
 * All /api routes. Used by the Cloudflare Pages Function in production
 * and by Vite middleware during `npm run dev`.
 */
export async function handleApi(request: Request, env: Env, waitUntil: WaitUntil = (p) => void p.catch(() => undefined)): Promise<Response> {
  const path = new URL(request.url).pathname.replace(/^\/api/, '').replace(/\/$/, '')
  const player = playerOf(request)

  if (path === '/config') {
    return json({
      dialogue: !!env.ANTHROPIC_API_KEY,
      tts: !!env.ELEVENLABS_API_KEY,
      stt: !!env.ELEVENLABS_API_KEY,
      translate: !!env.DEEPL_API_KEY,
      channels: !!env.ANTHROPIC_API_KEY,
      db: !!env.DB,
      admin: adminEnabled(env),
    } satisfies ApiConfig)
  }

  const route = routeOf(path)
  const visitor = request.headers.get('cf-connecting-ip') ?? 'local'
  const wait = rateLimit(visitor, route)
  if (wait) return new Response(JSON.stringify({ error: 'Too many requests' }), {
    status: 429,
    headers: { 'content-type': 'application/json', 'retry-after': String(wait) },
  })

  if (env.DB && COUNTED.has(path)) countUsage(env.DB, player, path, waitUntil)

  try {
    if (route === '/admin') return await handleAdmin(request, env, path)
    if (route === '/sessions' || route === '/channels' || path === '/sync') return await handleSync(request, env, path, player)
    if (route === '/recordings' || route === '/audio') return await handleRecordings(request, env, path, player)
    switch (path) {
      case '/dialogue':
        return await handleDialogue(request, env)
      case '/channel':
        return await handleChannel(request, env, player)
      case '/tts':
        return await handleTts(request, env, {}, { player, waitUntil })
      case '/tts/stream':
        return await handleTts(request, env, { stream: true }, { player, waitUntil })
      case '/stt':
        return await handleStt(request, env)
      case '/sfx':
        return await handleSfx(request, env)
      case '/translate':
        return await handleTranslate(request, env)
      default:
        return json({ error: 'Not found' }, 404)
    }
  } catch (err) {
    console.error('[api]', path, err)
    return json({ error: 'Server error' }, 500)
  }
}
