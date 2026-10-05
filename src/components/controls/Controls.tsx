import type { ReactNode } from 'react'
import { LightBar } from '../device/parts'
import { PauseIcon, PlayIcon, ReplayIcon } from '../icons'
import { usePress } from './usePress'
import './controls.css'

export interface ControlDeckProps {
  left: ReactNode
  center: ReactNode
  right: ReactNode
}

/** Three-slot layout for the controls under the screen. */
export function ControlDeck({ left, center, right }: ControlDeckProps) {
  return (
    <div className="control-deck">
      <div className="control-deck__side">{left}</div>
      <div className="control-deck__center">{center}</div>
      <div className="control-deck__side">{right}</div>
    </div>
  )
}

export interface PauseButtonProps {
  paused: boolean
  onToggle: () => void
  pauseLabel?: string
  resumeLabel?: string
  size?: number
}

export function PauseButton({ paused, onToggle, pauseLabel = 'Pause', resumeLabel = 'Resume', size = 88 }: PauseButtonProps) {
  const label = paused ? resumeLabel : pauseLabel
  return (
    <div className="hw-control">
      <button
        type="button"
        className="round-button"
        data-tour="pause"
        style={{ width: size, height: size }}
        onClick={onToggle}
        aria-label={label}
        aria-pressed={paused}
      >
        <span className="round-button__cap">
          {paused ? <PlayIcon size={26} /> : <PauseIcon size={26} />}
        </span>
      </button>
      <span className="engraved hw-label">{label}</span>
    </div>
  )
}

export interface TalkButtonProps {
  pressed: boolean
  /** hold: transmit while held. toggle: tap to start, tap again to send. */
  mode?: 'hold' | 'toggle'
  lightColor: string
  label?: string
  activeLabel?: string
  disabled?: boolean
  onPress: () => void
  onRelease: () => void
}

/** The big push-to-talk key with light bars above and below. */
export function TalkButton({
  pressed,
  mode = 'hold',
  lightColor,
  label = 'Hold to talk',
  activeLabel = 'Transmitting',
  disabled,
  onPress,
  onRelease,
}: TalkButtonProps) {
  const press = usePress({ mode, pressed, disabled, onPress, onRelease })

  return (
    <div className={`ptt${pressed ? ' is-pressed' : ''}`}>
      <LightBar color={lightColor} active={pressed} className="ptt__light ptt__light--top" />
      <div className="ptt__well">
        <button
          type="button"
          className="ptt__key"
          data-tour="talk"
          disabled={disabled}
          aria-pressed={pressed}
          aria-label={label}
          {...press}
        >
          <span className="ptt__ribs" aria-hidden>
            {Array.from({ length: 4 }, (_, i) => <span key={i} />)}
          </span>
          <span className="ptt__label engraved">{pressed ? activeLabel : label}</span>
          <span className="ptt__ribs" aria-hidden>
            {Array.from({ length: 4 }, (_, i) => <span key={i} />)}
          </span>
          <span className="ptt__dots" aria-hidden>
            <span />
            <span />
            <span />
          </span>
        </button>
      </div>
      <LightBar color={lightColor} active={pressed} className="ptt__light ptt__light--bottom" />
    </div>
  )
}

export interface ReplayGrilleProps {
  onReplay: () => void
  disabled?: boolean
  label?: string
  slots?: number
}

/** Speaker grille that doubles as the "repeat last line" key. */
export function ReplayGrille({ onReplay, disabled, label = 'Repeat', slots = 6 }: ReplayGrilleProps) {
  return (
    <div className="hw-control">
      <button type="button" className="grille" data-tour="replay" onClick={onReplay} disabled={disabled} aria-label={label}>
        <span className="grille__slots" aria-hidden>
          {Array.from({ length: slots }, (_, i) => <span key={i} />)}
        </span>
        <span className="grille__badge">
          <ReplayIcon size={20} />
        </span>
      </button>
      <span className="engraved hw-label">{label}</span>
    </div>
  )
}
