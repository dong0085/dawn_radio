/**
 * Voice audio kept in Cloudflare R2, so lines can play again without asking ElevenLabs twice.
 *
 *   tmp/<player>/<key>.wav                every line as it streams; a bucket rule deletes these after a day
 *   saved/<player>/<recording>/<key>.wav  lines of a recording someone saved; kept until they delete it
 *
 * <key> is a hash of what was said and how (voice, model, speed, delivery), so the same line is stored once.
 */

export interface R2ObjectBody {
  body: ReadableStream
  size: number
  arrayBuffer(): Promise<ArrayBuffer>
}

/** The parts of Cloudflare's R2 binding this app uses. */
export interface R2Bucket {
  put(key: string, value: ArrayBuffer | Uint8Array, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>
  get(key: string): Promise<R2ObjectBody | null>
  delete(keys: string | string[]): Promise<void>
  list(options?: { prefix?: string; cursor?: string; limit?: number }): Promise<{ objects: { key: string }[]; truncated: boolean; cursor?: string }>
}

export interface AudioEnv {
  AUDIO?: R2Bucket
}

export const AUDIO_KEY = /^[0-9a-f]{32}$/

export const tmpKey = (player: string, key: string) => `tmp/${player}/${key}.wav`
export const savedPrefix = (player: string, recording: string) => `saved/${player}/${recording}/`
export const savedKey = (player: string, recording: string, key: string) => `${savedPrefix(player, recording)}${key}.wav`

const encoder = new TextEncoder()

/** Short hash naming one voiced line. */
export async function audioKey(parts: (string | number | undefined)[]) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(parts.map((p) => p ?? '').join('\u0001')))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32)
}

const fromBase64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))

/** 16-bit mono PCM wrapped in a WAV header. */
function wav(chunks: Uint8Array[], length: number, sampleRate: number) {
  const out = new Uint8Array(44 + length)
  const v = new DataView(out.buffer)
  const text = (at: number, s: string) => [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)))
  text(0, 'RIFF')
  v.setUint32(4, 36 + length, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true) // PCM
  v.setUint16(22, 1, true) // mono
  v.setUint32(24, sampleRate, true)
  v.setUint32(28, sampleRate * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  text(36, 'data')
  v.setUint32(40, length, true)
  let at = 44
  for (const c of chunks) {
    out.set(c, at)
    at += c.length
  }
  return out
}

/**
 * Reads a copy of the ElevenLabs stream (newline-delimited JSON with base64 PCM) and stores the line as a WAV.
 * A stream that breaks off (the player cut in before it finished) is not stored.
 */
export async function archiveStream(bucket: R2Bucket, key: string, stream: ReadableStream<Uint8Array>, sampleRate: number) {
  const reader = stream.pipeThrough(new TextDecoderStream()).getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  let buffer = ''
  let odd: number | null = null
  const take = (line: string) => {
    if (!line.trim()) return
    const b64 = (JSON.parse(line) as { audio_base64?: string }).audio_base64
    if (!b64) return
    let bytes = fromBase64(b64)
    // A sample can be split across chunks.
    if (odd !== null) {
      const joined = new Uint8Array(bytes.length + 1)
      joined[0] = odd
      joined.set(bytes, 1)
      bytes = joined
      odd = null
    }
    if (bytes.length % 2) {
      odd = bytes[bytes.length - 1]
      bytes = bytes.subarray(0, bytes.length - 1)
    }
    chunks.push(bytes)
    length += bytes.length
  }
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += value
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    lines.forEach(take)
  }
  take(buffer)
  if (length) await bucket.put(key, wav(chunks, length, sampleRate), { httpMetadata: { contentType: 'audio/wav' } })
}

/** Copies a recording's lines from the day's temporary audio to its own folder. Already copied lines are skipped. */
export async function keepAudio(bucket: R2Bucket, player: string, recording: string, keys: string[]) {
  const have = new Set((await listAll(bucket, savedPrefix(player, recording))).map((k) => k.slice(-36, -4)))
  let kept = keys.filter((k) => have.has(k)).length
  let missing = 0
  await Promise.all(
    keys
      .filter((k) => !have.has(k))
      .map(async (k) => {
        const obj = await bucket.get(tmpKey(player, k))
        if (!obj) {
          missing++
          return
        }
        await bucket.put(savedKey(player, recording, k), await obj.arrayBuffer(), { httpMetadata: { contentType: 'audio/wav' } })
        kept++
      }),
  )
  return { kept, missing }
}

async function listAll(bucket: R2Bucket, prefix: string) {
  const keys: string[] = []
  let cursor: string | undefined
  do {
    const page = await bucket.list({ prefix, cursor, limit: 1000 })
    keys.push(...page.objects.map((o) => o.key))
    cursor = page.truncated ? page.cursor : undefined
  } while (cursor)
  return keys
}

/** Deletes every object under a prefix. */
export async function deletePrefix(bucket: R2Bucket, prefix: string) {
  const keys = await listAll(bucket, prefix)
  for (let i = 0; i < keys.length; i += 1000) await bucket.delete(keys.slice(i, i + 1000))
}
