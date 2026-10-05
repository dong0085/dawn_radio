import type { ApiConfig } from '../../shared/api.ts'

const TOKEN_KEY = 'radio.admin.token'
/** Window event sent when the server rejects the saved token. */
export const SIGNED_OUT = 'admin:signed-out'

export class AdminError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** The admin token lasts for this browser tab only. */
export const token = {
  get: () => {
    try {
      return sessionStorage.getItem(TOKEN_KEY) ?? ''
    } catch {
      return ''
    }
  },
  set: (value: string) => {
    try {
      if (value) sessionStorage.setItem(TOKEN_KEY, value)
      else sessionStorage.removeItem(TOKEN_KEY)
    } catch {
      /* storage blocked: the token lasts until reload */
    }
  },
}

/** Calls /api/admin with the token. Sends JSON bodies; returns parsed JSON. */
export async function admin<T>(path: string, init: { method?: string; body?: unknown; auth?: string } = {}): Promise<T> {
  const res = await fetch(`/api/admin${path}`, {
    method: init.method ?? 'GET',
    headers: {
      authorization: `Bearer ${init.auth ?? token.get()}`,
      ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  })
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  // The saved token stopped working (changed on the server): back to sign in.
  if (res.status === 401 && init.auth === undefined) {
    token.set('')
    window.dispatchEvent(new Event(SIGNED_OUT))
  }
  if (!res.ok) throw new AdminError(res.status, data.error ?? res.statusText)
  return data
}

export const getConfig = (): Promise<ApiConfig | null> =>
  fetch('/api/config')
    .then((r) => (r.ok ? (r.json() as Promise<ApiConfig>) : null))
    .catch(() => null)
