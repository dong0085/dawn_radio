import { useEffect, useRef, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { SendIcon } from '../icons'

const fade = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
  transition: { duration: 0.2 },
}

export interface TransmitViewProps {
  label: string
  color: string
  text: string
  mode: 'voice' | 'keyboard'
  /** True while speech is being turned into text. */
  processing?: boolean
  listeningText?: string
  processingText?: string
  placeholder?: string
  onChange?: (text: string) => void
  onSubmit?: () => void
  onCancel?: () => void
}

/** What the screen shows while the player transmits. */
export function TransmitView({
  label,
  color,
  text,
  mode,
  processing,
  listeningText = 'Listening…',
  processingText = 'Sending…',
  placeholder = 'Type your message…',
  onChange,
  onSubmit,
  onCancel,
}: TransmitViewProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (mode === 'keyboard') inputRef.current?.focus()
  }, [mode])

  return (
    <motion.div className="tx-view" {...fade}>
      <span className="tx-view__label" style={{ color }}>
        <span className="tx-view__dot" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
        {label}
      </span>
      {mode === 'keyboard' ? (
        <form
          className="tx-view__form"
          onSubmit={(e) => {
            e.preventDefault()
            onSubmit?.()
          }}
        >
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => onChange?.(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onCancel?.()
              e.stopPropagation()
            }}
            placeholder={placeholder}
            enterKeyHint="send"
            autoComplete="off"
          />
          <button type="submit" aria-label="Send" style={{ color }}>
            <SendIcon size={18} />
          </button>
        </form>
      ) : (
        <p className={`tx-view__text${text ? '' : ' is-empty'}`}>
          {processing ? text || processingText : text || listeningText}
        </p>
      )}
    </motion.div>
  )
}

export interface MessageViewProps {
  eyebrow?: string
  title: string
  body?: ReactNode
  actions?: ReactNode
  tone?: string
}

/** Centered message: standby, endings, tuning in. */
export function MessageView({ eyebrow, title, body, actions, tone }: MessageViewProps) {
  return (
    <motion.div className="message-view" {...fade}>
      {eyebrow && <span className="message-view__eyebrow">{eyebrow}</span>}
      <h2 className="message-view__title" style={tone ? { color: tone } : undefined}>
        {title}
      </h2>
      {body && <p className="message-view__body">{body}</p>}
      {actions && <div className="message-view__actions">{actions}</div>}
    </motion.div>
  )
}

export interface WordCardProps {
  word: string
  /** Translation of the word in context; undefined while loading. */
  translation?: string
  /** Shown under the word, e.g. the sentence translation when no word lookup is available. */
  note?: string
  lang?: string
  loadingText?: string
  closeLabel?: string
  onClose: () => void
}

/** Card for a tapped word: the word and what it means here. */
export function WordCard({ word, translation, note, lang, loadingText = 'Looking up…', closeLabel = 'Continue', onClose }: WordCardProps) {
  return (
    <motion.div
      className="word-card"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.16 }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="word-card__text">
        <span className="word-card__word" lang={lang}>
          {word}
        </span>
        {translation !== undefined || note ? (
          translation && <span className="word-card__meaning">{translation}</span>
        ) : (
          <span className="word-card__meaning is-loading">{loadingText}</span>
        )}
        {note && <span className="word-card__note">{note}</span>}
      </div>
      <button type="button" className="chip chip--primary" onClick={onClose}>
        {closeLabel}
      </button>
    </motion.div>
  )
}
