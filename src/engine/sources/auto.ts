import type { Line } from '../../types'
import type { Batch, BatchRequest, LineSource, NextOptions } from './types'

/**
 * Picks a source when the channel opens (and again after a reset):
 * `choose` returns the live source when it is available, else the fallback.
 */
export class AutoSource implements LineSource {
  private current: LineSource | null = null
  private choosing: Promise<LineSource> | null = null
  private choose: () => Promise<LineSource>

  constructor(choose: () => Promise<LineSource>) {
    this.choose = choose
  }

  private get source() {
    this.choosing ??= this.choose().then((s) => (this.current = s))
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
  }
}
