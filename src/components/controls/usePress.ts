import { useRef, type MouseEvent, type PointerEvent } from 'react'

export interface PressOptions {
  /** hold: active while held. toggle: tap to start, tap again to stop. */
  mode: 'hold' | 'toggle'
  pressed: boolean
  disabled?: boolean
  onPress: () => void
  onRelease: () => void
}

/** Pointer handlers for a push-to-talk style key (mouse, touch and pen). */
export function usePress({ mode, pressed, disabled, onPress, onRelease }: PressOptions) {
  const holding = useRef(false)

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    if (disabled || e.button > 0) return
    e.preventDefault()
    if (mode === 'toggle') {
      if (pressed) onRelease()
      else onPress()
      return
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    holding.current = true
    onPress()
  }

  const up = () => {
    if (mode !== 'hold' || !holding.current) return
    holding.current = false
    onRelease()
  }

  return {
    onPointerDown,
    onPointerUp: up,
    onPointerCancel: up,
    onContextMenu: (e: MouseEvent) => e.preventDefault(),
  }
}
