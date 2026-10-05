import { useState } from 'react'
import type { RecordingDetail } from '../shared/recordings.ts'
import App from './App'
import { channelData, type ChannelData } from './channels/build'
import type { StoredChannel } from './channels/store'
import { useChannels } from './channels/useChannels'
import { playerLanguage, uiText, type UiText } from './i18n'
import { getRecording } from './recordings'
import { caveRescue } from './scenarios/caveRescue'
import { caveRescueTranslations } from './scenarios/caveRescue.i18n'
import { localizeScripted } from './scenarios/localize'
import { loadSession, type SavedSession } from './engine/session'
import type { ScriptedScenario } from './engine/sources/scripted'
import { useSettings } from './settings'

const preset = { scenario: caveRescue.scenario, level: 'A2–B1' }

/**
 * Picks the channel the radio is tuned to. Its languages are fixed for the whole session:
 * a made channel keeps the ones it was made with, and the preset keeps the player's language
 * from when its session started. A saved recording plays on a radio of its own, then hands back to the live channel.
 */
export function Root() {
  const [settings] = useSettings()
  const { controller, current } = useChannels(preset)
  const [recording, setRecording] = useState<RecordingDetail | null>(null)

  const playRecording = (id: string) =>
    getRecording(id)
      .then(setRecording)
      .catch((err) => console.warn('[recordings] could not open', err))

  /** The radio for a made channel, or for the preset when `channel` is null. */
  const tune = (channel: StoredChannel | null, saved: SavedSession | null): { text: UiText; data: ScriptedScenario | ChannelData } => {
    if (channel) {
      const text = uiText(channel.bible.nativeLang)
      return { text, data: channelData(channel, { player: text.you, incident: text.incident }) }
    }
    const nativeLang = saved?.nativeLang ?? playerLanguage(settings.nativeLang, preset.scenario.targetLang)
    const data = localizeScripted(caveRescue, caveRescueTranslations[nativeLang])
    return { text: uiText(nativeLang), data: { ...data, scenario: { ...data.scenario, nativeLang } } }
  }

  if (recording) {
    // Older recordings may carry a language in their session id ("id@lang").
    const [id] = recording.session.split('@')
    const stored = controller.find(id)
    const signed = stored ?? (recording.channel && { ...recording.channel, id, number: controller.items().find((c) => c.id === id)?.number ?? 0, createdAt: 0 })
    if (id === preset.scenario.id || signed) {
      const session = recording.data as SavedSession
      const { data, text } = tune(signed || null, session)
      return (
        <App
          key={`tape:${recording.id}`}
          data={{ ...data, scenario: { ...data.scenario, session: recording.session } }}
          channels={controller}
          text={text}
          tape={{ id: recording.id, title: recording.title, savedAt: recording.updatedAt, session }}
          onPlayRecording={playRecording}
          onBackToLive={() => setRecording(null)}
        />
      )
    }
  }

  const id = controller.currentId
  const { data, text } = tune(current, current ? null : loadSession(id))
  return <App key={`${id}|${data.scenario.nativeLang}`} data={data} channels={controller} text={text} onPlayRecording={playRecording} />
}
