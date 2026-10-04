import type { ApiConfig } from '../shared/api.ts'
import { handleDialogue, type DialogueEnv } from './dialogue.ts'
import { json } from './http.ts'
import { rateLimit } from './rateLimit.ts'
import { handleStt, type SttEnv } from './stt.ts'
import { handleTranslate, type TranslateEnv } from './translate.ts'
import { handleTts, type TtsEnv } from './tts.ts'

export interface Env extends TtsEnv, SttEnv, DialogueEnv, TranslateEnv {}

/**
 * All /api routes. Used by the Cloudflare Pages Function in production
 * and by Vite middleware during `npm run dev`.
 */
export async function handleApi(request: Request, env: Env): Promise<Response> {
  const path = new URL(request.url).pathname.replace(/^\/api/, '').replace(/\/$/, '')

  if (path === '/config') {
    return json({
      dialogue: !!env.ANTHROPIC_API_KEY,
      tts: !!env.ELEVENLABS_API_KEY,
      stt: !!env.ELEVENLABS_API_KEY,
      translate: !!env.DEEPL_API_KEY,
    } satisfies ApiConfig)
  }

  const visitor = request.headers.get('cf-connecting-ip') ?? 'local'
  const wait = rateLimit(visitor, path)
  if (wait) return new Response(JSON.stringify({ error: 'Too many requests' }), {
    status: 429,
    headers: { 'content-type': 'application/json', 'retry-after': String(wait) },
  })

  try {
    switch (path) {
      case '/dialogue':
        return await handleDialogue(request, env)
      case '/tts':
        return await handleTts(request, env)
      case '/tts/stream':
        return await handleTts(request, env, { stream: true })
      case '/stt':
        return await handleStt(request, env)
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
