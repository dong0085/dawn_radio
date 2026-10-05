import { useEffect, useRef, useState } from 'react'
import type { ChannelBrief, SignedChannel } from '../../shared/channels.ts'
import { createChannel } from '../api'
import { clearChannelSessions, languageSessionId, loadSession } from '../engine/session'
import { removeChannel } from '../sync'
import type { Scenario } from '../types'
import { channelLabel, nextChannelNumber } from './build'
import { loadChannels, loadCurrentId, loadLanguages, saveChannels, saveCurrentId, saveLanguages, type StoredChannel } from './store'

export type ChannelStatus =
  | { kind: 'new' }
  | { kind: 'running'; transmissions: number }
  | { kind: 'ended'; transmissions: number; outcome?: 'success' | 'failure' | 'other' }

/** One row in the channel list. */
export interface ChannelItem {
  id: string
  number: number
  /** e.g. CH-07 */
  label: string
  title: string
  /** Language the channel is heard in now. */
  targetLang: string
  level: string
  /** Built into the radio; it can be cleared but not deleted. */
  preset: boolean
  status: ChannelStatus
}

/** What the radio's channel panel can do. */
export interface ChannelsController {
  currentId: string
  /** Fresh rows, with progress read from each channel's saved session. */
  items: () => ChannelItem[]
  select: (id: string) => void
  /** Asks the server for a new channel, stores it and tunes in. */
  create: (brief: ChannelBrief, signal?: AbortSignal) => Promise<void>
  /** Removes a made channel and its progress. */
  remove: (id: string) => void
  /** Wipes a channel's saved progress, keeping the channel. */
  clear: (id: string) => void
  /** Language a channel is heard in now. */
  languageOf: (id: string) => string
  /** The channel's own language, as it was set up. */
  ownLanguageOf: (id: string) => string
  /** Hears a channel in another language. Each language keeps its own progress. */
  setLanguage: (id: string, lang: string) => void
}

export interface Preset {
  scenario: Scenario
  /** CEFR level label for the list, e.g. "A2–B1". */
  level: string
}

const presetNumber = (s: Scenario) => Number(/\d+/.exec(s.channel)?.[0] ?? 1)

function statusOf(session: string): ChannelStatus {
  const saved = loadSession(session)
  if (!saved) return { kind: 'new' }
  const transmissions = saved.transcript.length
  return saved.phase === 'ended' ? { kind: 'ended', transmissions, outcome: saved.ending?.outcome } : { kind: 'running', transmissions }
}

/** The preset plus every channel the player made, and which one the radio is tuned to. */
export function useChannels(preset: Preset) {
  const [list, setList] = useState(loadChannels)
  const [languages, setLanguages] = useState(loadLanguages)
  const [currentId, setCurrentId] = useState(() => {
    const id = loadCurrentId()
    return id && (id === preset.scenario.id || list.some((c) => c.id === id)) ? id : preset.scenario.id
  })
  // Progress to wipe once the old radio has unmounted, so it can't save over the wipe.
  const toClear = useRef<string[]>([])
  useEffect(() => {
    toClear.current.splice(0).forEach(clearChannelSessions)
  })

  const update = (next: StoredChannel[]) => {
    setList(next)
    saveChannels(next)
  }
  const select = (id: string) => {
    setCurrentId(id)
    saveCurrentId(id)
  }
  const ownLanguageOf = (id: string) => list.find((c) => c.id === id)?.bible.targetLang ?? preset.scenario.targetLang
  const languageOf = (id: string) => languages[id] ?? ownLanguageOf(id)
  const status = (id: string) => statusOf(languageSessionId(id, languageOf(id), ownLanguageOf(id)))
  const updateLanguages = (next: Record<string, string>) => {
    setLanguages(next)
    saveLanguages(next)
  }

  const controller: ChannelsController = {
    currentId,
    items: () => [
      {
        id: preset.scenario.id,
        number: presetNumber(preset.scenario),
        label: preset.scenario.channel,
        title: preset.scenario.title,
        targetLang: languageOf(preset.scenario.id),
        level: preset.level,
        preset: true,
        status: status(preset.scenario.id),
      },
      ...list.map((c) => ({
        id: c.id,
        number: c.number,
        label: channelLabel(c.number),
        title: c.display.title,
        targetLang: languageOf(c.id),
        level: c.bible.level,
        preset: false,
        status: status(c.id),
      })),
    ],
    select,
    create: async (brief, signal) => {
      const signed: SignedChannel = await createChannel(brief, signal)
      const stored: StoredChannel = {
        ...signed,
        id: signed.bible.id,
        number: nextChannelNumber([presetNumber(preset.scenario), ...list.map((c) => c.number)]),
        createdAt: Date.now(),
      }
      update([...list, stored])
      select(stored.id)
    },
    remove: (id) => {
      if (id === preset.scenario.id) return
      update(list.filter((c) => c.id !== id))
      removeChannel(id)
      const { [id]: _, ...rest } = languages
      updateLanguages(rest)
      clearChannelSessions(id)
      toClear.current.push(id)
      if (id === currentId) select(preset.scenario.id)
    },
    clear: (id) => {
      clearChannelSessions(id)
      toClear.current.push(id)
    },
    languageOf,
    ownLanguageOf,
    setLanguage: (id, lang) => {
      const { [id]: _, ...rest } = languages
      updateLanguages(lang === ownLanguageOf(id) ? rest : { ...rest, [id]: lang })
    },
  }

  return { controller, current: list.find((c) => c.id === currentId) ?? null }
}
