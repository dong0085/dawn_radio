import { NARRATOR_ID, PLAYER_ID, type Line, type LogState, type Party, type Scenario, type ScenarioEnding, type TimedWord, type TranscriptEntry } from '../types'
import type { InputMode, Settings } from '../settings'
import { setAudioSession, type CarrierOptions, type RadioAudio } from './radioAudio'
import { applyLogUpdate, initialLog } from './log'
import { ApiError } from '../api'
import { recognitionSupported } from './recognizer'
import { createBrowserTranscriber, createCloudTranscriber, type Transcriber } from './transcriber'
import type { AmbienceSpec } from './ambience'
import type { LineSource } from './sources/types'
import type { Playback, PreparedSpeech, SpeechEngine, SpeechProvider } from './speech/types'
import { sessionId, type SavedSession } from './session'
import { wordIndexAt } from './words'

export type Phase = 'standby' | 'running' | 'ended'
/**
 * idle: between lines · speaking: a party is talking · waiting: next lines are loading
 * transmitting: the player holds push-to-talk · transcribing: turning the player's speech into text
 */
export type Activity = 'idle' | 'speaking' | 'waiting' | 'transmitting' | 'transcribing'

export interface ActiveLine {
  line: Line
  words: TimedWord[]
  /** Word being spoken; -1 before the first, words.length when done. */
  wordIndex: number
  replay: boolean
}

export interface ConversationState {
  phase: Phase
  activity: Activity
  paused: boolean
  /** The line on screen (stays after it finishes until the next one starts). */
  current: ActiveLine | null
  /** Who is on air right now: a party id, PLAYER_ID, or null. */
  onAir: string | null
  transcript: TranscriptEntry[]
  /** Player's text while transmitting (live transcription or typed). */
  txText: string
  txMode: InputMode | null
  ending: ScenarioEnding | null
  engine: SpeechEngine
  /** Short status message, e.g. "No transmission received". */
  notice: string | null
  /** A saved session was reopened and is waiting on standby to resume. */
  resumed: boolean
  /** People, places and events so far. */
  log: LogState
  /** Past lines are playing again; the live channel carries on after them. */
  replaying: boolean
}

export interface ConversationOptions {
  scenario: Scenario
  source: LineSource
  audio: RadioAudio
  /** archive: plays lines again from the server's recorded audio (see speech/archive.ts). */
  voices: { browser: SpeechProvider; elevenlabs?: SpeechProvider; archive?: SpeechProvider & { handles(line: Line): boolean } }
  /**
   * Plays a saved recording like a tape: every line in order (the player's too), with the silences
   * and cut-ins as they aired, then stops. Nothing new is written and the player can't transmit.
   */
  tape?: boolean
  settings: Settings
  /** True when server speech-to-text is set up (otherwise the browser recognizer is used). */
  cloudSpeechToText?: () => boolean
  /** Translates the player's message both ways: { target, native }. Falls back to the writers' version. */
  translatePlayer?: (text: string) => Promise<{ target: string; native: string }> | null
  /** Start loading the next batch when this many lines (or fewer) are queued. */
  refillAt?: number
  /** How many upcoming lines get their audio prepared while the current one plays. */
  lookahead?: number
  /** Silence on the channel before each line, in ms (random within each range). */
  gaps?: Partial<GapRanges>
  /** Status messages flashed on the screen. */
  notices?: Partial<ConversationNotices>
}

/** Short status messages the radio flashes on its screen. */
export interface ConversationNotices {
  garbled: string
  nothingReceived: string
  channelError: string
  offAir: string
  signalLost: string
  backupVoice: string
}

export const DEFAULT_NOTICES: ConversationNotices = {
  garbled: 'Transmission garbled',
  nothingReceived: 'No transmission received',
  channelError: 'Channel error',
  offAir: 'Channel off the air',
  signalLost: 'Signal lost. Retrying…',
  backupVoice: 'Voice service unavailable. Using backup voice.',
}

/** Ranges in ms, [min, max]. */
export interface GapRanges {
  /** The other party answers. */
  reply: [number, number]
  /** The same party transmits again. */
  followUp: [number, number]
  /** The line is marked "quick": an instant answer. */
  quick: [number, number]
  /** The line is marked "long": the speaker hesitates, is busy, or takes a moment. */
  long: [number, number]
  /** Before the narrator's first words, once the soundscape is playing. */
  opening: [number, number]
  /** Between the narrator's lines. */
  narration: [number, number]
  /** From the end of the narration to the first voice on the channel. */
  curtain: [number, number]
}

export const DEFAULT_GAPS: GapRanges = {
  reply: [700, 1400],
  followUp: [900, 1800],
  quick: [200, 450],
  long: [2200, 3800],
  opening: [1800, 2400],
  narration: [500, 900],
  curtain: [2600, 3200],
}

interface QueueItem {
  line: Line
  /** Audio being prepared; created only when the line is close to airing. */
  prepared?: Promise<PreparedSpeech>
  ready?: PreparedSpeech
  /** Silence before this line, in ms; picked once, when it is next in line. */
  gap?: number
}

const initialState = (engine: SpeechEngine, log: LogState): ConversationState => ({
  phase: 'standby',
  activity: 'idle',
  paused: false,
  current: null,
  onAir: null,
  transcript: [],
  txText: '',
  txMode: null,
  ending: null,
  engine,
  notice: null,
  log,
  resumed: false,
  replaying: false,
})

/**
 * Runs the radio conversation: fetches batches of lines, prepares their audio ahead of time,
 * plays them in order, and handles pause, replay and player transmissions.
 */
export class Conversation {
  private state: ConversationState
  private listeners = new Set<() => void>()
  private opts: Required<Pick<ConversationOptions, 'refillAt' | 'lookahead'>> & ConversationOptions
  private gaps: GapRanges
  private notices: ConversationNotices

  private queue: QueueItem[] = []
  private epoch = 0
  private batchPending = false
  private pendingEnding: ScenarioEnding | null = null
  /** Cancels the batch being written when the player cuts in. */
  private batchAbort: AbortController | null = null
  private playback: Playback | null = null
  private playingItem: QueueItem | null = null
  private lastItem: QueueItem | null = null
  /** Every line that has aired, by id, so it can play again. */
  private played = new Map<string, QueueItem>()
  /** Past lines still to play again before the channel goes back to live. */
  private replayQueue: QueueItem[] = []
  /** When the channel last went quiet (a line or the player's transmission ended), from performance.now(). */
  private quietSince = 0
  /** The soundscape under the opening narration is playing. */
  private bed = false
  /** Settles once the soundscape plays (or takes too long); the narrator waits for it. */
  private sceneReady: Promise<unknown> | null = null
  private sceneSettled = true
  /** The listener skipped the narration, so lines of it that are still arriving are dropped. */
  private preludeSkipped = false
  /** When the player's current transmission started (performance.now()), and the silence before it (s). */
  private txStartedAt = 0
  private txGap = 0
  private gapTimer: ReturnType<typeof setTimeout> | undefined
  private noticeTimer: ReturnType<typeof setTimeout> | undefined
  private raf = 0
  private startedAt = 0
  private recognizer: Transcriber | null = null
  private micStream: MediaStream | null = null
  private elevenLabsReady = false
  /** Player lines already filled in by DeepL and by the writers. */
  private rendered = { deepl: '', writers: '' }
  /** Seconds already spent on the channel before a reload. */
  private resumeElapsed = 0
  /** Latest player settings; read whenever needed. */
  settings: Settings

  constructor(options: ConversationOptions) {
    this.opts = { refillAt: 3, lookahead: 1, ...options }
    this.gaps = { ...DEFAULT_GAPS, ...options.gaps }
    this.notices = { ...DEFAULT_NOTICES, ...options.notices }
    this.settings = options.settings
    this.state = initialState('browser', initialLog(options.scenario.log?.initial))
  }

  // ---- store interface (for useSyncExternalStore) ----

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getState = () => this.state

  private set(patch: Partial<ConversationState>) {
    this.state = { ...this.state, ...patch }
    this.listeners.forEach((l) => l())
  }

  // ---- public controls ----

  updateSettings(settings: Settings) {
    this.settings = settings
  }

  setElevenLabsAvailable(ok: boolean) {
    this.elevenLabsReady = ok
    this.set({ engine: this.pickEngine() })
  }

  start() {
    if (this.state.phase === 'running') return
    // A tape plays from the top.
    if (this.opts.tape && !this.replayQueue.length && this.state.transcript[0]) return this.replayFrom(this.state.transcript[0].id)
    this.opts.audio.ensure()
    this.opts.voices.browser.unlock?.()
    this.startedAt = performance.now() - this.resumeElapsed * 1000
    this.resumeElapsed = 0
    this.set({ phase: 'running', paused: false, resumed: false, engine: this.pickEngine() })
    this.advance()
  }

  togglePause() {
    if (this.state.phase === 'standby') return this.start()
    if (this.state.paused) this.resume()
    else this.pause()
  }

  pause() {
    if (this.state.paused || (this.state.phase !== 'running' && !this.state.replaying)) return
    clearTimeout(this.gapTimer)
    if (this.playback) {
      this.playback.pause()
      this.channelOff()
    }
    if (this.bed) this.opts.audio.bedLevel('off')
    this.set({ paused: true, onAir: this.state.activity === 'transmitting' ? PLAYER_ID : null })
  }

  resume() {
    if (!this.state.paused) return
    this.opts.audio.ensure()
    this.set({ paused: false })
    if (this.bed) this.opts.audio.bedLevel(this.playingItem?.line.speaker === NARRATOR_ID ? 'under' : 'full')
    if (this.playback && this.playingItem) {
      this.channelOn(this.playingItem.line)
      this.playback.resume()
      this.set({ onAir: this.playingItem.line.speaker })
    } else {
      this.advance()
    }
  }

  /** Play the current line again from the start, or the last line if none is playing. */
  replay() {
    const target = this.playingItem ?? this.lastItem
    if (!target?.ready || this.isTransmitting()) return
    this.opts.audio.ensure()
    clearTimeout(this.gapTimer)
    this.stopPlayback()
    this.play(target, true)
  }

  /** Plays the channel again from a past line, then carries on live where it left off. */
  replayFrom(lineId: string) {
    if (this.isTransmitting()) return
    const at = this.state.transcript.findIndex((e) => e.id === lineId)
    if (at < 0) return
    // The player's own lines have no audio; a tape keeps them as silent transmissions.
    const items = this.state.transcript
      .slice(at)
      .filter((e) => this.opts.tape || e.speaker !== PLAYER_ID)
      .map((e) => this.pastItem(e))
    if (!items.length) return
    this.opts.audio.ensure()
    clearTimeout(this.gapTimer)
    if (this.playback) this.channelOff()
    // A live line cut short here plays in full at the end of the replay, since it is already in the transcript.
    this.stopPlayback()
    this.replayQueue = items
    this.quietSince = 0
    this.set({ replaying: true, paused: false })
    // From the top, a tape fills the log in again as it plays.
    if (this.opts.tape && at === 0) this.set({ log: initialLog(this.opts.scenario.log?.initial) })
    if (this.state.phase === 'standby') this.start()
    else this.advance()
  }

  /** Stops playing past lines and goes back to the live channel. */
  goLive() {
    if (!this.state.replaying) return
    this.replayQueue = []
    if (this.state.current?.replay) {
      if (this.playback) this.channelOff()
      this.stopPlayback()
      this.quietSince = performance.now()
    }
    this.endReplay()
    this.set({ activity: 'idle', onAir: null })
    this.advance()
  }

  /** Skips the rest of the opening narration and goes straight to the channel. */
  skipPrelude() {
    if (this.state.phase !== 'running' || this.state.replaying) return
    this.preludeSkipped = true
    this.queue = this.queue.filter((q) => q.line.speaker !== NARRATOR_ID)
    if (this.playingItem?.line.speaker === NARRATOR_ID) {
      this.stopPlayback()
      this.quietSince = performance.now()
      this.set({ onAir: null, current: null, activity: 'idle' })
    }
    this.closeBed(1.2)
    this.set({ paused: false })
    this.advance()
  }

  startTransmit(mode: InputMode) {
    if (this.opts.tape || this.state.phase === 'ended' || this.isTransmitting()) return
    if (this.state.phase === 'standby') this.start()
    const cloud = mode === 'voice' && !!this.opts.cloudSpeechToText?.() && typeof MediaRecorder !== 'undefined'
    if (mode === 'voice' && !cloud && !recognitionSupported()) mode = 'keyboard'

    // Cutting in leaves no silence; otherwise it's the wait since the channel went quiet.
    this.txStartedAt = performance.now()
    this.txGap = this.playback ? 0 : Math.min(5, Math.max(0, (this.txStartedAt - this.quietSince) / 1000))
    this.interrupt()
    this.opts.audio.beep('tx-start')
    this.set({ activity: 'transmitting', onAir: PLAYER_ID, txText: '', txMode: mode, notice: null })

    if (mode === 'voice') {
      const mic = this.ensureMic()
      const s = this.settings
      const lang = s.micLanguage === 'native' ? this.opts.scenario.nativeLang : this.opts.scenario.targetLang
      this.recognizer = cloud ? createCloudTranscriber(() => mic) : createBrowserTranscriber(lang)
      this.recognizer?.start((text) => this.set({ txText: text }))
    }
  }

  /** Typed input while transmitting in keyboard mode. */
  setTxText(text: string) {
    if (this.state.activity === 'transmitting') this.set({ txText: text })
  }

  async endTransmit() {
    if (this.state.activity !== 'transmitting') return
    const epoch = this.epoch
    let text = this.state.txText
    if (this.recognizer) {
      this.set({ activity: 'transcribing', onAir: null })
      try {
        text = await this.recognizer.stop()
      } catch (err) {
        console.warn('[conversation] transcription failed', err)
        this.flash(this.notices.garbled)
        text = ''
      }
      this.recognizer = null
      if (epoch !== this.epoch) return
    }
    this.releaseMic()
    this.opts.audio.beep('tx-end')
    this.quietSince = performance.now()
    text = text.trim()
    this.set({ onAir: null, txMode: null })

    if (!text) {
      this.set({ activity: 'idle', txText: '' })
      this.flash(this.notices.nothingReceived)
      this.advance()
      return
    }

    this.addTranscript({
      id: `p${Date.now()}`,
      speaker: PLAYER_ID,
      segments: [{ text, translation: '' }],
      duration: Math.round((this.quietSince - this.txStartedAt) / 100) / 10,
      gap: Math.round(this.txGap * 10) / 10,
    })
    const playerId = this.state.transcript[this.state.transcript.length - 1].id
    this.opts
      .translatePlayer?.(text)
      ?.then((t) => this.applyPlayerRendering(t, playerId, 'deepl'))
      .catch((err) => console.warn('[conversation] translation failed', err))
    // The player spoke, so the channel answers right away.
    this.set({ paused: false, txText: '', activity: 'waiting' })
    this.requestBatch(text, playerId)
  }

  cancelTransmit() {
    if (!this.isTransmitting()) return
    this.recognizer?.abort()
    this.recognizer = null
    this.releaseMic()
    this.set({ activity: 'idle', onAir: null, txText: '', txMode: null })
    this.advance()
  }

  /** Everything worth keeping across a reload, or null if nothing has happened yet. */
  snapshot(): SavedSession | null {
    const s = this.state
    if (!s.transcript.length) return null
    return {
      v: 1,
      scenarioId: sessionId(this.opts.scenario),
      savedAt: Date.now(),
      phase: s.phase === 'ended' ? 'ended' : 'running',
      elapsed: s.phase === 'running' ? this.elapsed() : this.resumeElapsed,
      transcript: s.transcript,
      log: s.log,
      ending: s.ending,
      source: this.opts.source.snapshot?.(this.queue.map((q) => q.line)),
      nativeLang: this.opts.scenario.nativeLang,
    }
  }

  /** Reopens a saved session: on standby (ready to resume) or on the closing screen. */
  restore(saved: SavedSession) {
    this.opts.source.restore?.(saved.source)
    this.resumeElapsed = saved.elapsed
    this.state = {
      ...this.state,
      phase: saved.phase === 'ended' ? 'ended' : 'standby',
      transcript: saved.transcript,
      log: saved.log,
      ending: saved.ending,
      resumed: saved.phase !== 'ended',
    }
    this.listeners.forEach((l) => l())
  }

  restart() {
    this.epoch++
    this.resumeElapsed = 0
    this.stopPlayback()
    this.recognizer?.abort()
    this.recognizer = null
    this.releaseMic()
    clearTimeout(this.gapTimer)
    this.queue = []
    this.batchPending = false
    this.pendingEnding = null
    this.lastItem = null
    this.played.clear()
    this.replayQueue = []
    this.opts.audio.carrierOff()
    this.closeBed(0.6)
    this.sceneReady = null
    this.sceneSettled = true
    this.preludeSkipped = false
    this.opts.source.reset?.()
    this.state = initialState(this.pickEngine(), initialLog(this.opts.scenario.log?.initial))
    this.start()
  }

  /** Loudness for the waveform display, 0–1. */
  getLevel() {
    const { activity, txMode, current } = this.state
    if (activity === 'transmitting' && txMode === 'voice') return this.opts.audio.getMicLevel()
    if (!this.playback || !current || this.state.paused && !current.replay) return 0
    if (this.playingItem?.ready?.filtered) return this.opts.audio.getLevel()
    // Browser voice bypasses Web Audio, so fake a level from word timing.
    const pos = this.playback.position()
    const w = current.words[wordIndexAt(current.words, pos)]
    return w && pos <= w.end ? 0.25 + Math.random() * 0.55 : Math.random() * 0.06
  }

  dispose() {
    this.epoch++
    this.stopPlayback()
    this.closeBed(0.3)
    this.recognizer?.abort()
    this.releaseMic()
    clearTimeout(this.gapTimer)
    clearTimeout(this.noticeTimer)
  }

  // ---- internals ----

  private isTransmitting() {
    return this.state.activity === 'transmitting' || this.state.activity === 'transcribing'
  }

  private pickEngine(): SpeechEngine {
    const pref = this.settings.voiceEngine
    if (pref === 'browser' || !this.opts.voices.elevenlabs) return 'browser'
    if (pref === 'elevenlabs') return 'elevenlabs'
    return this.elevenLabsReady ? 'elevenlabs' : 'browser'
  }

  private advance() {
    const s = this.state
    if (s.paused || this.playback || this.isTransmitting()) return
    if (this.replayQueue.length) return this.advanceReplay()
    if (s.replaying) this.endReplay()
    // The tape ran out: it stops instead of going live.
    if (this.opts.tape) {
      if (s.phase !== 'standby') this.set({ phase: 'ended', activity: 'idle', onAir: null, current: null })
      return
    }
    if (s.phase !== 'running') return
    clearTimeout(this.gapTimer)

    const item = this.queue[0]
    if (!item) {
      if (this.pendingEnding && !this.batchPending) return this.finish(this.pendingEnding)
      this.set({ activity: 'waiting' })
      this.requestBatch()
      return
    }
    if (!item.ready) {
      this.set({ activity: 'waiting' })
      const epoch = this.epoch
      this.prepare(item).then(() => epoch === this.epoch && this.advance())
      return
    }
    const narration = item.line.speaker === NARRATOR_ID
    // The narrator lets the soundscape set in before the first words.
    if (narration && !this.sceneSettled && this.sceneReady) {
      this.set({ activity: 'waiting' })
      const epoch = this.epoch
      this.sceneReady.then(() => epoch === this.epoch && this.advance())
      return
    }
    // The narration is over: the soundscape fades while the channel opens.
    if (!narration) this.closeBed()
    // Let the channel stay quiet for a moment, like people taking turns.
    item.gap ??= this.pickGap(item.line)
    const wait = this.quietSince + item.gap - performance.now()
    if (wait > 0) {
      if (s.activity !== 'idle') this.set({ activity: 'idle' })
      this.gapTimer = setTimeout(() => this.advance(), wait)
      return
    }

    this.queue.shift()
    this.play(item, false)
    this.prepareAhead()
    if (this.queue.length <= this.opts.refillAt) this.requestBatch()
  }

  /** Plays the next past line, with a short pause between lines. */
  private advanceReplay() {
    clearTimeout(this.gapTimer)
    const item = this.replayQueue[0]
    if (!item.ready) {
      this.set({ activity: 'waiting' })
      const epoch = this.epoch
      this.prepare(item).then(() => epoch === this.epoch && this.advance())
      return
    }
    // The silence the line first aired after, when it was recorded.
    const wait = this.quietSince + (item.line.gapMs ?? this.gaps.reply[0]) - performance.now()
    if (wait > 0) {
      if (this.state.activity !== 'idle') this.set({ activity: 'idle' })
      this.gapTimer = setTimeout(() => this.advance(), wait)
      return
    }
    if (item.line.speaker !== NARRATOR_ID) this.closeBed()
    this.replayQueue.shift()
    this.play(item, true)
    if (this.replayQueue[0]) void this.prepare(this.replayQueue[0])
  }

  private endReplay() {
    this.closeBed()
    // After the closing, the screen goes back to the ending.
    this.set({ replaying: false, ...(this.state.phase === 'ended' && { current: null }) })
  }

  /** The queue item for a line that already aired; rebuilt from the transcript after a reload. */
  private pastItem(entry: TranscriptEntry): QueueItem {
    let item = this.played.get(entry.id)
    if (!item) {
      item = this.makeItem({
        id: entry.id,
        speaker: entry.speaker,
        segments: entry.segments,
        audio: entry.audio,
        cutAt: entry.cutAt,
        gapMs: entry.gap !== undefined ? entry.gap * 1000 : undefined,
        duration: entry.duration,
        log: entry.log,
      })
      this.played.set(entry.id, item)
    }
    return item
  }

  private requestBatch(playerMessage?: string, playerId?: string) {
    if (this.batchPending || (this.pendingEnding && !playerMessage)) return
    this.batchPending = true
    const epoch = this.epoch
    const abort = new AbortController()
    this.batchAbort = abort
    // Lines that arrive early (streaming) are queued right away.
    const queued = new Set<string>()
    const enqueue = (line: Line) => {
      if (epoch !== this.epoch || queued.has(line.id)) return
      if (line.speaker === NARRATOR_ID && this.preludeSkipped) return
      queued.add(line.id)
      this.queue.push(this.makeItem(line))
    }
    this.opts.source
      .next(
        {
          history: this.state.transcript,
          upcoming: this.queue.map((q) => q.line),
          playerMessage,
          log: this.state.log,
          prelude:
            !!this.opts.scenario.narrator && this.settings.prelude && !this.preludeSkipped && !playerMessage && !this.state.transcript.length,
        },
        {
          signal: abort.signal,
          onScene: (scene) => epoch === this.epoch && this.openScene(scene),
          onPlayer: (player) => {
            if (epoch === this.epoch && playerId) this.applyPlayerRendering(player, playerId, 'writers')
          },
          onLine: (line) => {
            enqueue(line)
            if (this.playback) this.prepareAhead()
            else this.advance()
          },
        },
      )
      .then((batch) => {
        if (epoch !== this.epoch) {
          this.opts.source.discard?.(batch.lines)
          return
        }
        this.batchPending = false
        this.batchAbort = null
        if (playerId && batch.player) this.applyPlayerRendering(batch.player, playerId, 'writers')
        batch.lines.forEach(enqueue)
        if (batch.ending) this.pendingEnding = batch.ending
        this.advance()
      })
      .catch((err) => {
        if (epoch !== this.epoch) return
        console.error('[conversation] batch failed', err)
        this.batchPending = false
        this.batchAbort = null
        if (err instanceof ApiError && (err.status === 400 || err.status === 410)) {
          // Retrying won't help; wait for the player to resume.
          this.flash(err.status === 410 ? this.notices.offAir : this.notices.channelError, 6000)
          this.set({ paused: true, activity: 'idle' })
          return
        }
        this.flash(this.notices.signalLost)
        this.gapTimer = setTimeout(() => this.advance(), 3000)
      })
  }

  /** Silence before a line: set by the writers, or by whether the speaker changes. */
  private pickGap(line: Line) {
    const previous = this.state.transcript[this.state.transcript.length - 1]?.speaker
    const narration = line.speaker === NARRATOR_ID
    const [min, max] = narration
      ? previous === NARRATOR_ID
        ? this.gaps.narration
        : this.gaps.opening
      : previous === NARRATOR_ID
        ? this.gaps.curtain
        : line.pause
          ? this.gaps[line.pause]
          : line.speaker === previous
            ? this.gaps.followUp
            : this.gaps.reply
    return min + Math.random() * (max - min)
  }

  private makeItem(line: Line): QueueItem {
    return { line }
  }

  /** Starts preparing a line's audio (once) and resolves when it can start playing. */
  private prepare(item: QueueItem): Promise<PreparedSpeech> {
    if (item.prepared) return item.prepared
    const party = this.voiceOf(item.line.speaker)
    const lang = this.opts.scenario.targetLang
    const { browser, elevenlabs, archive } = this.opts.voices
    const engine = this.pickEngine()
    const live = () =>
      engine === 'elevenlabs' && elevenlabs
        ? elevenlabs.prepare(item.line, party, lang).catch((err) => {
            console.warn('[conversation] ElevenLabs failed, using browser voice', err)
            this.flash(this.notices.backupVoice)
            return browser.prepare(item.line, party, lang)
          })
        : browser.prepare(item.line, party, lang)

    // A line that already aired plays from its recording when the server kept one.
    item.prepared = archive?.handles(item.line)
      ? archive.prepare(item.line, party, lang).catch((err) => {
          console.warn('[conversation] recorded audio unavailable, voicing the line again', err)
          return live()
        })
      : live()
    item.prepared.then((p) => (item.ready = p)).catch(() => undefined)
    return item.prepared
  }

  /** Channel sound for a line: the speaker's background and signal strength. */
  private carrierFor(line: Line): CarrierOptions {
    const radio = this.opts.scenario.parties.find((p) => p.id === line.speaker)?.radio
    return { ambience: radio?.ambience, signal: line.signal ?? radio?.signal ?? 1 }
  }

  /** Who speaks a line: a party, or the narrator dressed as one for the voices. */
  private voiceOf(speaker: string): Party | undefined {
    const narrator = this.opts.scenario.narrator
    if (speaker === NARRATOR_ID && narrator) return { id: NARRATOR_ID, name: narrator.name ?? NARRATOR_ID, side: 'left', color: narrator.color, voice: narrator.voice }
    return this.opts.scenario.parties.find((p) => p.id === speaker)
  }

  /** Opens the channel for a line: the radio's squelch for a party; for the narrator, the soundscape follows the cue. */
  private channelOn(line: Line) {
    if (line.speaker !== NARRATOR_ID) return this.opts.audio.carrierOn(this.carrierFor(line))
    if (!this.bed) return
    const audio = this.opts.audio
    audio.bedLevel('under')
    // Introducing one side brings up the sound at their end, clean, as if the listener stood there.
    const ambience = this.opts.scenario.parties.find((p) => p.id === line.cue)?.radio?.ambience
    void audio.setBed('cue', ambience && ambience.kind !== 'none' ? ambience : null, 0.55, 1.2)
  }

  /** Closes the channel after the line that is playing. */
  private channelOff(line = this.playingItem?.line) {
    if (line?.speaker !== NARRATOR_ID) return this.opts.audio.carrierOff()
    if (this.bed) this.opts.audio.bedLevel('full')
  }

  /** The opening soundscape starts; the narrator waits for it, a few seconds at most. */
  private openScene(scene: AmbienceSpec) {
    if (this.preludeSkipped) return
    const gain = this.opts.scenario.narrator?.bedGain ?? 0.5
    this.bed = true
    this.sceneSettled = false
    const playing = this.opts.audio.setBed('scene', scene, gain, 2.5)
    const ready = Promise.race([playing, new Promise((r) => setTimeout(r, 6000))]).then(() => {
      if (this.sceneReady !== ready) return
      this.sceneSettled = true
      // The pause before the first words counts from here.
      if (!this.state.transcript.length) this.quietSince = performance.now()
    })
    this.sceneReady = ready
  }

  /** Fades the soundscape out. */
  private closeBed(fade = 2.5) {
    this.sceneSettled = true
    if (!this.bed) return
    this.bed = false
    this.opts.audio.bedOff(fade)
  }

  /** Prepares only the next few lines, so cut-off lines rarely cost a voice request. */
  private prepareAhead() {
    this.queue.slice(0, this.opts.lookahead).forEach((item) => void this.prepare(item))
  }

  private play(item: QueueItem, replay: boolean) {
    const speech = item.ready!
    const playback = speech.play()
    this.playback = playback
    this.playingItem = item

    if (!replay) {
      this.lastItem = item
      this.played.set(item.line.id, item)
      this.addTranscript({
        id: item.line.id,
        speaker: item.line.speaker,
        segments: item.line.segments,
        audio: speech.archiveKey,
        gap: item.gap !== undefined && this.state.transcript.length ? Math.round(item.gap / 100) / 10 : undefined,
        log: item.line.log,
      })
      if (item.line.log) {
        this.set({ log: applyLogUpdate(this.state.log, item.line.log, { at: this.elapsed(), lineId: item.line.id }) })
        const notice = this.opts.scenario.log?.updatedNotice
        if (notice) this.flash(notice, 2500)
      }
    } else if (this.opts.tape && item.line.log) {
      // A tape makes the log changes again as it plays.
      this.set({ log: applyLogUpdate(this.state.log, item.line.log, { at: this.elapsed(), lineId: item.line.id }) })
    }
    this.channelOn(item.line)
    this.set({
      activity: 'speaking',
      onAir: item.line.speaker,
      current: { line: item.line, words: speech.words, wordIndex: -1, replay },
    })
    this.trackWords()

    playback.finished.then((reason) => {
      if (this.playback !== playback) return
      this.playback = null
      this.playingItem = null
      cancelAnimationFrame(this.raf)
      this.channelOff(item.line)
      const current = this.state.current && { ...this.state.current, wordIndex: speech.words.length }
      this.set({ onAir: null, current, activity: reason === 'ended' ? 'idle' : this.state.activity })
      if (reason !== 'ended') return
      this.quietSince = performance.now()
      this.advance()
    })
  }

  private trackWords() {
    cancelAnimationFrame(this.raf)
    const tick = () => {
      const pb = this.playback
      const cur = this.state.current
      if (!pb || !cur) return
      const idx = wordIndexAt(cur.words, pb.position())
      if (idx !== cur.wordIndex) this.set({ current: { ...cur, wordIndex: idx } })
      this.raf = requestAnimationFrame(tick)
    }
    this.raf = requestAnimationFrame(tick)
  }

  /** Stop whatever is playing without triggering the next line. */
  private stopPlayback() {
    const pb = this.playback
    this.playback = null
    this.playingItem = null
    cancelAnimationFrame(this.raf)
    pb?.stop()
  }

  /** The player cut in: stop the current line and drop everything queued. */
  private interrupt() {
    this.epoch++
    clearTimeout(this.gapTimer)
    this.batchAbort?.abort()
    this.batchAbort = null
    if (this.playback && this.playingItem && !this.state.current?.replay) {
      const id = this.playingItem.line.id
      const cutAt = Math.round(this.playback.position() * 100) / 100
      this.set({
        transcript: this.state.transcript.map((e) => (e.id === id ? { ...e, interrupted: true, cutAt } : e)),
      })
    }
    if (this.playback) this.channelOff()
    this.stopPlayback()
    this.replayQueue = []
    this.closeBed(0.6)
    if (this.state.replaying) this.set({ replaying: false })
    this.opts.source.discard?.(this.queue.map((q) => q.line))
    this.queue = []
    this.batchPending = false
    this.pendingEnding = null
  }

  private finish(ending: ScenarioEnding) {
    this.closeBed()
    this.set({ phase: 'ended', activity: 'idle', onAir: null, ending })
  }

  private elapsed() {
    return (performance.now() - this.startedAt) / 1000
  }

  private addTranscript(entry: Omit<TranscriptEntry, 'at'>) {
    this.set({ transcript: [...this.state.transcript, { ...entry, at: this.elapsed() }] })
  }

  private flash(notice: string, ms = 3200) {
    clearTimeout(this.noticeTimer)
    this.set({ notice })
    this.noticeTimer = setTimeout(() => this.set({ notice: null }), ms)
  }

  private micPromise: Promise<MediaStream> | null = null

  /**
   * Opens the microphone for one transmission. releaseMic() closes it again: while a mic is
   * open, iOS routes all audio through the call channel (earpiece volume, much louder).
   */
  private ensureMic(): Promise<MediaStream> {
    if (!navigator.mediaDevices?.getUserMedia) return Promise.reject(new Error('No microphone access'))
    if (this.micPromise) return this.micPromise
    setAudioSession('play-and-record')
    const p: Promise<MediaStream> = navigator.mediaDevices
      .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      .then((stream) => {
        // Released before the mic finished opening (a quick tap): close it right away.
        if (this.micPromise !== p) {
          stream.getTracks().forEach((t) => t.stop())
          return stream
        }
        this.micStream = stream
        this.opts.audio.attachMic(stream)
        return stream
      })
    this.micPromise = p
    p.catch((err) => {
      console.warn('[conversation] mic unavailable', err)
      if (this.micPromise === p) this.releaseMic()
    })
    return p
  }

  private releaseMic() {
    if (!this.micPromise) return
    this.micStream?.getTracks().forEach((t) => t.stop())
    this.micStream = null
    this.micPromise = null
    this.opts.audio.detachMic()
    setAudioSession('playback')
  }

  /**
   * Fills in the player's line: target-language version + translation.
   * The target-language version comes from the writers, because the reply confirms it in the same words;
   * DeepL's shows until theirs arrives. The translation comes from DeepL, which detects a message already
   * in the player's language; the writers' is used only without DeepL.
   */
  private applyPlayerRendering(player: { target: string; native: string }, id: string, from: 'deepl' | 'writers') {
    this.rendered[from] = id
    const takeTarget = from === 'writers' || this.rendered.writers !== id
    const takeNative = from === 'deepl' || this.rendered.deepl !== id
    this.set({
      transcript: this.state.transcript.map((e) =>
        e.id === id
          ? {
              ...e,
              rendering: (takeTarget && player.target) || e.rendering,
              segments: takeNative ? e.segments.map((seg) => ({ ...seg, translation: player.native })) : e.segments,
            }
          : e,
      ),
    })
  }
}
