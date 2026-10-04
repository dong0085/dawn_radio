import { transcribe } from '../api'
import { createRecognizer } from './recognizer'

/** Turns the player's push-to-talk speech into text. */
export interface Transcriber {
  /** Start listening. onText gets in-progress text when the engine can provide it. */
  start(onText?: (text: string) => void): void
  /** Stop and resolve with the final text ('' if nothing was said). */
  stop(): Promise<string>
  abort(): void
}

const MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']

/**
 * Records with MediaRecorder and sends the clip to /api/stt (ElevenLabs Scribe).
 * The server detects the language, so mixed-language speech works.
 */
export function createCloudTranscriber(getStream: () => Promise<MediaStream>, minMs = 350): Transcriber | null {
  if (typeof MediaRecorder === 'undefined') return null
  const mimeType = MIME_TYPES.find((t) => MediaRecorder.isTypeSupported?.(t))

  let recorder: MediaRecorder | null = null
  let chunks: Blob[] = []
  let startedAt = 0
  let cancelled = false
  let starting: Promise<void> | null = null

  return {
    start() {
      cancelled = false
      chunks = []
      starting = getStream().then((stream) => {
        if (cancelled) return
        recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
        recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data)
        recorder.start()
        startedAt = performance.now()
      })
      starting.catch((err) => console.warn('[transcriber] mic unavailable', err))
    },
    async stop() {
      await starting?.catch(() => undefined)
      const r = recorder
      recorder = null
      if (!r || r.state === 'inactive') return ''
      const duration = performance.now() - startedAt
      await new Promise<void>((resolve) => {
        r.onstop = () => resolve()
        r.stop()
      })
      if (duration < minMs || !chunks.length) return ''
      const blob = new Blob(chunks, { type: r.mimeType || mimeType || 'audio/webm' })
      const { text } = await transcribe(blob)
      return text
    },
    abort() {
      cancelled = true
      const r = recorder
      recorder = null
      if (r && r.state !== 'inactive') r.stop()
    },
  }
}

/** The browser's built-in recognizer (live text, one language at a time). */
export function createBrowserTranscriber(lang: string): Transcriber | null {
  const rec = createRecognizer(lang)
  if (!rec) return null
  return {
    start: (onText) => rec.start(onText ?? (() => undefined)),
    stop: () => rec.stop(),
    abort: () => rec.abort(),
  }
}
