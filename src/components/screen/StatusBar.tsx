import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { BatteryIcon, ChevronIcon, SignalIcon } from '../icons'

export interface StatusAction {
  id: string
  label: string
  icon: ReactNode
  active?: boolean
  /** Shows a dot: something new is waiting behind this key. */
  badge?: boolean
  onClick: () => void
}

export interface StatusBarProps {
  incident: string
  title: string
  channel: string
  frequency: string
  clock: string
  signal?: number
  battery?: number
  actions?: StatusAction[]
  /** Makes the channel name a key, e.g. to open the channel list. */
  onTitleClick?: () => void
  titleLabel?: string
}

export function StatusBar({
  incident,
  title,
  channel,
  frequency,
  clock,
  signal = 4,
  battery = 0.8,
  actions = [],
  onTitleClick,
  titleLabel,
}: StatusBarProps) {
  const info = (
    <>
      <span className="status__incident">{incident}</span>
      <span className="status__title">{title}</span>
      <span className="status__freq">
        {channel}
        <span>{frequency}</span>
      </span>
    </>
  )
  return (
    <div className="status panel">
      {onTitleClick ? (
        <button type="button" className="status__info status__info--key" data-tour="channels" onClick={onTitleClick} aria-label={titleLabel} title={titleLabel}>
          {info}
        </button>
      ) : (
        <div className="status__info" data-tour="channels">
          {info}
        </div>
      )}
      <div className="status__meters">
        <SignalIcon size={14} bars={signal} />
        <BatteryIcon size={18} level={battery} />
        <span className="status__clock">{clock}</span>
      </div>
      <div className="status__actions">
        {actions.map((a) => (
          <button
            key={a.id}
            type="button"
            className={`screen-key${a.active ? ' is-active' : ''}`}
            data-tour={a.id}
            onClick={a.onClick}
            aria-label={a.label}
            aria-pressed={a.active}
            title={a.label}
          >
            {a.icon}
            {a.badge && <span className="screen-key__badge" aria-hidden />}
          </button>
        ))}
      </div>
    </div>
  )
}

export interface PartyLabel {
  name: string
  color: string
  active: boolean
}

export interface PartyBarProps {
  left: PartyLabel
  right: PartyLabel
  center: ReactNode
}

export function PartyBar({ left, right, center }: PartyBarProps) {
  return (
    <div className="party-bar">
      <PartyName {...left} side="left" />
      <div className="party-bar__center">{center}</div>
      <PartyName {...right} side="right" />
    </div>
  )
}

function PartyName({ name, color, active, side }: PartyLabel & { side: 'left' | 'right' }) {
  return (
    <span className={`party-name party-name--${side}${active ? ' is-active' : ''}`} style={{ color }}>
      {side === 'left' && <ChevronIcon dir="left" size={10} />}
      {name}
      {side === 'right' && <ChevronIcon dir="right" size={10} />}
    </span>
  )
}

export type LiveMode = 'live' | 'loading' | 'paused' | 'tx' | 'standby' | 'off' | 'replay' | 'prelude'

export interface LiveIndicatorProps {
  mode: LiveMode
  color?: string
  labels?: Partial<Record<LiveMode, string>>
  /** Bars in the loading waveform. */
  bars?: number
}

const defaultLabels: Record<LiveMode, string> = {
  live: 'Live',
  loading: '',
  paused: 'Paused',
  tx: 'TX',
  standby: 'Standby',
  off: 'Off air',
  replay: 'Replay',
  prelude: 'Prologue',
}

/** "LIVE • • •" marker; becomes an animated waveform while the next lines load. */
export function LiveIndicator({ mode, color, labels, bars = 7 }: LiveIndicatorProps) {
  const text = { ...defaultLabels, ...labels }[mode]
  return (
    <span className={`live live--${mode}`} style={color ? { color } : undefined}>
      {text && <span className="live__text">{text}</span>}
      {mode === 'loading' ? (
        <span className="live__wave" aria-label="Receiving">
          {Array.from({ length: bars }, (_, i) => (
            <motion.span
              key={i}
              animate={{ scaleY: [0.25, 1, 0.35, 0.8, 0.25] }}
              transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut', delay: i * 0.09 }}
            />
          ))}
        </span>
      ) : (mode === 'live' || mode === 'tx') && (
        <span className="live__dots" aria-hidden>
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              animate={{ opacity: [0.25, 1, 0.25] }}
              transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
            />
          ))}
        </span>
      )}
    </span>
  )
}
