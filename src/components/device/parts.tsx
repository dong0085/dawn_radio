import type { CSSProperties } from 'react'

export interface ScrewProps {
  x: number
  y: number
  /** Slot angle in degrees. */
  angle?: number
  size?: number
}

/** A recessed hex screw. Position is in device design pixels. */
export function Screw({ x, y, angle = 20, size = 14 }: ScrewProps) {
  return (
    <span
      className="screw"
      style={{ left: x - size / 2, top: y - size / 2, width: size, height: size, '--angle': `${angle}deg` } as CSSProperties}
    />
  )
}

export interface SideLightProps {
  side: 'left' | 'right'
  color: string
  active: boolean
  /** Vertical position and length in device design pixels, relative to the bezel. */
  top?: number
  height?: number
}

/** Light tube on the bezel that glows when that party is on air. */
export function SideLight({ side, color, active, top = 150, height = 130 }: SideLightProps) {
  return (
    <span
      className={`side-light side-light--${side}${active ? ' is-on' : ''}`}
      style={{ top, height, '--light': color } as CSSProperties}
    />
  )
}

export interface LightBarProps {
  color: string
  active: boolean
  width?: number
  className?: string
}

/** Horizontal light strip (used above and below push-to-talk). */
export function LightBar({ color, active, width = 96, className = '' }: LightBarProps) {
  return <span className={`light-bar${active ? ' is-on' : ''} ${className}`} style={{ width, '--light': color } as CSSProperties} />
}

/** `idle`: powered on, nothing on air. */
export type LedState = 'rx' | 'tx' | 'busy' | 'idle' | 'off'

export function Led({ state }: { state: LedState }) {
  return <span className={`led led--${state}`} />
}
