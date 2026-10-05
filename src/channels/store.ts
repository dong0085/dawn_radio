import type { SignedChannel } from '../../shared/channels.ts'

/** A channel the player made, as kept in this browser. */
export interface StoredChannel extends SignedChannel {
  /** Same as bible.id. */
  id: string
  /** Shown as CH-07 and Incident 07. */
  number: number
  createdAt: number
}

const LIST_KEY = 'radio.channels.v1'
const CURRENT_KEY = 'radio.channel.current'
const LANGUAGES_KEY = 'radio.channel.languages.v1'

export function loadChannels(): StoredChannel[] {
  try {
    const list = JSON.parse(localStorage.getItem(LIST_KEY) ?? '[]') as unknown
    return Array.isArray(list)
      ? list.filter((c): c is StoredChannel => !!c && typeof c.id === 'string' && !!c.bible && !!c.display && typeof c.sig === 'string')
      : []
  } catch {
    return []
  }
}

export function saveChannels(list: StoredChannel[]) {
  try {
    localStorage.setItem(LIST_KEY, JSON.stringify(list))
  } catch {
    /* storage full or blocked; the list lasts until the page closes */
  }
}

export function loadCurrentId(): string | null {
  try {
    return localStorage.getItem(CURRENT_KEY)
  } catch {
    return null
  }
}

/** Language each channel is heard in, when the player switched it from the channel's own. */
export function loadLanguages(): Record<string, string> {
  try {
    const map = JSON.parse(localStorage.getItem(LANGUAGES_KEY) ?? '{}') as unknown
    return map && typeof map === 'object' && !Array.isArray(map) ? (map as Record<string, string>) : {}
  } catch {
    return {}
  }
}

export function saveLanguages(map: Record<string, string>) {
  try {
    localStorage.setItem(LANGUAGES_KEY, JSON.stringify(map))
  } catch {
    /* ignore */
  }
}

export function saveCurrentId(id: string) {
  try {
    localStorage.setItem(CURRENT_KEY, id)
  } catch {
    /* ignore */
  }
}
