import { useEffect, useRef, useState } from 'react'
import { CHANNEL_LANGUAGES, CHANNEL_LEVELS, BRIEF_LIMITS, type ChannelBrief, type ChannelLevel } from '../../../shared/channels.ts'
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
  briefing: string
  briefingPrompt: string
  placeholder: string
  suggestions: string[]
  language: string
  level: string
  tuneIn: string
  back: string
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
  briefing: 'Briefing',
  briefingPrompt: 'What’s going on?',
  placeholder: 'A lighthouse keeper loses power in a storm…',
  suggestions: ['Mountain rescue', 'Air traffic', 'Ferry in fog', 'Wildfire watch'],
  language: 'Language',
  level: 'Level',
  tuneIn: 'Tune in',
  back: 'Channels',
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

/** The briefing form. On success the radio tunes to the new channel, which closes this panel. */
export function NewChannelPanel({ targetLang, nativeLang, onCreate, onBack, onClose, labels }: NewChannelPanelProps) {
  const l = { ...defaultChannelsLabels, ...labels }
  const [about, setAbout] = useState('')
  const [lang, setLang] = useState<string>(() => CHANNEL_LANGUAGES.find((x) => x.tag === targetLang)?.tag ?? CHANNEL_LANGUAGES[0].tag)
  const [level, setLevel] = useState<ChannelLevel>('A2')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)
  useEffect(() => () => abort.current?.abort(), [])

  const submit = async () => {
    abort.current = new AbortController()
    setBusy(true)
    setError(null)
    try {
      await onCreate({ about: about.trim(), targetLang: lang, nativeLang, level }, abort.current.signal)
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

  return (
    <ScreenPanel title={l.newTitle} onClose={onClose}>
      {busy ? (
        <div className="new-channel__busy" role="status">
          <span className="new-channel__scan" aria-hidden>
            <span />
            <span />
            <span />
          </span>
          <p>{l.searching}</p>
          <button type="button" className="chip" onClick={cancel}>
            {l.cancel}
          </button>
        </div>
      ) : (
        <form
          className="new-channel"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <label className="new-channel__field">
            <span className="log__heading">
              {l.briefing} · {l.briefingPrompt}
            </span>
            <textarea
              value={about}
              onChange={(e) => setAbout(e.target.value)}
              maxLength={BRIEF_LIMITS.aboutChars}
              rows={2}
              placeholder={l.placeholder}
            />
          </label>
          <div className="new-channel__suggestions">
            {l.suggestions.map((s) => (
              <button key={s} type="button" className={`chip${about === s ? ' is-on' : ''}`} onClick={() => setAbout(s)}>
                {s}
              </button>
            ))}
          </div>
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
            <span className="settings__label">{l.level}</span>
            <Segmented value={level} options={CHANNEL_LEVELS.map((v) => ({ value: v, label: v }))} onChange={setLevel} />
          </div>
          {error && <p className="new-channel__error">{error}</p>}
          <div className="new-channel__actions">
            <button type="button" className="chip" onClick={onBack}>
              ← {l.back}
            </button>
            <button type="submit" className="chip chip--primary">
              {l.tuneIn}
            </button>
          </div>
        </form>
      )}
    </ScreenPanel>
  )
}
