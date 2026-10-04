import { useEffect, useLayoutEffect, useRef } from 'react'

export interface WaveformProps {
  /** Returns current loudness 0–1; polled every frame. */
  getLevel: () => number
  color: string
  /** Logical size in device pixels. */
  width?: number
  height?: number
  /** Bars on each side of the center. */
  bars?: number
  /** Extra canvas resolution (the device is scaled with CSS). */
  resolution?: number
  leftLabel?: string
  rightLabel?: string
}

/** Decorative live waveform: newest level in the center, spreading outward. */
export function Waveform({
  getLevel,
  color,
  width = 290,
  height = 46,
  bars = 42,
  resolution = 2.5,
  leftLabel,
  rightLabel,
}: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const colorRef = useRef(color)
  const levelRef = useRef(getLevel)
  useLayoutEffect(() => {
    colorRef.current = color
    levelRef.current = getLevel
  })

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const k = (window.devicePixelRatio || 1) * resolution
    canvas.width = width * k
    canvas.height = height * k
    ctx.scale(k, k)

    const history = new Array<number>(bars).fill(0)
    let smooth = 0
    let frame = 0
    let raf = 0

    const draw = () => {
      raf = requestAnimationFrame(draw)
      // Shift at ~30 fps so the wave travels at a steady speed.
      if (frame++ % 2) return
      const raw = levelRef.current()
      smooth = Math.max(raw, smooth * 0.7)
      history.pop()
      history.unshift(smooth)

      ctx.clearRect(0, 0, width, height)
      const mid = height / 2
      const step = width / 2 / bars
      const c = colorRef.current
      ctx.fillStyle = c
      ctx.shadowColor = c
      ctx.shadowBlur = 6

      for (let i = 0; i < bars; i++) {
        const level = history[i]
        const falloff = 1 - (i / bars) * 0.55
        const jitter = 0.75 + Math.random() * 0.5
        const h = Math.max(1.6, level * falloff * jitter * (height - 6))
        const xs = [width / 2 + i * step, width / 2 - i * step]
        for (const x of i === 0 ? [width / 2] : xs) {
          if (h <= 1.6) {
            ctx.globalAlpha = 0.45
            ctx.fillRect(x - 0.8, mid - 0.8, 1.6, 1.6)
          } else {
            ctx.globalAlpha = 0.95
            ctx.fillRect(x - 0.9, mid - h / 2, 1.8, h)
          }
        }
      }
      ctx.globalAlpha = 1
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [width, height, bars, resolution])

  return (
    <div className="waveform panel">
      <canvas ref={canvasRef} style={{ width, height }} />
      <div className="waveform__labels">
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </div>
    </div>
  )
}
