import { useState, type ReactNode } from 'react'
import { fmt } from './lib'

// ---- pieces ----

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'alert'; children: ReactNode }) {
  return <p className={`adm-notice adm-notice--${tone}`}>{children}</p>
}

/** A button that asks once more before it acts. */
export function ConfirmButton({ label, confirm, onConfirm, danger = true }: { label: string; confirm: string; onConfirm: () => Promise<unknown> | void; danger?: boolean }) {
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  if (!asking) {
    return (
      <button type="button" className={`adm-btn${danger ? ' adm-btn--danger' : ''}`} onClick={() => setAsking(true)}>
        {label}
      </button>
    )
  }
  return (
    <span className="adm-confirm">
      <span>{confirm}</span>
      <button type="button" className="adm-btn" onClick={() => setAsking(false)} disabled={busy}>
        Cancel
      </button>
      <button
        type="button"
        className={`adm-btn${danger ? ' adm-btn--danger' : ' adm-btn--primary'}`}
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          try {
            await onConfirm()
          } finally {
            setBusy(false)
            setAsking(false)
          }
        }}
      >
        {label}
      </button>
    </span>
  )
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="adm-seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} className={o.value === value ? 'is-on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Pager({ offset, limit, total, onChange }: { offset: number; limit: number; total: number; onChange: (offset: number) => void }) {
  if (!total) return null
  return (
    <div className="adm-pager">
      <span>
        {fmt.num(offset + 1)}–{fmt.num(Math.min(total, offset + limit))} of {fmt.num(total)}
      </span>
      <button type="button" className="adm-btn" disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - limit))}>
        ← Newer
      </button>
      <button type="button" className="adm-btn" disabled={offset + limit >= total} onClick={() => onChange(offset + limit)}>
        Older →
      </button>
    </div>
  )
}

export function Pill({ tone, children }: { tone: 'live' | 'ok' | 'warn' | 'alert' | 'muted'; children: ReactNode }) {
  return <span className={`adm-pill adm-pill--${tone}`}>{children}</span>
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="adm-field">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

// ---- charts ----

/**
 * Daily bars for one measure. Recessive baseline and a single gridline at the top value;
 * the hovered or focused bar shows its day and value.
 */
export function DailyBars({ title, days, unit }: { title: string; days: { day: string; value: number }[]; unit: string }) {
  const [active, setActive] = useState<number | null>(null)
  const max = Math.max(1, ...days.map((d) => d.value))
  const total = days.reduce((n, d) => n + d.value, 0)
  const shown = active ?? null
  return (
    <figure className="adm-chart">
      <figcaption className="adm-chart__head">
        <span className="adm-chart__title">{title}</span>
        <span className="adm-chart__value">
          {shown === null ? (
            <>
              {fmt.num(total)} <small>in {days.length} days</small>
            </>
          ) : (
            <>
              {fmt.num(days[shown].value)} <small>{fmt.day(days[shown].day)}</small>
            </>
          )}
        </span>
      </figcaption>
      <div className="adm-chart__plot" onMouseLeave={() => setActive(null)}>
        <span className="adm-chart__max">{fmt.num(max)}</span>
        <div className="adm-chart__bars">
          {days.map((d, i) => (
            <button
              key={d.day}
              type="button"
              className={`adm-chart__bar${active === i ? ' is-active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              aria-label={`${fmt.day(d.day)}: ${fmt.num(d.value)} ${unit}`}
            >
              <span style={{ height: `${(d.value / max) * 100}%` }} />
            </button>
          ))}
        </div>
      </div>
      <div className="adm-chart__axis" aria-hidden>
        <span>{fmt.day(days[0]?.day ?? '')}</span>
        <span>{fmt.day(days[days.length - 1]?.day ?? '')}</span>
      </div>
      <table className="adm-sr">
        <caption>{title}</caption>
        <tbody>
          {days.map((d) => (
            <tr key={d.day}>
              <th>{d.day}</th>
              <td>{d.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}

/** Horizontal bars with the label and value as text beside each. */
export function BarList({ rows, empty = 'Nothing yet.' }: { rows: { label: string; value: number }[]; empty?: string }) {
  if (!rows.length) return <p className="adm-empty">{empty}</p>
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <ul className="adm-barlist">
      {rows.map((r) => (
        <li key={r.label}>
          <span className="adm-barlist__label">{r.label}</span>
          <span className="adm-barlist__track">
            <span style={{ width: `${(r.value / max) * 100}%` }} />
          </span>
          <span className="adm-barlist__value">{fmt.num(r.value)}</span>
        </li>
      ))}
    </ul>
  )
}
