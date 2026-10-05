import type { CSSProperties } from 'react'
import type { Scenario } from './types'

/** Everything visual that a re-skin might change. All colors are CSS colors. */
export interface RadioTheme {
  brand: string
  brandSub: string
  /** Logical size the device is drawn at; it is scaled to fit the screen. */
  designWidth: number
  designHeight: number
  body: {
    metal: string
    metalLight: string
    metalDark: string
    edge: string
    rubber: string
    bumper: string
    engrave: string
    /** Optional photo/texture of the device face, drawn over the metal (any CSS url()). */
    image?: string
  }
  screen: {
    glass: string
    glassDeep: string
    text: string
    textDim: string
    line: string
    accent: string
  }
  led: { rx: string; tx: string; off: string }
  lights: {
    /** Color of the light bars around the talk key. */
    talk: string
    /** Brightness (0–1) of a light that is ready but not lit up. */
    idle: number
  }
  /** Colors for log states: going well, needs attention, danger. */
  tone: { ok: string; warn: string; alert: string }
  fonts: { ui: string; subtitle: string }
  /** Page layout around the device. */
  layout: {
    /** Side of the radio the log panel docks to. */
    logSide: 'left' | 'right'
    /** Window width (px) from which the log docks beside the radio instead of opening inside its screen. */
    dockFrom: number
    /** Width (px) of the docked log. */
    dockWidth: number
  }
}

export const defaultTheme: RadioTheme = {
  brand: 'NEXUS',
  brandSub: 'COMMS',
  designWidth: 400,
  designHeight: 800,
  body: {
    metal: '#1c1e20',
    metalLight: '#2c2f32',
    metalDark: '#0e0f10',
    edge: '#4a4f54',
    rubber: '#17191b',
    bumper: '#8a4a1a',
    engrave: '#8d959b',
  },
  screen: {
    glass: '#0b2523',
    glassDeep: '#04100f',
    text: '#dff3ef',
    textDim: '#8fb3ad',
    line: 'rgba(140, 220, 210, 0.16)',
    accent: '#6fe3d6',
  },
  led: { rx: '#2bff88', tx: '#ff4a3d', off: '#1d2b24' },
  lights: { talk: '#ff9d2e', idle: 0.5 },
  tone: { ok: '#62e8a0', warn: '#ffc46b', alert: '#ff6b5e' },
  fonts: {
    ui: "'Saira', 'Rajdhani', system-ui, sans-serif",
    subtitle: "'Figtree', 'Avenir Next', system-ui, sans-serif",
  },
  layout: { logSide: 'right', dockFrom: 900, dockWidth: 340 },
}

/** Theme + scenario colors as CSS custom properties, set on the device root. */
export function themeVars(theme: RadioTheme, scenario: Scenario): CSSProperties {
  const left = scenario.parties.find((p) => p.side === 'left')!
  const right = scenario.parties.find((p) => p.side === 'right')!
  return {
    '--metal': theme.body.metal,
    '--metal-light': theme.body.metalLight,
    '--metal-dark': theme.body.metalDark,
    '--edge': theme.body.edge,
    '--rubber': theme.body.rubber,
    '--bumper': theme.body.bumper,
    '--engrave': theme.body.engrave,
    '--body-image': theme.body.image ?? 'none',
    '--glass': theme.screen.glass,
    '--glass-deep': theme.screen.glassDeep,
    '--text': theme.screen.text,
    '--text-dim': theme.screen.textDim,
    '--line': theme.screen.line,
    '--accent': theme.screen.accent,
    '--led-rx': theme.led.rx,
    '--led-tx': theme.led.tx,
    '--led-off': theme.led.off,
    '--light-idle': theme.lights.idle,
    '--tone-ok': theme.tone.ok,
    '--tone-warn': theme.tone.warn,
    '--tone-alert': theme.tone.alert,
    '--party-left': left.color,
    '--party-right': right.color,
    '--player': scenario.player.color,
    '--font-ui': theme.fonts.ui,
    '--font-sub': theme.fonts.subtitle,
    '--design-w': `${theme.designWidth}px`,
    '--design-h': `${theme.designHeight}px`,
    '--dock-w': `${theme.layout.dockWidth}px`,
  } as CSSProperties
}
