import type { CSSProperties } from 'react'
import { useFitScale } from '../../hooks/useFitScale'
import type { RadioTheme } from '../../theme'
import { ControlDeck, PauseButton, ReplayGrille, TalkButton } from '../controls/Controls'
import { Led, Screw, SideLight } from './parts'
import type { DeviceViewProps } from './types'
import './device.css'

export interface RadioDeviceProps extends DeviceViewProps {
  theme: RadioTheme
}

/** The walkie-talkie built entirely in CSS: body, top plate, screen bezel, side lights and control deck. */
export function RadioDevice({ theme, style, led, leftLight, rightLight, screen, controls, className = '' }: RadioDeviceProps) {
  const [stageRef, scale] = useFitScale(theme.designWidth, theme.designHeight)

  return (
    <div ref={stageRef} className={`stage ${className}`} style={style}>
      <div
        className="device"
        style={{ width: theme.designWidth, height: theme.designHeight, transform: `translate(-50%, -50%) scale(${scale})` }}
      >
        <div className="device__knobs" aria-hidden>
          <span className="knob knob--left" />
          <span className="antenna" />
          <span className="knob knob--right" />
        </div>

        <div className="device__shadow">
          <div className="device__body">
            <div className="device__skin" aria-hidden />
            <div className="device__texture" aria-hidden />

            <span className="grip grip--left" aria-hidden />
            <span className="grip grip--right" aria-hidden />
            <span className="bumper bumper--tl" aria-hidden />
            <span className="bumper bumper--tr" aria-hidden />
            <span className="bumper bumper--bl" aria-hidden />
            <span className="bumper bumper--br" aria-hidden />

            <header className="top-plate">
              <div className="brand-plate">
                <span className="brand">{theme.brand}</span>
                <span className="brand-sub">{theme.brandSub}</span>
              </div>
              <div className="top-speaker" aria-hidden>
                <span />
                <span />
              </div>
              <div className="rxtx-plate">
                <span className="rxtx-label">RX / TX</span>
                <Led state={led} />
              </div>
            </header>

            <div className="bezel">
              <SideLight side="left" {...leftLight} />
              <SideLight side="right" {...rightLight} />
              <span
                className={`spill spill--left${leftLight.active ? ' is-on' : ''}`}
                style={{ '--light': leftLight.color } as CSSProperties}
                aria-hidden
              />
              <span
                className={`spill spill--right${rightLight.active ? ' is-on' : ''}`}
                style={{ '--light': rightLight.color } as CSSProperties}
                aria-hidden
              />
              <div className="glass">{screen}</div>
            </div>

            <div className="deck">
              <ControlDeck
                left={
                  <PauseButton
                    paused={controls.paused}
                    onToggle={controls.onPauseToggle}
                    pauseLabel={controls.pauseLabel}
                    resumeLabel={controls.resumeLabel}
                  />
                }
                center={<TalkButton {...controls.talk} />}
                right={<ReplayGrille {...controls.replay} />}
              />
            </div>

            <div className="foot" aria-hidden>
              <span />
              <span />
              <span />
            </div>

            <Screw x={22} y={498} angle={35} size={12} />
            <Screw x={362} y={498} angle={-20} size={12} />
            <Screw x={46} y={753} angle={70} />
            <Screw x={338} y={753} angle={10} />
          </div>
        </div>
      </div>
    </div>
  )
}
