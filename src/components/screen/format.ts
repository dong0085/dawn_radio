/** Seconds since the session started, as mm:ss. */
export const formatElapsed = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`

/** Name of a language, e.g. "fr-FR" → "French", shown in the player's language. */
export function languageLabel(tag: string, displayIn = 'en') {
  try {
    const name = new Intl.DisplayNames([displayIn], { type: 'language' }).of(tag.split('-')[0]) ?? tag
    return name.charAt(0).toLocaleUpperCase(displayIn) + name.slice(1)
  } catch {
    return tag
  }
}
