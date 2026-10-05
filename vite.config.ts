import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import type { D1Database } from './server/db.ts'
import { handleApi, type Env } from './server/router.ts'

/**
 * Serves /api/* during `pnpm dev`, with keys from .env / .env.local (same code as Cloudflare).
 * The database is a local copy kept by wrangler in .wrangler/state (`pnpm db:migrate:local` sets it up).
 */
function devApi(keys: Env): Plugin {
  let env: Promise<Env> | null = null
  const connect = async (): Promise<Env> => {
    try {
      const { getPlatformProxy } = await import('wrangler')
      const proxy = await getPlatformProxy<{ DB?: D1Database }>()
      return { ...keys, DB: proxy.env.DB }
    } catch (err) {
      console.warn('[dev-api] no local database:', err)
      return keys
    }
  }
  return {
    name: 'dev-api',
    configureServer(server) {
      // Same as Cloudflare Pages: /admin serves admin.html.
      server.middlewares.use((req, _res, next) => {
        if (req.url === '/admin' || req.url?.startsWith('/admin?') || req.url?.startsWith('/admin#')) req.url = req.url.replace('/admin', '/admin.html')
        next()
      })
      server.middlewares.use('/api', async (req, res) => {
        env ??= connect()
        const chunks: Buffer[] = []
        for await (const chunk of req) chunks.push(chunk as Buffer)
        const headers = new Headers()
        for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
        const request = new Request(`http://localhost${req.originalUrl ?? '/api'}`, {
          method: req.method,
          headers,
          body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
        })
        // Lets the route see when the browser gives up (e.g. the player cut in).
        const abort = new AbortController()
        res.on('close', () => !res.writableEnded && abort.abort())
        const response = await handleApi(new Request(request, { signal: abort.signal }), await env)
        res.statusCode = response.status
        response.headers.forEach((v, k) => res.setHeader(k, v))
        if (!response.body) return res.end()
        // Pass streams through chunk by chunk (dialogue lines, voice audio).
        const reader = response.body.getReader()
        try {
          for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            res.write(value)
          }
        } catch {
          /* client went away */
        }
        res.end()
      })
    },
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), devApi(loadEnv(mode, process.cwd(), ['ELEVENLABS_', 'ANTHROPIC_', 'CLAUDE_', 'DEEPL_', 'CHANNEL_', 'ADMIN_']) as Env)],
  server: { host: true },
  build: {
    rollupOptions: {
      input: { main: resolve(import.meta.dirname, 'index.html'), admin: resolve(import.meta.dirname, 'admin.html') },
    },
  },
}))
