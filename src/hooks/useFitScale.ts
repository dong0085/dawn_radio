import { useLayoutEffect, useRef, useState } from 'react'

/**
 * Scale factor that fits a fixed-size design inside an element.
 * Attach the returned ref to the element that sets the available space.
 */
export function useFitScale<T extends HTMLElement = HTMLDivElement>(width: number, height: number, maxScale = 1.25) {
  const ref = useRef<T>(null)
  const [scale, setScale] = useState(() => Math.min(window.innerWidth / width, window.innerHeight / height, maxScale))

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    // Fires once on observe, then on every size change (window resize, side panel showing).
    const observer = new ResizeObserver(() => setScale(Math.min(el.clientWidth / width, el.clientHeight / height, maxScale)))
    observer.observe(el)
    return () => observer.disconnect()
  }, [width, height, maxScale])

  return [ref, scale] as const
}
