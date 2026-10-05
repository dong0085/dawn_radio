import { useEffect, useState } from 'react'
import type { RecordingSummary } from '../../../shared/recordings.ts'
import { formatElapsed } from './format'
import { ScreenPanel } from './Panels'

/** Every word the recordings panel shows. */
export interface RecordingsLabels {
  title: string
  empty: string
  loading: string
  failed: string
  /** e.g. "18 transmissions · 6:40" */
  meta: (transmissions: number, time: string) => string
  outcome: Record<'success' | 'failure' | 'other', string>
  play: string
  delete: string
  confirmDelete: string
  cancel: string
  close: string
  /** Shown at the top while a recording plays, to leave it. */
  backToLive: string
}

const defaultRecordingsLabels: RecordingsLabels = {
  title: 'Recordings',
  empty: 'No recordings yet. Save one from the transcript, or when a channel closes.',
  loading: 'Loading…',
  failed: 'Recordings are offline.',
  meta: (n, time) => `${n} transmission${n === 1 ? '' : 's'} · ${time}`,
  outcome: { success: '✓', failure: '✕', other: '·' },
  play: 'Play',
  delete: 'Delete',
  confirmDelete: 'Delete this recording?',
  cancel: 'Cancel',
  close: 'Close',
  backToLive: 'Back to live',
}

export interface RecordingsPanelProps {
  load: () => Promise<{ rows: RecordingSummary[] }>
  onPlay: (id: string) => void
  onDelete: (id: string) => Promise<void>
  onClose: () => void
  /** The recording playing now, if any: marked, with the way back to live. */
  playingId?: string
  onBackToLive?: () => void
  /** Language for dates. */
  locale?: string
  labels?: Partial<RecordingsLabels>
}

/** Saved recordings, newest first: play one like a tape, or delete it. */
export function RecordingsPanel({ load, onPlay, onDelete, onClose, playingId, onBackToLive, locale, labels }: RecordingsPanelProps) {
  const l = { ...defaultRecordingsLabels, ...labels }
  const [rows, setRows] = useState<RecordingSummary[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [confirming, setConfirming] = useState<string | null>(null)
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' })

  useEffect(() => {
    let alive = true
    load()
      .then((r) => alive && setRows(r.rows))
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [load])

  return (
    <ScreenPanel title={l.title} onClose={onClose} closeLabel={l.close}>
      {playingId && onBackToLive && (
        <button type="button" className="channels__new recordings__live" onClick={onBackToLive}>
          ← {l.backToLive}
        </button>
      )}
      {failed ? (
        <p className="transcript__empty">{l.failed}</p>
      ) : !rows ? (
        <p className="transcript__empty">{l.loading}</p>
      ) : !rows.length ? (
        <p className="transcript__empty">{l.empty}</p>
      ) : (
        <ul className="channels">
          {rows.map((r) => {
            const current = r.id === playingId
            const outcome = r.outcome as keyof RecordingsLabels['outcome'] | null
            return (
              <li key={r.id} className={`channel${current ? ' is-current' : ''}`}>
                <button type="button" className="channel__main" onClick={() => !current && onPlay(r.id)} aria-current={current || undefined}>
                  <span className="channel__dot" aria-hidden />
                  <span className="channel__body">
                    <span className="channel__line">
                      <span className="channel__title">{r.title}</span>
                    </span>
                    <span className="channel__meta">
                      {date.format(r.updatedAt)} · {l.meta(r.transmissions, formatElapsed(r.elapsed))}
                      {outcome && l.outcome[outcome] ? ` · ${l.outcome[outcome]}` : ''}
                    </span>
                  </span>
                  {!current && <span className="channel__state">{l.play}</span>}
                </button>
                {confirming === r.id ? (
                  <div className="channel__confirm">
                    <span>{l.confirmDelete}</span>
                    <button type="button" className="chip" onClick={() => setConfirming(null)}>
                      {l.cancel}
                    </button>
                    <button
                      type="button"
                      className="chip chip--danger"
                      onClick={async () => {
                        setConfirming(null)
                        await onDelete(r.id)
                        setRows((list) => list?.filter((x) => x.id !== r.id) ?? null)
                      }}
                    >
                      {l.delete}
                    </button>
                  </div>
                ) : (
                  !current && (
                    <button type="button" className="channel__remove" onClick={() => setConfirming(r.id)}>
                      {l.delete}
                    </button>
                  )
                )}
              </li>
            )
          })}
        </ul>
      )}
    </ScreenPanel>
  )
}
