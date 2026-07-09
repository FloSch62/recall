import { useSyncExternalStore } from 'react'
import {
  applyGrade,
  emptyProgress,
  todayKey,
  type CardProgress,
  type CardStateName,
  type Grade,
} from './srs'

export interface Settings {
  newPerDay: number
  maxReviewsPerDay: number
}

export interface LogEntry {
  t: number
  deck: string
  card: string
  mode: 'srs' | 'practice'
  grade?: Grade
  /** multiple-choice result; null when the answer was revealed without picking */
  correct: boolean | null
  ms?: number
  /** card state before the review */
  st?: CardStateName
  /** interval (days) after the review */
  ivl?: number
}

export interface DayCounters {
  date: string
  byDeck: Record<string, { n: number; r: number }>
}

export interface ProgressData {
  version: 1
  settings: Settings
  /** keyed by `${deckId}::${cardId}` */
  cards: Record<string, CardProgress>
  log: LogEntry[]
  day: DayCounters
}

export const DEFAULT_SETTINGS: Settings = { newPerDay: 20, maxReviewsPerDay: 200 }

const STORAGE_KEY = 'recall:progress:v1'
const MAX_LOG = 50_000

export const cardKey = (deck: string, card: string) => `${deck}::${card}`

export function emptyData(): ProgressData {
  return {
    version: 1,
    settings: { ...DEFAULT_SETTINGS },
    cards: {},
    log: [],
    day: { date: todayKey(Date.now()), byDeck: {} },
  }
}

export function isProgressData(v: unknown): v is ProgressData {
  if (typeof v !== 'object' || v === null) return false
  const d = v as Record<string, unknown>
  return d.version === 1 && typeof d.cards === 'object' && d.cards !== null && Array.isArray(d.log)
}

function load(): ProgressData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyData()
    const parsed: unknown = JSON.parse(raw)
    if (!isProgressData(parsed)) return emptyData()
    return {
      ...emptyData(),
      ...parsed,
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
    }
  } catch {
    return emptyData()
  }
}

function rolledDay(day: DayCounters, now: number): DayCounters {
  const key = todayKey(now)
  return day.date === key ? day : { date: key, byDeck: {} }
}

class ProgressStore {
  private data: ProgressData = load()
  private listeners = new Set<() => void>()
  private saveTimer: ReturnType<typeof setTimeout> | undefined
  private undoData: ProgressData | null = null

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', () => this.flush())
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') this.flush()
      })
    }
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  getSnapshot = (): ProgressData => this.data

  private commit(next: ProgressData) {
    this.data = next
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => this.flush(), 400)
    this.listeners.forEach((fn) => fn())
  }

  flush() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = undefined
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data))
    } catch {
      // storage full or unavailable — keep working in memory
    }
  }

  /** Grade a card in an SRS session. `correct` is null when revealed without picking. */
  grade(deck: string, card: string, grade: Grade, correct: boolean | null, ms: number) {
    const now = Date.now()
    const key = cardKey(deck, card)
    const prev = this.data.cards[key] ?? emptyProgress()
    const wasNew = prev.st === 'new'
    const next = applyGrade(prev, grade, now)
    if (correct !== null) {
      next.seen = prev.seen + 1
      next.correct = prev.correct + (correct ? 1 : 0)
    }
    const day = rolledDay(this.data.day, now)
    const dc = day.byDeck[deck] ?? { n: 0, r: 0 }
    const entry: LogEntry = { t: now, deck, card, mode: 'srs', grade, correct, ms, st: prev.st, ivl: next.ivl }
    this.undoData = this.data
    this.commit({
      ...this.data,
      cards: { ...this.data.cards, [key]: next },
      log: [...this.data.log.slice(-MAX_LOG), entry],
      day: {
        ...day,
        byDeck: { ...day.byDeck, [deck]: { n: dc.n + (wasNew ? 1 : 0), r: dc.r + (wasNew ? 0 : 1) } },
      },
    })
  }

  /** Record a practice answer without touching the review schedule. */
  practice(deck: string, card: string, correct: boolean) {
    const now = Date.now()
    const key = cardKey(deck, card)
    const prev = this.data.cards[key] ?? emptyProgress()
    const next: CardProgress = { ...prev, seen: prev.seen + 1, correct: prev.correct + (correct ? 1 : 0) }
    const entry: LogEntry = { t: now, deck, card, mode: 'practice', correct }
    this.undoData = null
    this.commit({
      ...this.data,
      cards: { ...this.data.cards, [key]: next },
      log: [...this.data.log.slice(-MAX_LOG), entry],
    })
  }

  canUndo(): boolean {
    return this.undoData !== null
  }

  /** Undo the most recent grade() call. */
  undo(): boolean {
    if (!this.undoData) return false
    const prev = this.undoData
    this.undoData = null
    this.commit(prev)
    return true
  }

  setSettings(patch: Partial<Settings>) {
    this.undoData = null
    this.commit({ ...this.data, settings: { ...this.data.settings, ...patch } })
  }

  replaceData(data: ProgressData) {
    this.undoData = null
    this.commit(data)
  }

  resetDeck(deck: string) {
    const prefix = `${deck}::`
    const cards: Record<string, CardProgress> = {}
    for (const [k, v] of Object.entries(this.data.cards)) {
      if (!k.startsWith(prefix)) cards[k] = v
    }
    const byDeck = { ...this.data.day.byDeck }
    delete byDeck[deck]
    this.undoData = null
    this.commit({
      ...this.data,
      cards,
      log: this.data.log.filter((l) => l.deck !== deck),
      day: { ...this.data.day, byDeck },
    })
  }

  resetAll() {
    this.undoData = null
    this.commit(emptyData())
  }
}

export const store = new ProgressStore()

export function useProgress(): ProgressData {
  return useSyncExternalStore(store.subscribe, store.getSnapshot)
}
