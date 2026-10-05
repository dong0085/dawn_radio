// Minimal types for the Web Speech recognition API (not in TypeScript's DOM lib everywhere).
interface RecognitionResult {
  isFinal: boolean
  0: { transcript: string }
}
interface RecognitionEvent {
  resultIndex: number
  results: ArrayLike<RecognitionResult>
}
interface RecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((e: RecognitionEvent) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}
type RecognitionCtor = new () => RecognitionLike

function ctor(): RecognitionCtor | undefined {
  const w = window as unknown as Record<string, RecognitionCtor | undefined>
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

export const recognitionSupported = () => typeof window !== 'undefined' && !!ctor()

export interface Recognizer {
  /** Start listening. onText receives the full text so far (final + in-progress). */
  start(onText: (text: string) => void): void
  /** Stop listening and resolve with the final text. */
  stop(): Promise<string>
  abort(): void
}

/** Speech-to-text with the browser's built-in recognizer. Step 2 swaps this for a server model. */
export function createRecognizer(lang: string, finalWaitMs = 1800): Recognizer | null {
  const Ctor = ctor()
  if (!Ctor) return null

  let rec: RecognitionLike | null = null
  let text = ''
  let ended: (() => void) | null = null

  return {
    start(onText) {
      text = ''
      rec = new Ctor()
      // Browsers list Cantonese under Hong Kong Chinese.
      rec.lang = lang.startsWith('yue') ? 'zh-HK' : lang
      rec.continuous = true
      rec.interimResults = true
      rec.onresult = (e) => {
        let full = ''
        for (let i = 0; i < e.results.length; i++) full += e.results[i][0].transcript
        text = full.trim()
        onText(text)
      }
      rec.onerror = (e) => console.warn('[recognizer]', e.error)
      rec.onend = () => ended?.()
      try {
        rec.start()
      } catch (err) {
        console.warn('[recognizer] start failed', err)
      }
    },
    stop() {
      const r = rec
      if (!r) return Promise.resolve(text)
      return new Promise((resolve) => {
        const timer = setTimeout(() => resolve(text), finalWaitMs)
        ended = () => {
          clearTimeout(timer)
          ended = null
          resolve(text)
        }
        r.stop()
      })
    },
    abort() {
      ended = null
      rec?.abort()
      rec = null
    },
  }
}
