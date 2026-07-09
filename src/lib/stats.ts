import type { Deck } from './types'
import { cardKey, type ProgressData } from './store'
import { endOfToday, todayKey, MATURE_IVL } from './srs'

export interface DeckCounts {
  total: number
  /** unique cards with at least one multiple-choice answer in any mode */
  answered: number
  /** cards that entered the SRS (state != new) */
  started: number
  newRemaining: number
  learning: number
  dueReviews: number
  dueLearning: number
  mature: number
  seen: number
  correct: number
}

const zero = (total: number): DeckCounts => ({
  total,
  answered: 0,
  started: 0,
  newRemaining: total,
  learning: 0,
  dueReviews: 0,
  dueLearning: 0,
  mature: 0,
  seen: 0,
  correct: 0,
})

/** Counts derived from the progress store alone (no deck.json needed). */
export function homeDeckCounts(deckId: string, cardCount: number, data: ProgressData, now: number): DeckCounts {
  const c = zero(cardCount)
  const prefix = `${deckId}::`
  const eod = endOfToday(now)
  for (const [key, p] of Object.entries(data.cards)) {
    if (!key.startsWith(prefix)) continue
    if (p.seen > 0) c.answered++
    c.seen += p.seen
    c.correct += p.correct
    if (p.st === 'new') continue
    c.started++
    if (p.st === 'learning' || p.st === 'relearning') {
      c.learning++
      if (p.due <= eod) c.dueLearning++
    } else {
      if (p.due <= eod) c.dueReviews++
      if (p.ivl >= MATURE_IVL) c.mature++
    }
  }
  c.answered = Math.min(cardCount, c.answered)
  c.newRemaining = Math.max(0, cardCount - c.started)
  return c
}

/** Same counts, but iterating the actual deck cards (ignores stale progress entries). */
export function deckCounts(deck: Deck, data: ProgressData, now: number): DeckCounts {
  const c = zero(deck.cards.length)
  const eod = endOfToday(now)
  let started = 0
  for (const card of deck.cards) {
    const p = data.cards[cardKey(deck.id, card.id)]
    if (!p) continue
    if (p.seen > 0) c.answered++
    c.seen += p.seen
    c.correct += p.correct
    if (p.st === 'new') continue
    started++
    if (p.st === 'learning' || p.st === 'relearning') {
      c.learning++
      if (p.due <= eod) c.dueLearning++
    } else {
      if (p.due <= eod) c.dueReviews++
      if (p.ivl >= MATURE_IVL) c.mature++
    }
  }
  c.started = started
  c.newRemaining = Math.max(0, deck.cards.length - started)
  return c
}

export interface ModuleCounts {
  total: number
  answered: number
  started: number
  mature: number
  seen: number
  correct: number
}

export function moduleCounts(deck: Deck, data: ProgressData): ModuleCounts[] {
  const out: ModuleCounts[] = deck.modules.map(() => ({ total: 0, answered: 0, started: 0, mature: 0, seen: 0, correct: 0 }))
  for (const card of deck.cards) {
    const m = out[card.module]
    if (!m) continue
    m.total++
    const p = data.cards[cardKey(deck.id, card.id)]
    if (!p) continue
    if (p.seen > 0) m.answered++
    m.seen += p.seen
    m.correct += p.correct
    if (p.st === 'new') continue
    m.started++
    if (p.st === 'review' && p.ivl >= MATURE_IVL) m.mature++
  }
  return out
}

/** How many cards a study session started now would contain. */
export function sessionEstimate(counts: DeckCounts, data: ProgressData, deckId: string, now: number): number {
  const dayC = data.day.date === todayKey(now) ? data.day.byDeck[deckId] : undefined
  const newAllow = Math.max(0, data.settings.newPerDay - (dayC?.n ?? 0))
  const revAllow = Math.max(0, data.settings.maxReviewsPerDay - (dayC?.r ?? 0))
  return Math.min(counts.newRemaining, newAllow) + counts.learning + Math.min(counts.dueReviews, revAllow)
}
