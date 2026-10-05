import { loadAmbience, type AmbienceSpec } from './ambience'

/** What the channel sounds like for one transmission. */
export interface CarrierOptions {
  /** Background sound at the speaker's end, heard through their radio. */
  ambience?: AmbienceSpec
  /** Signal strength, 0 (barely there) to 1 (clear). Weak signals hiss more and drop out. */
  signal?: number
}

export interface RadioAudioOptions {
  /** Lowest voice frequency kept by the radio filter (Hz). */
  bandLow?: number
  /** Highest voice frequency kept by the radio filter (Hz). */
  bandHigh?: number
  /** Distortion amount on the voice (0 = clean). */
  drive?: number
  /** Background hiss while a channel is open (0–1). */
  hiss?: number
  /** Loudness of the squelch burst at the start and end of a transmission (0–1). */
  burst?: number
  /** Loudness of the push-to-talk beeps (0–1). */
  beepVolume?: number
}

const DEFAULTS: Required<RadioAudioOptions> = {
  bandLow: 320,
  bandHigh: 3200,
  drive: 6,
  hiss: 0.03,
  burst: 0.2,
  beepVolume: 0.1,
}

/**
 * Web Audio graph that makes voices sound like a walkie-talkie:
 * band-pass filter, light distortion, compression, hiss and squelch bursts.
 */
export class RadioAudio {
  private ctx: AudioContext | null = null
  private master!: GainNode
  private voiceIn!: GainNode
  private noiseGain!: GainNode
  private analyser!: AnalyserNode
  private micAnalyser: AnalyserNode | null = null
  private micSource: MediaStreamAudioSourceNode | null = null
  private buf = new Float32Array(1024)
  private opts: Required<RadioAudioOptions>
  private staticLevel = 1
  private voiceGate!: GainNode
  private ambienceCache = new Map<string, Promise<AudioBuffer | null>>()
  private ambienceSource: { src: AudioBufferSourceNode; gain: GainNode } | null = null
  private dropoutTimer: ReturnType<typeof setTimeout> | undefined
  /** Bumped on every carrier change, so late-loading ambience doesn't start after the line ended. */
  private carrierId = 0
  private volume = 1

  constructor(options: RadioAudioOptions = {}) {
    this.opts = { ...DEFAULTS, ...options }
  }

  /** Create or wake the audio context. Call from a user gesture. */
  ensure(): AudioContext {
    if (!this.ctx) this.build()
    if (this.ctx!.state === 'suspended') void this.ctx!.resume()
    return this.ctx!
  }

  get context() {
    return this.ensure()
  }

  /** Close the audio context (browsers allow only a few). The next ensure() builds a new one. */
  dispose() {
    this.carrierId++
    clearTimeout(this.dropoutTimer)
    this.ambienceSource = null
    this.ambienceCache.clear()
    this.detachMic()
    const ctx = this.ctx
    this.ctx = null
    void ctx?.close().catch(() => undefined)
  }

  /** Connect voice audio here to send it through the radio filter. */
  get input(): AudioNode {
    this.ensure()
    return this.voiceIn
  }

  setVolume(v: number) {
    this.volume = v
    if (this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02)
  }

  setStaticLevel(v: number) {
    this.staticLevel = v
  }

  /** Squelch opens: short burst, then low hiss under the voice (more when the signal is weak). */
  carrierOn({ ambience, signal = 1 }: CarrierOptions = {}) {
    const ctx = this.ensure()
    const id = ++this.carrierId
    const weak = 1 - Math.max(0, Math.min(1, signal))
    const g = this.noiseGain.gain
    const t = ctx.currentTime
    g.cancelScheduledValues(t)
    g.setValueAtTime(this.opts.burst * this.staticLevel, t)
    g.linearRampToValueAtTime(this.opts.hiss * (1 + weak * 3) * this.staticLevel, t + 0.09)
    this.click(t)
    this.voiceGate.gain.cancelScheduledValues(t)
    this.voiceGate.gain.setValueAtTime(1, t)

    if (ambience && ambience.kind !== 'none') {
      this.ambience(ambience).then((buffer) => {
        if (!buffer || id !== this.carrierId) return
        this.stopAmbience()
        const src = ctx.createBufferSource()
        src.buffer = buffer
        src.loop = true
        const gain = ctx.createGain()
        gain.gain.setValueAtTime(0, ctx.currentTime)
        gain.gain.linearRampToValueAtTime(ambience.gain ?? 0.15, ctx.currentTime + 0.15)
        // Through the radio chain: it's picked up by the speaker's microphone.
        src.connect(gain).connect(this.voiceIn)
        src.start(0, Math.random() * buffer.duration)
        this.ambienceSource = { src, gain }
      })
    }
    if (weak > 0.45) this.scheduleDropouts(weak)
  }

  /** Squelch closes: the classic "kssh" tail, then silence. */
  carrierOff() {
    this.carrierId++
    clearTimeout(this.dropoutTimer)
    this.stopAmbience()
    const ctx = this.ensure()
    this.voiceGate.gain.cancelScheduledValues(ctx.currentTime)
    this.voiceGate.gain.setValueAtTime(1, ctx.currentTime)
    const g = this.noiseGain.gain
    const t = ctx.currentTime
    g.cancelScheduledValues(t)
    g.setValueAtTime(this.opts.burst * 1.2 * this.staticLevel, t)
    g.setValueAtTime(this.opts.burst * this.staticLevel, t + 0.12)
    g.linearRampToValueAtTime(0, t + 0.2)
  }

  /** Beeps for the player's own push-to-talk. */
  beep(kind: 'tx-start' | 'tx-end') {
    const ctx = this.ensure()
    const t = ctx.currentTime
    const tones: [number, number][] = kind === 'tx-start' ? [[1050, 0.07]] : [[1250, 0.07], [880, 0.1]]
    let at = t
    for (const [freq, dur] of tones) {
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      g.gain.setValueAtTime(0, at)
      g.gain.linearRampToValueAtTime(this.opts.beepVolume, at + 0.005)
      g.gain.setValueAtTime(this.opts.beepVolume, at + dur - 0.01)
      g.gain.linearRampToValueAtTime(0, at + dur)
      osc.connect(g).connect(this.master)
      osc.start(at)
      osc.stop(at + dur + 0.02)
      at += dur
    }
  }

  /** Current voice loudness, 0–1. */
  getLevel() {
    return this.ctx ? rms(this.analyser, this.buf) : 0
  }

  attachMic(stream: MediaStream) {
    const ctx = this.ensure()
    this.detachMic()
    this.micAnalyser = ctx.createAnalyser()
    this.micAnalyser.fftSize = 1024
    this.micSource = ctx.createMediaStreamSource(stream)
    this.micSource.connect(this.micAnalyser)
  }

  detachMic() {
    this.micSource?.disconnect()
    this.micSource = null
    this.micAnalyser = null
  }

  getMicLevel() {
    return this.micAnalyser ? rms(this.micAnalyser, this.buf) : 0
  }

  private ambience(spec: AmbienceSpec) {
    const key = `${spec.kind}|${spec.src ?? ''}`
    let p = this.ambienceCache.get(key)
    if (!p) {
      p = loadAmbience(this.ensure(), spec).catch(() => null)
      this.ambienceCache.set(key, p)
    }
    return p
  }

  private stopAmbience() {
    const a = this.ambienceSource
    this.ambienceSource = null
    if (!a || !this.ctx) return
    const t = this.ctx.currentTime
    a.gain.gain.cancelScheduledValues(t)
    a.gain.gain.setValueAtTime(a.gain.gain.value, t)
    a.gain.gain.linearRampToValueAtTime(0, t + 0.08)
    a.src.stop(t + 0.1)
  }

  /** A weak signal briefly cuts out now and then, with a crackle. Kept short so words stay clear. */
  private scheduleDropouts(weak: number) {
    clearTimeout(this.dropoutTimer)
    const id = this.carrierId
    const tick = () => {
      if (id !== this.carrierId || !this.ctx) return
      if (Math.random() < weak * 0.6) {
        const t = this.ctx.currentTime
        const len = 0.05 + Math.random() * 0.1 * weak
        const gate = this.voiceGate.gain
        gate.setValueAtTime(1, t)
        gate.linearRampToValueAtTime(0.08, t + 0.01)
        gate.setValueAtTime(0.08, t + len)
        gate.linearRampToValueAtTime(1, t + len + 0.02)
        const n = this.noiseGain.gain
        n.setValueAtTime(this.opts.burst * 0.9 * this.staticLevel, t)
        n.linearRampToValueAtTime(this.opts.hiss * (1 + weak * 3) * this.staticLevel, t + len + 0.03)
      }
      this.dropoutTimer = setTimeout(tick, 1200 + Math.random() * 1600)
    }
    this.dropoutTimer = setTimeout(tick, 600 + Math.random() * 1000)
  }

  private click(t: number) {
    const ctx = this.ctx!
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'square'
    osc.frequency.value = 90
    g.gain.setValueAtTime(0.08 * this.staticLevel, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03)
    osc.connect(g).connect(this.master)
    osc.start(t)
    osc.stop(t + 0.04)
  }

  private build() {
    const ctx = new AudioContext()
    this.ctx = ctx
    const o = this.opts

    this.master = ctx.createGain()
    this.master.gain.value = this.volume
    this.master.connect(ctx.destination)

    // Voice chain
    this.voiceIn = ctx.createGain()
    const hp = biquad(ctx, 'highpass', o.bandLow, 0.8)
    const lp = biquad(ctx, 'lowpass', o.bandHigh, 0.9)
    const presence = biquad(ctx, 'peaking', 1800, 1)
    presence.gain.value = 5
    const shaper = ctx.createWaveShaper()
    shaper.curve = softClip(o.drive)
    shaper.oversample = '2x'
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -24
    comp.ratio.value = 6
    comp.attack.value = 0.004
    comp.release.value = 0.15
    const makeup = ctx.createGain()
    makeup.gain.value = 1.4
    this.analyser = ctx.createAnalyser()
    this.analyser.fftSize = 1024
    // Gate for signal dropouts.
    this.voiceGate = ctx.createGain()
    this.voiceIn.connect(hp).connect(lp).connect(presence).connect(shaper).connect(comp).connect(makeup).connect(this.voiceGate)
    this.voiceGate.connect(this.analyser)
    this.voiceGate.connect(this.master)

    // Static
    const noise = ctx.createBufferSource()
    noise.buffer = whiteNoise(ctx, 2)
    noise.loop = true
    const noiseBand = biquad(ctx, 'bandpass', 2000, 0.5)
    this.noiseGain = ctx.createGain()
    this.noiseGain.gain.value = 0
    noise.connect(noiseBand).connect(this.noiseGain).connect(this.master)
    noise.start()
  }
}

function biquad(ctx: AudioContext, type: BiquadFilterType, freq: number, q: number) {
  const f = ctx.createBiquadFilter()
  f.type = type
  f.frequency.value = freq
  f.Q.value = q
  return f
}

function softClip(k: number) {
  const n = 1024
  const curve = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1
    curve[i] = k === 0 ? x : Math.tanh(k * x) / Math.tanh(k)
  }
  return curve
}

function whiteNoise(ctx: AudioContext, seconds: number) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  return buffer
}

function rms(analyser: AnalyserNode, buf: Float32Array<ArrayBuffer>) {
  analyser.getFloatTimeDomainData(buf)
  let sum = 0
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
  return Math.min(1, Math.sqrt(sum / buf.length) * 4)
}
