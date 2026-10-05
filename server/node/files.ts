/**
 * Voice audio in a folder on disk, behind the same small API the app uses with Cloudflare R2 (see ../audio.ts).
 * A key like tmp/<player>/<key>.wav is the file's path inside the folder.
 */
import { createReadStream } from 'node:fs'
import { mkdir, readdir, readFile, rename, rm, rmdir, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative, sep } from 'node:path'
import { Readable } from 'node:stream'
import type { R2Bucket, R2ObjectBody } from '../audio.ts'

/** Written under this suffix, then renamed, so a half-written file is never read. */
const PART = '.part-'

export class FileBucket implements R2Bucket {
  readonly root: string

  constructor(root: string) {
    this.root = root
  }

  /** The file for a key; refuses keys that would leave the folder. */
  private path(key: string) {
    if (!key || key.startsWith('/') || key.includes('\\') || key.split('/').some((p) => p === '..' || p === '.' || p === '')) {
      throw new Error(`Invalid audio key: ${key}`)
    }
    return join(this.root, key)
  }

  async put(key: string, value: ArrayBuffer | Uint8Array) {
    const path = this.path(key)
    await mkdir(dirname(path), { recursive: true })
    const part = `${path}${PART}${process.pid}-${Math.random().toString(36).slice(2)}`
    await writeFile(part, value instanceof Uint8Array ? value : new Uint8Array(value))
    await rename(part, path)
  }

  async get(key: string): Promise<R2ObjectBody | null> {
    const path = this.path(key)
    const info = await stat(path).catch(() => null)
    if (!info?.isFile()) return null
    return {
      size: info.size,
      // Opened only when read, so asking for arrayBuffer() leaves no file open.
      get body() {
        return Readable.toWeb(createReadStream(path)) as ReadableStream
      },
      arrayBuffer: async () => {
        const b = await readFile(path)
        return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
      },
    }
  }

  async delete(keys: string | string[]) {
    const paths = (Array.isArray(keys) ? keys : [keys]).map((k) => this.path(k))
    await Promise.all(paths.map((p) => rm(p, { force: true })))
    // Tidy up folders left empty (fails harmlessly when they still hold files).
    await Promise.all([...new Set(paths.map((p) => dirname(p)))].map((d) => rmdir(d).catch(() => undefined)))
  }

  async list({ prefix = '', cursor, limit = 1000 }: { prefix?: string; cursor?: string; limit?: number } = {}) {
    // Only the folder the prefix points into needs reading.
    const start = join(this.root, prefix.slice(0, prefix.lastIndexOf('/') + 1))
    const keys = (await walk(start))
      .map((p) => relative(this.root, p).split(sep).join('/'))
      .filter((k) => k.startsWith(prefix) && !k.includes(PART) && (!cursor || k > cursor))
      .sort()
    const page = keys.slice(0, limit)
    const truncated = keys.length > limit
    return { objects: page.map((key) => ({ key })), truncated, cursor: truncated ? page[page.length - 1] : undefined }
  }

  /**
   * Deletes files under a prefix older than maxAge (ms), and the folders that leaves empty.
   * Stands in for the R2 bucket rule that clears tmp/ after a day.
   */
  async sweep(prefix: string, maxAge: number, now = Date.now()) {
    let removed = 0
    const clear = async (dir: string): Promise<boolean> => {
      const entries = await readdir(dir, { withFileTypes: true }).catch(() => null)
      if (!entries) return false
      let left = entries.length
      for (const e of entries) {
        const path = join(dir, e.name)
        if (e.isDirectory()) {
          if (await clear(path)) left--
        } else if (now - (await stat(path)).mtimeMs > maxAge) {
          await rm(path, { force: true })
          removed++
          left--
        }
      }
      if (left || dir === this.root) return false
      return rmdir(dir).then(
        () => true,
        () => false,
      )
    }
    await clear(this.path(prefix.replace(/\/$/, '')))
    return removed
  }
}

/** Every file under a folder (none if it is missing). */
async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  const nested = await Promise.all(entries.map((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)])))
  return nested.flat()
}
