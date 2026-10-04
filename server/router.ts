import type { ApiConfig } from '../shared/api.ts'
import { handleDialogue, type DialogueEnv } from './dialogue.ts'
import { json } from './http.ts'
import { handleStt, type SttEnv } from './stt.ts'
import { handleTts, type TtsEnv } from './tts.ts'

export interface Env extends TtsEnv, SttEnv, DialogueEnv {
  /** When set, every API call must send this in the x-access-code header. */
  APP_ACCESS_CODE?: string
}

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
      accessCode: !!env.APP_ACCESS_CODE,
    } satisfies ApiConfig)
  }

  if (env.APP_ACCESS_CODE && request.method !== 'GET' && request.headers.get('x-access-code') !== env.APP_ACCESS_CODE) {
    return json({ error: 'Access code required' }, 401)
  }

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
      default:
        return json({ error: 'Not found' }, 404)
    }
  } catch (err) {
    console.error('[api]', path, err)
    return json({ error: 'Server error' }, 500)
  }
}
