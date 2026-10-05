import { NARRATOR_ID, type Line, type Scenario, type ScenarioEnding, type ScriptedPrelude } from '../../types'
import type { Batch, BatchRequest, LineSource, NextOptions } from './types'

type ScriptLine = Omit<Line, 'id'>

export interface ScriptedScenario {
  scenario: Scenario
  script: ScriptLine[]
  /** Short reply sets played after the player speaks. */
  reactions: ScriptLine[][]
  ending: ScenarioEnding
  batchSize?: number
  /** The narrator's opening, played before the first batch. */
  prelude?: ScriptedPrelude
}

export interface ScriptedSourceOptions {
  /** Fake generation delay range in ms, to exercise the loading state. */
  latency?: [number, number]
}

// Unique across reloads, so saved transcript ids never collide with new ones.
let lineCounter = Date.now()
const makeLine = (l: ScriptLine): Line => ({ ...l, id: `l${++lineCounter}` })

/** Plays a fixed script in batches, with canned reactions to the player. */
export class ScriptedSource implements LineSource {
  readonly kind = 'drill'
  private cursor = 0
  private reactionIndex = 0
  private pushedBack: Line[] = []
  private data: ScriptedScenario
  private latency: [number, number]

  constructor(data: ScriptedScenario, options: ScriptedSourceOptions = {}) {
    this.data = data
    this.latency = options.latency ?? [700, 1600]
  }

  async next(request: BatchRequest, { onScene }: NextOptions = {}): Promise<Batch> {
    const prelude = request.prelude ? this.data.prelude : undefined
    // The sound starts loading while the first lines are "written".
    if (prelude?.scene) onScene?.(prelude.scene)
    const [min, max] = this.latency
    await new Promise((r) => setTimeout(r, min + Math.random() * (max - min)))

    const size = this.data.batchSize ?? 4
    const lines: Line[] = []

    if (request.playerMessage && this.data.reactions.length) {
      const set = this.data.reactions[this.reactionIndex % this.data.reactions.length]
      this.reactionIndex++
      lines.push(...set.map(makeLine))
    }

    while (lines.length < size && this.pushedBack.length) lines.push(this.pushedBack.shift()!)
    while (lines.length < size && this.cursor < this.data.script.length) {
      lines.push(makeLine(this.data.script[this.cursor++]))
    }

    const done = this.cursor >= this.data.script.length && this.pushedBack.length === 0
    if (prelude) lines.unshift(...prelude.lines.map((l) => makeLine({ ...l, speaker: NARRATOR_ID })))
    return { lines, ending: done ? this.data.ending : undefined }
  }

  discard(lines: Line[]) {
    // Script lines are fixed, so unplayed ones come back next time.
    // Unplayed reactions are dropped; they only make sense right after the player speaks.
    // The narration only opens the channel, so it never comes back either.
    const keep = lines.filter((l) => l.speaker !== NARRATOR_ID && !this.isReaction(l))
    this.pushedBack = [...keep, ...this.pushedBack]
  }

  reset() {
    this.cursor = 0
    this.reactionIndex = 0
    this.pushedBack = []
  }

  snapshot(upcoming: Line[]) {
    // Lines handed out but never heard come back when the session resumes.
    const unheard = this.pushedBack.length + upcoming.filter((l) => l.speaker !== NARRATOR_ID && !this.isReaction(l)).length
    return { cursor: Math.max(0, this.cursor - unheard), reactionIndex: this.reactionIndex }
  }

  restore(data: unknown) {
    const d = data as { cursor?: number; reactionIndex?: number } | undefined
    this.cursor = Math.min(this.data.script.length, Math.max(0, d?.cursor ?? 0))
    this.reactionIndex = d?.reactionIndex ?? 0
    this.pushedBack = []
  }

  private isReaction(line: Line) {
    const first = line.segments[0]?.text
    return this.data.reactions.some((set) => set.some((r) => r.segments[0]?.text === first))
  }
}
