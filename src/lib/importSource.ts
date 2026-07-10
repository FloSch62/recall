/**
 * Turns user-supplied import input (pasted markdown, GitHub links, raw URLs)
 * into a parsed Deck ready to store. Fetched text is sniffed: JSON that looks
 * like a compiled deck.json is used directly, anything else is parsed as
 * questions.md markdown.
 */
import type { Card, CardOption, Checkpoint, Deck, Exhibit, TopologySpec } from './types'
// explicit .ts extension so Node can run this module too (build script / tests)
import { parseDeckMarkdown, slugify } from './parseDeckMd.ts'
import { checkpointAlignments } from './questStructure.ts'
import type { DeckSource, GithubDeckSourceV2 } from './importedDecks'
import {
  discoverGithubDecks,
  fetchGithubAsset,
  fetchGithubFile,
  type DiscoveredGithubDeck,
} from './github.ts'

export interface PreparedImport {
  deck: Deck
  problems: string[]
  source: DeckSource
}

const FALLBACK_ID = 'imported-deck'

/** Parse fetched or pasted text as either a compiled deck.json or questions.md. */
export function deckFromText(text: string, source: DeckSource): PreparedImport {
  const trimmed = text.trim()
  if (!trimmed) throw new Error('The deck content is empty.')
  if (trimmed.startsWith('{')) return { deck: deckFromJson(trimmed), problems: [], source }

  const { deck, problems } = parseDeckMarkdown(FALLBACK_ID, trimmed)
  if (deck.title === FALLBACK_ID) problems.unshift('Deck has no "# Title" heading — using a placeholder title.')
  if (deck.cards.length === 0)
    throw new Error('No questions found. Expected markdown with **Q1.1**-style questions (see the deck format docs).')
  const id = slugify(deck.title) || FALLBACK_ID
  const parsed = { ...deck, id }
  validateDeckImageSources(parsed)
  return { deck: parsed, problems, source }
}

function validateImageSource(src: string, label: string): void {
  const scheme = src.match(/^([a-z][a-z0-9+.-]*):/i)?.[1].toLowerCase()
  if (!scheme) return
  if (scheme === 'http' || scheme === 'https') return
  if (scheme === 'data' && /^data:image\/[a-z0-9.+-]+(?:;[^,]*)?,/i.test(src)) return
  throw new Error(`${label} uses an unsafe image URL scheme.`)
}

function validateDeckImageSources(deck: Deck): void {
  for (const card of deck.cards) {
    for (const exhibit of card.exhibits) {
      if (exhibit.type === 'image') validateImageSource(exhibit.src, `Card ${card.id}`)
    }
  }
}

function normalizeExhibit(value: unknown, cardNumber: number, exhibitNumber: number): Exhibit {
  if (typeof value !== 'object' || value === null)
    throw new Error(`Card ${cardNumber} exhibit ${exhibitNumber} is invalid.`)
  const exhibit = value as Partial<Exhibit>
  if (exhibit.type === 'cli' && typeof exhibit.text === 'string') return { type: 'cli', text: exhibit.text }
  if (
    exhibit.type === 'topology' &&
    typeof exhibit.spec === 'object' &&
    exhibit.spec !== null &&
    Array.isArray((exhibit.spec as TopologySpec).nodes)
  )
    return { type: 'topology', spec: exhibit.spec as TopologySpec }
  if (exhibit.type === 'image' && typeof exhibit.src === 'string') {
    validateImageSource(exhibit.src, `Card ${cardNumber} exhibit ${exhibitNumber}`)
    return { type: 'image', src: exhibit.src }
  }
  throw new Error(`Card ${cardNumber} exhibit ${exhibitNumber} has an invalid type or content.`)
}

function deckFromJson(text: string): Deck {
  let v: unknown
  try {
    v = JSON.parse(text)
  } catch {
    throw new Error('The file starts with "{" but is not valid JSON.')
  }
  const d = v as Partial<Deck>
  if (typeof d !== 'object' || d === null || typeof d.title !== 'string' || !Array.isArray(d.cards))
    throw new Error('This JSON does not look like a Recall deck (expected "title" and "cards").')
  const cards = d.cards.map((c, i): Card => {
    const card = c as Partial<Card>
    if (
      typeof card.id !== 'string' ||
      typeof card.questionHtml !== 'string' ||
      !Array.isArray(card.options) ||
      typeof card.answer !== 'string' ||
      typeof card.explanationHtml !== 'string'
    )
      throw new Error(`Card ${i + 1} is missing id, questionHtml or options.`)
    const options = card.options.map((option, optionIndex): CardOption => {
      const candidate = option as Partial<CardOption>
      if (typeof candidate.key !== 'string' || typeof candidate.html !== 'string')
        throw new Error(`Card ${i + 1} option ${optionIndex + 1} is missing key or html.`)
      return { key: candidate.key, html: candidate.html }
    })
    return {
      id: card.id,
      module: typeof card.module === 'number' ? card.module : 0,
      page: typeof card.page === 'string' ? card.page : '',
      questionHtml: card.questionHtml,
      exhibits: Array.isArray(card.exhibits)
        ? card.exhibits.map((exhibit, exhibitIndex) => normalizeExhibit(exhibit, i + 1, exhibitIndex + 1))
        : [],
      options,
      answer: card.answer,
      explanationHtml: card.explanationHtml,
    }
  })
  if (cards.length === 0) throw new Error('The deck contains no cards.')
  const cardIds = new Set(cards.map((card) => card.id))
  const checkpointIds = new Set<string>()
  const checkpoints = Array.isArray(d.checkpoints)
    ? d.checkpoints.map((c, i): Checkpoint => {
        const checkpoint = c as Partial<Checkpoint>
        if (
          typeof checkpoint.id !== 'string' ||
          !/^[a-z0-9][a-z0-9-]*$/.test(checkpoint.id) ||
          typeof checkpoint.title !== 'string' ||
          !checkpoint.title.trim() ||
          typeof checkpoint.contentHtml !== 'string' ||
          !checkpoint.contentHtml.trim() ||
          typeof checkpoint.sources !== 'string' ||
          !checkpoint.sources.trim()
        )
          throw new Error(`Checkpoint ${i + 1} has an invalid id or is missing title, contentHtml or sources.`)
        if (checkpointIds.has(checkpoint.id)) throw new Error(`Duplicate checkpoint id "${checkpoint.id}".`)
        checkpointIds.add(checkpoint.id)
        const beforeCardId = typeof checkpoint.beforeCardId === 'string' ? checkpoint.beforeCardId : null
        if (beforeCardId && !cardIds.has(beforeCardId))
          throw new Error(`Checkpoint "${checkpoint.id}" references unknown card "${beforeCardId}".`)
        return {
          id: checkpoint.id,
          title: checkpoint.title,
          contentHtml: checkpoint.contentHtml,
          sources: typeof checkpoint.sources === 'string' ? checkpoint.sources : '',
          module: typeof checkpoint.module === 'number' ? checkpoint.module : 0,
          beforeCardId,
        }
      })
    : []
  const deck: Deck = {
    id: slugify(typeof d.id === 'string' ? d.id : d.title) || FALLBACK_ID,
    title: d.title,
    description: typeof d.description === 'string' ? d.description : '',
    modules: Array.isArray(d.modules) ? d.modules.filter((module): module is string => typeof module === 'string') : [],
    cards,
    checkpoints,
  }
  const misaligned = checkpointAlignments(deck).find((alignment) => !alignment.aligned)
  if (misaligned) throw new Error(`Checkpoint "${misaligned.id}" is not anchored to the start of a Quest lesson.`)
  validateDeckImageSources(deck)
  return deck
}

function sourceFor(candidate: DiscoveredGithubDeck): GithubDeckSourceV2 {
  return {
    type: 'github',
    version: 2,
    url: candidate.sourceUrl,
    owner: candidate.owner,
    repo: candidate.repo,
    ref: candidate.ref,
    path: candidate.path,
    visibility: candidate.visibility,
  }
}

function resolveRepositoryPath(sourceFile: string, image: string): string {
  const decoded = image.replace(/^\//, '')
  const base = image.startsWith('/') ? [] : sourceFile.split('/').slice(0, -1)
  for (const part of decoded.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') {
      if (base.length === 0) throw new Error(`Image path "${image}" escapes the repository root.`)
      base.pop()
    } else {
      base.push(part)
    }
  }
  return base.join('/')
}

function isRelativeImage(src: string): boolean {
  return !/^[a-z][a-z0-9+.-]*:/i.test(src) && !src.startsWith('//')
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return `data:${blob.type};base64,${btoa(binary)}`
}

async function embedPrivateImages(deck: Deck, candidate: DiscoveredGithubDeck, token: string): Promise<Deck> {
  const relative = new Set<string>()
  for (const card of deck.cards) {
    for (const exhibit of card.exhibits) {
      if (exhibit.type === 'image' && isRelativeImage(exhibit.src)) relative.add(exhibit.src)
    }
  }
  if (relative.size === 0) return deck

  const embedded = new Map(
    await Promise.all(
      [...relative].map(async (src) => {
        const path = resolveRepositoryPath(candidate.path, src)
        const blob = await fetchGithubAsset(candidate, path, token)
        return [src, await blobToDataUrl(blob)] as const
      }),
    ),
  )
  return {
    ...deck,
    cards: deck.cards.map((card) => ({
      ...card,
      exhibits: card.exhibits.map((exhibit) =>
        exhibit.type === 'image' && embedded.has(exhibit.src)
          ? { ...exhibit, src: embedded.get(exhibit.src)! }
          : exhibit,
      ),
    })),
  }
}

export async function prepareGithubImport(candidate: DiscoveredGithubDeck, token = ''): Promise<PreparedImport> {
  const source = sourceFor(candidate)
  const prepared = deckFromText(await fetchGithubFile(candidate, token), source)
  if (candidate.visibility !== 'private') return prepared
  return { ...prepared, deck: await embedPrivateImages(prepared.deck, candidate, token) }
}

/** Fetch the first candidate URL that answers 200; returns the winning URL and its text. */
export async function fetchFirst(urls: string[]): Promise<{ url: string; text: string }> {
  const failures: string[] = []
  for (const url of urls) {
    try {
      const res = await fetch(url)
      if (res.ok) return { url, text: await res.text() }
      failures.push(`${url} → HTTP ${res.status}`)
    } catch {
      failures.push(`${url} → network/CORS error`)
    }
  }
  throw new Error(`Could not fetch the deck:\n${failures.join('\n')}`)
}

export async function importFromGithub(link: string, token = ''): Promise<PreparedImport> {
  if (new URL(link.trim()).hostname === 'gist.githubusercontent.com') {
    const { url, text } = await fetchFirst([link.trim()])
    return deckFromText(text, { type: 'github', url: link.trim(), rawUrl: url })
  }
  const candidates = await discoverGithubDecks(link.trim(), token)
  if (candidates.length !== 1)
    throw new Error(`Found ${candidates.length} decks. Select the decks to import from the discovery list.`)
  return prepareGithubImport(candidates[0], token)
}

export async function importFromUrl(link: string): Promise<PreparedImport> {
  const trimmed = link.trim()
  try {
    new URL(trimmed)
  } catch {
    throw new Error('Not a valid URL.')
  }
  const { url, text } = await fetchFirst([trimmed])
  return deckFromText(text, { type: 'url', url })
}

/** Re-fetch a deck from its stored source (Update from source). */
export async function refetchFromSource(source: DeckSource, token = ''): Promise<PreparedImport> {
  if (source.type === 'manual') throw new Error('This deck was pasted manually and has no source URL.')
  if (source.type === 'github' && source.version === 2) {
    return prepareGithubImport(
      {
        owner: source.owner,
        repo: source.repo,
        ref: source.ref,
        path: source.path,
        sourceUrl: source.url,
        visibility: source.visibility,
      },
      token,
    )
  }
  const { text } = await fetchFirst([source.type === 'github' ? source.rawUrl : source.url])
  return deckFromText(text, source)
}
