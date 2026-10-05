/**
 * The radio on its own server (see Dockerfile): serves the built site from dist/ and the /api routes,
 * with the database in a SQLite file and voice audio in a folder, both under DATA_DIR.
 *
 *   node server/node/main.ts
 *
 * Settings come from the environment: the API keys in .env.example, plus PORT, DATA_DIR and CLIENT_IP_HEADER.
 */
import { mkdirSync, readFileSync, statSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'
import { brotliCompressSync, gzipSync } from 'node:zlib'
import { handleApi, type Env } from '../router.ts'
import { sendResponse, toRequest } from './bridge.ts'
import { FileBucket } from './files.ts'
import { SqliteDatabase } from './sqlite.ts'

const ROOT = resolve(import.meta.dirname, '../..')
const PORT = Number(process.env.PORT) || 8080
const DATA_DIR = resolve(process.env.DATA_DIR || join(ROOT, 'data'))
const SITE_DIR = resolve(process.env.SITE_DIR || join(ROOT, 'dist'))
/**
 * Where the visitor's address comes from, for rate limits: cf-connecting-ip behind Cloudflare's proxy,
 * x-forwarded-for behind Caddy or nginx. Unset: the connection's own address.
 */
const CLIENT_IP_HEADER = process.env.CLIENT_IP_HEADER?.toLowerCase()
/** Voice audio for each line is kept a day (saved recordings keep their own copy). */
const TMP_AUDIO_MAX_AGE = 24 * 60 * 60 * 1000

// ---- storage ----

mkdirSync(DATA_DIR, { recursive: true })
const db = new SqliteDatabase(join(DATA_DIR, 'radio.db'))
const applied = db.migrate(join(ROOT, 'migrations'))
if (applied.length) console.log(`[server] database migrations applied: ${applied.join(', ')}`)
const audio = new FileBucket(join(DATA_DIR, 'audio'))

const sweep = () =>
  audio
    .sweep('tmp/', TMP_AUDIO_MAX_AGE)
    .then((n) => n && console.log(`[server] removed ${n} voice files older than a day`))
    .catch((err) => console.warn('[server] audio cleanup failed', err))
void sweep()
setInterval(sweep, 60 * 60 * 1000).unref()

const KEYS = ['ELEVENLABS_', 'ANTHROPIC_', 'CLAUDE_', 'DEEPL_', 'CHANNEL_', 'ADMIN_']
const env: Env = {
  ...Object.fromEntries(Object.entries(process.env).filter(([k, v]) => v && KEYS.some((p) => k.startsWith(p)))),
  DB: db,
  AUDIO: audio,
}

/** Work that finishes after its response (usage counts, voice archiving); waited for on shutdown. */
const pending = new Set<Promise<unknown>>()
const waitUntil = (p: Promise<unknown>) => {
  const tracked = p.catch((err) => console.warn('[server] background task failed', err)).finally(() => pending.delete(tracked))
  pending.add(tracked)
}

// ---- static site ----

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.webm': 'audio/webm',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
}
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg', '.txt', '.webmanifest'])

interface SiteFile {
  body: Buffer
  type: string
  etag: string
  br?: Buffer
  gzip?: Buffer
}
/** The site never changes while the server runs, so files are read (and compressed) once. */
const files = new Map<string, SiteFile | null>()

function siteFile(path: string): SiteFile | null {
  if (files.has(path)) return files.get(path)!
  let file: SiteFile | null = null
  try {
    const info = statSync(path)
    if (info.isFile()) {
      const body = readFileSync(path)
      const ext = extname(path).toLowerCase()
      file = { body, type: TYPES[ext] ?? 'application/octet-stream', etag: `W/"${info.size.toString(36)}-${info.mtimeMs.toString(36)}"` }
      if (COMPRESSIBLE.has(ext) && body.length > 1024) {
        file.br = brotliCompressSync(body)
        file.gzip = gzipSync(body)
      }
    }
  } catch {
    /* missing */
  }
  files.set(path, file)
  return file
}

/** Like Cloudflare Pages: /admin is admin.html, other paths without a file get the app. */
function serveSite(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://localhost')
  let pathname: string
  try {
    pathname = decodeURIComponent(url.pathname)
  } catch {
    pathname = '/'
  }
  if (pathname === '/admin') pathname = '/admin.html'
  if (pathname.endsWith('/')) pathname += 'index.html'
  const path = join(SITE_DIR, normalize(pathname))
  let file = path.startsWith(SITE_DIR) ? siteFile(path) : null
  if (!file && !extname(pathname)) file = siteFile(join(SITE_DIR, 'index.html'))
  if (!file) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    return void res.end('Not found')
  }

  // Built assets have a hash in their name, so they can be kept for good.
  const immutable = pathname.startsWith('/assets/')
  const headers: Record<string, string> = {
    'content-type': file.type,
    'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate',
    etag: file.etag,
    'x-content-type-options': 'nosniff',
  }
  if (file.br) headers.vary = 'accept-encoding'
  if (req.headers['if-none-match'] === file.etag) {
    res.writeHead(304, headers)
    return void res.end()
  }
  const accepts = String(req.headers['accept-encoding'] ?? '')
  let body = file.body
  if (file.br && /\bbr\b/.test(accepts)) {
    body = file.br
    headers['content-encoding'] = 'br'
  } else if (file.gzip && /\bgzip\b/.test(accepts)) {
    body = file.gzip
    headers['content-encoding'] = 'gzip'
  }
  headers['content-length'] = String(body.length)
  res.writeHead(200, headers)
  res.end(req.method === 'HEAD' ? undefined : body)
}

// ---- server ----

/** The visitor's address, set as cf-connecting-ip, which the rate limits read. */
function clientIp(req: IncomingMessage) {
  const sent = CLIENT_IP_HEADER && req.headers[CLIENT_IP_HEADER]
  const value = Array.isArray(sent) ? sent[0] : sent
  // x-forwarded-for lists the client first.
  return value?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown'
}

const server = createServer(async (req, res) => {
  try {
    const path = req.url?.split('?')[0] ?? '/'
    if (path === '/healthz') {
      res.writeHead(200, { 'content-type': 'text/plain' })
      return void res.end('ok')
    }
    if (path === '/api' || path.startsWith('/api/')) {
      req.headers['cf-connecting-ip'] = clientIp(req)
      const request = await toRequest(req, res, `http://${req.headers.host ?? 'localhost'}`)
      return await sendResponse(res, await handleApi(request, env, waitUntil))
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD' })
      return void res.end()
    }
    serveSite(req, res)
  } catch (err) {
    console.error('[server]', req.method, req.url, err)
    if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' })
    res.end(res.headersSent ? undefined : JSON.stringify({ error: 'Server error' }))
  }
})

server.listen(PORT, () => console.log(`[server] listening on :${PORT}, data in ${DATA_DIR}`))

/** Stops taking requests, lets open ones and background work finish (up to 8s), then closes the database. */
function shutdown(signal: string) {
  console.log(`[server] ${signal}: shutting down`)
  server.close()
  server.closeIdleConnections()
  const force = setTimeout(() => server.closeAllConnections(), 8000)
  const done = new Promise<void>((r) => server.once('close', () => r()))
  void Promise.all([done, Promise.all(pending)]).finally(() => {
    clearTimeout(force)
    db.close()
    process.exit(0)
  })
}
process.once('SIGTERM', () => shutdown('SIGTERM'))
process.once('SIGINT', () => shutdown('SIGINT'))
