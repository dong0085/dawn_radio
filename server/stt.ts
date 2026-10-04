import { LIMITS, type SttResponse } from '../shared/api.ts'
import { json } from './http.ts'

export interface SttEnv {
  ELEVENLABS_API_KEY?: string
  /** ElevenLabs speech-to-text model. Defaults to scribe_v1. */
  ELEVENLABS_STT_MODEL?: string
}

/**
 * Speech-to-text with ElevenLabs Scribe.
 *   POST /api/stt  (body: raw audio, any common format) -> { text, languageCode }
 * The language is detected automatically, so mixed-language speech works.
 */
export async function handleStt(request: Request, env: SttEnv): Promise<Response> {
  if (!env.ELEVENLABS_API_KEY) return json({ error: 'ELEVENLABS_API_KEY is not set' }, 503)
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const audio = await request.arrayBuffer()
  if (audio.byteLength < 1000) return json({ text: '' } satisfies SttResponse)
  if (audio.byteLength > LIMITS.sttBytes) return json({ error: 'Recording is too long' }, 413)

  const type = request.headers.get('content-type') || 'audio/webm'
  const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : type.includes('wav') ? 'wav' : 'webm'
  const form = new FormData()
  form.append('model_id', env.ELEVENLABS_STT_MODEL || 'scribe_v1')
  form.append('file', new Blob([audio], { type }), `speech.${ext}`)
  form.append('tag_audio_events', 'false')

  const upstream = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: { 'xi-api-key': env.ELEVENLABS_API_KEY },
    body: form,
  })
  if (!upstream.ok) {
    const detail = await upstream.text()
    return json({ error: 'Speech-to-text failed', status: upstream.status, detail: detail.slice(0, 500) }, 502)
  }
  const data = (await upstream.json()) as { text?: string; language_code?: string }
  return json({ text: (data.text ?? '').trim(), languageCode: data.language_code } satisfies SttResponse)
}
