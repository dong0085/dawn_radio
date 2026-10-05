import { useEffect, useId, useLayoutEffect, useRef, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { PLAYER_ID, type Party, type PlayerConfig, type TranscriptEntry } from '../../types'
import type { Settings } from '../../settings'
import { ChangelogRow } from '../../changelog/Changelog'
import { ChevronIcon, CloseIcon, PlayIcon } from '../icons'
import { formatElapsed } from './format'

export interface ScreenPanelProps {
  title: string
  onClose: () => void
  headerExtra?: ReactNode
  closeLabel?: string
  children: ReactNode
}

/** Full-screen overlay inside the glass (transcript, settings). */
export function ScreenPanel({ title, onClose, headerExtra, closeLabel = 'Close', children }: ScreenPanelProps) {
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
        <button type="button" className="screen-key screen-key--small" onClick={onClose} aria-label={closeLabel}>
          <CloseIcon size={16} />
        </button>
      </header>
      <div className="screen-panel__body">{children}</div>
    </motion.section>
  )
}

export interface DockPanelProps {
  title: string
  /** Side of the radio the panel sits on. */
  side: 'left' | 'right'
  /** Unfolded; folded, only the handle shows beside the radio. */
  open: boolean
  onToggle: () => void
  /** Dot on the handle, e.g. for news while the panel is folded. */
  badge?: boolean
  headerExtra?: ReactNode
  /** Field training stop that points at this panel. */
  tour?: string
  children: ReactNode
}

/**
 * A panel beside the radio, styled as a second display. A tall handle on the edge facing the radio
 * folds it away and brings it back, and stays in the same place either way.
 */
export function DockPanel({ title, side, open, onToggle, badge, headerExtra, tour, children }: DockPanelProps) {
  const id = useId()
  // The arrow points the way the panel will move.
  const away = side === 'right' ? 'right' : 'left'
  const toward = side === 'right' ? 'left' : 'right'
  return (
    <div className={`dock dock--${side}${open ? '' : ' is-folded'}`} data-tour={tour}>
      <button type="button" className="dock__handle" aria-expanded={open} aria-controls={id} aria-label={title} onClick={onToggle}>
        <ChevronIcon dir={open ? away : toward} size={14} />
        <span className="dock__label">{title}</span>
        {badge && <span className="dock__badge" aria-hidden />}
      </button>
      <div className="dock__drawer">
        <aside id={id} className="dock-panel" aria-label={title} inert={!open}>
          <header className="dock-panel__head">
            <span className="screen-panel__title">{title}</span>
            {headerExtra}
          </header>
          <div className="dock-panel__body">{children}</div>
        </aside>
      </div>
    </div>
  )
}

export interface TranscriptViewProps {
  entries: TranscriptEntry[]
  parties: Party[]
  player: PlayerConfig
  showTranslation: boolean
  /** Id of the entry being spoken, to mark it. */
  liveId?: string
  /** Id of an entry to scroll to and mark, e.g. from the log timeline. */
  focusId?: string
  /** Language tag of the target language, for the player's rewritten lines. */
  targetLang?: string
  /** Plays the channel again from this line. Leave out to make lines plain text. */
  onPlayFrom?: (id: string) => void
  labels?: Partial<TranscriptLabels>
}

export interface TranscriptPanelProps extends TranscriptViewProps {
  onToggleTranslation: () => void
  onClose: () => void
  /** Past lines are playing again: shows the way back to live. */
  replaying?: boolean
  onGoLive?: () => void
}

export interface TranscriptLabels {
  title: string
  translation: string
  /** Tag on a line the player cut off. */
  cutOff: string
  empty: string
  close: string
  /** Button on each line that plays the channel again from it. */
  playFrom: string
  /** Leaves the replay for the live channel. */
  backToLive: string
}

const defaultTranscriptLabels: TranscriptLabels = {
  title: 'Transcript',
  translation: 'Translation',
  cutOff: 'cut off',
  empty: 'Nothing on this channel yet.',
  close: 'Close',
  playFrom: 'Play from here',
  backToLive: 'Back to live',
}

/** Compares two lines ignoring case, spacing and punctuation. */
const sameText = (a: string, b: string) => {
  const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
  return norm(a) === norm(b)
}


/** Transcript header buttons: back to live while replaying, and the translation toggle. */
function TranscriptActions({
  showTranslation,
  onToggleTranslation,
  replaying,
  onGoLive,
  labels: l,
}: Pick<TranscriptPanelProps, 'showTranslation' | 'onToggleTranslation' | 'replaying' | 'onGoLive'> & { labels: TranscriptLabels }) {
  return (
    <>
      {replaying && onGoLive && (
        <button type="button" className="chip chip--primary" onClick={onGoLive}>
          {l.backToLive}
        </button>
      )}
      <button type="button" className={`chip${showTranslation ? ' is-on' : ''}`} onClick={onToggleTranslation}>
        {l.translation}
      </button>
    </>
  )
}

/** The transcript inside the radio screen, opened from the status bar. */
export function TranscriptPanel(props: TranscriptPanelProps) {
  const l = { ...defaultTranscriptLabels, ...props.labels }
  return (
    <ScreenPanel title={l.title} onClose={props.onClose} closeLabel={l.close} headerExtra={<TranscriptActions {...props} labels={l} />}>
      <TranscriptView {...props} labels={l} />
    </ScreenPanel>
  )
}

export interface DockedTranscriptProps extends Omit<TranscriptPanelProps, 'onClose'>, Pick<DockPanelProps, 'side' | 'open' | 'onToggle'> {}

/** The transcript as a panel beside the radio, folded away or open. */
export function DockedTranscript({ side, open, onToggle, ...props }: DockedTranscriptProps) {
  const l = { ...defaultTranscriptLabels, ...props.labels }
  return (
    <DockPanel title={l.title} side={side} open={open} onToggle={onToggle} headerExtra={<TranscriptActions {...props} labels={l} />}>
      <TranscriptView {...props} labels={l} />
    </DockPanel>
  )
}

/** Everything said on the channel, newest at the bottom. */
export function TranscriptView({ entries, parties, player, showTranslation, liveId, focusId, targetLang, onPlayFrom, labels }: TranscriptViewProps) {
  const l = { ...defaultTranscriptLabels, ...labels }
  const endRef = useRef<HTMLDivElement>(null)
  const focusRef = useRef<HTMLLIElement>(null)
  /** The list was scrolled to the end before the last update, so new lines keep it there. */
  const atEnd = useRef(true)

  useLayoutEffect(() => {
    if (atEnd.current) endRef.current?.scrollIntoView({ block: 'end' })
  }, [entries.length])
  useEffect(() => {
    if (focusId) focusRef.current?.scrollIntoView({ block: 'center' })
  }, [focusId])
  useEffect(() => {
    const box = endRef.current?.parentElement
    if (!box) return
    const onScroll = () => (atEnd.current = box.scrollHeight - box.scrollTop - box.clientHeight < 48)
    box.addEventListener('scroll', onScroll, { passive: true })
    return () => box.removeEventListener('scroll', onScroll)
  }, [])

  const who = (id: string) =>
    id === PLAYER_ID ? { name: player.name, color: player.color } : parties.find((p) => p.id === id) ?? { name: id, color: 'inherit' }

  return (
    <>
      {entries.length === 0 && <p className="transcript__empty">{l.empty}</p>}
      <ol className="transcript">
        {entries.map((e) => {
          const p = who(e.speaker)
          const text = e.segments.map((s) => s.text).join(' ')
          const joined = e.segments.map((s) => s.translation).filter(Boolean).join(' ')
          // A player line spoken in the player's own language needs no translation.
          const translation = sameText(joined, text) ? '' : joined
          // The player's own lines have no audio to play again.
          const playable = !!onPlayFrom && e.speaker !== PLAYER_ID
          return (
            <li
              key={e.id}
              ref={e.id === focusId ? focusRef : undefined}
              className={`transcript__entry${e.id === liveId ? ' is-live' : ''}${e.id === focusId ? ' is-focus' : ''}${playable ? ' is-playable' : ''}`}
              onClick={
                playable
                  ? () => {
                      // Selecting text to copy leaves the channel alone.
                      if (!window.getSelection()?.isCollapsed) return
                      onPlayFrom(e.id)
                    }
                  : undefined
              }
            >
              <div className="transcript__meta">
                <span style={{ color: p.color }}>{p.name}</span>
                <time>{formatElapsed(e.at)}</time>
                {e.interrupted && <span className="transcript__cut">{l.cutOff}</span>}
                {playable && (
                  <button
                    type="button"
                    className="transcript__play"
                    aria-label={l.playFrom}
                    title={l.playFrom}
                    onClick={(ev) => {
                      ev.stopPropagation()
                      onPlayFrom(e.id)
                    }}
                  >
                    <PlayIcon size={11} />
                  </button>
                )}
              </div>
              <p className="transcript__target">{text}</p>
              {e.rendering && !sameText(e.rendering, text) && (
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
    </>
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

export interface SettingsLabels {
  title: string
  feed: string
  live: string
  drill: string
  translation: string
  highlight: string
  speed: string
  static: string
  staticLevels: { off: string; low: string; mid: string; high: string }
  volume: string
  voice: string
  voices: { auto: string; elevenlabs: string; device: string }
  talkInput: string
  inputs: { voice: string; keyboard: string }
  micLanguage: string
  on: string
  off: string
  /** The player's own language. */
  yourLanguage: string
  /** Language the channel is heard in. */
  channelLanguage: string
  training: string
  trainingAction: string
  restart: string
  close: string
}

const defaultSettingsLabels: SettingsLabels = {
  title: 'Settings',
  feed: 'Feed',
  live: 'Live',
  drill: 'Drill',
  translation: 'Translation',
  highlight: 'Word highlight',
  speed: 'Speed',
  static: 'Static',
  staticLevels: { off: 'Off', low: 'Low', mid: 'Mid', high: 'High' },
  volume: 'Volume',
  voice: 'Voice',
  voices: { auto: 'Auto', elevenlabs: 'Eleven', device: 'Device' },
  talkInput: 'Talk input',
  inputs: { voice: 'Voice', keyboard: 'Keyboard' },
  micLanguage: 'Mic language',
  on: 'On',
  off: 'Off',
  yourLanguage: 'Your language',
  channelLanguage: 'Channel language',
  training: 'Field training',
  trainingAction: 'Start',
  restart: 'Rejoin channel',
  close: 'Close',
}

/** A language picker row: the current value and the choices, each named for the player. */
export interface LanguageChoice {
  value: string
  options: { value: string; label: string }[]
  onChange: (lang: string) => void
  /** Small note under the label. */
  note?: string
  disabled?: boolean
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
  /** Small note under the Feed row. */
  feedNote?: string
  /** The player's own language; the row is hidden without it. */
  yourLanguage?: LanguageChoice
  /** The language this channel is heard in; the row is hidden without it. */
  channelLanguage?: LanguageChoice
  /** Opens the field training again; the row is hidden without it. */
  onTraining?: () => void
  labels?: Partial<SettingsLabels>
}

export function SettingsPanel({
  settings: s,
  update,
  onClose,
  onRestart,
  engineStatus,
  targetLabel,
  nativeLabel,
  feedNote,
  yourLanguage,
  channelLanguage,
  onTraining,
  labels,
}: SettingsPanelProps) {
  const l = { ...defaultSettingsLabels, ...labels }
  const onOff = [
    { value: 1, label: l.on },
    { value: 0, label: l.off },
  ]
  return (
    <ScreenPanel title={l.title} onClose={onClose} closeLabel={l.close}>
      <div className="settings">
        {yourLanguage && <LanguageRow label={l.yourLanguage} choice={yourLanguage} />}
        {channelLanguage && <LanguageRow label={l.channelLanguage} choice={channelLanguage} />}
        <Row label={l.feed} note={feedNote}>
          <Segmented
            value={s.feed}
            options={[
              { value: 'live', label: l.live },
              { value: 'drill', label: l.drill },
            ]}
            onChange={(v) => update('feed', v)}
          />
        </Row>
        <Row label={l.translation}>
          <Segmented value={s.showTranslation ? 1 : 0} options={onOff} onChange={(v) => update('showTranslation', !!v)} />
        </Row>
        <Row label={l.highlight}>
          <Segmented value={s.highlightWords ? 1 : 0} options={onOff} onChange={(v) => update('highlightWords', !!v)} />
        </Row>
        <Row label={l.speed}>
          <Segmented
            value={s.speechRate}
            options={[0.8, 0.9, 1, 1.1].map((v) => ({ value: v, label: `${v}×` }))}
            onChange={(v) => update('speechRate', v)}
          />
        </Row>
        <Row label={l.static}>
          <Segmented
            value={s.staticLevel}
            options={[
              { value: 0, label: l.staticLevels.off },
              { value: 0.6, label: l.staticLevels.low },
              { value: 1, label: l.staticLevels.mid },
              { value: 1.6, label: l.staticLevels.high },
            ]}
            onChange={(v) => update('staticLevel', v)}
          />
        </Row>
        <Row label={l.volume}>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={s.volume}
            onChange={(e) => update('volume', Number(e.target.value))}
            aria-label={l.volume}
          />
        </Row>
        <Row label={l.voice} note={engineStatus}>
          <Segmented
            value={s.voiceEngine}
            options={[
              { value: 'auto', label: l.voices.auto },
              { value: 'elevenlabs', label: l.voices.elevenlabs },
              { value: 'browser', label: l.voices.device },
            ]}
            onChange={(v) => update('voiceEngine', v)}
          />
        </Row>
        <Row label={l.talkInput}>
          <Segmented
            value={s.inputMode}
            options={[
              { value: 'voice', label: l.inputs.voice },
              { value: 'keyboard', label: l.inputs.keyboard },
            ]}
            onChange={(v) => update('inputMode', v)}
          />
        </Row>
        <Row label={l.micLanguage}>
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
          <Row label={l.training}>
            <button type="button" className="chip" onClick={onTraining}>
              {l.trainingAction}
            </button>
          </Row>
        )}
        <ChangelogRow />
        <button type="button" className="settings__restart" onClick={onRestart}>
          {l.restart}
        </button>
      </div>
    </ScreenPanel>
  )
}

function LanguageRow({ label, choice }: { label: string; choice: LanguageChoice }) {
  return (
    <Row label={label} note={choice.note}>
      <select
        className="settings__select"
        value={choice.value}
        disabled={choice.disabled}
        aria-label={label}
        onChange={(e) => choice.onChange(e.target.value)}
      >
        {choice.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Row>
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
