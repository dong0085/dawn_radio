import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import './training.css'

export interface TrainingStep {
  /** `data-tour` id of the part to point at. Null shows the card in the middle with nothing marked. */
  target: string | null
  title: string
  body: ReactNode
  /** Keyboard keys for this part, drawn as keycaps (e.g. ['Space']). */
  keys?: string[]
  /** Outline the part as a circle (round keys) or a rounded box. */
  shape?: 'box' | 'round'
}

export interface FieldTrainingLabels {
  eyebrow: string
  next: string
  back: string
  skip: string
  /** Last button when the caller gives no finishLabel. */
  done: string
  /** Text before the keycaps. */
  key: string
}

const defaultLabels: FieldTrainingLabels = {
  eyebrow: 'Field training',
  next: 'Next',
  back: 'Back',
  skip: 'Skip',
  done: 'Done',
  key: 'Key',
}

export interface FieldTrainingProps {
  steps: TrainingStep[]
  /** Element the `data-tour` targets are looked up in. */
  root: RefObject<HTMLElement | null>
  /** completed: the player went through to the end (false when skipped). */
  onFinish: (completed: boolean) => void
  /** Label of the last button, e.g. "Join channel". */
  finishLabel?: string
  /** Show keyboard keys (hide them on touch screens). */
  showKeys?: boolean
  labels?: Partial<FieldTrainingLabels>
}

interface Box {
  x: number
  y: number
  w: number
  h: number
}

/** Space between the part and its outline, and between the outline and the card. */
const PAD = 8
const GAP = 22
/** Page gutter. */
const EDGE = 16
const CARD_W = 300

const find = (root: HTMLElement | null, id: string) => root?.querySelector<HTMLElement>(`[data-tour="${id}"]`) ?? null

/** Follows an element's box on screen, including while the radio rescales. */
function useBox(root: RefObject<HTMLElement | null>, target: string | null) {
  const [box, setBox] = useState<Box | null>(null)
  const [view, setView] = useState({ w: window.innerWidth, h: window.innerHeight })
  useLayoutEffect(() => {
    let raf = 0
    let last = ''
    const tick = () => {
      const el = target ? find(root.current, target) : null
      const r = el?.getBoundingClientRect()
      const next = r && r.width > 0 ? { x: r.x, y: r.y, w: r.width, h: r.height } : null
      const key = `${window.innerWidth}x${window.innerHeight}|${next ? Object.values(next).map(Math.round).join(',') : '-'}`
      if (key !== last) {
        last = key
        setBox(next)
        setView({ w: window.innerWidth, h: window.innerHeight })
      }
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [root, target])
  return { box, view }
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

/** Where the card goes: beside the part when there is room, else above or below, else over it. */
function placeCard(hole: Box | null, card: { w: number; h: number }, view: { w: number; h: number }) {
  const center = { x: (view.w - card.w) / 2, y: (view.h - card.h) / 2 }
  if (!hole) return center
  const cx = hole.x + hole.w / 2
  const cy = hole.y + hole.h / 2
  const xAt = clamp(cx - card.w / 2, EDGE, view.w - card.w - EDGE)
  const yAt = clamp(cy - card.h / 2, EDGE, view.h - card.h - EDGE)
  const room = {
    right: view.w - (hole.x + hole.w) - GAP - EDGE,
    left: hole.x - GAP - EDGE,
    below: view.h - (hole.y + hole.h) - GAP - EDGE,
    above: hole.y - GAP - EDGE,
  }
  const options = [
    room.right >= card.w && { x: hole.x + hole.w + GAP, y: yAt },
    room.left >= card.w && { x: hole.x - GAP - card.w, y: yAt },
    room.below >= card.h && { x: xAt, y: hole.y + hole.h + GAP },
    room.above >= card.h && { x: xAt, y: hole.y - GAP - card.h },
  ]
  const fit = options.find(Boolean)
  if (fit) return fit
  // No room anywhere: sit over the half of the screen the part is not in.
  return { x: xAt, y: cy > view.h / 2 ? EDGE : view.h - card.h - EDGE }
}

/** The point of box `a` closest to point p. */
const nearest = (a: Box, p: { x: number; y: number }) => ({ x: clamp(p.x, a.x, a.x + a.w), y: clamp(p.y, a.y, a.y + a.h) })

/**
 * First-visit walkthrough: dims the page, locks a targeting bracket onto one part of the radio
 * at a time, and explains it in a card drawn like the radio's screen.
 */
export function FieldTraining({ steps: allSteps, root, onFinish, finishLabel, showKeys = true, labels }: FieldTrainingProps) {
  const l = { ...defaultLabels, ...labels }
  // Steps whose part isn't on screen (e.g. no log on this channel) are left out.
  const [steps] = useState(() => allSteps.filter((s) => !s.target || find(root.current, s.target)))
  const [index, setIndex] = useState(0)
  const step = steps[index]
  const { box, view } = useBox(root, step?.target ?? null)
  const reduce = useReducedMotion()

  const cardRef = useRef<HTMLDivElement>(null)
  const nextRef = useRef<HTMLButtonElement>(null)
  const [cardH, setCardH] = useState(200)
  useLayoutEffect(() => {
    const el = cardRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setCardH(el.offsetHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const isLast = index === steps.length - 1
  const next = () => (isLast ? onFinish(true) : setIndex((i) => i + 1))
  const back = () => setIndex((i) => Math.max(0, i - 1))

  useEffect(() => {
    nextRef.current?.focus({ preventScroll: true })
  }, [index])

  // The radio's own shortcuts stay quiet while training is open.
  const keys = useRef({ next, back, skip: () => onFinish(false) })
  useLayoutEffect(() => {
    keys.current = { next, back, skip: () => onFinish(false) }
  })
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      e.stopPropagation()
      if (e.key === 'ArrowRight') keys.current.next()
      else if (e.key === 'ArrowLeft') keys.current.back()
      else if (e.key === 'Escape') keys.current.skip()
    }
    const up = (e: KeyboardEvent) => e.stopPropagation()
    window.addEventListener('keydown', down, true)
    window.addEventListener('keyup', up, true)
    return () => {
      window.removeEventListener('keydown', down, true)
      window.removeEventListener('keyup', up, true)
    }
  }, [])

  if (!step) return null

  const hole: Box | null = box && {
    x: clamp(box.x - PAD, 4, view.w),
    y: clamp(box.y - PAD, 4, view.h),
    w: Math.min(box.w + PAD * 2, view.w - 8),
    h: Math.min(box.h + PAD * 2, view.h - 8),
  }
  const radius = hole ? (step.shape === 'round' ? Math.min(hole.w, hole.h) / 2 : 14) : 0
  const card = { w: Math.min(CARD_W, view.w - EDGE * 2), h: cardH }
  const at = placeCard(hole, card, view)
  const cardBox = { x: at.x, y: at.y, w: card.w, h: card.h }

  // Leader line from the outline to the card, when they don't overlap.
  const from = hole && nearest(hole, { x: at.x + card.w / 2, y: at.y + card.h / 2 })
  const to = from && nearest(cardBox, from)
  const showLeader = from && to && Math.hypot(to.x - from.x, to.y - from.y) > 10

  const spring = reduce ? { duration: 0 } : { type: 'spring' as const, stiffness: 240, damping: 30 }
  const count = (n: number) => String(n).padStart(2, '0')

  return (
    <div className="training" role="dialog" aria-modal="true" aria-labelledby="training-title">
      <svg className="training__shade" width={view.w} height={view.h} aria-hidden>
        <defs>
          <mask id="training-hole">
            <rect width={view.w} height={view.h} fill="white" />
            {hole && (
              <motion.rect
                initial={false}
                animate={{ x: hole.x, y: hole.y, width: hole.w, height: hole.h, rx: radius }}
                transition={spring}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect width={view.w} height={view.h} className="training__dim" mask="url(#training-hole)" />
        {showLeader && (
          <g className="training__leader">
            <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} />
            <circle cx={from.x} cy={from.y} r={2.5} />
          </g>
        )}
      </svg>

      {hole && (
        <motion.div
          className="reticle"
          initial={false}
          animate={{ x: hole.x, y: hole.y, width: hole.w, height: hole.h }}
          transition={spring}
          aria-hidden
        >
          <motion.div
            key={index}
            className="reticle__lock"
            initial={reduce ? false : { opacity: 0, scale: 1.18 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          >
            <span className="reticle__scan" style={{ borderRadius: radius }} />
            <span className="reticle__corner reticle__corner--tl" />
            <span className="reticle__corner reticle__corner--tr" />
            <span className="reticle__corner reticle__corner--bl" />
            <span className="reticle__corner reticle__corner--br" />
            <span className={`reticle__tag${hole.y < 30 ? ' reticle__tag--inside' : ''}`}>
              {count(index + 1)} · {step.title}
            </span>
          </motion.div>
        </motion.div>
      )}

      <motion.div
        ref={cardRef}
        className="training__card"
        style={{ width: card.w }}
        initial={reduce ? false : { opacity: 0, x: at.x, y: at.y + 10 }}
        animate={{ opacity: 1, x: at.x, y: at.y }}
        transition={spring}
      >
        <div className="training__head">
          <span className="training__eyebrow">{l.eyebrow}</span>
          <span className="training__count">
            {count(index + 1)} / {count(steps.length)}
          </span>
        </div>
        <div className="training__ticks" aria-hidden>
          {steps.map((_, i) => (
            <span key={i} className={i < index ? 'is-done' : i === index ? 'is-on' : ''} />
          ))}
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={index}
            className="training__content"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
          >
            <h2 id="training-title" className="training__title">
              {step.title}
            </h2>
            <p className="training__body">{step.body}</p>
            {showKeys && step.keys?.length ? (
              <p className="training__keys">
                <span>{l.key}</span>
                {step.keys.map((k) => (
                  <kbd key={k}>{k}</kbd>
                ))}
              </p>
            ) : null}
          </motion.div>
        </AnimatePresence>
        <div className="training__actions">
          {!isLast && (
            <button type="button" className="training__skip" onClick={() => onFinish(false)}>
              {l.skip}
            </button>
          )}
          <span className="training__spacer" />
          {index > 0 && (
            <button type="button" className="chip" onClick={back}>
              {l.back}
            </button>
          )}
          <button ref={nextRef} type="button" className="chip chip--primary" onClick={next}>
            {isLast ? (finishLabel ?? l.done) : `${l.next} →`}
          </button>
        </div>
      </motion.div>
    </div>
  )
}
