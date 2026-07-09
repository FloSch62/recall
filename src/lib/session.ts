import { cardKey, type ProgressData } from './store'
import { emptyProgress, endOfToday, todayKey, MIN_MS, type CardProgress } from './srs'
import type { Card, Deck } from './types'

/** Learning cards due within this window are shown in the current session. */
const LEARN_AHEAD_MS = 20 * MIN_MS

export interface QueueCounts {
  newCount: number
  learnCount: number
  reviewCount: number
}

export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/** Spread `b` evenly through `a`, keeping each list's internal order. */
function interleave<T>(a: T[], b: T[]): T[] {
  if (!a.length) return [...b]
  if (!b.length) return [...a]
  const out: T[] = []
  let ai = 0
  let bi = 0
  const total = a.length + b.length
  for (let i = 0; i < total; i++) {
    const aBehind = ai / a.length <= bi / b.length
    if ((aBehind && ai < a.length) || bi >= b.length) out.push(a[ai++])
    else out.push(b[bi++])
  }
  return out
}

export class StudySession {
  readonly deckId: string
  /** interleaved due reviews + allowed new cards */
  private main: Card[]
  /** (re)learning cards, kept sorted by due */
  private learn: Card[]
  /** cards put back by undo — always served first */
  private front: Card[] = []
  answered = 0

  constructor(deck: Deck, data: ProgressData, now: number) {
    this.deckId = deck.id
    const dayC = data.day.date === todayKey(now) ? data.day.byDeck[deck.id] : undefined
    const newAllowance = Math.max(0, data.settings.newPerDay - (dayC?.n ?? 0))
    const revAllowance = Math.max(0, data.settings.maxReviewsPerDay - (dayC?.r ?? 0))
    const eod = endOfToday(now)

    const news: Card[] = []
    const reviews: Card[] = []
    this.learn = []
    for (const card of deck.cards) {
      const p = data.cards[cardKey(deck.id, card.id)]
      if (!p || p.st === 'new') news.push(card)
      else if (p.st === 'learning' || p.st === 'relearning') this.learn.push(card)
      else if (p.due <= eod) reviews.push(card)
    }
    shuffle(reviews)
    this.main = interleave(reviews.slice(0, revAllowance), news.slice(0, newAllowance))
    this.sortLearn(data)
  }

  private sortLearn(data: ProgressData) {
    const due = (c: Card) => (data.cards[cardKey(this.deckId, c.id)] ?? emptyProgress()).due
    this.learn.sort((a, b) => due(a) - due(b))
  }

  remaining(): number {
    return this.front.length + this.learn.length + this.main.length
  }

  counts(data: ProgressData): QueueCounts {
    let newCount = 0
    let reviewCount = 0
    let learnCount = this.learn.length
    for (const c of [...this.front, ...this.main]) {
      const p = data.cards[cardKey(this.deckId, c.id)]
      if (!p || p.st === 'new') newCount++
      else if (p.st === 'learning' || p.st === 'relearning') learnCount++
      else reviewCount++
    }
    return { newCount, reviewCount, learnCount }
  }

  next(data: ProgressData, now: number): Card | null {
    if (this.front.length) return this.front.shift()!
    if (this.learn.length) {
      const p = data.cards[cardKey(this.deckId, this.learn[0].id)]
      if (p && p.due <= now) return this.learn.shift()!
    }
    if (this.main.length) return this.main.shift()!
    if (this.learn.length) return this.learn.shift()! // show early rather than block
    return null
  }

  /** Call after grading: re-enqueue if the card comes back within this session. */
  onAnswered(card: Card, after: CardProgress, data: ProgressData, now: number) {
    this.answered += 1
    if ((after.st === 'learning' || after.st === 'relearning') && after.due <= now + LEARN_AHEAD_MS) {
      this.learn.push(card)
      this.sortLearn(data)
    }
  }

  /** Undo support: put a card back to be shown next. */
  requeueFront(card: Card) {
    this.front.unshift(card)
  }
}
