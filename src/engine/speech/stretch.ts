/**
 * Changes how fast speech plays without changing its pitch (WSOLA).
 * Feed audio in pieces as it arrives; each call returns the audio that is ready so far.
 */
export class TimeStretch {
  readonly rate: number
  /** Frame length, and the output step between frames (half a frame). */
  private readonly size: number
  private readonly hop: number
  /** How far (each way) to search for the best-matching frame; covers one pitch period of a low voice. */
  private readonly tolerance: number
  private readonly window: Float32Array

  /** Input kept in memory; `inStart` is the index of its first sample in the whole stream. */
  private input = new Float32Array(0)
  private inLength = 0
  private inStart = 0
  /** Samples received so far (plus silent padding after `flush`). */
  private total = 0
  /** Real end of the input, set by `flush`. */
  private end = Infinity
  private overlap: Float32Array
  private frame = 0
  private prev = 0

  constructor(rate: number, sampleRate: number) {
    this.rate = rate
    this.hop = Math.round(sampleRate * 0.016)
    this.size = this.hop * 2
    this.tolerance = Math.round(sampleRate * 0.012)
    this.overlap = new Float32Array(this.size)
    // Hann windows at half-frame steps add up to exactly 1.
    this.window = new Float32Array(this.size)
    for (let i = 0; i < this.size; i++) this.window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / this.size)
  }

  push(data: Float32Array): Float32Array {
    if (this.rate === 1) return data
    this.append(data)
    return this.process()
  }

  /** Call once the input has ended; returns the rest of the output. */
  flush(): Float32Array {
    if (this.rate === 1 || this.end !== Infinity) return new Float32Array(0)
    this.end = this.total
    // Silence past the end, so the last frames have something to read.
    this.append(new Float32Array(2 * (this.size + this.tolerance)))
    const out = this.process()
    const tail = this.overlap.slice(0, this.size - this.hop)
    return concat([out, tail])
  }

  private process(): Float32Array {
    const { size, hop, tolerance, window, overlap } = this
    const out: Float32Array[] = []
    for (;;) {
      const nominal = Math.round(this.frame * hop * this.rate)
      if (nominal >= this.end) break
      // The frame that would continue the previous one seamlessly.
      const natural = this.prev + hop
      const lo = this.frame ? Math.max(0, nominal - tolerance) : 0
      const hi = this.frame ? nominal + tolerance : 0
      if (Math.max(hi, natural) + size > this.total) break

      const pos = this.frame ? this.bestMatch(lo, hi, natural) : 0
      const src = pos - this.inStart
      for (let i = 0; i < size; i++) overlap[i] += window[i] * this.input[src + i]
      out.push(overlap.slice(0, hop))
      overlap.copyWithin(0, hop)
      overlap.fill(0, size - hop)

      this.prev = pos
      this.frame++
      this.discard(Math.min(Math.round(this.frame * hop * this.rate) - tolerance, pos + hop))
    }
    return concat(out)
  }

  /** The start (in [lo, hi]) of the frame that best lines up with the one at `natural`. */
  private bestMatch(lo: number, hi: number, natural: number) {
    const x = this.input
    const ref = natural - this.inStart
    let best = lo
    let bestScore = -Infinity
    for (let c = lo; c <= hi; c++) {
      const cand = c - this.inStart
      let dot = 0
      let energy = 1e-9
      // Every other sample is plenty for speech, and halves the work.
      for (let i = 0; i < this.size; i += 2) {
        const v = x[cand + i]
        dot += v * x[ref + i]
        energy += v * v
      }
      const score = dot / Math.sqrt(energy)
      if (score > bestScore) {
        bestScore = score
        best = c
      }
    }
    return best
  }

  private append(data: Float32Array) {
    if (this.inLength + data.length > this.input.length) {
      const grown = new Float32Array(Math.max(this.input.length * 2, this.inLength + data.length))
      grown.set(this.input.subarray(0, this.inLength))
      this.input = grown
    }
    this.input.set(data, this.inLength)
    this.inLength += data.length
    this.total += data.length
  }

  /** Forget input before `from` (an index in the whole stream). */
  private discard(from: number) {
    const drop = from - this.inStart
    if (drop <= 0) return
    this.input.copyWithin(0, drop, this.inLength)
    this.inLength -= drop
    this.inStart = from
  }
}

/** Joins pieces of audio into one. */
export function concat(parts: Float32Array[]): Float32Array {
  if (parts.length === 1) return parts[0]
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}
