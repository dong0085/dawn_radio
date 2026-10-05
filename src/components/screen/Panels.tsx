import { useEffect, useRef, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { PLAYER_ID, type Party, type PlayerConfig, type TranscriptEntry } from '../../types'
import type { Settings } from '../../settings'
import { CloseIcon } from '../icons'
import { formatElapsed } from './format'

export interface ScreenPanelProps {
  title: string
  onClose: () => void
  headerExtra?: ReactNode
  children: ReactNode
}

/** Full-screen overlay inside the glass (transcript, settings). */
export function ScreenPanel({ title, onClose, headerExtra, children }: ScreenPanelProps) {
  return (
    <motion.section
      className="screen-panel"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 14 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      <header className="screen-panel__head">
        <span className="screen-panel__title">{title}</span>
        {headerExtra}
        <button type="button" className="screen-key screen-key--small" onClick={onClose} aria-label="Close">
          <CloseIcon size={16} />
        </button>
      </header>
      <div className="screen-panel__body">{children}</div>
    </motion.section>
  )
}

export interface TranscriptPanelProps {
  entries: TranscriptEntry[]
  parties: Party[]
  player: PlayerConfig
  showTranslation: boolean
  onToggleTranslation: () => void
  onClose: () => void
  /** Id of the entry being spoken, to mark it. */
  liveId?: string
  /** Id of an entry to scroll to and mark, e.g. from the log timeline. */
  focusId?: string
  emptyText?: string
  /** Language tag of the target language, for the player's rewritten lines. */
  targetLang?: string
}

/** Compares two lines ignoring case, spacing and punctuation. */
const sameText = (a: string, b: string) => {
  const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
  return norm(a) === norm(b)
}


export function TranscriptPanel({
  entries,
  parties,
  player,
  showTranslation,
  onToggleTranslation,
  onClose,
  liveId,
  focusId,
  emptyText = 'Nothing on this channel yet.',
  targetLang,
}: TranscriptPanelProps) {
  const endRef = useRef<HTMLDivElement>(null)
  const focusRef = useRef<HTMLLIElement>(null)
  useEffect(() => {
    // While a line is in focus, new lines leave the scroll position alone.
    if (focusId) focusRef.current?.scrollIntoView({ block: 'center' })
    else endRef.current?.scrollIntoView({ block: 'end' })
  }, [entries.length, focusId])

  const who = (id: string) =>
    id === PLAYER_ID ? { name: player.name, color: player.color } : parties.find((p) => p.id === id) ?? { name: id, color: 'inherit' }

  return (
    <ScreenPanel
      title="Transcript"
      onClose={onClose}
      headerExtra={
        <button type="button" className={`chip${showTranslation ? ' is-on' : ''}`} onClick={onToggleTranslation}>
          Translation
        </button>
      }
    >
      {entries.length === 0 && <p className="transcript__empty">{emptyText}</p>}
      <ol className="transcript">
        {entries.map((e) => {
          const p = who(e.speaker)
          const translation = e.segments.map((s) => s.translation).filter(Boolean).join(' ')
          return (
            <li
              key={e.id}
              ref={e.id === focusId ? focusRef : undefined}
              className={`transcript__entry${e.id === liveId ? ' is-live' : ''}${e.id === focusId ? ' is-focus' : ''}`}
            >
              <div className="transcript__meta">
                <span style={{ color: p.color }}>{p.name}</span>
                <time>{formatElapsed(e.at)}</time>
                {e.interrupted && <span className="transcript__cut">cut off</span>}
              </div>
              <p className="transcript__target">{e.segments.map((s) => s.text).join(' ')}</p>
              {e.rendering && !sameText(e.rendering, e.segments.map((s) => s.text).join(' ')) && (
                <p className="transcript__rendering" lang={targetLang}>
                  {e.rendering}
                </p>
              )}
              {showTranslation && translation && <p className="transcript__native">{translation}</p>}
            </li>
          )
        })}
      </ol>
      <div ref={endRef} />
    </ScreenPanel>
  )
}

export interface SegmentedProps<T extends string | number> {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}

export function Segmented<T extends string | number>({ value, options, onChange }: SegmentedProps<T>) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? 'is-on' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export interface SettingsPanelProps {
  settings: Settings
  update: <K extends keyof Settings>(key: K, value: Settings[K]) => void
  onClose: () => void
  onRestart: () => void
  /** Which voice is actually in use, and whether ElevenLabs is set up. */
  engineStatus: string
  targetLabel: string
  nativeLabel: string
  restartLabel?: string
  /** Small note under the Feed row. */
  feedNote?: string
  /** Opens the field training again; the row is hidden without it. */
  onTraining?: () => void
  trainingLabel?: string
  trainingAction?: string
}

export function SettingsPanel({
  settings: s,
  update,
  onClose,
  onRestart,
  engineStatus,
  targetLabel,
  nativeLabel,
  restartLabel = 'Rejoin channel',
  feedNote,
  onTraining,
  trainingLabel = 'Field training',
  trainingAction = 'Start',
}: SettingsPanelProps) {
  const onOff = [
    { value: 1, label: 'On' },
    { value: 0, label: 'Off' },
  ]
  return (
    <ScreenPanel title="Settings" onClose={onClose}>
      <div className="settings">
        <Row label="Feed" note={feedNote}>
          <Segmented
            value={s.feed}
            options={[
              { value: 'live', label: 'Live' },
              { value: 'drill', label: 'Drill' },
            ]}
            onChange={(v) => update('feed', v)}
          />
        </Row>
        <Row label="Translation">
          <Segmented value={s.showTranslation ? 1 : 0} options={onOff} onChange={(v) => update('showTranslation', !!v)} />
        </Row>
        <Row label="Word highlight">
          <Segmented value={s.highlightWords ? 1 : 0} options={onOff} onChange={(v) => update('highlightWords', !!v)} />
        </Row>
        <Row label="Speed">
          <Segmented
            value={s.speechRate}
            options={[0.8, 0.9, 1, 1.1].map((v) => ({ value: v, label: `${v}×` }))}
            onChange={(v) => update('speechRate', v)}
          />
        </Row>
        <Row label="Static">
          <Segmented
            value={s.staticLevel}
            options={[
              { value: 0, label: 'Off' },
              { value: 0.6, label: 'Low' },
              { value: 1, label: 'Mid' },
              { value: 1.6, label: 'High' },
            ]}
            onChange={(v) => update('staticLevel', v)}
          />
        </Row>
        <Row label="Volume">
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={s.volume}
            onChange={(e) => update('volume', Number(e.target.value))}
            aria-label="Volume"
          />
        </Row>
        <Row label="Voice" note={engineStatus}>
          <Segmented
            value={s.voiceEngine}
            options={[
              { value: 'auto', label: 'Auto' },
              { value: 'elevenlabs', label: 'Eleven' },
              { value: 'browser', label: 'Device' },
            ]}
            onChange={(v) => update('voiceEngine', v)}
          />
        </Row>
        <Row label="Talk input">
          <Segmented
            value={s.inputMode}
            options={[
              { value: 'voice', label: 'Voice' },
              { value: 'keyboard', label: 'Keyboard' },
            ]}
            onChange={(v) => update('inputMode', v)}
          />
        </Row>
        <Row label="Mic language">
          <Segmented
            value={s.micLanguage}
            options={[
              { value: 'target', label: targetLabel },
              { value: 'native', label: nativeLabel },
            ]}
            onChange={(v) => update('micLanguage', v)}
          />
        </Row>
        {onTraining && (
          <Row label={trainingLabel}>
            <button type="button" className="chip" onClick={onTraining}>
              {trainingAction}
            </button>
          </Row>
        )}
        <button type="button" className="settings__restart" onClick={onRestart}>
          {restartLabel}
        </button>
      </div>
    </ScreenPanel>
  )
}

function Row({ label, note, children }: { label: string; note?: string; children: ReactNode }) {
  return (
    <div className="settings__row">
      <div className="settings__label">
        {label}
        {note && <small>{note}</small>}
      </div>
      {children}
    </div>
  )
}
