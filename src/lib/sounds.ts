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
}

function tone(c: AudioContext, { freq, at, dur, type = 'sine', vol = 0.12, glide }: Tone) {
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, at)
  if (glide !== undefined) osc.frequency.exponentialRampToValueAtTime(glide, at + dur)
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(vol, at + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur)
  osc.connect(gain)
  gain.connect(c.destination)
  osc.start(at)
  osc.stop(at + dur + 0.05)
}

export const sfx = {
  /** soft click for taps and toggles */
  tap() {
    const c = getCtx()
    if (!c) return
    tone(c, { freq: 1400, at: c.currentTime, dur: 0.06, type: 'triangle', vol: 0.05 })
  },

  /** bright two-note ding */
  correct() {
    const c = getCtx()
    if (!c) return
    const t = c.currentTime
    tone(c, { freq: 784, at: t, dur: 0.12, type: 'triangle', vol: 0.14 })
    tone(c, { freq: 1175, at: t + 0.09, dur: 0.22, type: 'triangle', vol: 0.14 })
  },

  /** low descending buzz */
  wrong() {
    const c = getCtx()
    if (!c) return
    const t = c.currentTime
    tone(c, { freq: 220, at: t, dur: 0.28, type: 'sawtooth', vol: 0.08, glide: 130 })
    tone(c, { freq: 110, at: t, dur: 0.28, type: 'sine', vol: 0.12, glide: 70 })
  },

  /** rising ping, higher for each star */
  star(i: number) {
    const c = getCtx()
    if (!c) return
    tone(c, { freq: 880 * Math.pow(1.25, i), at: c.currentTime, dur: 0.3, type: 'triangle', vol: 0.12 })
  },

  /** big rising fanfare for reaching a new level */
  levelUp() {
    const c = getCtx()
    if (!c) return
    const t = c.currentTime
    const notes = [392, 523.25, 659.25, 783.99, 1046.5] // G4 C5 E5 G5 C6
    notes.forEach((f, i) => tone(c, { freq: f, at: t + i * 0.09, dur: 0.22, type: 'triangle', vol: 0.13 }))
    ;[783.99, 987.77, 1174.66].forEach((f) => tone(c, { freq: f, at: t + 0.5, dur: 0.7, type: 'sine', vol: 0.08 }))
  },

  /** little fanfare for a finished lesson */
  complete() {
    const c = getCtx()
    if (!c) return
    const t = c.currentTime
    const notes = [523.25, 659.25, 783.99, 1046.5] // C5 E5 G5 C6
    notes.forEach((f, i) => tone(c, { freq: f, at: t + i * 0.12, dur: 0.25, type: 'triangle', vol: 0.13 }))
    notes.forEach((f) => tone(c, { freq: f, at: t + 0.55, dur: 0.6, type: 'sine', vol: 0.06 }))
  },
}
