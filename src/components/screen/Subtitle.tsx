import { useMemo } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { paginate } from '../../engine/words'
import type { Segment, TimedWord } from '../../types'

export interface SubtitleProps {
  lineId: string
  segments: Segment[]
  words: TimedWord[]
  /** Word being spoken; -1 before start, words.length when finished. */
  wordIndex: number
  showTranslation: boolean
  highlight: boolean
  /** Max characters of target text per screen page. */
  maxChars?: number
  /** Color for the word being spoken. */
  color?: string
  onRevealTranslation?: () => void
  translationHint?: string
  /** Language tag of the target text. */
  lang?: string
}

/** Target-language line with word-by-word highlight, and its translation underneath. */
export function Subtitle({
  lineId,
  segments,
  words,
  wordIndex,
  showTranslation,
  highlight,
  maxChars = 96,
  color,
  onRevealTranslation,
  translationHint = 'Tap to translate',
  lang,
}: SubtitleProps) {
  const pages = useMemo(() => paginate(segments, maxChars), [segments, maxChars])

  const activeSegment =
    wordIndex < 0 ? 0 : wordIndex >= words.length ? segments.length - 1 : (words[wordIndex]?.segment ?? 0)
  const pageIndex = Math.max(0, pages.findIndex((p) => p.segments.includes(activeSegment)))
  const page = pages[pageIndex]

  const pageWords = words
    .map((w, i) => ({ ...w, i }))
    .filter((w) => page.segments.includes(w.segment))

  // No timing data: show the page's text as plain words.
  const fallback = words.length === 0
  const translation = page.segments.map((s) => segments[s].translation).join(' ')

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={`${lineId}:${pageIndex}`}
        className="subtitle"
        initial={{ opacity: 0, y: 6, filter: 'blur(3px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        exit={{ opacity: 0, y: -6, filter: 'blur(3px)' }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        onClick={showTranslation ? undefined : onRevealTranslation}
      >
        <p className="subtitle__target" lang={lang}>
          {fallback
            ? page.segments.map((s) => segments[s].text).join(' ')
            : pageWords.map((w) => {
                const state = !highlight || w.i < wordIndex ? 'spoken' : w.i === wordIndex ? 'current' : 'upcoming'
                return (
                  <span
                    key={w.i}
                    className={`word word--${state}`}
                    style={state === 'current' && color ? { textShadow: `0 0 12px ${color}` } : undefined}
                  >
                    {w.text}{' '}
                  </span>
                )
              })}
        </p>
        {showTranslation ? (
          <p className="subtitle__native">{translation}</p>
        ) : (
          translation && <p className="subtitle__hint">{translationHint}</p>
        )}
        {pages.length > 1 && (
          <span className="subtitle__pager" aria-hidden>
            {pages.map((_, i) => (
              <span key={i} className={i === pageIndex ? 'is-on' : ''} />
            ))}
          </span>
        )}
      </motion.div>
    </AnimatePresence>
  )
}
