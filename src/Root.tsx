import App from './App'
import { channelData } from './channels/build'
import { useChannels } from './channels/useChannels'
import { playerLanguage, uiText } from './i18n'
import { caveRescue } from './scenarios/caveRescue'
import { caveRescueTranslations } from './scenarios/caveRescue.i18n'
import { localizeScripted } from './scenarios/localize'
import { languageSessionId } from './engine/session'
import { useSettings } from './settings'

const preset = { scenario: caveRescue.scenario, level: 'A2–B1' }

/**
 * Picks the channel the radio is tuned to and the languages it is heard and read in.
 * Changing channel or language mounts a fresh radio; each language keeps its own progress.
 */
export function Root() {
  const [settings] = useSettings()
  const { controller, current } = useChannels(preset)
  const id = controller.currentId
  const ownLang = controller.ownLanguageOf(id)
  const targetLang = controller.languageOf(id)
  const nativeLang = playerLanguage(settings.nativeLang, targetLang)
  const text = uiText(nativeLang)

  const data = current ? channelData(current, { player: text.you, incident: text.incident }) : localizeScripted(caveRescue, caveRescueTranslations[nativeLang])
  const { log } = data.scenario
  const tuned = {
    ...data,
    scenario: {
      ...data.scenario,
      targetLang,
      nativeLang,
      session: languageSessionId(id, targetLang, ownLang),
      // The starting log is written in the channel's own language; in another one the writers fill it in.
      log: log && targetLang !== ownLang ? { ...log, initial: undefined } : log,
    },
  }
  return <App key={`${id}|${targetLang}|${nativeLang}`} data={tuned} recordedIn={ownLang} channels={controller} text={text} />
}
