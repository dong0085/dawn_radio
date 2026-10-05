import { json } from './http.ts'

/**
 * Soundscapes under the opening narration, made by ElevenLabs' sound effects model.
 *
 *   GET /api/sfx?p=<prompt>&s=<signature>  -> audio/mpeg, a seamless loop
 *
 * Only prompts the dialogue writers produced carry a valid signature (see sceneUrl),
 * so visitors can't spend the key on sounds of their own. The same prompt always gives
 * the same address, so browsers and Cloudflare's edge cache keep the sound.
 */

export interface SfxEnv {
  ELEVENLABS_API_KEY?: string
  /** Key for signing prompts. Falls back to one derived from ANTHROPIC_API_KEY. */
  CHANNEL_SECRET?: string
  ANTHROPIC_API_KEY?: string
}

export const SFX_PROMPT_CHARS = 240
/** Seconds of sound; it loops under the narration. */
const LOOP_SECONDS = 22

const encoder = new TextEncoder()

function key(env: SfxEnv) {
  const secret = env.CHANNEL_SECRET || env.ANTHROPIC_API_KEY
  if (!secret) return null
  return crypto.subtle.importKey('raw', encoder.encode(`sfx-v1:${secret}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
}

async function sign(env: SfxEnv, prompt: string) {
  const k = await key(env)
  if (!k) return null
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', k, encoder.encode(prompt)))
  return [...mac.slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** The address of a soundscape, or null when sounds can't be made here. */
export async function sceneUrl(env: SfxEnv, prompt: string) {
  const p = prompt.replace(/\s+/g, ' ').trim().slice(0, SFX_PROMPT_CHARS)
  if (!p || !env.ELEVENLABS_API_KEY) return null
  const s = await sign(env, p)
  return s ? `/api/sfx?${new URLSearchParams({ p, s })}` : null
}

interface EdgeCache {
  match(request: Request): Promise<Response | undefined>
  put(request: Request, response: Response): Promise<void>
}
const edgeCache = () => (globalThis as { caches?: { default?: EdgeCache } }).caches?.default

export async function handleSfx(request: Request, env: SfxEnv): Promise<Response> {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405)
  if (!env.ELEVENLABS_API_KEY) return json({ error: 'ELEVENLABS_API_KEY is not set' }, 503)
  const url = new URL(request.url)
  const prompt = url.searchParams.get('p') ?? ''
  if (!prompt || prompt.length > SFX_PROMPT_CHARS || url.searchParams.get('s') !== (await sign(env, prompt))) {
    return json({ error: 'Invalid sound' }, 400)
  }

  const cache = edgeCache()
  const cached = await cache?.match(request)
  if (cached) return cached

  const upstream = await fetch('https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128', {
    method: 'POST',
    headers: { 'xi-api-key': env.ELEVENLABS_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({
      text: `${prompt} No music, no voices, no speech.`,
      duration_seconds: LOOP_SECONDS,
      loop: true,
      prompt_influence: 0.5,
    }),
    signal: request.signal,
  })
  if (!upstream.ok) {
    const detail = await upstream.text()
    return json({ error: 'ElevenLabs request failed', status: upstream.status, detail: detail.slice(0, 500) }, 502)
  }
  const response = new Response(await upstream.arrayBuffer(), {
    headers: { 'content-type': 'audio/mpeg', 'cache-control': 'public, max-age=31536000, immutable' },
  })
  await cache?.put(request, response.clone()).catch(() => undefined)
  return response
}
