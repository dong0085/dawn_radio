import { useEffect, useLayoutEffect, useRef } from 'react'

export interface ShortcutHandlers {
  onTalkDown?: () => void
  onTalkUp?: () => void
  onPause?: () => void
  onReplay?: () => void
  onTranscript?: () => void
  onLog?: () => void
  onEscape?: () => void
}

export interface ShortcutKeys {
  talk: string
  pause: string
  replay: string
  transcript: string
  log: string
}

export const defaultKeys: ShortcutKeys = { talk: ' ', pause: 'p', replay: 'r', transcript: 't', log: 'l' }

/** Keyboard controls: hold Space to talk, P pause, R repeat, T transcript, L log, Esc close. */
export function useShortcuts(handlers: ShortcutHandlers, keys: ShortcutKeys = defaultKeys) {
  const ref = useRef(handlers)
  useLayoutEffect(() => {
    ref.current = handlers
  })

  useEffect(() => {
    const typing = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
    }

    const down = (e: KeyboardEvent) => {
      if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return
      const h = ref.current
      const k = e.key.toLowerCase()
      if (k === keys.talk) {
        e.preventDefault()
        if (!e.repeat) h.onTalkDown?.()
      } else if (e.repeat) {
        return
      } else if (k === keys.pause) h.onPause?.()
      else if (k === keys.replay) h.onReplay?.()
      else if (k === keys.transcript) h.onTranscript?.()
      else if (k === keys.log) h.onLog?.()
      else if (k === 'escape') h.onEscape?.()
    }
    const up = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === keys.talk && !typing(e)) {
        e.preventDefault()
        ref.current.onTalkUp?.()
      }
    }

    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [keys])
}
