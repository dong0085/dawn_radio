import type { CSSProperties } from 'react'
import { useFitScale } from '../../hooks/useFitScale'
import type { PhotoSkin, Rect, SkinLabel } from '../../skins/types'
import type { RadioTheme } from '../../theme'
import { usePress } from '../controls/usePress'
import { PlayIcon } from '../icons'
import type { DeviceViewProps } from './types'
import './photo.css'

export interface PhotoDeviceProps extends DeviceViewProps {
  skin: PhotoSkin
  theme: RadioTheme
}

const box = ({ x, y, w, h, r }: Rect): CSSProperties => ({
  left: x,
  top: y,
  width: w,
  height: h,
  borderRadius: r,
})

/** Shows the part of the base image under an element, so it can be pushed in. */
const patch = (skin: PhotoSkin, x: number, y: number): CSSProperties => ({
  backgroundImage: `url(${skin.base})`,
  backgroundSize: `${skin.width}px ${skin.height}px`,
  backgroundPosition: `${-x}px ${-y}px`,
})

function Label({ at, text, className = '' }: { at?: SkinLabel; text: string; className?: string }) {
  if (!at) return null
  return (
    <span className={`photo-label ${className}`} style={{ left: at.x, top: at.y, fontSize: at.size }} aria-hidden>
      {text}
    </span>
  )
}

function Light({ rect, color, on, className = '' }: { rect: Rect; color: string; on: boolean; className?: string }) {
  return <span className={`photo-light${on ? ' is-on' : ''} ${className}`} style={{ ...box(rect), '--light': color } as CSSProperties} />
}

/** The walkie-talkie drawn from a rendered photo, with live screen, lights and keys on top. */
export function PhotoDevice({ skin, theme, style, led, leftLight, rightLight, screen, controls, className = '' }: PhotoDeviceProps) {
  const [stageRef, scale] = useFitScale(skin.width, skin.height, 1)
  const { talk, replay } = controls
  const { pause, talk: talkSkin } = skin
  const press = usePress({
    mode: talk.mode,
    pressed: talk.pressed,
    disabled: talk.disabled,
    onPress: talk.onPress,
    onRelease: talk.onRelease,
  })

  const s = skin.screen
  const layoutW = skin.screenLayoutWidth
  const screenScale = s.w / layoutW
  const fade = `${(skin.edgeFade ?? 0) * 100}%`
  const pauseLabel = controls.paused ? (controls.resumeLabel ?? 'Resume') : (controls.pauseLabel ?? 'Pause')
  const pr = pause.radius

  return (
    <div ref={stageRef} className={`stage stage--photo ${className}`} style={{ ...style, background: skin.backdrop }}>
      <div
        className="photo-device"
        style={
          {
            width: skin.width,
            height: skin.height,
            transform: `translate(-50%, -50%) scale(${scale})`,
            '--fade': fade,
          } as CSSProperties
        }
      >
        <img className="photo-device__base" src={skin.base} alt="" draggable={false} />

        {/* Talk key pressed in */}
        {talkSkin.pressedRect && talkSkin.pressedImage && (
          <img
            className={`photo-pressed${talk.pressed ? ' is-on' : ''}`}
            src={talkSkin.pressedImage}
            alt=""
            draggable={false}
            style={box(talkSkin.pressedRect)}
          />
        )}

        {/* Screen */}
        <div className="glass photo-glass" style={box(s)}>
          <div
            className="photo-glass__content"
            style={{ width: layoutW, height: s.h / screenScale, transform: `scale(${screenScale})` }}
          >
            {screen}
          </div>
          <span
            className={`photo-spill photo-spill--left${leftLight.active ? ' is-on' : ''}`}
            style={{ '--light': leftLight.color } as CSSProperties}
          />
          <span
            className={`photo-spill photo-spill--right${rightLight.active ? ' is-on' : ''}`}
            style={{ '--light': rightLight.color } as CSSProperties}
          />
        </div>

        {/* Lights */}
        <Light rect={skin.sideLights.left} color={leftLight.color} on={leftLight.active} className="photo-light--side" />
        <Light rect={skin.sideLights.right} color={rightLight.color} on={rightLight.active} className="photo-light--side" />
        <Light rect={skin.talkLights.top} color={talk.lightColor} on={talk.pressed} className="photo-light--bar" />
        <Light rect={skin.talkLights.bottom} color={talk.lightColor} on={talk.pressed} className="photo-light--bar" />
        <span className={`photo-led photo-led--${led}`} style={box(skin.led)} />

        {/* Printed labels */}
        <Label at={skin.labels.brand} text={theme.brand} className="photo-label--brand" />
        <Label at={skin.labels.brandSub} text={theme.brandSub} className="photo-label--sub" />
        <Label at={skin.labels.rxtx} text="RX / TX" />
        <Label at={skin.labels.pause} text={pauseLabel} />
        <Label at={skin.labels.replay} text={replay.label ?? 'Repeat'} />

        {/* Pause key */}
        <button
          type="button"
          className="photo-key photo-key--round"
          style={{ left: pause.center.x - pr, top: pause.center.y - pr, width: pr * 2, height: pr * 2 }}
          onClick={controls.onPauseToggle}
          aria-label={pauseLabel}
          aria-pressed={controls.paused}
        >
          <span className="photo-key__face" style={patch(skin, pause.center.x - pr, pause.center.y - pr)}>
            {controls.paused && (
              <span
                className="photo-key__icon-patch"
                style={
                  {
                    width: pause.iconPatch.radius * 2,
                    height: pause.iconPatch.radius * 2,
                    '--inner': pause.iconPatch.inner,
                    '--outer': pause.iconPatch.outer,
                  } as CSSProperties
                }
              >
                <PlayIcon size={pause.iconSize} className="photo-key__icon" />
              </span>
            )}
          </span>
        </button>

        {/* Talk key */}
        <button
          type="button"
          className={`photo-key photo-key--talk${talk.pressed ? ' is-pressed' : ''}`}
          style={box(talkSkin.key)}
          disabled={talk.disabled}
          aria-pressed={talk.pressed}
          aria-label={talk.label}
          {...press}
        >
          <span
            className="photo-label photo-label--talk"
            style={{
              left: talkSkin.label.x - talkSkin.key.x,
              top: talkSkin.label.y - talkSkin.key.y,
              fontSize: talkSkin.label.size,
            }}
          >
            {talk.pressed ? talk.activeLabel : talk.label}
          </span>
        </button>

        {/* Repeat grille */}
        <button
          type="button"
          className="photo-key photo-key--grille"
          style={{ ...box(skin.replay.area), clipPath: skin.replay.clip }}
          onClick={replay.onReplay}
          disabled={replay.disabled}
          aria-label={`${replay.label ?? 'Repeat'} last line`}
        >
          <span className="photo-key__face" style={patch(skin, skin.replay.area.x, skin.replay.area.y)} />
        </button>
      </div>
    </div>
  )
}
