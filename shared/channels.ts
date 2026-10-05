/**
 * Channels the player makes from a short briefing. Shared by the browser and the server.
 * The server writes the story bible and signs it; the browser keeps it and sends it back
 * with each dialogue request, and the server only accepts bibles carrying its signature.
 */

import type { Bilingual, LogTone } from './api.ts'
import type { StoryBible } from './stories.ts'

/** Languages a channel can be in: ElevenLabs voices, Scribe and DeepL all cover these. */
export const CHANNEL_LANGUAGES = [
  { tag: 'fr-FR', name: 'French' },
  { tag: 'es-ES', name: 'Spanish' },
  { tag: 'de-DE', name: 'German' },
  { tag: 'it-IT', name: 'Italian' },
  { tag: 'pt-BR', name: 'Portuguese' },
  { tag: 'ja-JP', name: 'Japanese' },
] as const

/** Languages the player can follow along in: translations, word lookups and the radio's own wording. */
export const NATIVE_LANGUAGES = ['en-US', 'zh-CN', 'zh-TW', 'yue-HK', ...CHANNEL_LANGUAGES.map((l) => l.tag)] as const

/** English name of a language for the writers' instructions, e.g. "fr-FR" → "French". */
export function languageName(tag: string) {
  // "Chinese" alone leaves the script open.
  if (tag === 'zh-TW') return 'Traditional Chinese'
  if (tag.startsWith('zh')) return 'Simplified Chinese'
  if (tag.startsWith('yue')) return 'written Cantonese (Traditional characters)'
  const code = tag.split('-')[0]
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? tag
  } catch {
    return tag
  }
}

export const CHANNEL_LEVELS = ['A1', 'A2', 'B1', 'B2'] as const
export type ChannelLevel = (typeof CHANNEL_LEVELS)[number]

/** How much pressure the situation puts on the people on the channel. */
export const CHANNEL_TENSIONS = ['calm', 'steady', 'intense'] as const
export type ChannelTension = (typeof CHANNEL_TENSIONS)[number]

/** Background sound at each end of the channel (generated in the browser). */
export const CHANNEL_AMBIENCES = ['cave', 'room', 'rain', 'none'] as const
export type ChannelAmbience = (typeof CHANNEL_AMBIENCES)[number]

export const CHANNEL_SIGNALS = ['strong', 'fair', 'weak'] as const
export type ChannelSignal = (typeof CHANNEL_SIGNALS)[number]

/**
 * ElevenLabs premade voices the writers cast from. They are multilingual, so any of them
 * can speak any channel language. Replace with voices from your own library if you like.
 */
export const VOICE_POOL = [
  { id: 'JBFqnCBsd6RMkjVDRZzb', gender: 'male', about: 'middle-aged, warm, steady' },
  { id: 'onwK4e9ZLuTAKqWW03F9', gender: 'male', about: 'middle-aged, clear, authoritative' },
  { id: 'nPczCjzI2devNBz1zQrb', gender: 'male', about: 'deep, calm, measured' },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', gender: 'male', about: 'young, energetic' },
  { id: 'EXAVITQu4vr4xnSDxMaL', gender: 'female', about: 'young adult, soft, friendly' },
  { id: 'XrExE9yKIg1WjnnlVkGX', gender: 'female', about: 'warm, confident' },
  { id: 'XB0fDUnXU5powFXDhCwa', gender: 'female', about: 'calm, precise' },
  { id: 'cgSgspJ2msm6clMCkdW9', gender: 'female', about: 'young, expressive' },
] as const

/** What the player asks for. */
export interface ChannelBrief {
  /** What's going on, in the player's words. May be empty: the writers then pick something. */
  about: string
  /** Who the player is on the channel, in their words. Empty: the writers decide. */
  role?: string
  tension?: ChannelTension
  targetLang: string
  nativeLang: string
  level: ChannelLevel
}

export interface ChannelPartyDisplay {
  /** Party id in the bible. */
  id: string
  /** Operational role shown on the radio, in the player's language, e.g. "Harbour Office". */
  name: string
  voiceId: string
  ambience: ChannelAmbience
  signal: ChannelSignal
}

/** How the radio shows the channel. Only the browser reads this, so it is not signed. */
export interface ChannelDisplay {
  /** Two to four words, in the player's language. */
  title: string
  /** Two or three sentences shown on standby, in the player's language. */
  premise: string
  parties: [ChannelPartyDisplay, ChannelPartyDisplay]
  log: {
    title: string
    /** Same ids as the bible's logSections. */
    sections: { id: string; title: string; layout: 'list' | 'route' }[]
    objective: Bilingual
    entries: { id: string; section: string; label: Bilingual; state?: Bilingual; tone?: LogTone }[]
  }
}

/** A channel as the server hands it out. */
export interface SignedChannel {
  bible: StoryBible
  display: ChannelDisplay
  /** HMAC of the bible, from the server. */
  sig: string
}

/** POST /api/channel takes a ChannelBrief and answers with a SignedChannel. */
export type ChannelRequest = ChannelBrief
export type ChannelResponse = SignedChannel

/** Limits the server enforces on a briefing. */
export const BRIEF_LIMITS = { aboutChars: 300, roleChars: 120 }
