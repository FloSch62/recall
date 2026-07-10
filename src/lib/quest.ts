import { useSyncExternalStore } from 'react'
import { DAY_MS, todayKey } from './srs.ts'
import type { QuestCheckpoint, QuestLesson, QuestStep } from './questStructure.ts'
export { buildQuest, LESSON_SIZE } from './questStructure.ts'
export type { CheckpointAlignment, QuestCheckpoint, QuestLesson, QuestStep, QuestUnit } from './questStructure.ts'

export const LESSON_XP = 10
export const PERFECT_BONUS = 5
export const DAILY_GOAL_XP = 30

/** Base XP plus 1 per first-try correct answer, plus the perfect bonus. */
export function lessonXp(firstTryCorrect: number, total: number): number {
  return LESSON_XP + firstTryCorrect + (firstTryCorrect === total ? PERFECT_BONUS : 0)
}

const RANKS = [
  'Novice',
  'Apprentice',
  'Student',
  'Scholar',
  'Adept',
  'Expert',
  'Veteran',
  'Master',
  'Grandmaster',
  'Legend',
]

export interface LevelInfo {
  level: number
  title: string
  /** XP accumulated within the current level */
  into: number
  /** XP needed to advance from this level */
  needed: number
}

/** Level thresholds grow linearly: 40 XP for level 2, then +20 XP per level. */
export function levelFor(xp: number): LevelInfo {
  let level = 1
  let rest = xp
  for (;;) {
    const needed = 40 + (level - 1) * 20
    if (rest < needed) return { level, title: RANKS[Math.min(level - 1, RANKS.length - 1)], into: rest, needed }
    rest -= needed
    level++
  }
}

export function starsFor(firstTryCorrect: number, total: number): 1 | 2 | 3 {
  if (total > 0 && firstTryCorrect === total) return 3
  if (total > 0 && firstTryCorrect / total >= 0.7) return 2
  return 1
}

export interface LessonScore {
  stars: 1 | 2 | 3
  /** epoch ms of the latest completion */
  t: number
}

export interface CheckpointCompletion {
  /** Epoch ms of the first explicit completion. */
  t: number
}

export interface QuestData {
  version: 1
  sound: boolean
  /** keyed by `${deckId}::${lessonKey}` */
  lessons: Record<string, LessonScore>
  /** keyed by `${deckId}::${checkpointId}` */
  checkpoints: Record<string, CheckpointCompletion>
  /** local YYYY-MM-DD -> XP earned that day */
  xpByDay: Record<string, number>
}

const STORAGE_KEY = 'recall:quest:v1'

export function emptyQuest(): QuestData {
  return { version: 1, sound: true, lessons: {}, checkpoints: {}, xpByDay: {} }
}

export function isQuestData(v: unknown): v is QuestData {
  if (typeof v !== 'object' || v === null) return false
  const d = v as Record<string, unknown>
  return (
    d.version === 1 &&
    typeof d.sound === 'boolean' &&
    typeof d.lessons === 'object' &&
    d.lessons !== null &&
    (d.checkpoints === undefined || (typeof d.checkpoints === 'object' && d.checkpoints !== null)) &&
    typeof d.xpByDay === 'object' &&
    d.xpByDay !== null
  )
}

function normalizeQuest(data: QuestData): QuestData {
  return {
    ...emptyQuest(),
    ...data,
    lessons: { ...data.lessons },
    checkpoints: { ...(data.checkpoints ?? {}) },
    xpByDay: { ...data.xpByDay },
  }
}

function load(): QuestData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyQuest()
    const parsed: unknown = JSON.parse(raw)
    if (!isQuestData(parsed)) return emptyQuest()
    return normalizeQuest(parsed)
  } catch {
    return emptyQuest()
  }
}

export function mergeQuest(current: QuestData, incoming: QuestData): QuestData {
  const lessons = { ...current.lessons }
  for (const [key, inc] of Object.entries(incoming.lessons)) {
    const cur = lessons[key]
    lessons[key] = cur
      ? { stars: Math.max(cur.stars, inc.stars) as 1 | 2 | 3, t: Math.max(cur.t, inc.t) }
      : inc
  }

  const checkpoints = { ...current.checkpoints }
  for (const [key, inc] of Object.entries(incoming.checkpoints ?? {})) {
    const cur = checkpoints[key]
    checkpoints[key] = cur ? { t: Math.max(cur.t, inc.t) } : inc
  }

  const xpByDay = { ...current.xpByDay }
  for (const [day, xp] of Object.entries(incoming.xpByDay)) {
    xpByDay[day] = Math.max(xpByDay[day] ?? 0, xp)
  }

  return { version: 1, sound: current.sound, lessons, checkpoints, xpByDay }
}

class QuestStore {
  private data: QuestData = load()
  private listeners = new Set<() => void>()

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  getSnapshot = (): QuestData => this.data

  private commit(next: QuestData) {
    this.data = next
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // storage full or unavailable — keep working in memory
    }
    this.listeners.forEach((fn) => fn())
  }

  completeLesson(deckId: string, lessonKey: string, stars: 1 | 2 | 3, xp: number, now: number) {
    const key = `${deckId}::${lessonKey}`
    const prev = this.data.lessons[key]
    const day = todayKey(now)
    this.commit({
      ...this.data,
      lessons: {
        ...this.data.lessons,
        [key]: { stars: Math.max(prev?.stars ?? 0, stars) as 1 | 2 | 3, t: now },
      },
      xpByDay: { ...this.data.xpByDay, [day]: (this.data.xpByDay[day] ?? 0) + xp },
    })
  }

  completeCheckpoint(deckId: string, checkpointId: string, now: number) {
    const key = `${deckId}::${checkpointId}`
    if (this.data.checkpoints[key]) return
    this.commit({
      ...this.data,
      checkpoints: { ...this.data.checkpoints, [key]: { t: now } },
    })
  }

  setSound(on: boolean) {
    this.commit({ ...this.data, sound: on })
  }

  replaceData(data: QuestData) {
    this.commit(normalizeQuest(data))
  }

  resetDeck(deckId: string) {
    const prefix = `${deckId}::`
    const lessons: Record<string, LessonScore> = {}
    for (const [key, score] of Object.entries(this.data.lessons)) {
      if (!key.startsWith(prefix)) lessons[key] = score
    }
    const checkpoints: Record<string, CheckpointCompletion> = {}
    for (const [key, completion] of Object.entries(this.data.checkpoints)) {
      if (!key.startsWith(prefix)) checkpoints[key] = completion
    }
    this.commit({ ...this.data, lessons, checkpoints })
  }

  resetAll() {
    this.commit(emptyQuest())
  }
}

export const questStore = new QuestStore()

export function useQuest(): QuestData {
  return useSyncExternalStore(questStore.subscribe, questStore.getSnapshot)
}

export function lessonScore(data: QuestData, deckId: string, lessonKey: string): LessonScore | undefined {
  return data.lessons[`${deckId}::${lessonKey}`]
}

export function checkpointCompletion(
  data: QuestData,
  deckId: string,
  checkpointId: string,
): CheckpointCompletion | undefined {
  return data.checkpoints[`${deckId}::${checkpointId}`]
}

/** Explicit completion, or an inferred migration completion when the following lesson predates checkpoints. */
export function checkpointIsComplete(data: QuestData, deckId: string, step: QuestCheckpoint): boolean {
  return Boolean(
    checkpointCompletion(data, deckId, step.checkpoint.id) ||
      (step.followingLessonKey && lessonScore(data, deckId, step.followingLessonKey)),
  )
}

export function questStepIsComplete(data: QuestData, deckId: string, step: QuestStep): boolean {
  return step.type === 'lesson'
    ? Boolean(lessonScore(data, deckId, step.key))
    : checkpointIsComplete(data, deckId, step)
}

export function totalXp(data: QuestData): number {
  return Object.values(data.xpByDay).reduce((a, b) => a + b, 0)
}

/** Consecutive days with quest XP, counting back from today (today still pending is fine). */
export function questStreak(data: QuestData, now: number): number {
  const d = new Date(now)
  if (!data.xpByDay[todayKey(d.getTime())]) d.setDate(d.getDate() - 1)
  let streak = 0
  while (data.xpByDay[todayKey(d.getTime())]) {
    streak++
    d.setDate(d.getDate() - 1)
  }
  return streak
}

export function xpToday(data: QuestData, now: number): number {
  return data.xpByDay[todayKey(now)] ?? 0
}

export interface DayXp {
  key: string
  /** narrow weekday label, e.g. "M" */
  label: string
  xp: number
  isToday: boolean
}

/** XP for the last `n` days, oldest first. */
export function lastDaysXp(data: QuestData, now: number, n: number): DayXp[] {
  const out: DayXp[] = []
  const d = new Date(now)
  d.setDate(d.getDate() - (n - 1))
  for (let i = 0; i < n; i++) {
    const key = todayKey(d.getTime())
    out.push({
      key,
      label: d.toLocaleDateString(undefined, { weekday: 'narrow' }),
      xp: data.xpByDay[key] ?? 0,
      isToday: i === n - 1,
    })
    d.setDate(d.getDate() + 1)
  }
  return out
}

/** Longest run of consecutive days with quest XP, ever. */
export function bestStreak(data: QuestData): number {
  const days = Object.keys(data.xpByDay)
    .filter((k) => (data.xpByDay[k] ?? 0) > 0)
    .sort()
  let best = 0
  let run = 0
  let prev: number | null = null
  for (const k of days) {
    const [y, m, d] = k.split('-').map(Number)
    const t = new Date(y, m - 1, d).getTime()
    run = prev !== null && Math.round((t - prev) / DAY_MS) === 1 ? run + 1 : 1
    best = Math.max(best, run)
    prev = t
  }
  return best
}

export interface DeckQuestTotals {
  done: number
  perfect: number
  stars: number
}

export function deckQuestTotals(data: QuestData, deckId: string, lessons: QuestLesson[]): DeckQuestTotals {
  let done = 0
  let perfect = 0
  let stars = 0
  for (const l of lessons) {
    const s = lessonScore(data, deckId, l.key)
    if (!s) continue
    done++
    stars += s.stars
    if (s.stars === 3) perfect++
  }
  return { done, perfect, stars }
}
