import { PLAYER_ID, type Line, type LogState, type Scenario, type ScenarioEnding, type TimedWord, type TranscriptEntry } from '../types'
import type { InputMode, Settings } from '../settings'
import type { CarrierOptions, RadioAudio } from './radioAudio'
import { applyLogUpdate, initialLog } from './log'
import { ApiError } from '../api'
import { recognitionSupported } from './recognizer'
import { createBrowserTranscriber, createCloudTranscriber, type Transcriber } from './transcriber'
import type { LineSource } from './sources/types'
import type { Playback, PreparedSpeech, SpeechEngine, SpeechProvider } from './speech/types'
import type { SavedSession } from './session'
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
}

export interface ConversationOptions {
  scenario: Scenario
  source: LineSource
  audio: RadioAudio
  voices: { browser: SpeechProvider; elevenlabs?: SpeechProvider }
  settings: Settings
  /** True when server speech-to-text is set up (otherwise the browser recognizer is used). */
  cloudSpeechToText?: () => boolean
  /** Translates the player's message both ways: { target, native }. Falls back to the writers' version. */
  translatePlayer?: (text: string) => Promise<{ target: string; native: string }> | null
  /** Start loading the next batch when this many lines (or fewer) are queued. */
  refillAt?: number
  /** How many upcoming lines get their audio prepared while the current one plays. */
  lookahead?: number
  /** Silence between lines, in ms (random within range). */
  gapMs?: [number, number]
}

interface QueueItem {
  line: Line
  /** Audio being prepared; created only when the line is close to airing. */
  prepared?: Promise<PreparedSpeech>
  ready?: PreparedSpeech
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
})

/**
 * Runs the radio conversation: fetches batches of lines, prepares their audio ahead of time,
 * plays them in order, and handles pause, replay and player transmissions.
 */
export class Conversation {
  private state: ConversationState
  private listeners = new Set<() => void>()
  private opts: Required<Pick<ConversationOptions, 'refillAt' | 'gapMs' | 'lookahead'>> & ConversationOptions

  private queue: QueueItem[] = []
  private epoch = 0
  private batchPending = false
  private pendingEnding: ScenarioEnding | null = null
  /** Cancels the batch being written when the player cuts in. */
  private batchAbort: AbortController | null = null
  private playback: Playback | null = null
  private playingItem: QueueItem | null = null
  private lastItem: QueueItem | null = null
  private gapTimer: ReturnType<typeof setTimeout> | undefined
  private noticeTimer: ReturnType<typeof setTimeout> | undefined
  private raf = 0
  private startedAt = 0
  private recognizer: Transcriber | null = null
  private micStream: MediaStream | null = null
  private elevenLabsReady = false
  /** Player line waiting for its target-language rendering from the next batch. */
  private pendingPlayerId: string | null = null
  /** Seconds already spent on the channel before a reload. */
  private resumeElapsed = 0
  /** Latest player settings; read whenever needed. */
  settings: Settings

  constructor(options: ConversationOptions) {
    this.opts = { refillAt: 3, lookahead: 1, gapMs: [450, 1000], ...options }
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
    if (this.state.paused || this.state.phase !== 'running') return
    clearTimeout(this.gapTimer)
    if (this.playback) {
      this.playback.pause()
      this.opts.audio.carrierOff()
    }
    this.set({ paused: true, onAir: this.state.activity === 'transmitting' ? PLAYER_ID : null })
  }

  resume() {
    if (!this.state.paused) return
    this.opts.audio.ensure()
    this.set({ paused: false })
    if (this.playback && this.playingItem) {
      this.opts.audio.carrierOn(this.carrierFor(this.playingItem.line))
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

  startTransmit(mode: InputMode) {
    if (this.state.phase === 'ended' || this.isTransmitting()) return
    if (this.state.phase === 'standby') this.start()
    const cloud = mode === 'voice' && !!this.opts.cloudSpeechToText?.() && typeof MediaRecorder !== 'undefined'
    if (mode === 'voice' && !cloud && !recognitionSupported()) mode = 'keyboard'

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
        this.flash('Transmission garbled')
        text = ''
      }
      this.recognizer = null
      if (epoch !== this.epoch) return
    }
    this.releaseMic()
    this.opts.audio.beep('tx-end')
    text = text.trim()
    this.set({ onAir: null, txMode: null })

    if (!text) {
      this.set({ activity: 'idle', txText: '' })
      this.flash('No transmission received')
      this.advance()
      return
    }

    this.addTranscript({ id: `p${Date.now()}`, speaker: PLAYER_ID, segments: [{ text, translation: '' }] })
    const playerId = this.state.transcript[this.state.transcript.length - 1].id
    this.pendingPlayerId = playerId
    this.opts
      .translatePlayer?.(text)
      ?.then((t) => this.applyPlayerRendering(t, playerId))
      .catch((err) => console.warn('[conversation] translation failed', err))
    // The player spoke, so the channel answers right away.
    this.set({ paused: false, txText: '', activity: 'waiting' })
    this.requestBatch(text)
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
      scenarioId: this.opts.scenario.id,
      savedAt: Date.now(),
      phase: s.phase === 'ended' ? 'ended' : 'running',
      elapsed: s.phase === 'running' ? this.elapsed() : this.resumeElapsed,
      transcript: s.transcript,
      log: s.log,
      ending: s.ending,
      source: this.opts.source.snapshot?.(this.queue.map((q) => q.line)),
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
    this.opts.audio.carrierOff()
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
    if (s.phase !== 'running' || s.paused || this.playback || this.isTransmitting()) return
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

    this.queue.shift()
    this.play(item, false)
    this.prepareAhead()
    if (this.queue.length <= this.opts.refillAt) this.requestBatch()
  }

  private requestBatch(playerMessage?: string) {
    if (this.batchPending || (this.pendingEnding && !playerMessage)) return
    this.batchPending = true
    const epoch = this.epoch
    const abort = new AbortController()
    this.batchAbort = abort
    // Lines that arrive early (streaming) are queued right away.
    const queued = new Set<string>()
    const enqueue = (line: Line) => {
      if (epoch !== this.epoch || queued.has(line.id)) return
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
        },
        {
          signal: abort.signal,
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
        if (playerMessage && batch.player) this.applyPlayerRendering(batch.player)
        batch.lines.forEach(enqueue)
        if (batch.ending) this.pendingEnding = batch.ending
        this.advance()
      })
      .catch((err) => {
        if (epoch !== this.epoch) return
        console.error('[conversation] batch failed', err)
        this.batchPending = false
        this.batchAbort = null
        if (err instanceof ApiError && err.status === 400) {
          // Retrying won't help; wait for the player to resume.
          this.flash('Channel error', 6000)
          this.set({ paused: true, activity: 'idle' })
          return
        }
        this.flash('Signal lost. Retrying…')
        this.gapTimer = setTimeout(() => this.advance(), 3000)
      })
  }

  private makeItem(line: Line): QueueItem {
    return { line }
  }

  /** Starts preparing a line's audio (once) and resolves when it can start playing. */
  private prepare(item: QueueItem): Promise<PreparedSpeech> {
    if (item.prepared) return item.prepared
    const party = this.opts.scenario.parties.find((p) => p.id === item.line.speaker)
    const lang = this.opts.scenario.targetLang
    const { browser, elevenlabs } = this.opts.voices
    const engine = this.pickEngine()

    item.prepared =
      engine === 'elevenlabs' && elevenlabs
        ? elevenlabs.prepare(item.line, party, lang).catch((err) => {
            console.warn('[conversation] ElevenLabs failed, using browser voice', err)
            this.flash('Voice service unavailable. Using backup voice.')
            return browser.prepare(item.line, party, lang)
          })
        : browser.prepare(item.line, party, lang)
    item.prepared.then((p) => (item.ready = p)).catch(() => undefined)
    return item.prepared
  }

  /** Channel sound for a line: the speaker's background and signal strength. */
  private carrierFor(line: Line): CarrierOptions {
    const radio = this.opts.scenario.parties.find((p) => p.id === line.speaker)?.radio
    return { ambience: radio?.ambience, signal: line.signal ?? radio?.signal ?? 1 }
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
      this.addTranscript({ id: item.line.id, speaker: item.line.speaker, segments: item.line.segments })
      if (item.line.log) {
        this.set({ log: applyLogUpdate(this.state.log, item.line.log, { at: this.elapsed(), lineId: item.line.id }) })
        const notice = this.opts.scenario.log?.updatedNotice
        if (notice) this.flash(notice, 2500)
      }
    }
    this.opts.audio.carrierOn(this.carrierFor(item.line))
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
      this.opts.audio.carrierOff()
      const current = this.state.current && { ...this.state.current, wordIndex: speech.words.length }
      this.set({ onAir: null, current, activity: reason === 'ended' ? 'idle' : this.state.activity })
      if (reason !== 'ended') return
      const [min, max] = this.opts.gapMs
      this.gapTimer = setTimeout(() => this.advance(), min + Math.random() * (max - min))
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
      this.set({
        transcript: this.state.transcript.map((e) => (e.id === id ? { ...e, interrupted: true } : e)),
      })
    }
    if (this.playback) this.opts.audio.carrierOff()
    this.stopPlayback()
    this.opts.source.discard?.(this.queue.map((q) => q.line))
    this.queue = []
    this.batchPending = false
    this.pendingEnding = null
  }

  private finish(ending: ScenarioEnding) {
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

  /** Adds the target-language version and translation to the player's last line. */
  /** Fills in the player's line: target-language version + translation. The first answer wins. */
  private applyPlayerRendering(player: { target: string; native: string }, id = this.pendingPlayerId) {
    if (!id || id !== this.pendingPlayerId) return
    this.pendingPlayerId = null
    this.set({
      transcript: this.state.transcript.map((e) =>
        e.id === id
          ? { ...e, rendering: player.target || undefined, segments: e.segments.map((seg) => ({ ...seg, translation: player.native })) }
          : e,
      ),
    })
  }
}

/**
 * Safari's Audio Session API (iOS 16.4+). After the mic closes, 'playback' moves audio
 * back from the call channel to the normal media speaker and volume.
 */
function setAudioSession(type: 'playback' | 'play-and-record') {
  const session = (navigator as { audioSession?: { type: string } }).audioSession
  if (session) session.type = type
}
