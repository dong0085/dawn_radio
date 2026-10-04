import type { CSSProperties, ReactNode } from 'react'
import type { LedState } from './parts'

export interface SideLightConfig {
  color: string
  active: boolean
}

/** Control state shared by every device look (CSS-built or photo skin). */
export interface DeviceControls {
  paused: boolean
  onPauseToggle: () => void
  pauseLabel?: string
  resumeLabel?: string
  talk: {
    pressed: boolean
    mode: 'hold' | 'toggle'
    lightColor: string
    label: string
    activeLabel: string
    disabled?: boolean
    onPress: () => void
    onRelease: () => void
  }
  replay: {
    onReplay: () => void
    disabled?: boolean
    label?: string
  }
}

/** Props every device look accepts. */
export interface DeviceViewProps {
  /** CSS variables for colors (see themeVars). */
  style?: CSSProperties
  led: LedState
  leftLight: SideLightConfig
  rightLight: SideLightConfig
  /** Content of the glass screen. */
  screen: ReactNode
  controls: DeviceControls
  className?: string
}
