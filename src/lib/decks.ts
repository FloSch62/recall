import { useEffect, useMemo, useState } from 'react'
import type { Deck, DeckIndex } from './types'
import { ensureLoaded, getImportedDeck, sourceBaseUrl, useImportedDecks, useImportedVersion } from './importedDecks'

const BASE = import.meta.env.BASE_URL

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to load ${url} (${res.status})`)
  return res.json() as Promise<T>
}

let indexPromise: Promise<DeckIndex> | null = null
function getBuiltinIndex(): Promise<DeckIndex> {
  indexPromise ??= fetchJson<DeckIndex>(`${BASE}decks/index.json`).catch((e: unknown) => {
    indexPromise = null
    throw e
  })
  return indexPromise
}

const deckCache = new Map<string, Promise<Deck>>()
function getBuiltinDeck(id: string): Promise<Deck> {
  let p = deckCache.get(id)
  if (!p) {
    p = fetchJson<Deck>(`${BASE}decks/${encodeURIComponent(id)}/deck.json`).catch((e: unknown) => {
      deckCache.delete(id)
      throw e
    })
    deckCache.set(id, p)
  }
  return p
}

/** Imported decks take precedence over a built-in deck with the same id. */
export async function getDeck(id: string): Promise<Deck> {
  await ensureLoaded()
  const imported = getImportedDeck(id)
  if (imported) return imported.deck
  return getBuiltinDeck(id)
}

export function imageUrl(deckId: string, rel: string): string {
  const imported = getImportedDeck(deckId)
  if (imported) {
    const base = sourceBaseUrl(imported.source)
    // manual imports have no base to resolve against — leave the path untouched
    return base ? new URL(rel, base).href : rel
  }
  return `${BASE}decks/${deckId}/${rel}`
}

interface Async<T> {
  value: T | null
  error: string | null
}

function useAsync<T>(factory: (() => Promise<T>) | null, key: string | undefined): Async<T> {
  const [state, setState] = useState<Async<T> & { key?: string }>({ value: null, error: null })
  useEffect(() => {
    if (!factory) return
    let cancelled = false
    setState({ value: null, error: null, key })
    factory().then(
      (value) => {
        if (!cancelled) setState({ value, error: null, key })
      },
      (e: unknown) => {
        if (!cancelled) setState({ value: null, error: e instanceof Error ? e.message : String(e), key })
      },
    )
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return state.key === key ? state : { value: null, error: null }
}

export function useDeckIndex(): { index: DeckIndex | null; error: string | null } {
  const { value, error } = useAsync(getBuiltinIndex, 'index')
  const imported = useImportedDecks()
  const index = useMemo(() => {
    if (!value || !imported.loaded) return null
    const shadowed = new Set(imported.summaries.map((s) => s.id))
    return { decks: [...value.decks.filter((d) => !shadowed.has(d.id)), ...imported.summaries] }
  }, [value, imported])
  return { index, error }
}

export function useDeck(id: string | undefined): { deck: Deck | null; error: string | null } {
  // re-fetch when imported decks change so replace/update/delete is reflected
  const version = useImportedVersion()
  const { value, error } = useAsync(id ? () => getDeck(id) : null, id ? `${id}@${version}` : undefined)
  return { deck: value, error }
}
