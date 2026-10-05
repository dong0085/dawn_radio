import { useState } from 'react'

/** State kept in this browser's storage, for small conveniences like a folded panel. */
export function useStoredState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw === null ? initial : { ...initial, ...JSON.parse(raw) }
    } catch {
      return initial
    }
  })
  const set = (next: T) => {
    setValue(next)
    try {
      localStorage.setItem(key, JSON.stringify(next))
    } catch {
      /* storage unavailable */
    }
  }
  return [value, set] as const
}
