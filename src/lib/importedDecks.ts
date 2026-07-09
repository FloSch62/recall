/**
 * Runtime-imported decks, persisted in IndexedDB (decks can be close to a MB,
 * which would crowd out the localStorage progress data). An in-memory mirror
 * keeps all reads synchronous after the initial load and feeds
 * useSyncExternalStore for reactivity.
 */
import { useSyncExternalStore } from 'react'
import type { Deck, DeckSummary } from './types'
import { summarizeDeck } from './parseDeckMd'

export type DeckSource =
  | { type: 'manual' }
  | { type: 'url'; url: string }
  | { type: 'github'; url: string; rawUrl: string }

export interface ImportedDeck {
  id: string
  deck: Deck
  source: DeckSource
  importedAt: number
  updatedAt: number
}

const DB_NAME = 'recall-decks'
const DB_STORE = 'decks'

function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, 1)
    open.onupgradeneeded = () => {
      if (!open.result.objectStoreNames.contains(DB_STORE)) open.result.createObjectStore(DB_STORE, { keyPath: 'id' })
    }
    open.onerror = () => reject(open.error ?? new Error('Could not open the deck database.'))
    open.onsuccess = () => {
      const db = open.result
      const tx = db.transaction(DB_STORE, mode)
      const req = run(tx.objectStore(DB_STORE))
      req.onerror = () => reject(req.error ?? new Error('Deck database error.'))
      tx.oncomplete = () => {
        db.close()
        resolve(req.result)
      }
      tx.onabort = () => {
        db.close()
        reject(tx.error ?? new Error('Deck database transaction aborted.'))
      }
    }
  })
}

let records = new Map<string, ImportedDeck>()
let loaded = false
let version = 0
let snapshot: { loaded: boolean; summaries: DeckSummary[] } = { loaded: false, summaries: [] }
const listeners = new Set<() => void>()

function rebuild() {
  const summaries = [...records.values()]
    .sort((a, b) => a.importedAt - b.importedAt)
    .map((r): DeckSummary => ({ ...summarizeDeck(r.deck), origin: 'imported' }))
  version++
  snapshot = { loaded, summaries }
  listeners.forEach((fn) => fn())
}

let loadPromise: Promise<void> | null = null
export function ensureLoaded(): Promise<void> {
  loadPromise ??= withStore('readonly', (s) => s.getAll() as IDBRequest<ImportedDeck[]>)
    .then((all) => {
      records = new Map(all.map((r) => [r.id, r]))
    })
    .catch(() => {
      // IndexedDB unavailable (private mode, storage denied) — run without imports
    })
    .then(() => {
      loaded = true
      rebuild()
    })
  return loadPromise
}
if (typeof indexedDB !== 'undefined') void ensureLoaded()

/** Synchronous lookup from the in-memory mirror; undefined until ensureLoaded resolves. */
export function getImportedDeck(id: string): ImportedDeck | undefined {
  return records.get(id)
}

/** Save (or replace, keeping the original import date) an imported deck. */
export async function saveImportedDeck(deck: Deck, source: DeckSource): Promise<ImportedDeck> {
  await ensureLoaded()
  const now = Date.now()
  const rec: ImportedDeck = {
    id: deck.id,
    deck,
    source,
    importedAt: records.get(deck.id)?.importedAt ?? now,
    updatedAt: now,
  }
  await withStore('readwrite', (s) => s.put(rec))
  records.set(rec.id, rec)
  rebuild()
  return rec
}

export async function deleteImportedDeck(id: string): Promise<void> {
  await ensureLoaded()
  await withStore('readwrite', (s) => s.delete(id))
  records.delete(id)
  rebuild()
}

/** Base URL that relative image paths in an imported deck resolve against. */
export function sourceBaseUrl(source: DeckSource): string | null {
  const url = source.type === 'github' ? source.rawUrl : source.type === 'url' ? source.url : null
  return url ? url.slice(0, url.lastIndexOf('/') + 1) : null
}

export function describeSource(source: DeckSource): string {
  return source.type === 'manual' ? 'pasted / local file' : source.url
}

const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function useImportedDecks(): { loaded: boolean; summaries: DeckSummary[] } {
  return useSyncExternalStore(subscribe, () => snapshot)
}

/** Bumps whenever imported decks change — used to re-key deck fetches. */
export function useImportedVersion(): number {
  return useSyncExternalStore(subscribe, () => version)
}
