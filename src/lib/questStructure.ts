import type { Card, Checkpoint, Deck } from './types.ts'

/** Target questions per lesson; module remainders are spread evenly. */
export const LESSON_SIZE = 8

export interface QuestLesson {
  type: 'lesson'
  /** Stable within a deck: `u<module>-l<index>`. */
  key: string
  unit: number
  index: number
  cards: Card[]
}

export interface QuestCheckpoint {
  type: 'checkpoint'
  key: string
  unit: number
  checkpoint: Checkpoint
  /** Used to preserve pre-checkpoint progress for learners who already passed this point. */
  followingLessonKey: string | null
}

export type QuestStep = QuestLesson | QuestCheckpoint

export interface QuestUnit {
  module: number
  title: string
  lessons: QuestLesson[]
  steps: QuestStep[]
}

/** Split cards exactly as before, then interleave authored reading checkpoints. */
export function buildQuest(deck: Deck): QuestUnit[] {
  const byModule = new Map<number, Card[]>()
  for (const card of deck.cards) {
    const list = byModule.get(card.module) ?? []
    list.push(card)
    byModule.set(card.module, list)
  }

  const units: QuestUnit[] = []
  for (const [module, cards] of [...byModule.entries()].sort((a, b) => a[0] - b[0])) {
    const count = Math.max(1, Math.ceil(cards.length / LESSON_SIZE))
    const lessons: QuestLesson[] = []
    for (let i = 0; i < count; i++) {
      const start = Math.round((i * cards.length) / count)
      const end = Math.round(((i + 1) * cards.length) / count)
      lessons.push({ type: 'lesson', key: `u${module}-l${i}`, unit: module, index: i, cards: cards.slice(start, end) })
    }

    const beforeLesson = new Map<string, Checkpoint[]>()
    const trailing: Checkpoint[] = []
    for (const checkpoint of deck.checkpoints ?? []) {
      if (checkpoint.beforeCardId === null) {
        if (checkpoint.module === module) trailing.push(checkpoint)
        continue
      }
      const lesson = lessons.find((candidate) => candidate.cards.some((card) => card.id === checkpoint.beforeCardId))
      if (!lesson) continue
      const list = beforeLesson.get(lesson.key) ?? []
      list.push(checkpoint)
      beforeLesson.set(lesson.key, list)
    }

    const steps: QuestStep[] = []
    for (const lesson of lessons) {
      for (const checkpoint of beforeLesson.get(lesson.key) ?? []) {
        steps.push({
          type: 'checkpoint',
          key: `c-${checkpoint.id}`,
          unit: module,
          checkpoint,
          followingLessonKey: lesson.key,
        })
      }
      steps.push(lesson)
    }
    for (const checkpoint of trailing) {
      steps.push({
        type: 'checkpoint',
        key: `c-${checkpoint.id}`,
        unit: module,
        checkpoint,
        followingLessonKey: null,
      })
    }

    units.push({ module, title: deck.modules[module] ?? `Module ${module + 1}`, lessons, steps })
  }
  return units
}

export interface CheckpointAlignment {
  id: string
  lessonKey: string | null
  aligned: boolean
}

/** Authoring/validation view of how checkpoint card anchors map to unchanged lesson boundaries. */
export function checkpointAlignments(deck: Deck): CheckpointAlignment[] {
  const units = buildQuest({ ...deck, checkpoints: [] })
  const lessons = units.flatMap((unit) => unit.lessons)
  return (deck.checkpoints ?? []).map((checkpoint) => {
    if (checkpoint.beforeCardId === null) return { id: checkpoint.id, lessonKey: null, aligned: true }
    const lesson = lessons.find((candidate) =>
      candidate.cards.some((card) => card.id === checkpoint.beforeCardId),
    )
    return {
      id: checkpoint.id,
      lessonKey: lesson?.key ?? null,
      aligned: lesson?.cards[0]?.id === checkpoint.beforeCardId,
    }
  })
}
