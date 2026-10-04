import type { HistoryLine, LogSnapshot, StoryMemory } from '../../../shared/api.ts'
import { streamDialogue } from '../../api'
import { PLAYER_ID, type Line, type LogState, type TranscriptEntry } from '../../types'
import type { Batch, BatchRequest, LineSource, NextOptions } from './types'

export interface AiSourceOptions {
  /** Story id known to the server (shared/stories.ts). */
  storyId: string
  /** How many recent lines to send word for word; older ones live in the summary. */
  recentLines?: number
}

// Unique across reloads, so saved transcript ids never collide with new ones.
let counter = Date.now()
const emptyMemory = (): StoryMemory => ({ summary: '', facts: [] })
/** Signal words from the writers, as strengths for the radio. */
const SIGNAL = { strong: 1, fair: 0.65, weak: 0.3 } as const

function toHistory(entries: TranscriptEntry[]): HistoryLine[] {
  return entries.map((e) => ({
    speaker: e.speaker === PLAYER_ID ? 'player' : e.speaker,
    text: e.segments.map((s) => s.text).join(' '),
    interrupted: e.interrupted,
  }))
}

function toSnapshot(log: LogState | undefined): LogSnapshot | undefined {
  if (!log) return undefined
  return {
    objective: log.objective ? `${log.objective.text}${log.objective.done ? ' (done)' : ''}` : undefined,
    entries: log.entries.map((e) => ({ id: e.id, section: e.section, label: e.label.text, state: e.state?.text })),
  }
}

/**
 * Lines written live by Claude through /api/dialogue.
 * Keeps the story memory (summary + facts) between batches.
 */
export class AiSource implements LineSource {
  readonly kind = 'live'
  private memory = emptyMemory()
  private batchIndex = 0
  /** Memory before the last batch, to roll back if that batch never airs. */
  private previous: { memory: StoryMemory; batchIndex: number; ids: Set<string> } | null = null
  private opts: Required<AiSourceOptions>

  constructor(options: AiSourceOptions) {
    this.opts = { recentLines: 24, ...options }
  }

  async next(request: BatchRequest, { onLine, signal }: NextOptions = {}): Promise<Batch> {
    const lines: Line[] = []
    const res = await streamDialogue(
      {
        storyId: this.opts.storyId,
        batchIndex: this.batchIndex,
        memory: this.memory,
        // Queued lines will air first, so the writers continue after them.
        history: [
          ...toHistory(request.history),
          ...(request.upcoming ?? []).map((l) => ({ speaker: l.speaker, text: l.segments.map((x) => x.text).join(' ') })),
        ].slice(-this.opts.recentLines),
        playerMessage: request.playerMessage,
        log: toSnapshot(request.log),
      },
      {
        signal,
        onLine: (l) => {
          const line: Line = { ...l, id: `ai${++counter}`, signal: l.signal ? SIGNAL[l.signal] : undefined }
          lines.push(line)
          onLine?.(line)
        },
      },
    )

    this.previous = { memory: this.memory, batchIndex: this.batchIndex, ids: new Set(lines.map((l) => l.id)) }
    this.memory = res.memory
    this.batchIndex++
    return { lines, ending: res.ending, player: res.player }
  }

  discard(lines: Line[]) {
    // If the whole last batch never aired, forget it so the summary only covers what was heard.
    const prev = this.previous
    if (prev && prev.ids.size && [...prev.ids].every((id) => lines.some((l) => l.id === id))) {
      this.memory = prev.memory
      this.batchIndex = prev.batchIndex
      this.previous = null
    }
  }

  reset() {
    this.memory = emptyMemory()
    this.batchIndex = 0
    this.previous = null
  }

  snapshot() {
    return { memory: this.memory, batchIndex: this.batchIndex }
  }

  restore(data: unknown) {
    const d = data as { memory?: StoryMemory; batchIndex?: number } | undefined
    this.memory = d?.memory ?? emptyMemory()
    this.batchIndex = d?.batchIndex ?? 0
    this.previous = null
  }
}
