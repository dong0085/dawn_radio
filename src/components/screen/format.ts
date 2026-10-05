/** Seconds since the session started, as mm:ss. */
export const formatElapsed = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`

/** The code to name a language by: the script for Chinese (Simplified/Traditional), else the bare language. */
const displayCode = (tag: string) => (tag === 'zh-TW' ? 'zh-Hant' : tag.startsWith('zh') ? 'zh-Hans' : tag.split('-')[0])

/** Name of a language, e.g. "fr-FR" → "French", shown in the player's language. */
export function languageLabel(tag: string, displayIn = 'en') {
  // Browsers have few names in Cantonese itself; Hong Kong Chinese reads the same way.
  if (displayIn.startsWith('yue')) displayIn = 'zh-Hant-HK'
  try {
    const name = new Intl.DisplayNames([displayIn], { type: 'language' }).of(displayCode(tag)) ?? tag
    return name.charAt(0).toLocaleUpperCase(displayIn) + name.slice(1)
  } catch {
    return tag
  }
}

/** Name of a language in that language itself, e.g. "fr-FR" → "Français", for language pickers. */
export const ownLanguageLabel = (tag: string) => languageLabel(tag, tag)
