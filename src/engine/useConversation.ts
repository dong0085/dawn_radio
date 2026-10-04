import { useEffect, useState, useSyncExternalStore } from 'react'
import type { ApiConfig } from '../../shared/api.ts'
import { getConfig, setAccessCode } from '../api'
import type { Settings } from '../settings'
import { Conversation } from './conversation'
import { RadioAudio, type RadioAudioOptions } from './radioAudio'
import { BrowserSpeech } from './speech/browser'
import { ElevenLabsSpeech } from './speech/elevenlabs'
import type { LineSource } from './sources/types'
import type { Scenario } from '../types'

export interface UseConversationOptions {
  scenario: Scenario
  /** Creates the dialogue source. Called once; getSettings returns the latest settings. */
  createSource: (getSettings: () => Settings) => LineSource
  settings: Settings
  audio?: RadioAudioOptions
  /** TTS route under /api. */
  ttsEndpoint?: string
}

/** Builds the audio graph, voices and controller once, and exposes the live state. */
export function useConversation({ scenario, createSource, settings, audio: audioOptions, ttsEndpoint = '/tts' }: UseConversationOptions) {
  const [config, setConfig] = useState<ApiConfig | null>(null)

  const [{ conversation, audio, cfg }] = useState(() => {
    const audio = new RadioAudio(audioOptions)
    // What the server has set up; filled in once /api/config answers.
    const cfg: { current: ApiConfig | null } = { current: null }
    // Voices read the controller's current settings when they prepare each line.
    const get = () => conversation.settings
    const conversation: Conversation = new Conversation({
      scenario,
      source: createSource(get),
      audio,
      settings,
      cloudSpeechToText: () => !!cfg.current?.stt,
      voices: {
        browser: new BrowserSpeech({ rate: () => get().speechRate, volume: () => get().volume }),
        elevenlabs: new ElevenLabsSpeech(audio, { endpoint: ttsEndpoint, speed: () => get().speechRate }),
      },
    })
    return { conversation, audio, cfg }
  })

  useEffect(() => {
    setAccessCode(settings.accessCode)
    conversation.updateSettings(settings)
  }, [conversation, settings])

  useEffect(() => {
    let alive = true
    getConfig().then((c) => {
      if (!alive) return
      cfg.current = c
      setConfig(c)
      conversation.setElevenLabsAvailable(c.tts)
    })
    return () => {
      alive = false
    }
  }, [conversation, cfg])

  useEffect(() => {
    audio.setVolume(settings.volume)
    audio.setStaticLevel(settings.staticLevel)
  }, [audio, settings.volume, settings.staticLevel])

  useEffect(() => () => conversation.dispose(), [conversation])

  const state = useSyncExternalStore(conversation.subscribe, conversation.getState)
  /** null until /api/config answers. */
  return { state, conversation, config }
}
