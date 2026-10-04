import { useCallback, useEffect, useState } from 'react'

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

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(load)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(settings))
    } catch {
      /* storage unavailable */
    }
  }, [settings])

  const update = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((s) => ({ ...s, [key]: value }))
  }, [])

  return [settings, update] as const
}
