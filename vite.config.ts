import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { handleApi, type Env } from './server/router.ts'

/** Serves /api/* during `npm run dev`, with keys from .env.local (same code as Cloudflare). */
function devApi(env: Env): Plugin {
  return {
    name: 'dev-api',
    configureServer(server) {
      server.middlewares.use('/api', async (req, res) => {
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
        const response = await handleApi(new Request(request, { signal: abort.signal }), env)
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
  plugins: [react(), devApi(loadEnv(mode, process.cwd(), ['ELEVENLABS_', 'ANTHROPIC_', 'CLAUDE_', 'DEEPL_']) as Env)],
  server: { host: true },
}))
