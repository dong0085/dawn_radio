import { NATIVE_LANGUAGES } from '../../shared/channels.ts'
import { en, type UiText } from './text'
import { zhHans } from './zh-Hans'
import { zhHant } from './zh-Hant'

export type { UiText } from './text'

/** The radio's wording for each language the player can read; others fall back to English. */
const TEXTS: Record<string, UiText> = {
  'en-US': en,
  'zh-CN': zhHans,
  'zh-TW': zhHant,
  'yue-HK': zhHant,
}

export const uiText = (lang: string): UiText => TEXTS[lang] ?? en

/** Which of our languages a browser language tag means, e.g. "zh-HK" → "zh-TW". */
function matchLanguage(tag: string): string | undefined {
  const t = tag.toLowerCase()
  if (t.startsWith('yue')) return 'yue-HK'
  if (t.startsWith('zh')) return /hant|tw|hk|mo/.test(t) ? 'zh-TW' : 'zh-CN'
  const base = t.split('-')[0]
  return NATIVE_LANGUAGES.find((l) => l.split('-')[0] === base)
}

/**
 * The player's language: their choice, else the browser's first supported language
 * that differs from the language they are learning on this channel.
 */
export function playerLanguage(choice: string | null, targetLang: string): string {
  if (choice && (NATIVE_LANGUAGES as readonly string[]).includes(choice)) return choice
  const browser = typeof navigator === 'undefined' ? [] : (navigator.languages ?? [navigator.language])
  for (const tag of browser) {
    const lang = matchLanguage(tag)
    if (lang && lang !== targetLang) return lang
  }
  return 'en-US'
}
