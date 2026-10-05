import { useEffect, useRef, useState } from 'react'
import type { ChannelBrief, SignedChannel } from '../../shared/channels.ts'
import { createChannel } from '../api'
import { clearSession, loadSession } from '../engine/session'
import type { Scenario } from '../types'
import { channelLabel, nextChannelNumber } from './build'
import { loadChannels, loadCurrentId, saveChannels, saveCurrentId, type StoredChannel } from './store'

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
}

export interface Preset {
  scenario: Scenario
  /** CEFR level label for the list, e.g. "A2–B1". */
  level: string
}

const presetNumber = (s: Scenario) => Number(/\d+/.exec(s.channel)?.[0] ?? 1)

function statusOf(id: string): ChannelStatus {
  const saved = loadSession(id)
  if (!saved) return { kind: 'new' }
  const transmissions = saved.transcript.length
  return saved.phase === 'ended' ? { kind: 'ended', transmissions, outcome: saved.ending?.outcome } : { kind: 'running', transmissions }
}

/** The preset plus every channel the player made, and which one the radio is tuned to. */
export function useChannels(preset: Preset) {
  const [list, setList] = useState(loadChannels)
  const [currentId, setCurrentId] = useState(() => {
    const id = loadCurrentId()
    return id && (id === preset.scenario.id || list.some((c) => c.id === id)) ? id : preset.scenario.id
  })
  // Progress to wipe once the old radio has unmounted, so it can't save over the wipe.
  const toClear = useRef<string[]>([])
  useEffect(() => {
    toClear.current.splice(0).forEach(clearSession)
  })

  const update = (next: StoredChannel[]) => {
    setList(next)
    saveChannels(next)
  }
  const select = (id: string) => {
    setCurrentId(id)
    saveCurrentId(id)
  }

  const controller: ChannelsController = {
    currentId,
    items: () => [
      {
        id: preset.scenario.id,
        number: presetNumber(preset.scenario),
        label: preset.scenario.channel,
        title: preset.scenario.title,
        targetLang: preset.scenario.targetLang,
        level: preset.level,
        preset: true,
        status: statusOf(preset.scenario.id),
      },
      ...list.map((c) => ({
        id: c.id,
        number: c.number,
        label: channelLabel(c.number),
        title: c.display.title,
        targetLang: c.bible.targetLang,
        level: c.bible.level,
        preset: false,
        status: statusOf(c.id),
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
      clearSession(id)
      toClear.current.push(id)
      if (id === currentId) select(preset.scenario.id)
    },
    clear: (id) => {
      clearSession(id)
      toClear.current.push(id)
    },
  }

  return { controller, current: list.find((c) => c.id === currentId) ?? null }
}
