import assert from 'node:assert/strict'
import test from 'node:test'
import {
  checkpointIsComplete,
  emptyQuest,
  isQuestData,
  mergeQuest,
  questStore,
  totalXp,
} from '../src/lib/quest.ts'

const checkpointStep = {
  type: 'checkpoint',
  key: 'c-start',
  unit: 0,
  checkpoint: {
    id: 'start',
    title: 'Start',
    contentHtml: '<p>Read.</p>',
    sources: 'page 1',
    module: 0,
    beforeCardId: 'Q1.1',
  },
  followingLessonKey: 'u0-l0',
}

test('accepts and normalizes legacy v1 Quest data without checkpoints', () => {
  const legacy = { version: 1, sound: true, lessons: {}, xpByDay: {} }
  assert.equal(isQuestData(legacy), true)
  questStore.replaceData(legacy)
  assert.deepEqual(questStore.getSnapshot().checkpoints, {})
})

test('checkpoint completion is idempotent and awards no XP', () => {
  questStore.replaceData(emptyQuest())
  const before = totalXp(questStore.getSnapshot())
  questStore.completeCheckpoint('deck', 'start', 100)
  questStore.completeCheckpoint('deck', 'start', 200)
  const after = questStore.getSnapshot()
  assert.equal(totalXp(after), before)
  assert.deepEqual(after.xpByDay, {})
  assert.deepEqual(after.checkpoints['deck::start'], { t: 100 })
  assert.equal(checkpointIsComplete(after, 'deck', checkpointStep), true)
})

test('grandfathers a checkpoint when its following legacy lesson is already complete', () => {
  const data = emptyQuest()
  data.lessons['deck::u0-l0'] = { stars: 2, t: 50 }
  assert.equal(checkpointIsComplete(data, 'deck', checkpointStep), true)
  assert.deepEqual(data.checkpoints, {})
})

test('merges checkpoint timestamps and resets them with their deck', () => {
  const current = emptyQuest()
  current.checkpoints['deck::start'] = { t: 100 }
  const incoming = emptyQuest()
  incoming.checkpoints['deck::start'] = { t: 200 }
  incoming.checkpoints['other::start'] = { t: 300 }
  const merged = mergeQuest(current, incoming)
  assert.deepEqual(merged.checkpoints, {
    'deck::start': { t: 200 },
    'other::start': { t: 300 },
  })

  questStore.replaceData(merged)
  questStore.resetDeck('deck')
  assert.deepEqual(questStore.getSnapshot().checkpoints, { 'other::start': { t: 300 } })
})
