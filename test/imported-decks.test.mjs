import assert from 'node:assert/strict'
import test from 'node:test'
import { indexedDB } from 'fake-indexeddb'

function deck(id) {
  return { id, title: id, description: '', modules: [], cards: [], checkpoints: [] }
}

function seedLegacyRecord() {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('recall-decks', 1)
    open.onupgradeneeded = () => open.result.createObjectStore('decks', { keyPath: 'id' })
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const db = open.result
      const tx = db.transaction('decks', 'readwrite')
      tx.objectStore('decks').put({
        id: 'legacy',
        deck: deck('legacy'),
        source: {
          type: 'github',
          url: 'https://github.com/acme/decks/blob/main/legacy/questions.md',
          rawUrl: 'https://raw.githubusercontent.com/acme/decks/main/legacy/questions.md',
        },
        importedAt: 1,
        updatedAt: 1,
      })
      tx.oncomplete = () => {
        db.close()
        resolve()
      }
      tx.onerror = () => reject(tx.error)
    }
  })
}

test('migrates legacy GitHub sources and atomically stores multiple decks', async () => {
  globalThis.indexedDB = indexedDB
  await seedLegacyRecord()
  const imported = await import(`../src/lib/importedDecks.ts?test=${Date.now()}`)
  await imported.ensureLoaded()

  const legacy = imported.getImportedDeck('legacy')
  assert.equal(legacy.source.version, 2)
  assert.equal(legacy.source.path, 'legacy/questions.md')

  const source = { type: 'manual' }
  const saved = await imported.saveImportedDecks([
    { deck: deck('one'), source },
    { deck: deck('two'), source },
  ])
  assert.deepEqual(
    saved.map((record) => record.id),
    ['one', 'two'],
  )
  assert.equal(imported.getImportedDeck('one').deck.title, 'one')
  assert.equal(imported.getImportedDeck('two').deck.title, 'two')
  delete globalThis.indexedDB
})
