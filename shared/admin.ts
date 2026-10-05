/** Response shapes for /api/admin, shared by the admin page and the server. */

import type { ChannelBrief, ChannelDisplay } from './channels.ts'
import type { StoryBible } from './stories.ts'

export interface AdminOverview {
  totals: { players: number; channels: number; sessions: number; hidden: number; endedSessions: number }
  /** Players seen in the last day and the last 7 days. */
  active: { day: number; week: number }
  /** Oldest first, one entry per UTC day, including empty days. */
  days: { day: string; channels: number; requests: number }[]
  /** Requests per route over the same days. */
  routes: { route: string; count: number }[]
}

export interface AdminChannelRow {
  id: string
  owner: string
  title: string
  targetLang: string
  level: string
  /** The briefing the player wrote, if any. */
  about: string
  createdAt: number
  hidden: boolean
  removedAt: number | null
  sessions: number
  transmissions: number
}

export interface AdminChannel extends AdminChannelRow {
  brief: Partial<ChannelBrief>
  bible: StoryBible
  display: ChannelDisplay
  sessionList: AdminSessionRow[]
}

export interface AdminSessionRow {
  player: string
  channel: string
  /** Channel title, or the channel id when the channel isn't stored. */
  title: string
  phase: 'running' | 'ended'
  transmissions: number
  outcome: string | null
  updatedAt: number
}

export interface AdminSession extends AdminSessionRow {
  /** The session as the browser saved it (SavedSession). */
  data: {
    elapsed?: number
    transcript: { id: string; speaker: string; at: number; interrupted?: boolean; rendering?: string; segments: { text: string; translation: string }[] }[]
    ending: { outcome: string; title: string; summary: string } | null
  }
  /** Who is who on the channel. */
  parties: { id: string; name: string }[]
}

export interface AdminPlayerRow {
  id: string
  createdAt: number
  seenAt: number
  channels: number
  sessions: number
  /** Requests in the last 7 days. */
  requests: number
}

export interface AdminPlayer extends AdminPlayerRow {
  channelList: AdminChannelRow[]
  sessionList: AdminSessionRow[]
  /** Requests per route in the last 14 days. */
  usage: { route: string; count: number }[]
}

export interface AdminPage<T> {
  rows: T[]
  total: number
}
