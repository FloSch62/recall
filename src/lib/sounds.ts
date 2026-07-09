import { questStore } from './quest'

/**
 * Tiny WebAudio synth for quest-mode feedback sounds — no audio assets.
 * All sounds respect the quest sound toggle and fail silently without WebAudio.
 */

let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined' || !questStore.getSnapshot().sound) return null
  if (!('AudioContext' in window)) return null
  ctx ??= new AudioContext()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

interface Tone {
  freq: number
  at: number
  dur: number
  type?: OscillatorType
  vol?: number
  /** glide the pitch to this frequency over the duration */
  glide?: number
  attack?: number
  release?: number
  pan?: number
}

const MIN_GAIN = 0.0001

function tone(c: AudioContext, { freq, at, dur, type = 'sine', vol = 0.12, glide, attack = 0.01, release = 0.05, pan }: Tone) {
  const osc = c.createOscillator()
  const gain = c.createGain()
  const attackEnd = at + Math.min(attack, dur * 0.45)
  const releaseStart = at + Math.max(Math.min(dur - release, dur * 0.75), attackEnd - at)

  osc.type = type
  osc.frequency.setValueAtTime(freq, at)
  if (glide !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, glide), at + dur)

  gain.gain.setValueAtTime(MIN_GAIN, at)
  gain.gain.exponentialRampToValueAtTime(vol, attackEnd)
  gain.gain.setValueAtTime(vol, releaseStart)
  gain.gain.exponentialRampToValueAtTime(MIN_GAIN, at + dur)

  osc.connect(gain)
  if (pan !== undefined) {
    const panner = c.createStereoPanner()
    panner.pan.setValueAtTime(pan, at)
    gain.connect(panner)
    panner.connect(c.destination)
  } else {
    gain.connect(c.destination)
  }
  osc.start(at)
  osc.stop(at + dur + 0.05)
}

function sparkle(c: AudioContext, at: number, dur = 0.12, vol = 0.04) {
  const buffer = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * dur)), c.sampleRate)
  const samples = buffer.getChannelData(0)
  for (let i = 0; i < samples.length; i += 1) {
    const fade = 1 - i / samples.length
    samples[i] = (Math.random() * 2 - 1) * fade * fade
  }

  const source = c.createBufferSource()
  const filter = c.createBiquadFilter()
  const gain = c.createGain()

  source.buffer = buffer
  filter.type = 'highpass'
  filter.frequency.setValueAtTime(4200, at)
  gain.gain.setValueAtTime(MIN_GAIN, at)
  gain.gain.exponentialRampToValueAtTime(vol, at + 0.01)
  gain.gain.exponentialRampToValueAtTime(MIN_GAIN, at + dur)

  source.connect(filter)
  filter.connect(gain)
  gain.connect(c.destination)
  source.start(at)
  source.stop(at + dur + 0.02)
}

function chord(c: AudioContext, freqs: number[], at: number, dur: number, vol = 0.05) {
  freqs.forEach((freq, i) =>
    tone(c, {
      freq,
      at,
      dur,
      type: i === 0 ? 'triangle' : 'sine',
      vol: vol * (i === 0 ? 1 : 0.75),
      attack: 0.018,
      release: 0.18,
      pan: (i - (freqs.length - 1) / 2) * 0.18,
    }),
  )
}

export const sfx = {
  /** quick bubble click for taps and toggles */
  tap() {
    const c = getCtx()
    if (!c) return
    const t = c.currentTime
    tone(c, { freq: 520, at: t, dur: 0.055, type: 'sine', vol: 0.045, glide: 780, attack: 0.004, release: 0.03 })
    tone(c, { freq: 1320, at: t + 0.018, dur: 0.045, type: 'triangle', vol: 0.025, attack: 0.003, release: 0.025 })
  },

  /** playful coin-and-sparkle chime */
  correct() {
    const c = getCtx()
    if (!c) return
    const t = c.currentTime
    ;[659.25, 783.99, 1046.5].forEach((freq, i) =>
      tone(c, {
        freq,
        at: t + i * 0.055,
        dur: 0.16,
        type: 'triangle',
        vol: 0.095,
        attack: 0.006,
        release: 0.075,
        pan: i === 1 ? 0 : i === 0 ? -0.12 : 0.12,
      }),
    )
    sparkle(c, t + 0.12, 0.09, 0.032)
    tone(c, { freq: 1567.98, at: t + 0.16, dur: 0.18, type: 'sine', vol: 0.045, attack: 0.008, release: 0.1 })
  },

  /** soft comic wobble for a miss */
  wrong() {
    const c = getCtx()
    if (!c) return
    const t = c.currentTime
    tone(c, { freq: 330, at: t, dur: 0.18, type: 'triangle', vol: 0.075, glide: 247, attack: 0.006, release: 0.08 })
    tone(c, { freq: 196, at: t + 0.08, dur: 0.2, type: 'sine', vol: 0.06, glide: 164.81, attack: 0.01, release: 0.1 })
    tone(c, { freq: 415.3, at: t + 0.13, dur: 0.07, type: 'square', vol: 0.018, attack: 0.003, release: 0.04 })
  },

  /** rising star sparkle, higher for each star */
  star(i: number) {
    const c = getCtx()
    if (!c) return
    const t = c.currentTime
    const root = 783.99 * Math.pow(1.18, i)
    tone(c, { freq: root, at: t, dur: 0.2, type: 'triangle', vol: 0.075, glide: root * 1.08, attack: 0.006, release: 0.09 })
    tone(c, { freq: root * 1.5, at: t + 0.055, dur: 0.22, type: 'sine', vol: 0.055, attack: 0.008, release: 0.12 })
    sparkle(c, t + 0.035, 0.11, 0.035)
  },

  /** big rising fanfare for reaching a new level */
  levelUp() {
    const c = getCtx()
    if (!c) return
    const t = c.currentTime
    const notes = [392, 523.25, 659.25, 783.99, 1046.5, 1318.51] // G4 C5 E5 G5 C6 E6
    notes.forEach((freq, i) =>
      tone(c, {
        freq,
        at: t + i * 0.075,
        dur: 0.2,
        type: i % 2 ? 'sine' : 'triangle',
        vol: 0.1,
        attack: 0.006,
        release: 0.09,
        pan: i % 2 ? 0.12 : -0.12,
      }),
    )
    chord(c, [783.99, 987.77, 1174.66, 1567.98], t + 0.48, 0.78, 0.06)
    sparkle(c, t + 0.28, 0.16, 0.04)
    sparkle(c, t + 0.55, 0.2, 0.035)
  },

  /** bouncy fanfare for a finished lesson */
  complete() {
    const c = getCtx()
    if (!c) return
    const t = c.currentTime
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51] // C5 E5 G5 C6 E6
    notes.forEach((freq, i) =>
      tone(c, {
        freq,
        at: t + i * 0.08,
        dur: 0.2,
        type: 'triangle',
        vol: 0.095,
        attack: 0.006,
        release: 0.08,
        pan: i % 2 ? 0.1 : -0.1,
      }),
    )
    chord(c, [659.25, 783.99, 1046.5], t + 0.38, 0.52, 0.065)
    sparkle(c, t + 0.32, 0.15, 0.038)
  },
}
