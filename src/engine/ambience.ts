/**
 * Background sound picked up by a speaker's microphone (cave drips, room hum, rain).
 * Uses a recorded file when one is given and loads; otherwise renders a loop in the browser.
 */

export type AmbienceKind = 'cave' | 'room' | 'rain' | 'none'

export interface AmbienceSpec {
  kind: AmbienceKind
  /** Recorded loop (e.g. /sfx/cave.mp3), used instead of the generated one when it loads. */
  src?: string
  /** Loudness under the voice, 0–1. */
  gain?: number
}

const LOOP_SECONDS = 8

/** Loads (or renders) the loop for a spec. Cached by the caller. */
export async function loadAmbience(ctx: BaseAudioContext, spec: AmbienceSpec): Promise<AudioBuffer | null> {
  if (spec.src) {
    try {
      const res = await fetch(spec.src)
      if (res.ok) return await ctx.decodeAudioData(await res.arrayBuffer())
    } catch {
      /* fall back to the generated loop */
    }
  }
  return spec.kind === 'none' ? null : renderAmbience(spec.kind, ctx.sampleRate)
}

async function renderAmbience(kind: Exclude<AmbienceKind, 'none'>, sampleRate: number) {
  const ctx = new OfflineAudioContext(1, sampleRate * LOOP_SECONDS, sampleRate)
  const out = ctx.createGain()
  out.connect(ctx.destination)
  if (kind === 'cave') cave(ctx, out)
  else if (kind === 'room') room(ctx, out)
  else rain(ctx, out)
  return ctx.startRendering()
}

function noiseBuffer(ctx: BaseAudioContext, color: 'white' | 'brown') {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * LOOP_SECONDS, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  let last = 0
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1
    if (color === 'white') data[i] = white
    else {
      last = (last + 0.02 * white) / 1.02
      data[i] = last * 3.5
    }
  }
  return buffer
}

function noise(ctx: BaseAudioContext, color: 'white' | 'brown', dest: AudioNode, gain: number, filter?: BiquadFilterNode) {
  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer(ctx, color)
  const g = ctx.createGain()
  g.gain.value = gain
  if (filter) src.connect(filter).connect(g)
  else src.connect(g)
  g.connect(dest)
  src.start()
}

/** Exponential-decay impulse response, for echoey spaces. */
function reverb(ctx: BaseAudioContext, seconds: number) {
  const len = ctx.sampleRate * seconds
  const ir = ctx.createBuffer(1, len, ctx.sampleRate)
  const d = ir.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3)
  const conv = ctx.createConvolver()
  conv.buffer = ir
  return conv
}

function cave(ctx: OfflineAudioContext, out: AudioNode) {
  // Hollow air
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 400
  noise(ctx, 'brown', out, 0.25, lp)

  // Water drips with a long echo
  const wet = ctx.createGain()
  wet.gain.value = 0.6
  const echo = reverb(ctx, 2.2)
  echo.connect(wet).connect(out)
  let t = 0.3
  while (t < LOOP_SECONDS - 0.3) {
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    const f = 900 + Math.random() * 1100
    osc.frequency.setValueAtTime(f, t)
    osc.frequency.exponentialRampToValueAtTime(f * 0.55, t + 0.07)
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.18 + Math.random() * 0.2, t + 0.004)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09)
    osc.connect(g)
    g.connect(out)
    g.connect(echo)
    osc.start(t)
    osc.stop(t + 0.12)
    t += 0.35 + Math.random() * 1.3
  }
}

function room(ctx: OfflineAudioContext, out: AudioNode) {
  // Mains hum and its harmonic
  for (const [freq, gain] of [
    [50, 0.05],
    [100, 0.03],
    [150, 0.012],
  ]) {
    const osc = ctx.createOscillator()
    osc.frequency.value = freq
    const g = ctx.createGain()
    g.gain.value = gain
    osc.connect(g).connect(out)
    osc.start()
  }
  // Air conditioning
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 700
  bp.Q.value = 0.4
  noise(ctx, 'white', out, 0.05, bp)
}

function rain(ctx: OfflineAudioContext, out: AudioNode) {
  const hp = ctx.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 900
  noise(ctx, 'white', out, 0.22, hp)
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 300
  noise(ctx, 'brown', out, 0.35, lp)
}
