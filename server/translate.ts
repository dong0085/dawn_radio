import { json } from './http.ts'

export interface TranslateEnv {
  DEEPL_API_KEY?: string
}

interface TranslateBody {
  /** One or more texts to translate. */
  text?: string | string[]
  /** Target language tag, e.g. "en-US", "fr". */
  target?: string
  /** Source language tag; omit to detect. */
  source?: string
  /** Surrounding sentence, to translate a single word correctly. Not translated itself. */
  context?: string
}

const MAX_CHARS = 1500

/** DeepL wants EN-US/EN-GB and PT-PT/PT-BR for targets, plain codes elsewhere. */
function deeplTarget(tag: string) {
  const [lang, region] = tag.split('-')
  const l = lang.toUpperCase()
  if (l === 'EN') return region?.toUpperCase() === 'GB' ? 'EN-GB' : 'EN-US'
  if (l === 'PT') return region?.toUpperCase() === 'PT' ? 'PT-PT' : 'PT-BR'
  return l
}

/**
 * Translation with DeepL.
 *   POST /api/translate { text, target, source?, context? } -> { translations: [{ text, detected }] }
 */
export async function handleTranslate(request: Request, env: TranslateEnv): Promise<Response> {
  const key = env.DEEPL_API_KEY
  if (!key) return json({ error: 'DEEPL_API_KEY is not set' }, 503)
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let body: TranslateBody
  try {
    body = (await request.json()) as TranslateBody
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }
  const texts = (Array.isArray(body.text) ? body.text : [body.text]).filter((t): t is string => typeof t === 'string' && !!t.trim())
  if (!texts.length || !body.target || !/^[a-z]{2}(-[A-Za-z]{2})?$/.test(body.target)) {
    return json({ error: 'text and target are required' }, 400)
  }
  if (texts.join('').length > MAX_CHARS) return json({ error: 'Text too long' }, 400)

  // Free keys end in ":fx" and use a different host.
  const host = key.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com'
  const upstream = await fetch(`${host}/v2/translate`, {
    method: 'POST',
    headers: { authorization: `DeepL-Auth-Key ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      text: texts,
      target_lang: deeplTarget(body.target),
      ...(body.source ? { source_lang: body.source.split('-')[0].toUpperCase() } : {}),
      ...(body.context ? { context: String(body.context).slice(0, 500) } : {}),
    }),
  })
  if (!upstream.ok) {
    const detail = await upstream.text()
    return json({ error: 'Translation failed', status: upstream.status, detail: detail.slice(0, 300) }, 502)
  }
  const data = (await upstream.json()) as { translations: { text: string; detected_source_language?: string }[] }
  return json({ translations: data.translations.map((t) => ({ text: t.text, detected: t.detected_source_language })) })
}
