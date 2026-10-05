import { useCallback, useSyncExternalStore } from 'react'

export type VoiceEngineSetting = 'auto' | 'elevenlabs' | 'browser'
export type InputMode = 'voice' | 'keyboard'

export interface Settings {
  showTranslation: boolean
  highlightWords: boolean
  /** Speaking speed multiplier. */
  speechRate: number
  /** Master volume, 0–1. */
  volume: number
  /** Static and squelch loudness multiplier, 0–2. */
  staticLevel: number
  voiceEngine: VoiceEngineSetting
  inputMode: InputMode
  /** Which language the browser recognizer listens for. */
  micLanguage: 'target' | 'native'
  /** live: lines written as you listen (needs the server) · drill: the fixed training recording. */
  feed: 'live' | 'drill'
  /** The player's own language (BCP-47) for translations and the radio's wording. null: the browser's language. */
  nativeLang: string | null
  /** A narrator sets the scene before a channel opens. */
  prelude: boolean
}

export const defaultSettings: Settings = {
  showTranslation: true,
  highlightWords: true,
  speechRate: 1,
  volume: 0.9,
  staticLevel: 1,
  voiceEngine: 'auto',
  inputMode: 'voice',
  micLanguage: 'target',
  feed: 'live',
  nativeLang: null,
  prelude: true,
}

const KEY = 'radio.settings.v1'

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...defaultSettings, ...JSON.parse(raw) } : defaultSettings
  } catch {
    return defaultSettings
  }
}

// One copy for the whole page, so every part of the radio sees the same settings.
let current: Settings | null = null
const listeners = new Set<() => void>()

const get = () => (current ??= load())
const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function set(next: Settings) {
  current = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* storage unavailable */
  }
  listeners.forEach((fn) => fn())
}

export function useSettings() {
  const settings = useSyncExternalStore(subscribe, get)
  const update = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    set({ ...get(), [key]: value })
  }, [])
  return [settings, update] as const
}
