import { useEffect, useState, useSyncExternalStore } from 'react'
import type { ApiConfig } from '../../shared/api.ts'
import { getConfig, translate } from '../api'
import type { Settings } from '../settings'
import { Conversation, type ConversationNotices } from './conversation'
import { clearSession, loadSession, saveSession, sessionId } from './session'
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
  /** Reopen the last saved session for this scenario (default true). */
  resume?: boolean
  /** Status messages flashed on the screen. */
  notices?: Partial<ConversationNotices>
}

/** Builds the audio graph, voices and controller once, and exposes the live state. */
export function useConversation({
  scenario,
  createSource,
  settings,
  audio: audioOptions,
  ttsEndpoint = '/tts',
  resume = true,
  notices,
}: UseConversationOptions) {
  const session = sessionId(scenario)
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
      notices,
      cloudSpeechToText: () => !!cfg.current?.stt,
      translatePlayer: (text) => {
        if (!cfg.current?.translate) return null
        const { targetLang, nativeLang } = scenario
        // Naming the other language as the source handles mixed-language messages.
        return Promise.all([
          translate([text], targetLang, { source: nativeLang }),
          translate([text], nativeLang, { source: targetLang }),
        ]).then(([[target], [native]]) => ({ target, native }))
      },
      voices: {
        browser: new BrowserSpeech({ rate: () => get().speechRate, volume: () => get().volume }),
        elevenlabs: new ElevenLabsSpeech(audio, { endpoint: ttsEndpoint, speed: () => get().speechRate }),
      },
    })
    const saved = resume ? loadSession(session) : null
    if (saved) conversation.restore(saved)
    return { conversation, audio, cfg }
  })

  // Save at most once a second while things change, and right away when the page is hidden.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const save = () => {
      clearTimeout(timer)
      timer = undefined
      const snap = conversation.snapshot()
      if (snap) saveSession(snap)
      // A fresh start (nothing said yet) replaces the old save.
      else if (conversation.getState().phase === 'running') clearSession(session)
    }
    const unsubscribe = conversation.subscribe(() => {
      timer ??= setTimeout(save, 1000)
    })
    const onHide = () => document.visibilityState === 'hidden' && save()
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', save)
    return () => {
      unsubscribe()
      // Retuning (another channel or language) unmounts the radio: keep what just changed.
      if (timer) save()
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', save)
    }
  }, [conversation, session])

  useEffect(() => {
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

  useEffect(
    () => () => {
      conversation.dispose()
      // Switching channels remounts the radio; free its audio context too.
      audio.dispose()
    },
    [conversation, audio],
  )

  const state = useSyncExternalStore(conversation.subscribe, conversation.getState)
  /** null until /api/config answers. */
  return { state, conversation, config }
}
