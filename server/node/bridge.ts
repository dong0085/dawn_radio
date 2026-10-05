/**
 * Runs the /api routes on a plain Node HTTP server: turns Node's request into a web Request
 * and writes the web Response back. Used by the Docker server and by `pnpm dev`.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'

/** The request as a web Request. Its signal aborts when the browser gives up (e.g. the player cut in). */
export async function toRequest(req: IncomingMessage, res: ServerResponse, origin: string): Promise<Request> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  const headers = new Headers()
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === 'string') headers.set(k, v)
    else if (Array.isArray(v)) headers.set(k, v.join(', '))
  }
  const abort = new AbortController()
  res.on('close', () => !res.writableEnded && abort.abort())
  return new Request(`${origin}${req.url ?? '/'}`, {
    method: req.method,
    headers,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
    signal: abort.signal,
  })
}

/** Writes a web Response, passing streams through chunk by chunk (dialogue lines, voice audio). */
export async function sendResponse(res: ServerResponse, response: Response) {
  res.statusCode = response.status
  response.headers.forEach((v, k) => res.setHeader(k, v))
  if (!response.body) return void res.end()
  const reader = response.body.getReader()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!res.write(value)) await new Promise((resolve) => res.once('drain', resolve))
      if (res.destroyed) break
    }
  } catch {
    /* client went away */
  }
  res.end()
}
