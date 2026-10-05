import { useState, type CSSProperties, type ReactNode } from 'react'
import type { LogConfig, LogEntry, LogSection, LogState, Segment } from '../../types'
import { ChevronIcon } from '../icons'
import { formatElapsed } from './format'
import { ScreenPanel, Segmented } from './Panels'

export type LogTab = 'now' | 'timeline'

export interface LogViewProps {
  config: LogConfig
  log: LogState
  tab: LogTab
  onTabChange: (tab: LogTab) => void
  showTranslation: boolean
  /** Entries changed after this log version get the "new" tag. */
  since: number
  /** Opens the transcript at the line behind a timeline event. */
  onOpenLine?: (lineId: string) => void
  /** Language tag of the target text, for pronunciation and fonts. */
  lang?: string
}

export interface LogPanelProps extends Omit<LogViewProps, 'since'> {
  onToggleTranslation: () => void
  onClose: () => void
  /** Log version the player had seen when the panel opened. */
  seenVersion: number
}

const TranslationChip = ({ on, onClick }: { on: boolean; onClick: () => void }) => (
  <button type="button" className={`chip${on ? ' is-on' : ''}`} onClick={onClick}>
    Translation
  </button>
)

/** The log inside the radio screen, opened from the status bar. */
export function LogPanel({ onToggleTranslation, onClose, seenVersion, ...view }: LogPanelProps) {
  // Keep the "new" tags for the whole visit, even after the log is marked as seen.
  const [since] = useState(seenVersion)
  return (
    <ScreenPanel
      title={view.config.title}
      onClose={onClose}
      headerExtra={<TranslationChip on={view.showTranslation} onClick={onToggleTranslation} />}
    >
      <LogView {...view} since={since} />
    </ScreenPanel>
  )
}

export interface DockedLogProps extends Omit<LogViewProps, 'since'> {
  onToggleTranslation: () => void
  side: 'left' | 'right'
}

/** The log as a panel beside the radio, always open. Entries from the latest update get the "new" tag. */
export function DockedLog({ onToggleTranslation, side, ...view }: DockedLogProps) {
  return (
    <aside className={`docked-log docked-log--${side}`} data-tour="log" aria-label={view.config.title}>
      <header className="docked-log__head">
        <span className="screen-panel__title">{view.config.title}</span>
        <TranslationChip on={view.showTranslation} onClick={onToggleTranslation} />
      </header>
      <div className="docked-log__body">
        <LogView {...view} since={Math.max(0, view.log.version - 1)} />
      </div>
    </aside>
  )
}

/** What has happened on the channel and where things stand now. */
export function LogView({ config, log, tab, onTabChange, showTranslation, since, onOpenLine, lang }: LogViewProps) {
  const {
    nowTab = 'Now',
    timelineTab = 'Timeline',
    objectiveTitle = 'Objective',
    emptySection = 'Nothing yet',
    emptyTimeline = 'No events logged yet.',
    newLabel = 'New',
  } = config

  const text = (s: Segment | undefined) => s && <span lang={lang}>{s.text}</span>
  const translation = (...parts: (Segment | undefined)[]) => {
    if (!showTranslation) return null
    const line = parts.map((p) => p?.translation).filter(Boolean).join(' · ')
    return line ? <span className="log__translation">{line}</span> : null
  }

  return (
    <>
      <div className="log__tabs">
        <Segmented
          value={tab}
          options={[
            { value: 'now', label: nowTab },
            { value: 'timeline', label: timelineTab },
          ]}
          onChange={onTabChange}
        />
      </div>

      {tab === 'now' ? (
        <div className="log">
          {log.objective && (
            <section className={`log__objective${log.objective.done ? ' is-done' : ''}`}>
              <h3 className="log__heading">{objectiveTitle}</h3>
              <p className="log__objective-text">
                {log.objective.done && <span className="log__check" aria-hidden>✓ </span>}
                {text(log.objective)}
              </p>
              {translation(log.objective)}
            </section>
          )}
          {config.sections.map((section) => (
            <LogSectionView
              key={section.id}
              section={section}
              entries={log.entries.filter((e) => e.section === section.id)}
              isNew={(e) => e.rev > since}
              newLabel={newLabel}
              emptyText={emptySection}
              text={text}
              translation={translation}
            />
          ))}
        </div>
      ) : log.events.length === 0 ? (
        <p className="transcript__empty">{emptyTimeline}</p>
      ) : (
        <ol className="log-timeline">
          {[...log.events].reverse().map((event) => {
            const body = (
              <>
                <time>{formatElapsed(event.at)}</time>
                <span className="log-timeline__text">
                  {text(event.text)}
                  {translation(event.text)}
                </span>
                {event.lineId && onOpenLine && <ChevronIcon dir="right" size={12} className="log-timeline__go" />}
              </>
            )
            return (
              <li key={event.id} className="log-timeline__item">
                {event.lineId && onOpenLine ? (
                  <button type="button" className="log-timeline__row" onClick={() => onOpenLine(event.lineId!)}>
                    {body}
                  </button>
                ) : (
                  <div className="log-timeline__row">{body}</div>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </>
  )
}

interface LogSectionViewProps {
  section: LogSection
  entries: LogEntry[]
  isNew: (e: LogEntry) => boolean
  newLabel: string
  emptyText: string
  text: (s: Segment | undefined) => ReactNode
  translation: (...parts: (Segment | undefined)[]) => ReactNode
}

function LogSectionView({ section, entries, isNew, newLabel, emptyText, text, translation }: LogSectionViewProps) {
  const tag = (e: LogEntry) => isNew(e) && <span className="log__new">{newLabel}</span>
  const route = section.layout === 'route'

  return (
    <section className="log__section">
      <h3 className="log__heading">{section.title}</h3>
      {entries.length === 0 ? (
        <p className="log__empty">{emptyText}</p>
      ) : (
        <ul className={route ? 'log-route' : 'log-list'}>
          {entries.map((e) => (
            <li
              key={`${e.id}:${e.rev}`}
              className={`${route ? 'log-route__stop' : 'log-row'}${e.tone ? ` tone-${e.tone}` : ''}${isNew(e) ? ' is-new' : ''}`}
              style={e.color ? ({ '--dot': e.color } as CSSProperties) : undefined}
            >
              <span className={route ? 'log-route__dot' : 'log-row__dot'} aria-hidden />
              <div className="log-row__main">
                <div className="log-row__line">
                  <span className="log-row__label">{text(e.label)}</span>
                  {tag(e)}
                  {e.state && <span className="log-row__state">{text(e.state)}</span>}
                </div>
                {translation(e.label, e.state)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
