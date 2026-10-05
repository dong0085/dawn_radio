import { useEffect, useState, type CSSProperties } from 'react'
import type { ApiConfig } from '../../shared/api.ts'
import { PALETTES, PLAYER_COLOR } from '../channels/build'
import { defaultTheme, type RadioTheme } from '../theme'
import { AdminError, SIGNED_OUT, admin, getConfig, token } from './api'
import { ChannelDetail, ChannelsList, Overview, PlayerDetail, PlayersList, SessionDetail, SessionsList } from './views'
import { Notice } from './ui'
import './admin.css'

const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'channels', label: 'Channels' },
  { id: 'sessions', label: 'Sessions' },
  { id: 'players', label: 'Listeners' },
] as const

/** Radio theme colors and fonts as CSS variables, so the admin matches the device. */
const themeStyle = (t: RadioTheme) =>
  ({
    '--glass': t.screen.glass,
    '--glass-deep': t.screen.glassDeep,
    '--text': t.screen.text,
    '--text-dim': t.screen.textDim,
    '--line': t.screen.line,
    '--accent': t.screen.accent,
    '--tone-ok': t.tone.ok,
    '--tone-warn': t.tone.warn,
    '--tone-alert': t.tone.alert,
    '--font-ui': t.fonts.ui,
    '--font-sub': t.fonts.subtitle,
    // Transcript speakers: the radio's first channel colors.
    '--party-a': PALETTES[0][0],
    '--party-b': PALETTES[0][1],
    '--player': PLAYER_COLOR,
  }) as CSSProperties

function useHash() {
  const [hash, setHash] = useState(() => window.location.hash)
  useEffect(() => {
    const on = () => {
      setHash(window.location.hash)
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return hash
}

function Route({ parts }: { parts: string[] }) {
  const [section, a, b] = parts
  if (section === 'channels') return a ? <ChannelDetail key={a} id={a} /> : <ChannelsList />
  if (section === 'sessions') return a && b ? <SessionDetail key={`${a}/${b}`} player={a} channel={b} /> : <SessionsList />
  if (section === 'players') return a ? <PlayerDetail key={a} id={a} /> : <PlayersList />
  return <Overview />
}

function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <form
      className="adm-signin"
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        setError(null)
        try {
          await admin('/overview', { auth: value.trim() })
          token.set(value.trim())
          onSignedIn()
        } catch (err) {
          setError(err instanceof AdminError && err.status === 401 ? 'That token is not right.' : (err as Error).message)
        } finally {
          setBusy(false)
        }
      }}
    >
      <span className="adm-eyebrow">{defaultTheme.brand} · Admin</span>
      <h1 className="adm-title">Sign in</h1>
      <label className="adm-label" htmlFor="adm-token">
        Admin token
      </label>
      <input id="adm-token" className="adm-search" type="password" autoComplete="current-password" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
      {error && <Notice tone="alert">{error}</Notice>}
      <button type="submit" className="adm-btn adm-btn--primary" disabled={!value.trim() || busy}>
        {busy ? 'Checking…' : 'Sign in'}
      </button>
    </form>
  )
}

/** Management page: what's on the air, who is listening, and tools to take things down. */
export function AdminApp({ theme = defaultTheme }: { theme?: RadioTheme }) {
  const [config, setConfig] = useState<ApiConfig | null | undefined>(undefined)
  const [signedIn, setSignedIn] = useState(() => !!token.get())
  const hash = useHash()
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent)
  const section = SECTIONS.find((s) => s.id === parts[0])?.id ?? 'overview'

  useEffect(() => {
    void getConfig().then(setConfig)
  }, [])

  // A stale token sends you back to sign in.
  useEffect(() => {
    const out = () => setSignedIn(false)
    window.addEventListener(SIGNED_OUT, out)
    return () => window.removeEventListener(SIGNED_OUT, out)
  }, [])

  let body
  if (config === undefined) body = <p className="adm-empty">Connecting…</p>
  else if (!config?.admin) {
    body = (
      <div className="adm-signin">
        <span className="adm-eyebrow">{theme.brand} · Admin</span>
        <h1 className="adm-title">Admin is off</h1>
        <Notice>
          The admin page needs the database and an <code>ADMIN_TOKEN</code> secret of at least 16 characters. {config?.db ? 'The database is connected.' : 'The database is not connected yet.'}
        </Notice>
      </div>
    )
  } else if (!signedIn) body = <SignIn onSignedIn={() => setSignedIn(true)} />
  else body = <Route parts={parts} />

  const ready = config?.admin && signedIn
  return (
    <div className="adm" style={themeStyle(theme)}>
      <header className="adm-bar">
        <a className="adm-brand" href="#/overview">
          <span>{theme.brand}</span>
          <small>Admin</small>
        </a>
        {ready && (
          <nav className="adm-nav" aria-label="Sections">
            {SECTIONS.map((s) => (
              <a key={s.id} href={`#/${s.id}`} className={s.id === section ? 'is-on' : ''} aria-current={s.id === section ? 'page' : undefined}>
                {s.label}
              </a>
            ))}
          </nav>
        )}
        {ready && (
          <button
            type="button"
            className="adm-btn adm-bar__out"
            onClick={() => {
              token.set('')
              setSignedIn(false)
            }}
          >
            Sign out
          </button>
        )}
      </header>
      <main className="adm-main">{body}</main>
    </div>
  )
}
