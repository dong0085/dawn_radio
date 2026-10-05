import { useCallback, useEffect, useRef, useState } from 'react'

// ---- formatting ----

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const shortDay = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })
const number = new Intl.NumberFormat()

export const fmt = {
  date: (ms: number) => (ms ? dateTime.format(ms) : '—'),
  /** "2026-10-04" -> "Oct 4" */
  day: (day: string) => shortDay.format(Date.parse(`${day}T00:00:00Z`)),
  num: (n: number) => number.format(n),
  /** "3 min ago", "5 h ago", "12 d ago", then the date. */
  ago: (ms: number) => {
    if (!ms) return '—'
    const min = Math.round((Date.now() - ms) / 60_000)
    if (min < 1) return 'just now'
    if (min < 60) return `${min} min ago`
    const h = Math.round(min / 60)
    if (h < 24) return `${h} h ago`
    const d = Math.round(h / 24)
    return d < 60 ? `${d} d ago` : dateTime.format(ms)
  },
  /** First 8 characters of a player id. */
  player: (id: string) => id.slice(0, 8),
  elapsed: (seconds = 0) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`,
}

// ---- data ----

export interface Loaded<T> {
  data: T | null
  error: string | null
  loading: boolean
  reload: () => void
}

/** Runs `load` when `key` changes; keeps the last data while the next load runs. */
export function useLoad<T>(load: () => Promise<T>, key: string): Loaded<T> {
  const [tick, setTick] = useState(0)
  const current = `${key}#${tick}`
  const [state, setState] = useState<{ key: string | null; data: T | null; error: string | null }>({ key: null, data: null, error: null })
  const loadRef = useRef(load)
  useEffect(() => {
    loadRef.current = load
  })
  useEffect(() => {
    let alive = true
    loadRef
      .current()
      .then((data) => alive && setState({ key: current, data, error: null }))
      .catch((err: Error) => alive && setState((s) => ({ ...s, key: current, error: err.message })))
    return () => {
      alive = false
    }
  }, [current])
  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { data: state.data, error: state.error, loading: state.key !== current, reload }
}

/** Value that settles `ms` after the last change (for search boxes). */
export function useDebounced<T>(value: T, ms = 300) {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return settled
}
