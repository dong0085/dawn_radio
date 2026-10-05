import { useState, type ReactNode } from 'react'
import type {
  AdminChannel,
  AdminChannelRow,
  AdminOverview,
  AdminPage,
  AdminPlayer,
  AdminPlayerRow,
  AdminSession,
  AdminSessionRow,
} from '../../shared/admin.ts'
import { admin } from './api'
import { fmt, useDebounced, useLoad } from './lib'
import { BarList, ConfirmButton, DailyBars, Field, Notice, Pager, Pill, Segmented } from './ui'

const LIMIT = 25

const go = (hash: string) => {
  window.location.hash = hash
}

const channelHref = (id: string) => `#/channels/${id}`
const playerHref = (id: string) => `#/players/${id}`
const sessionHref = (s: { player: string; channel: string }) => `#/sessions/${s.player}/${encodeURIComponent(s.channel)}`

function Loading({ error }: { error: string | null }) {
  return error ? <Notice tone="alert">{error}</Notice> : <p className="adm-empty">Loading…</p>
}

function Toolbar({ search, onSearch, placeholder, children }: { search: string; onSearch: (q: string) => void; placeholder: string; children?: ReactNode }) {
  return (
    <div className="adm-toolbar">
      <input className="adm-search" type="search" value={search} onChange={(e) => onSearch(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
      {children}
    </div>
  )
}

/** Search, filter and page state for a list, reset to the first page when the search changes. */
function useListState<F extends string>(filter: F) {
  const [q, setQ] = useState('')
  const [f, setF] = useState(filter)
  const [offset, setOffset] = useState(0)
  const query = useDebounced(q)
  return {
    q,
    setQ: (v: string) => {
      setQ(v)
      setOffset(0)
    },
    f,
    setF: (v: F) => {
      setF(v)
      setOffset(0)
    },
    offset,
    setOffset,
    params: (key: string) => new URLSearchParams({ q: query, [key]: f, limit: String(LIMIT), offset: String(offset) }).toString(),
  }
}

// ---- overview ----

export function Overview() {
  const { data, error } = useLoad(() => admin<AdminOverview>('/overview'), 'overview')
  if (!data) return <Loading error={error} />
  const { totals, active, days, routes } = data
  const requests = days.reduce((n, d) => n + d.requests, 0)
  const tiles = [
    { label: 'Listeners', value: totals.players, note: `${fmt.num(active.day)} today · ${fmt.num(active.week)} this week` },
    { label: 'Channels made', value: totals.channels, note: `${fmt.num(totals.hidden)} off the air`, href: '#/channels' },
    { label: 'Sessions', value: totals.sessions, note: `${fmt.num(totals.endedSessions)} closed`, href: '#/sessions' },
    { label: 'Requests', value: requests, note: `last ${days.length} days` },
  ]
  return (
    <div className="adm-stack">
      <div className="adm-tiles">
        {tiles.map((t) => {
          const body = (
            <>
              <span className="adm-tile__label">{t.label}</span>
              <span className="adm-tile__value">{fmt.num(t.value)}</span>
              <span className="adm-tile__note">{t.note}</span>
            </>
          )
          return t.href ? (
            <a key={t.label} className="adm-tile adm-tile--link" href={t.href}>
              {body}
            </a>
          ) : (
            <div key={t.label} className="adm-tile">
              {body}
            </div>
          )
        })}
      </div>
      <div className="adm-grid2">
        <section className="adm-card">
          <DailyBars title="Requests per day" unit="requests" days={days.map((d) => ({ day: d.day, value: d.requests }))} />
        </section>
        <section className="adm-card">
          <DailyBars title="Channels made per day" unit="channels" days={days.map((d) => ({ day: d.day, value: d.channels }))} />
        </section>
      </div>
      <section className="adm-card">
        <h2 className="adm-card__title">Requests by route · last {days.length} days</h2>
        <BarList rows={routes.map((r) => ({ label: r.route, value: r.count }))} empty="No requests counted yet." />
      </section>
    </div>
  )
}

// ---- channels ----

type ChannelStatus = 'all' | 'live' | 'hidden' | 'removed'

function channelState(c: AdminChannelRow) {
  if (c.hidden) return <Pill tone="alert">Off the air</Pill>
  if (c.removedAt) return <Pill tone="muted">Removed by owner</Pill>
  return <Pill tone="live">On air</Pill>
}

function ChannelTable({ rows, showOwner = true }: { rows: AdminChannelRow[]; showOwner?: boolean }) {
  if (!rows.length) return <p className="adm-empty">No channels.</p>
  return (
    <table className="adm-table">
      <thead>
        <tr>
          <th>Channel</th>
          <th>Signal</th>
          {showOwner && <th>Made by</th>}
          <th>Sessions</th>
          <th>Made</th>
          <th>State</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((c) => (
          <tr key={c.id} onClick={() => go(channelHref(c.id))}>
            <td data-label="Channel">
              <a href={channelHref(c.id)} onClick={(e) => e.stopPropagation()}>
                {c.title}
              </a>
              {c.about && <small>{c.about}</small>}
            </td>
            <td data-label="Signal">
              {c.targetLang} · {c.level}
            </td>
            {showOwner && (
              <td data-label="Made by" className="adm-mono">
                {fmt.player(c.owner)}
              </td>
            )}
            <td data-label="Sessions">
              {fmt.num(c.sessions)} <small>{fmt.num(c.transmissions)} lines</small>
            </td>
            <td data-label="Made">{fmt.ago(c.createdAt)}</td>
            <td data-label="State">{channelState(c)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function ChannelsList() {
  const s = useListState<ChannelStatus>('all')
  const query = s.params('status')
  const { data, error } = useLoad(() => admin<AdminPage<AdminChannelRow>>(`/channels?${query}`), query)
  return (
    <div className="adm-stack">
      <Toolbar search={s.q} onSearch={s.setQ} placeholder="Search title, briefing, id or player">
        <Segmented
          label="State"
          value={s.f}
          onChange={s.setF}
          options={[
            { value: 'all', label: 'All' },
            { value: 'live', label: 'On air' },
            { value: 'hidden', label: 'Off the air' },
            { value: 'removed', label: 'Removed' },
          ]}
        />
      </Toolbar>
      {data ? (
        <section className="adm-card adm-card--flush">
          <ChannelTable rows={data.rows} />
          <Pager offset={s.offset} limit={LIMIT} total={data.total} onChange={s.setOffset} />
        </section>
      ) : (
        <Loading error={error} />
      )}
    </div>
  )
}

export function ChannelDetail({ id }: { id: string }) {
  const { data: c, error, reload } = useLoad(() => admin<AdminChannel>(`/channels/${id}`), id)
  if (!c) return <Loading error={error} />
  const [a, b] = c.bible.parties
  return (
    <div className="adm-stack">
      <header className="adm-head">
        <div>
          <span className="adm-eyebrow">
            Channel · <span className="adm-mono">{c.id}</span>
          </span>
          <h1 className="adm-title">{c.title}</h1>
          <div className="adm-head__meta">
            {channelState(c)}
            <span>
              {c.targetLang} · {c.level}
              {c.brief.tension ? ` · ${c.brief.tension}` : ''}
            </span>
            <span>Made {fmt.date(c.createdAt)}</span>
          </div>
        </div>
        <div className="adm-actions">
          <ConfirmButton
            label={c.hidden ? 'Put back on air' : 'Take off the air'}
            confirm={c.hidden ? 'Listeners can play it again.' : 'The live feed stops for everyone.'}
            danger={!c.hidden}
            onConfirm={() => admin(`/channels/${c.id}`, { method: 'PATCH', body: { hidden: !c.hidden } }).then(reload)}
          />
          <ConfirmButton
            label="Delete"
            confirm="Delete the channel and its sessions?"
            onConfirm={() => admin(`/channels/${c.id}`, { method: 'DELETE' }).then(() => go('#/channels'))}
          />
        </div>
      </header>

      <div className="adm-grid2">
        <section className="adm-card">
          <h2 className="adm-card__title">Briefing</h2>
          <dl className="adm-fields">
            <Field label="Situation">{c.about || <em>Surprise me</em>}</Field>
            <Field label="Their part">{c.brief.role || <em>Left to the writers</em>}</Field>
            <Field label="Made by">
              <a className="adm-mono" href={playerHref(c.owner)}>
                {fmt.player(c.owner)}
              </a>
            </Field>
            {c.removedAt && <Field label="Removed by owner">{fmt.date(c.removedAt)}</Field>}
          </dl>
        </section>
        <section className="adm-card">
          <h2 className="adm-card__title">On the channel</h2>
          <p className="adm-prose">{c.display.premise}</p>
          <dl className="adm-fields">
            {[a, b].map((p) => (
              <Field key={p.id} label={`${p.name} · ${p.callSign}`}>
                {p.role}
              </Field>
            ))}
            <Field label="Player">{c.bible.playerRole}</Field>
          </dl>
        </section>
      </div>

      <section className="adm-card">
        <h2 className="adm-card__title">Story notes</h2>
        <p className="adm-prose">{c.bible.premise}</p>
        <div className="adm-grid2">
          <div>
            <h3 className="adm-subtitle">Possible events</h3>
            <ul className="adm-list">
              {c.bible.beats.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="adm-subtitle">Endings</h3>
            <ul className="adm-list">
              {c.bible.endings.map((e) => (
                <li key={e.outcome}>
                  <strong>{e.outcome}</strong> — {e.when}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="adm-card adm-card--flush">
        <h2 className="adm-card__title adm-card__title--pad">Sessions on this channel</h2>
        <SessionTable rows={c.sessionList} showChannel={false} />
      </section>
    </div>
  )
}

// ---- sessions ----

type Phase = 'all' | 'running' | 'ended'

function sessionState(s: AdminSessionRow) {
  if (s.phase === 'running') return <Pill tone="live">In progress</Pill>
  const tone = s.outcome === 'success' ? 'ok' : s.outcome === 'failure' ? 'alert' : 'muted'
  return <Pill tone={tone}>Closed{s.outcome && s.outcome !== 'other' ? ` · ${s.outcome}` : ''}</Pill>
}

function SessionTable({ rows, showChannel = true, showPlayer = true }: { rows: AdminSessionRow[]; showChannel?: boolean; showPlayer?: boolean }) {
  if (!rows.length) return <p className="adm-empty">No sessions.</p>
  return (
    <table className="adm-table">
      <thead>
        <tr>
          {showChannel && <th>Channel</th>}
          {showPlayer && <th>Listener</th>}
          <th>Lines</th>
          <th>Last saved</th>
          <th>State</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((s) => (
          <tr key={`${s.player}/${s.channel}`} onClick={() => go(sessionHref(s))}>
            {showChannel && (
              <td data-label="Channel">
                <a href={sessionHref(s)} onClick={(e) => e.stopPropagation()}>
                  {s.title}
                </a>
              </td>
            )}
            {showPlayer && (
              <td data-label="Listener" className="adm-mono">
                {showChannel ? (
                  fmt.player(s.player)
                ) : (
                  <a href={sessionHref(s)} onClick={(e) => e.stopPropagation()}>
                    {fmt.player(s.player)}
                  </a>
                )}
              </td>
            )}
            <td data-label="Lines">{fmt.num(s.transmissions)}</td>
            <td data-label="Last saved">{fmt.ago(s.updatedAt)}</td>
            <td data-label="State">{sessionState(s)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function SessionsList() {
  const s = useListState<Phase>('all')
  const query = s.params('phase')
  const { data, error } = useLoad(() => admin<AdminPage<AdminSessionRow>>(`/sessions?${query}`), query)
  return (
    <div className="adm-stack">
      <Toolbar search={s.q} onSearch={s.setQ} placeholder="Search channel or player">
        <Segmented
          label="State"
          value={s.f}
          onChange={s.setF}
          options={[
            { value: 'all', label: 'All' },
            { value: 'running', label: 'In progress' },
            { value: 'ended', label: 'Closed' },
          ]}
        />
      </Toolbar>
      {data ? (
        <section className="adm-card adm-card--flush">
          <SessionTable rows={data.rows} />
          <Pager offset={s.offset} limit={LIMIT} total={data.total} onChange={s.setOffset} />
        </section>
      ) : (
        <Loading error={error} />
      )}
    </div>
  )
}

export function SessionDetail({ player, channel }: { player: string; channel: string }) {
  const [translation, setTranslation] = useState(true)
  const { data: s, error } = useLoad(() => admin<AdminSession>(`/sessions/${player}/${encodeURIComponent(channel)}`), `${player}/${channel}`)
  if (!s) return <Loading error={error} />
  const name = (id: string) => (id === 'player' ? 'Listener' : (s.parties.find((p) => p.id === id)?.name ?? id))
  const side = (id: string) => (id === 'player' ? 'player' : s.parties[0]?.id === id ? 'a' : 'b')
  return (
    <div className="adm-stack">
      <header className="adm-head">
        <div>
          <span className="adm-eyebrow">Session</span>
          <h1 className="adm-title">{s.title}</h1>
          <div className="adm-head__meta">
            {sessionState(s)}
            <span>{fmt.num(s.transmissions)} lines</span>
            <span>{fmt.elapsed(s.data.elapsed)} on air</span>
            <span>Saved {fmt.date(s.updatedAt)}</span>
          </div>
          <div className="adm-head__links">
            <a href={playerHref(s.player)}>
              Listener <span className="adm-mono">{fmt.player(s.player)}</span>
            </a>
            {s.channel.startsWith('ch-') && <a href={channelHref(s.channel.split('@')[0])}>Channel details</a>}
          </div>
        </div>
        <div className="adm-actions">
          <button type="button" className={`adm-btn${translation ? ' is-on' : ''}`} onClick={() => setTranslation((t) => !t)} aria-pressed={translation}>
            Translation
          </button>
          <ConfirmButton label="Delete" confirm="Delete this session?" onConfirm={() => admin(`/sessions/${s.player}/${encodeURIComponent(s.channel)}`, { method: 'DELETE' }).then(() => go('#/sessions'))} />
        </div>
      </header>

      {s.data.ending && (
        <section className="adm-card adm-ending">
          <span className="adm-eyebrow">Channel closed · {s.data.ending.outcome}</span>
          <h2 className="adm-card__title">{s.data.ending.title}</h2>
          <p className="adm-prose">{s.data.ending.summary}</p>
        </section>
      )}

      <section className="adm-card">
        <h2 className="adm-card__title">Transcript</h2>
        <ol className="adm-transcript">
          {s.data.transcript.map((e) => (
            <li key={e.id} className={`adm-line adm-line--${side(e.speaker)}`}>
              <div className="adm-line__meta">
                <span className="adm-line__who">{name(e.speaker)}</span>
                <time>{fmt.elapsed(e.at)}</time>
                {e.interrupted && <Pill tone="warn">Cut off</Pill>}
              </div>
              <p className="adm-line__text">{e.segments.map((x) => x.text).join(' ')}</p>
              {e.rendering && <p className="adm-line__rendering">→ {e.rendering}</p>}
              {translation && <p className="adm-line__translation">{e.segments.map((x) => x.translation).filter(Boolean).join(' ')}</p>}
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}

// ---- players ----

type Sort = 'seen' | 'requests'

export function PlayersList() {
  const s = useListState<Sort>('seen')
  const query = s.params('sort')
  const { data, error } = useLoad(() => admin<AdminPage<AdminPlayerRow>>(`/players?${query}`), query)
  return (
    <div className="adm-stack">
      <Toolbar search={s.q} onSearch={s.setQ} placeholder="Search player id">
        <Segmented
          label="Order"
          value={s.f}
          onChange={s.setF}
          options={[
            { value: 'seen', label: 'Recent' },
            { value: 'requests', label: 'Most requests' },
          ]}
        />
      </Toolbar>
      {data ? (
        <section className="adm-card adm-card--flush">
          {data.rows.length ? (
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Listener</th>
                  <th>Channels</th>
                  <th>Sessions</th>
                  <th>Requests (7 d)</th>
                  <th>First seen</th>
                  <th>Last seen</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((p) => (
                  <tr key={p.id} onClick={() => go(playerHref(p.id))}>
                    <td data-label="Listener" className="adm-mono">
                      <a href={playerHref(p.id)} onClick={(e) => e.stopPropagation()}>
                        {fmt.player(p.id)}
                      </a>
                    </td>
                    <td data-label="Channels">{fmt.num(p.channels)}</td>
                    <td data-label="Sessions">{fmt.num(p.sessions)}</td>
                    <td data-label="Requests (7 d)">{fmt.num(p.requests)}</td>
                    <td data-label="First seen">{fmt.ago(p.createdAt)}</td>
                    <td data-label="Last seen">{fmt.ago(p.seenAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="adm-empty">No listeners.</p>
          )}
          <Pager offset={s.offset} limit={LIMIT} total={data.total} onChange={s.setOffset} />
        </section>
      ) : (
        <Loading error={error} />
      )}
    </div>
  )
}

export function PlayerDetail({ id }: { id: string }) {
  const { data: p, error } = useLoad(() => admin<AdminPlayer>(`/players/${id}`), id)
  if (!p) return <Loading error={error} />
  return (
    <div className="adm-stack">
      <header className="adm-head">
        <div>
          <span className="adm-eyebrow">Listener</span>
          <h1 className="adm-title adm-mono">{p.id}</h1>
          <div className="adm-head__meta">
            <span>First seen {fmt.date(p.createdAt)}</span>
            <span>Last seen {fmt.ago(p.seenAt)}</span>
          </div>
        </div>
        <div className="adm-actions">
          <ConfirmButton
            label="Delete all their data"
            confirm="Channels, sessions and usage go for good."
            onConfirm={() => admin(`/players/${p.id}`, { method: 'DELETE' }).then(() => go('#/players'))}
          />
        </div>
      </header>
      <section className="adm-card">
        <h2 className="adm-card__title">Requests by route · last 14 days</h2>
        <BarList rows={p.usage.map((u) => ({ label: u.route, value: u.count }))} empty="No requests counted." />
      </section>
      <section className="adm-card adm-card--flush">
        <h2 className="adm-card__title adm-card__title--pad">Channels they made</h2>
        <ChannelTable rows={p.channelList} showOwner={false} />
      </section>
      <section className="adm-card adm-card--flush">
        <h2 className="adm-card__title adm-card__title--pad">Their sessions</h2>
        <SessionTable rows={p.sessionList} showPlayer={false} />
      </section>
    </div>
  )
}
