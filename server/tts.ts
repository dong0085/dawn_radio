import { LIMITS, TTS_STREAM_SAMPLE_RATE } from '../shared/api.ts'
import { json } from './http.ts'

/**
 * Text-to-speech proxy. Keeps the ElevenLabs key on the server.
 *
 *   GET  /api/tts         -> { enabled: boolean }
 *   POST /api/tts         { text, voiceId, languageCode?, speed? }
 *                         -> one JSON object: audio_base64 (mp3) + character alignment
 *   POST /api/tts/stream  same body
 *                         -> newline-delimited JSON chunks: audio_base64 (16-bit PCM) + alignment
 */


export interface TtsEnv {
  ELEVENLABS_API_KEY?: string
  /** e.g. eleven_multilingual_v2 (default) or eleven_flash_v2_5 (faster, cheaper). */
  ELEVENLABS_MODEL_ID?: string
}

interface TtsBody {
  /** How to perform the line, e.g. "urgent". Sent as a [tag] on models that support them. */
  delivery?: string
  text?: string
  voiceId?: string
  languageCode?: string
  speed?: number
}

const MAX_CHARS = LIMITS.ttsChars

export async function handleTts(request: Request, env: TtsEnv, { stream = false } = {}): Promise<Response> {
  const key = env.ELEVENLABS_API_KEY
  if (request.method === 'GET') return json({ enabled: !!key })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  if (!key) return json({ error: 'ELEVENLABS_API_KEY is not set' }, 503)

  let body: TtsBody
  try {
    body = (await request.json()) as TtsBody
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }
  const text = body.text?.trim()
  const voiceId = body.voiceId?.trim()
  if (!text || !voiceId || !/^[A-Za-z0-9]+$/.test(voiceId)) return json({ error: 'text and voiceId are required' }, 400)
  if (text.length > MAX_CHARS) return json({ error: `text is longer than ${MAX_CHARS} characters` }, 400)

  const model = env.ELEVENLABS_MODEL_ID || 'eleven_v4'
  // Expressive models (v3, v4) perform [tags]; older models would read them aloud.
  const tag = body.delivery && /^[a-z ]{2,20}$/.test(body.delivery) && /eleven_v[34]/.test(model) ? `[${body.delivery}] ` : ''
  const payload: Record<string, unknown> = { text: tag + text, model_id: model }
  // Only some models accept a forced language.
  if (body.languageCode && /flash|turbo/.test(model)) payload.language_code = body.languageCode
  if (body.speed && body.speed !== 1) {
    payload.voice_settings = { speed: Math.min(1.2, Math.max(0.7, body.speed)) }
  }

  const url = stream
    ? `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream/with-timestamps?output_format=pcm_${TTS_STREAM_SAMPLE_RATE}`
    : `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_128`
  const upstream = await fetch(url, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: request.signal,
    })

  if (!upstream.ok) {
    const detail = await upstream.text()
    return json({ error: 'ElevenLabs request failed', status: upstream.status, detail: detail.slice(0, 500) }, 502)
  }
  return new Response(upstream.body, {
    headers: { 'content-type': stream ? 'application/x-ndjson' : 'application/json', 'cache-control': 'no-store' },
  })
}
