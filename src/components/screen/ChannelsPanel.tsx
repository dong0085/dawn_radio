import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  BRIEF_LIMITS,
  CHANNEL_LANGUAGES,
  CHANNEL_LEVELS,
  CHANNEL_TENSIONS,
  type ChannelBrief,
  type ChannelLevel,
  type ChannelTension,
} from '../../../shared/channels.ts'
import { ApiError } from '../../api'
import type { ChannelItem, ChannelStatus } from '../../channels/useChannels'
import { languageLabel } from './format'
import { ScreenPanel, Segmented } from './Panels'

/** Every word the channel panels show. All of it is in-world radio wording. */
export interface ChannelsLabels {
  title: string
  newChannel: string
  newTitle: string
  preset: string
  onAir: string
  tunedIn: string
  notStarted: string
  transmissions: (n: number) => string
  closed: string
  outcome: Record<'success' | 'failure' | 'other', string>
  delete: string
  confirmDelete: (label: string) => string
  clear: string
  confirmClear: (label: string) => string
  cancel: string
  /** Names of the setup steps, in order: situation, your part, signal, confirm. */
  steps: [string, string, string, string]
  briefingPrompt: string
  placeholder: string
  /** Ready-made situations: a short name and the briefing it fills in. */
  situations: { label: string; about: string }[]
  surprise: string
  surpriseNote: string
  partPrompt: string
  partPlaceholder: string
  /** Ready-made parts for the player. An empty `role` lets the channel decide. */
  parts: { label: string; role: string }[]
  language: string
  level: string
  levelNotes: Record<ChannelLevel, string>
  tension: string
  tensions: Record<ChannelTension, string>
  confirmPrompt: string
  /** Row names on the confirm step: situation, your part, signal. */
  summary: { situation: string; part: string; signal: string }
  edit: string
  next: string
  tuneIn: string
  back: string
  /** Messages shown in turn while the channel is being set up. */
  stages: string[]
  searching: string
  offline: string
  tooMany: string
  declined: string
  noSignal: string
}

const defaultChannelsLabels: ChannelsLabels = {
  title: 'Channels',
  newChannel: 'New channel',
  newTitle: 'New channel',
  preset: 'Preset',
  onAir: 'On air',
  tunedIn: 'Tuned in',
  notStarted: 'Not started',
  transmissions: (n) => `${n} transmission${n === 1 ? '' : 's'}`,
  closed: 'Closed',
  outcome: { success: '✓', failure: '✕', other: '·' },
  delete: 'Delete',
  confirmDelete: (label) => `Delete ${label}?`,
  clear: 'Clear log',
  confirmClear: (label) => `Clear ${label}?`,
  cancel: 'Cancel',
  steps: ['Situation', 'Your part', 'Signal', 'Confirm'],
  briefingPrompt: 'What’s going on?',
  placeholder: 'Or describe it: a lighthouse keeper loses power in a storm…',
  situations: [
    { label: 'Mountain rescue', about: 'Two climbers are stuck on a ridge as the weather turns.' },
    { label: 'Air traffic', about: 'A small plane loses its instruments and needs to be talked down.' },
    { label: 'Ferry in fog', about: 'A ferry crossing goes blind in thick fog near the rocks.' },
    { label: 'Wildfire watch', about: 'A wildfire jumps the line and a lookout tower has to be cleared.' },
    { label: 'Deep sea', about: 'A research submarine goes quiet on the sea floor.' },
  ],
  surprise: 'Surprise me',
  surpriseNote: 'The channel picks a situation for you.',
  partPrompt: 'Who are you on the channel?',
  partPlaceholder: 'Or in your own words…',
  parts: [
    { label: 'A local who knows the area', role: 'A local who knows the area well.' },
    { label: 'A trainee at the base', role: 'A trainee at the base, listening in and learning.' },
    { label: 'An expert they called in', role: 'An expert the team called in for advice.' },
    { label: 'Let them decide', role: '' },
  ],
  language: 'Language',
  level: 'Level',
  levelNotes: { A1: 'First words', A2: 'Everyday', B1: 'Getting by', B2: 'Confident' },
  tension: 'Tension',
  tensions: { calm: 'Calm', steady: 'Steady', intense: 'Intense' },
  confirmPrompt: 'Ready to open the channel?',
  summary: { situation: 'Situation', part: 'Your part', signal: 'Signal' },
  edit: 'Edit',
  next: 'Next',
  tuneIn: 'Tune in',
  back: 'Back',
  stages: ['Finding a free frequency…', 'Casting the voices…', 'Writing the briefing…', 'Opening the channel…'],
  searching: 'Searching for a signal…',
  offline: 'Live feed offline',
  tooMany: 'Too many new channels. Wait a minute and try again.',
  declined: 'No signal for that briefing. Try describing it another way.',
  noSignal: 'No signal. Try again.',
}

function statusText(status: ChannelStatus, l: ChannelsLabels) {
  if (status.kind === 'new') return l.notStarted
  if (status.kind === 'running') return l.transmissions(status.transmissions)
  return `${l.closed}${status.outcome ? ` ${l.outcome[status.outcome]}` : ''}`
}

export interface ChannelsPanelProps {
  items: ChannelItem[]
  currentId: string
  /** True while the current channel is playing. */
  live: boolean
  /** Language the player reads, for language names. */
  nativeLang: string
  canCreate: boolean
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
  onClear: (id: string) => void
  onClose: () => void
  labels?: Partial<ChannelsLabels>
}

/** The radio's channel memory: tune in, make a new channel, delete one. */
export function ChannelsPanel({ items, currentId, live, nativeLang, canCreate, onSelect, onNew, onDelete, onClear, onClose, labels }: ChannelsPanelProps) {
  const l = { ...defaultChannelsLabels, ...labels }
  /** Row waiting for its second tap. */
  const [confirming, setConfirming] = useState<string | null>(null)

  return (
    <ScreenPanel title={l.title} onClose={onClose}>
      <ul className="channels">
        {items.map((item) => {
          const current = item.id === currentId
          const hasProgress = item.status.kind !== 'new'
          const removable = !item.preset || hasProgress
          const asking = confirming === item.id
          return (
            <li key={item.id} className={`channel${current ? ' is-current' : ''}`}>
              <button
                type="button"
                className="channel__main"
                onClick={() => !current && onSelect(item.id)}
                aria-current={current || undefined}
              >
                <span className="channel__dot" aria-hidden />
                <span className="channel__body">
                  <span className="channel__line">
                    <span className="channel__label">{item.label}</span>
                    <span className="channel__title">{item.title}</span>
                  </span>
                  <span className="channel__meta">
                    {languageLabel(item.targetLang, nativeLang)} · {item.level}
                    {item.preset && ` · ${l.preset}`} · {statusText(item.status, l)}
                  </span>
                </span>
                {current && <span className="channel__state">{live ? l.onAir : l.tunedIn}</span>}
              </button>
              {removable &&
                (asking ? (
                  <div className="channel__confirm">
                    <span>{item.preset ? l.confirmClear(item.label) : l.confirmDelete(item.label)}</span>
                    <button type="button" className="chip" onClick={() => setConfirming(null)}>
                      {l.cancel}
                    </button>
                    <button
                      type="button"
                      className="chip chip--danger"
                      onClick={() => {
                        setConfirming(null)
                        if (item.preset) onClear(item.id)
                        else onDelete(item.id)
                      }}
                    >
                      {item.preset ? l.clear : l.delete}
                    </button>
                  </div>
                ) : (
                  <button type="button" className="channel__remove" onClick={() => setConfirming(item.id)}>
                    {item.preset ? l.clear : l.delete}
                  </button>
                ))}
            </li>
          )
        })}
      </ul>
      <button type="button" className="channels__new" onClick={onNew} disabled={!canCreate}>
        + {l.newChannel}
        {!canCreate && <small>{l.offline}</small>}
      </button>
    </ScreenPanel>
  )
}

export interface NewChannelPanelProps {
  /** Language preselected in the form. */
  targetLang: string
  nativeLang: string
  onCreate: (brief: ChannelBrief, signal: AbortSignal) => Promise<void>
  onBack: () => void
  onClose: () => void
  labels?: Partial<ChannelsLabels>
}

const slide = {
  initial: (dir: number) => ({ opacity: 0, x: 18 * dir }),
  animate: { opacity: 1, x: 0 },
  exit: (dir: number) => ({ opacity: 0, x: -18 * dir }),
}

/**
 * Setting up a channel, one step at a time: the situation, the player's part, the signal
 * (language, level, tension), then a summary to confirm. On success the radio tunes to the
 * new channel, which closes this panel.
 */
export function NewChannelPanel({ targetLang, nativeLang, onCreate, onBack, onClose, labels }: NewChannelPanelProps) {
  const l = { ...defaultChannelsLabels, ...labels }
  const [step, setStep] = useState(0)
  const [dir, setDir] = useState(1)
  const [about, setAbout] = useState('')
  const [role, setRole] = useState('')
  const [lang, setLang] = useState<string>(() => CHANNEL_LANGUAGES.find((x) => x.tag === targetLang)?.tag ?? CHANNEL_LANGUAGES[0].tag)
  const [level, setLevel] = useState<ChannelLevel>('A2')
  const [tension, setTension] = useState<ChannelTension>('steady')
  const [busy, setBusy] = useState(false)
  const [stage, setStage] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)
  useEffect(() => () => abort.current?.abort(), [])

  // Step through the setup messages while the channel is being written; the last one stays.
  useEffect(() => {
    if (!busy) return
    const timer = setInterval(() => setStage((n) => Math.min(n + 1, l.stages.length - 1)), 7000)
    return () => clearInterval(timer)
  }, [busy, l.stages.length])

  const last = l.steps.length - 1
  const go = (to: number) => {
    setDir(to > step ? 1 : -1)
    setStep(to)
    setError(null)
  }

  const submit = async () => {
    abort.current = new AbortController()
    setStage(0)
    setBusy(true)
    setError(null)
    try {
      await onCreate({ about: about.trim(), role: role.trim() || undefined, tension, targetLang: lang, nativeLang, level }, abort.current.signal)
    } catch (err) {
      if (abort.current?.signal.aborted) return
      const status = err instanceof ApiError ? err.status : 0
      setError(status === 429 ? l.tooMany : status === 422 ? l.declined : l.noSignal)
      setBusy(false)
    }
  }
  const cancel = () => {
    abort.current?.abort()
    setBusy(false)
  }

  const situation = l.situations.find((x) => x.about === about.trim())
  const part = l.parts.find((x) => x.role === role.trim())
  const rows = [
    { step: 0, label: l.summary.situation, value: situation?.label ?? (about.trim() || l.surprise), note: situation?.about },
    { step: 1, label: l.summary.part, value: part?.label ?? role.trim() },
    {
      step: 2,
      label: l.summary.signal,
      value: `${languageLabel(lang, nativeLang)} · ${level} · ${l.tensions[tension]}`,
    },
  ]

  const body = (() => {
    if (step === 0) {
      return (
        <>
          <p className="wizard__prompt">{l.briefingPrompt}</p>
          <div className="wizard__tiles">
            {l.situations.map((x) => (
              <button
                key={x.label}
                type="button"
                className={`wizard__tile${about.trim() === x.about ? ' is-on' : ''}`}
                aria-pressed={about.trim() === x.about}
                onClick={() => setAbout(x.about)}
              >
                {x.label}
              </button>
            ))}
            <button
              type="button"
              className={`wizard__tile wizard__tile--surprise${!about.trim() ? ' is-on' : ''}`}
              aria-pressed={!about.trim()}
              onClick={() => setAbout('')}
            >
              {l.surprise}
            </button>
          </div>
          <textarea
            className="wizard__text"
            value={about}
            onChange={(e) => setAbout(e.target.value)}
            maxLength={BRIEF_LIMITS.aboutChars}
            rows={2}
            placeholder={l.placeholder}
            aria-label={l.briefingPrompt}
          />
          {!about.trim() && <p className="wizard__note">{l.surpriseNote}</p>}
        </>
      )
    }
    if (step === 1) {
      return (
        <>
          <p className="wizard__prompt">{l.partPrompt}</p>
          <div className="wizard__options">
            {l.parts.map((x) => (
              <button
                key={x.label}
                type="button"
                className={`wizard__option${role.trim() === x.role ? ' is-on' : ''}`}
                aria-pressed={role.trim() === x.role}
                onClick={() => setRole(x.role)}
              >
                <span className="wizard__radio" aria-hidden />
                {x.label}
              </button>
            ))}
          </div>
          <input
            className="wizard__text"
            value={part ? '' : role}
            onChange={(e) => setRole(e.target.value)}
            maxLength={BRIEF_LIMITS.roleChars}
            placeholder={l.partPlaceholder}
            aria-label={l.partPrompt}
          />
        </>
      )
    }
    if (step === 2) {
      return (
        <div className="settings">
          <div className="settings__row">
            <span className="settings__label">{l.language}</span>
            <select className="new-channel__select" value={lang} onChange={(e) => setLang(e.target.value)}>
              {CHANNEL_LANGUAGES.filter((x) => x.tag !== nativeLang).map((x) => (
                <option key={x.tag} value={x.tag}>
                  {languageLabel(x.tag, nativeLang)}
                </option>
              ))}
            </select>
          </div>
          <div className="settings__row">
            <span className="settings__label">
              {l.level}
              <small>{l.levelNotes[level]}</small>
            </span>
            <Segmented value={level} options={CHANNEL_LEVELS.map((v) => ({ value: v, label: v }))} onChange={setLevel} />
          </div>
          <div className="settings__row">
            <span className="settings__label">{l.tension}</span>
            <Segmented value={tension} options={CHANNEL_TENSIONS.map((v) => ({ value: v, label: l.tensions[v] }))} onChange={setTension} />
          </div>
        </div>
      )
    }
    return (
      <>
        <p className="wizard__prompt">{l.confirmPrompt}</p>
        <dl className="wizard__summary">
          {rows.map((r) => (
            <div key={r.step} className="wizard__row">
              <dt>{r.label}</dt>
              <dd>
                <span>{r.value}</span>
                {r.note && <small>{r.note}</small>}
              </dd>
              <button type="button" className="wizard__edit" onClick={() => go(r.step)}>
                {l.edit}
              </button>
            </div>
          ))}
        </dl>
        {error && <p className="new-channel__error">{error}</p>}
      </>
    )
  })()

  return (
    <ScreenPanel title={l.newTitle} onClose={onClose} headerExtra={!busy && <StepMeter step={step} total={l.steps.length} />}>
      {busy ? (
        <div className="new-channel__busy" role="status">
          <span className="new-channel__scan" aria-hidden>
            <span />
            <span />
            <span />
          </span>
          <AnimatePresence mode="wait">
            <motion.p key={stage} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }}>
              {l.stages[stage] ?? l.searching}
            </motion.p>
          </AnimatePresence>
          <button type="button" className="chip" onClick={cancel}>
            {l.cancel}
          </button>
        </div>
      ) : (
        <form
          className="wizard"
          onSubmit={(e) => {
            e.preventDefault()
            if (step < last) go(step + 1)
            else void submit()
          }}
        >
          <span className="wizard__step-name">
            {String(step + 1).padStart(2, '0')} · {l.steps[step]}
          </span>
          <div className="wizard__body">
            <AnimatePresence mode="wait" custom={dir} initial={false}>
              <motion.div
                key={step}
                className="wizard__page"
                custom={dir}
                variants={slide}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.18, ease: 'easeOut' }}
              >
                {body}
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="wizard__actions">
            <button type="button" className="chip" onClick={() => (step === 0 ? onBack() : go(step - 1))}>
              ← {step === 0 ? l.title : l.back}
            </button>
            <button type="submit" className="chip chip--primary">
              {step < last ? `${l.next} →` : l.tuneIn}
            </button>
          </div>
        </form>
      )}
    </ScreenPanel>
  )
}

/** Progress through the setup, drawn like a signal meter. */
function StepMeter({ step, total }: { step: number; total: number }) {
  return (
    <span className="step-meter" role="img" aria-label={`${step + 1} / ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={i < step ? 'is-done' : i === step ? 'is-on' : ''} style={{ height: 5 + i * 3 }} />
      ))}
    </span>
  )
}
