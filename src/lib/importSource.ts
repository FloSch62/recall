/**
 * Turns user-supplied import input (pasted markdown, GitHub links, raw URLs)
 * into a parsed Deck ready to store. Fetched text is sniffed: JSON that looks
 * like a compiled deck.json is used directly, anything else is parsed as
 * questions.md markdown.
 */
import type { Card, Checkpoint, Deck } from './types'
// explicit .ts extension so Node can run this module too (build script / tests)
import { parseDeckMarkdown, slugify } from './parseDeckMd.ts'
import { checkpointAlignments } from './questStructure.ts'
import type { DeckSource } from './importedDecks'

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
  return { deck: { ...deck, id }, problems, source }
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
    if (typeof card.id !== 'string' || typeof card.questionHtml !== 'string' || !Array.isArray(card.options))
      throw new Error(`Card ${i + 1} is missing id, questionHtml or options.`)
    return {
      id: card.id,
      module: typeof card.module === 'number' ? card.module : 0,
      page: card.page ?? '',
      questionHtml: card.questionHtml,
      exhibits: Array.isArray(card.exhibits) ? card.exhibits : [],
      options: card.options,
      answer: card.answer ?? '',
      explanationHtml: card.explanationHtml ?? '',
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
    modules: Array.isArray(d.modules) ? d.modules : [],
    cards,
    checkpoints,
  }
  const misaligned = checkpointAlignments(deck).find((alignment) => !alignment.aligned)
  if (misaligned) throw new Error(`Checkpoint "${misaligned.id}" is not anchored to the start of a Quest lesson.`)
  return deck
}

/**
 * Map a GitHub link to candidate raw-file URLs, most specific first:
 *  - blob/raw file links     -> that exact file
 *  - tree (folder) links     -> <folder>/questions.md, <folder>/deck.json
 *  - bare repository links   -> questions.md / deck.json on the default branch
 *  - raw.githubusercontent   -> used as-is
 */
export async function githubRawCandidates(link: string): Promise<string[]> {
  let u: URL
  try {
    u = new URL(link)
  } catch {
    throw new Error('Not a valid URL.')
  }
  if (u.hostname === 'raw.githubusercontent.com' || u.hostname === 'gist.githubusercontent.com') return [u.href]
  if (u.hostname !== 'github.com' && u.hostname !== 'www.github.com')
    throw new Error('Expected a github.com or raw.githubusercontent.com link.')

  const parts = u.pathname.split('/').filter(Boolean)
  if (parts.length < 2) throw new Error('The GitHub link must point to a repository, folder or file.')
  const [owner, repo, kind, branch, ...rest] = parts
  const raw = (b: string, p: string) => `https://raw.githubusercontent.com/${owner}/${repo}/${b}/${p}`

  if ((kind === 'blob' || kind === 'raw') && branch && rest.length > 0) return [raw(branch, rest.join('/'))]
  if (kind === 'tree' && branch) {
    const prefix = rest.length > 0 ? `${rest.join('/')}/` : ''
    return [raw(branch, `${prefix}questions.md`), raw(branch, `${prefix}deck.json`)]
  }

  // Bare repo link — ask the API for the default branch, fall back to main/master.
  let branches = ['main', 'master']
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`)
    if (res.ok) {
      const info = (await res.json()) as { default_branch?: string }
      if (info.default_branch) branches = [info.default_branch]
    }
  } catch {
    // API unreachable or rate-limited — the fallback branches usually work
  }
  return branches.flatMap((b) => [raw(b, 'questions.md'), raw(b, 'deck.json')])
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

export async function importFromGithub(link: string): Promise<PreparedImport> {
  const { url, text } = await fetchFirst(await githubRawCandidates(link.trim()))
  return deckFromText(text, { type: 'github', url: link.trim(), rawUrl: url })
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
export async function refetchFromSource(source: DeckSource): Promise<PreparedImport> {
  if (source.type === 'manual') throw new Error('This deck was pasted manually and has no source URL.')
  const { text } = await fetchFirst([source.type === 'github' ? source.rawUrl : source.url])
  return deckFromText(text, source)
}
