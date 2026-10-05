import { useSyncExternalStore } from 'react'
import data from './changelog.json'

/** One version of the radio and what changed in it. */
export interface Release {
  version: string
  /** Day it went out, YYYY-MM-DD. */
  date: string
  /** Last commit this version covers. The next version lists the commits after it. */
  commit: string
  /** Short lines for listeners, by language (BCP-47). */
  notes: Record<string, string[]>
}

export interface Changelog {
  /** Public repository, for links to each version's commits. */
  repo: string
  /** Languages every release is written in. The first is the fallback. */
  languages: string[]
  /** Newest first. */
  releases: Release[]
}

export const changelog = data as Changelog

/** The version this page was built at. */
export const currentVersion = changelog.releases[0]?.version ?? '0.0.0'

/** Negative when a is older than b, positive when newer. */
export function compareVersions(a: string, b: string) {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d) return d
  }
  return 0
}

/** Languages that read another one's notes. */
const NOTE_FALLBACK: Record<string, string> = { 'yue-HK': 'zh-TW' }

/** A release's notes in `lang`, or the closest language it was written in. */
export function notesIn(release: Release, lang: string) {
  const { notes } = release
  return notes[lang] ?? notes[NOTE_FALLBACK[lang]] ?? notes[changelog.languages[0]] ?? []
}

/** Link to the commits in a release: since the version before it, or all history for the first. */
export function commitsUrl(release: Release) {
  const i = changelog.releases.indexOf(release)
  const before = changelog.releases[i + 1]
  return before ? `${changelog.repo}/compare/${before.commit}...${release.commit}` : `${changelog.repo}/commits/${release.commit}`
}

// ---------- What this browser has seen ----------

const SEEN_KEY = 'radio.changelog.seen'
/** Keys a browser that used the radio before the changelog existed has. */
const EARLIER_VISIT_KEYS = ['radio.settings.v1', 'radio.training.v1']

function read(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, currentVersion)
  } catch {
    /* storage unavailable */
  }
}

/**
 * The version this browser last saw. A first visit counts as seeing the current one,
 * so new listeners start without a list of changes; a browser from before the changelog counts as 0.0.0.
 */
function lastSeen() {
  const seen = read(SEEN_KEY)
  if (seen) return seen
  if (EARLIER_VISIT_KEYS.some((k) => read(k) !== null)) return '0.0.0'
  markSeen()
  return currentVersion
}

/** Releases newer than `version`, newest first. */
export const releasesAfter = (version: string) => changelog.releases.filter((r) => compareVersions(r.version, version) > 0)

// ---------- Open state, shared by the page and the settings row ----------

/** Releases on show, or null when closed. */
let shown: Release[] | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((fn) => fn())

{
  const fresh = releasesAfter(lastSeen())
  if (fresh.length) shown = fresh
}

export function openChangelog(releases: Release[] = changelog.releases) {
  shown = releases
  emit()
}

export function closeChangelog() {
  shown = null
  markSeen()
  emit()
}

export function useChangelog() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => shown,
  )
}
