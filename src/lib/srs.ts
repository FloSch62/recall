/**
 * Anki-style SM-2 spaced-repetition scheduler.
 * Grades: 0 = Again, 1 = Hard, 2 = Good, 3 = Easy.
 */
export type Grade = 0 | 1 | 2 | 3
export type CardStateName = 'new' | 'learning' | 'review' | 'relearning'

export interface CardProgress {
  st: CardStateName
  ease: number
  /** current interval in days (review/relearning cards) */
  ivl: number
  /** index into the (re)learning steps */
  step: number
  /** epoch ms when the card is due */
  due: number
  lapses: number
  reps: number
  /** multiple-choice attempts */
  seen: number
  /** multiple-choice correct answers */
  correct: number
}

export const MIN_MS = 60_000
export const DAY_MS = 86_400_000
export const MATURE_IVL = 21

const LEARNING_STEPS = [1, 10] // minutes
const RELEARNING_STEPS = [10]
const GRADUATING_IVL = 1
const EASY_IVL = 4
const START_EASE = 2.5
const MIN_EASE = 1.3
const MAX_IVL = 3650

export const GRADE_LABELS = ['Again', 'Hard', 'Good', 'Easy'] as const

export function emptyProgress(): CardProgress {
  return { st: 'new', ease: START_EASE, ivl: 0, step: 0, due: 0, lapses: 0, reps: 0, seen: 0, correct: 0 }
}

function graduate(c: CardProgress, ivl: number, now: number) {
  c.st = 'review'
  c.step = 0
  c.ivl = Math.min(MAX_IVL, ivl)
  c.due = now + c.ivl * DAY_MS
}

/** Pure next state for a grade, without fuzz (used for previews too). */
export function nextProgress(p: CardProgress, grade: Grade, now: number): CardProgress {
  const c: CardProgress = { ...p, reps: p.reps + 1 }

  if (c.st === 'new') {
    c.st = 'learning'
    c.step = 0
  }

  if (c.st === 'learning' || c.st === 'relearning') {
    const steps = c.st === 'relearning' ? RELEARNING_STEPS : LEARNING_STEPS
    if (grade === 0) {
      c.step = 0
      c.due = now + steps[0] * MIN_MS
    } else if (grade === 1) {
      const cur = steps[Math.min(c.step, steps.length - 1)]
      c.due = now + Math.round(cur * 1.5) * MIN_MS
    } else if (grade === 2) {
      const next = c.step + 1
      if (next >= steps.length) {
        graduate(c, c.st === 'relearning' ? Math.max(1, c.ivl) : GRADUATING_IVL, now)
      } else {
        c.step = next
        c.due = now + steps[next] * MIN_MS
      }
    } else {
      graduate(c, c.st === 'relearning' ? Math.max(EASY_IVL, c.ivl + 1) : EASY_IVL, now)
    }
    return c
  }

  // review card
  if (grade === 0) {
    c.lapses += 1
    c.ease = Math.max(MIN_EASE, c.ease - 0.2)
    c.ivl = Math.max(1, Math.round(c.ivl * 0.5))
    c.st = 'relearning'
    c.step = 0
    c.due = now + RELEARNING_STEPS[0] * MIN_MS
    return c
  }

  let ivl: number
  if (grade === 1) {
    c.ease = Math.max(MIN_EASE, c.ease - 0.15)
    ivl = Math.max(c.ivl + 1, Math.round(c.ivl * 1.2))
  } else if (grade === 2) {
    ivl = Math.max(c.ivl + 1, Math.round(c.ivl * c.ease))
  } else {
    c.ease = c.ease + 0.15
    ivl = Math.max(c.ivl + 2, Math.round(c.ivl * c.ease * 1.3))
  }
  c.ivl = Math.min(MAX_IVL, ivl)
  c.due = now + c.ivl * DAY_MS
  return c
}

/** Next state with a small random fuzz on longer review intervals. */
export function applyGrade(p: CardProgress, grade: Grade, now: number): CardProgress {
  const c = nextProgress(p, grade, now)
  if (c.st === 'review' && c.ivl >= 3) {
    const fuzz = 1 + (Math.random() * 0.1 - 0.05)
    c.ivl = Math.min(MAX_IVL, Math.max(1, Math.round(c.ivl * fuzz)))
    c.due = now + c.ivl * DAY_MS
  }
  return c
}

export function startOfToday(now: number): number {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function endOfToday(now: number): number {
  return startOfToday(now) + DAY_MS - 1
}

/** Local YYYY-MM-DD key for day counters. */
export function todayKey(now: number): string {
  const d = new Date(now)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}
