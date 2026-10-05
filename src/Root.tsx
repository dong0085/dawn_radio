import { useState } from 'react'
import type { RecordingDetail } from '../shared/recordings.ts'
import App from './App'
import { channelData, type ChannelData } from './channels/build'
import { useChannels } from './channels/useChannels'
import { playerLanguage, uiText } from './i18n'
import { getRecording } from './recordings'
import { caveRescue } from './scenarios/caveRescue'
import { caveRescueTranslations } from './scenarios/caveRescue.i18n'
import { localizeScripted } from './scenarios/localize'
import { languageSessionId, type SavedSession } from './engine/session'
import type { ScriptedScenario } from './engine/sources/scripted'
import { useSettings } from './settings'

const preset = { scenario: caveRescue.scenario, level: 'A2–B1' }

/**
 * Picks the channel the radio is tuned to and the languages it is heard and read in.
 * Changing channel or language mounts a fresh radio; each language keeps its own progress.
 * A saved recording plays on a radio of its own, then hands back to the live channel.
 */
export function Root() {
  const [settings] = useSettings()
  const { controller, current } = useChannels(preset)
  const [recording, setRecording] = useState<RecordingDetail | null>(null)

  const playRecording = (id: string) =>
    getRecording(id)
      .then(setRecording)
      .catch((err) => console.warn('[recordings] could not open', err))

  /** The radio for a channel heard in `targetLang`, with its words in the player's language. */
  const tune = (build: (text: ReturnType<typeof uiText>) => ScriptedScenario | ChannelData, ownLang: string, targetLang: string, session: string) => {
    const nativeLang = playerLanguage(settings.nativeLang, targetLang)
    const text = uiText(nativeLang)
    const data = build(text)
    const { log } = data.scenario
    return {
      text,
      nativeLang,
      data: {
        ...data,
        scenario: {
          ...data.scenario,
          targetLang,
          nativeLang,
          session,
          // The starting log is written in the channel's own language; in another one the writers fill it in.
          log: log && targetLang !== ownLang ? { ...log, initial: undefined } : log,
        },
      },
    }
  }
  const presetData = (nativeLang: string) => localizeScripted(caveRescue, caveRescueTranslations[nativeLang])

  if (recording) {
    const [id, lang] = recording.session.split('@')
    const stored = controller.find(id)
    const signed = stored ?? (recording.channel && { ...recording.channel, id, number: controller.items().find((c) => c.id === id)?.number ?? 0, createdAt: 0 })
    const isPreset = id === preset.scenario.id
    if (isPreset || signed) {
      const ownLang = isPreset ? preset.scenario.targetLang : signed!.bible.targetLang
      const targetLang = lang ?? ownLang
      const nativeLang = playerLanguage(settings.nativeLang, targetLang)
      const { data, text } = tune(
        (t) => (isPreset ? presetData(nativeLang) : channelData(signed!, { player: t.you, incident: t.incident })),
        ownLang,
        targetLang,
        recording.session,
      )
      return (
        <App
          key={`tape:${recording.id}`}
          data={data}
          recordedIn={ownLang}
          channels={controller}
          text={text}
          tape={{ id: recording.id, title: recording.title, savedAt: recording.updatedAt, session: recording.data as SavedSession }}
          onPlayRecording={playRecording}
          onBackToLive={() => setRecording(null)}
        />
      )
    }
  }

  const id = controller.currentId
  const ownLang = controller.ownLanguageOf(id)
  const targetLang = controller.languageOf(id)
  const { data, text, nativeLang } = tune(
    (t) => (current ? channelData(current, { player: t.you, incident: t.incident }) : presetData(playerLanguage(settings.nativeLang, targetLang))),
    ownLang,
    targetLang,
    languageSessionId(id, targetLang, ownLang),
  )
  return (
    <App
      key={`${id}|${targetLang}|${nativeLang}`}
      data={data}
      recordedIn={ownLang}
      channels={controller}
      text={text}
      onPlayRecording={playRecording}
    />
  )
}
