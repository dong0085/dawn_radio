import { useEffect, useId, useRef, type CSSProperties } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { playerLanguage } from '../i18n'
import { useSettings } from '../settings'
import { defaultTheme, type RadioTheme } from '../theme'
import { closeChangelog, commitsUrl, currentVersion, notesIn, openChangelog, useChangelog } from './releases'
import './changelog.css'

export interface ChangelogLabels {
  eyebrow: string
  title: string
  /** e.g. "v0.2.0". */
  version: (version: string) => string
  /** Link to a release's commits. */
  commits: string
  close: string
  /** Settings row that opens the list again. */
  rowLabel: string
  rowAction: string
}

const LABELS: Record<string, ChangelogLabels> = {
  'en-US': {
    eyebrow: 'Firmware update',
    title: 'What’s new',
    version: (v) => `v${v}`,
    commits: 'Changes',
    close: 'Continue',
    rowLabel: 'Firmware',
    rowAction: 'What’s new',
  },
  'zh-CN': {
    eyebrow: '固件更新',
    title: '更新内容',
    version: (v) => `v${v}`,
    commits: '改动',
    close: '继续',
    rowLabel: '固件',
    rowAction: '更新内容',
  },
  'zh-TW': {
    eyebrow: '韌體更新',
    title: '更新內容',
    version: (v) => `v${v}`,
    commits: '改動',
    close: '繼續',
    rowLabel: '韌體',
    rowAction: '更新內容',
  },
}
LABELS['yue-HK'] = LABELS['zh-TW']

/** The player's language, and the changelog's words in it. */
function useLanguage(labels?: Partial<ChangelogLabels>) {
  const [settings] = useSettings()
  const lang = playerLanguage(settings.nativeLang, '')
  return { lang, l: { ...(LABELS[lang] ?? LABELS['en-US']), ...labels } }
}

/** Theme colors and fonts, for a card drawn outside the radio. */
const vars = (t: RadioTheme) =>
  ({
    '--text': t.screen.text,
    '--text-dim': t.screen.textDim,
    '--line': t.screen.line,
    '--accent': t.screen.accent,
    '--glass': t.screen.glass,
    '--glass-deep': t.screen.glassDeep,
    '--font-ui': t.fonts.ui,
    '--font-sub': t.fonts.subtitle,
    '--track-title': t.tracking.title,
    '--track-wide': t.tracking.wide,
    '--track-caps': t.tracking.caps,
  }) as CSSProperties

function formatDate(date: string, lang: string) {
  const [y, m, d] = date.split('-').map(Number)
  try {
    return new Intl.DateTimeFormat(lang, { dateStyle: 'medium' }).format(new Date(y, m - 1, d))
  } catch {
    return date
  }
}

export interface ChangelogProps {
  theme?: RadioTheme
  labels?: Partial<ChangelogLabels>
  /** Show the link to each release's commits. */
  showCommits?: boolean
}

/**
 * What changed since this browser's last visit. Opens by itself when the radio is newer than the
 * version last seen here, and from the settings row any time.
 */
export function Changelog({ theme = defaultTheme, labels, showCommits = true }: ChangelogProps) {
  const releases = useChangelog()
  const { lang, l } = useLanguage(labels)
  const titleId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)
  const open = !!releases?.length

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    // Keys stay with the card (Enter and Space still press its buttons), so the radio's shortcuts wait.
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation()
      if (e.type === 'keydown' && e.key === 'Escape') closeChangelog()
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('keyup', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('keyup', onKey, true)
    }
  }, [open])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="changelog"
          style={vars(theme)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onPointerDown={(e) => e.target === e.currentTarget && closeChangelog()}
        >
          <motion.section
            className="changelog__card"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
          >
            <header className="changelog__head">
              <span className="changelog__eyebrow">{l.eyebrow}</span>
              <span className="changelog__current">{l.version(currentVersion)}</span>
            </header>
            <h2 id={titleId} className="changelog__title">
              {l.title}
            </h2>
            <div className="changelog__list">
              {releases.map((r) => (
                <article key={r.version} className="changelog__release">
                  <div className="changelog__meta">
                    <span className="changelog__version">{l.version(r.version)}</span>
                    <span className="changelog__date">{formatDate(r.date, lang)}</span>
                    {showCommits && (
                      <a className="changelog__commits" href={commitsUrl(r)} target="_blank" rel="noreferrer">
                        {l.commits} ↗
                      </a>
                    )}
                  </div>
                  <ul className="changelog__notes">
                    {notesIn(r, lang).map((note, i) => (
                      <li key={i}>{note}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
            <footer className="changelog__actions">
              <button ref={closeRef} type="button" className="changelog__close" onClick={closeChangelog}>
                {l.close}
              </button>
            </footer>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** Settings row: the radio's version, and a key that lists every release. */
export function ChangelogRow({ labels }: { labels?: Partial<ChangelogLabels> }) {
  const { l } = useLanguage(labels)
  return (
    <div className="settings__row">
      <div className="settings__label">
        {l.rowLabel}
        <small>{l.version(currentVersion)}</small>
      </div>
      <button type="button" className="chip" onClick={() => openChangelog()}>
        {l.rowAction}
      </button>
    </div>
  )
}
