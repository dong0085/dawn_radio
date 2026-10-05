import { VOICE_POOL, type ChannelAmbience, type ChannelSignal } from '../../shared/channels.ts'
import type { AmbienceSpec } from '../engine/ambience'
import type { Party, Scenario } from '../types'
import type { StoredChannel } from './store'

/** Two-digit channel number, as on the radio: CH-07. */
export const channelLabel = (n: number) => `CH-${String(n).padStart(2, '0')}`

/** A frequency per channel number, in the 446 MHz band (CH-04 → 446.200 MHz). */
export const frequencyFor = (n: number) => `${(446.1 + n * 0.025).toFixed(3)} MHz`

/** The player's own light color on every made channel. */
export const PLAYER_COLOR = '#3dff9a'

/** The narrator's subtitle color on every made channel. */
export const NARRATOR_COLOR = '#f2e6c9'

/** Voices the narrator takes, best first; the first one neither side uses. */
const NARRATOR_VOICES = ['nPczCjzI2devNBz1zQrb', 'onwK4e9ZLuTAKqWW03F9', 'XB0fDUnXU5powFXDhCwa', 'XrExE9yKIg1WjnnlVkGX']

/** Next free number after the preset and every stored channel. */
export const nextChannelNumber = (taken: number[]) => Math.max(...taken) + 1

/** Light colors per side, picked by channel number. The player's green stays clear of them. */
export const PALETTES: [string, string][] = [
  ['#2fc4ff', '#ffb23f'],
  ['#b98cff', '#ffcf5c'],
  ['#ff8a7a', '#7fd4ff'],
  ['#ffb23f', '#c3a6ff'],
]

const AMBIENCE_GAIN: Record<ChannelAmbience, number> = { cave: 0.18, room: 0.12, rain: 0.15, none: 0 }
const SIGNAL: Record<ChannelSignal, number> = { strong: 1, fair: 0.75, weak: 0.5 }

/** Everything the radio needs to run a stored channel. */
export interface ChannelData {
  scenario: Scenario
  /** Sent with each dialogue request; the server checks the signature. */
  channel: { bible: StoredChannel['bible']; sig: string }
}

/** Wording the radio adds around a made channel, in the player's language. */
export interface ChannelWords {
  player: string
  incident: (number: string) => string
}

export function channelData(ch: StoredChannel, words: ChannelWords = { player: 'You', incident: (n) => `Incident ${n}` }): ChannelData {
  const { bible, display } = ch
  const colors = PALETTES[ch.number % PALETTES.length]

  const parties = display.parties.map((p, i): Party => {
    const voice = VOICE_POOL.find((v) => v.id === p.voiceId)
    const ambience: AmbienceSpec = { kind: p.ambience, gain: AMBIENCE_GAIN[p.ambience] }
    return {
      id: p.id,
      name: p.name,
      side: i === 0 ? 'left' : 'right',
      color: colors[i],
      radio: { ambience, signal: SIGNAL[p.signal] },
      voice: { elevenLabsVoiceId: p.voiceId, browserPitch: voice?.gender === 'female' ? 1.1 : 0.85 },
    }
  }) as [Party, Party]

  const narratorVoice = NARRATOR_VOICES.find((id) => !display.parties.some((p) => p.voiceId === id)) ?? NARRATOR_VOICES[0]
  const narratorGender = VOICE_POOL.find((v) => v.id === narratorVoice)?.gender

  const scenario: Scenario = {
    id: ch.id,
    incident: words.incident(String(ch.number).padStart(2, '0')),
    title: display.title,
    channel: channelLabel(ch.number),
    frequency: frequencyFor(ch.number),
    targetLang: bible.targetLang,
    nativeLang: bible.nativeLang,
    premise: display.premise,
    parties,
    player: { name: words.player, color: PLAYER_COLOR },
    narrator: {
      color: NARRATOR_COLOR,
      voice: { elevenLabsVoiceId: narratorVoice, browserPitch: narratorGender === 'female' ? 1.05 : 0.95 },
    },
    log: {
      title: display.log.title,
      sections: display.log.sections,
      initial: {
        objective: display.log.objective.text ? display.log.objective : undefined,
        // Party entries take the party's light color.
        entries: display.log.entries.map((e) => ({ ...e, color: parties.find((p) => p.id === e.id)?.color })),
      },
    },
  }
  return { scenario, channel: { bible, sig: ch.sig } }
}
