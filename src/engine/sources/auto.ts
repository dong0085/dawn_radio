import type { Line } from '../../types'
import type { Batch, BatchRequest, LineSource, NextOptions } from './types'

/**
 * Picks a source when the channel opens (and again after a reset):
 * `choose` returns the live source when it is available, else the fallback.
 */
export class AutoSource implements LineSource {
  private current: LineSource | null = null
  /** Saved state waiting for the source to be chosen. */
  private saved: { kind?: string; data?: unknown } | null = null
  private choosing: Promise<LineSource> | null = null
  private choose: () => Promise<LineSource>

  constructor(choose: () => Promise<LineSource>) {
    this.choose = choose
  }

  private get source() {
    this.choosing ??= this.choose().then((s) => {
      // Only restore into the same kind of source it was saved from.
      if (this.saved && this.saved.kind === s.kind) s.restore?.(this.saved.data)
      this.saved = null
      return (this.current = s)
    })
    return this.choosing
  }

  async next(request: BatchRequest, options?: NextOptions): Promise<Batch> {
    return (await this.source).next(request, options)
  }

  discard(lines: Line[]) {
    this.current?.discard?.(lines)
  }

  reset() {
    this.current?.reset?.()
    this.current = null
    this.choosing = null
    this.saved = null
  }

  snapshot(upcoming: Line[]) {
    if (!this.current) return this.saved ?? undefined
    return { kind: this.current.kind, data: this.current.snapshot?.(upcoming) }
  }

  restore(data: unknown) {
    this.saved = (data as { kind?: string; data?: unknown }) ?? null
  }
}
