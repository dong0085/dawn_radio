import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import type { R2Bucket } from './server/audio.ts'
import type { D1Database } from './server/db.ts'
import { sendResponse, toRequest } from './server/node/bridge.ts'
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
      const proxy = await getPlatformProxy<{ DB?: D1Database; AUDIO?: R2Bucket }>()
      return { ...keys, DB: proxy.env.DB, AUDIO: proxy.env.AUDIO }
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
        // The middleware strips /api from req.url; the routes expect it.
        req.url = req.originalUrl ?? '/api'
        await sendResponse(res, await handleApi(await toRequest(req, res, 'http://localhost'), await env))
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
