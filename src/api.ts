import type {
  ApiConfig,
  DialogueDone,
  DialogueEvent,
  DialogueLine,
  DialogueRequest,
  SttResponse,
  TranslateResponse,
} from '../shared/api.ts'
import type { ChannelRequest, ChannelResponse } from '../shared/channels.ts'
import { playerId } from './player'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** fetch() for our /api routes: sends the player id and turns errors into ApiError. */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  headers.set('x-player', playerId())
  const res = await fetch(`/api${path}`, { ...init, headers })
  if (!res.ok) {
    let message = res.statusText
    try {
      const body = (await res.json()) as { error?: string }
      message = body.error ?? message
    } catch {
      /* not JSON */
    }
    throw new ApiError(res.status, message)
  }
  return res
}

const offline: ApiConfig = { dialogue: false, tts: false, stt: false, translate: false, channels: false, db: false, admin: false }
let configPromise: Promise<ApiConfig> | null = null

/** What the server has set up. Fetched once; offline defaults if the API is missing. */
export function getConfig(): Promise<ApiConfig> {
  configPromise ??= fetch('/api/config')
    .then((r) => (r.ok ? (r.json() as Promise<ApiConfig>) : offline))
    .catch(() => offline)
  return configPromise
}

/**
 * Streams a batch of dialogue. onLine fires as each line is written;
 * resolves with the story memory once the batch is complete.
 */
export async function streamDialogue(
  body: DialogueRequest,
  {
    onLine,
    onPlayer,
    signal,
  }: { onLine: (line: DialogueLine) => void; onPlayer?: (player: { target: string; native: string }) => void; signal?: AbortSignal },
): Promise<DialogueDone> {
  const res = await apiFetch('/dialogue', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  let done: DialogueDone | null = null
  await readNdjson<DialogueEvent>(res, (event) => {
    if (event.type === 'line') onLine(event.line)
    else if (event.type === 'player') onPlayer?.(event.player)
    else if (event.type === 'done') done = event
    else throw new ApiError(event.status, event.error)
  })
  if (!done) throw new ApiError(502, 'The channel closed early')
  return done
}

/** Reads a newline-delimited JSON stream, calling onEvent for each object. */
export async function readNdjson<T>(res: Response, onEvent: (event: T) => void) {
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (value) buf += decoder.decode(value, { stream: !done })
    let i: number
    while ((i = buf.indexOf('\n')) >= 0) {
      const text = buf.slice(0, i).trim()
      buf = buf.slice(i + 1)
      if (text) onEvent(JSON.parse(text) as T)
    }
    if (done) break
  }
  if (buf.trim()) onEvent(JSON.parse(buf) as T)
}

const translations = new Map<string, Promise<TranslateResponse['translations']>>()

/** DeepL translation (cached), with the language DeepL read each text as. */
export function translateDetect(
  text: string[],
  target: string,
  opts: { source?: string; context?: string } = {},
): Promise<TranslateResponse['translations']> {
  const key = JSON.stringify([text, target, opts.source, opts.context])
  let p = translations.get(key)
  if (!p) {
    p = apiFetch('/translate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, target, ...opts }),
    })
      .then((r) => r.json() as Promise<TranslateResponse>)
      .then((d) => d.translations)
    translations.set(key, p)
    p.catch(() => translations.delete(key))
  }
  return p
}

/** DeepL translation (cached). `context` helps translate a single word in its sentence. */
export function translate(text: string[], target: string, opts: { source?: string; context?: string } = {}): Promise<string[]> {
  return translateDetect(text, target, opts).then((t) => t.map((x) => x.text))
}

/** Has the server write and sign a new channel from a briefing. Takes 10 to 30 seconds. */
export async function createChannel(brief: ChannelRequest, signal?: AbortSignal): Promise<ChannelResponse> {
  const res = await apiFetch('/channel', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(brief),
    signal,
  })
  return res.json()
}

export async function transcribe(audio: Blob): Promise<SttResponse> {
  const res = await apiFetch('/stt', {
    method: 'POST',
    headers: { 'content-type': audio.type || 'audio/webm' },
    body: audio,
  })
  return res.json()
}
