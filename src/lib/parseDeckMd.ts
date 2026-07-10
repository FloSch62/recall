/**
 * Parses a questions.md file into a Deck. Shared between the build script
 * (scripts/build-decks.mjs, via Node's type stripping) and the runtime deck
 * importer (Import page), so both produce identical decks.
 *
 * Expected markdown format (see public/decks/networking-basics/questions.md):
 *   # Deck title
 *   intro paragraph(s)  -> description
 *   ## Module heading
 *   ### Page / section heading
 *   ### Checkpoint stable-id — Reading checkpoint title
 *   <!-- Sources: pages X–Y -->
 *   **Q16.1** Question text (may span lines, may contain ![exhibit](images/x.png) and/or
 *   fenced ```cli / ```topology exhibit blocks)
 *   - A. option
 *   - B. option
 *   <details><summary>Answer</summary>
 *   **A** — explanation (may span lines)
 *   </details>
 */
import { marked } from 'marked'
import type { Card, CardOption, Checkpoint, Deck, DeckSummary, Exhibit, TopologySpec } from './types'
import { checkpointAlignments } from './questStructure.ts'

marked.setOptions({ gfm: true, breaks: false })

// Content contains literal tokens like `<ip>` or `lag<number>` that are not HTML.
// Escape everything before handing to marked so nothing is swallowed as a tag.
const escapeHtml = (s: string) =>
  s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

const mdBlock = (s: string) => marked.parse(escapeHtml(s.trim()), { async: false }).trim()
const mdInline = (s: string) => marked.parseInline(escapeHtml(s.trim()), { async: false }).trim()

const IMAGE_RE = /!\[([^\]]*)\]\(([^)\s]+)\)/g
const QUESTION_RE = /^\*\*(Q[^*]+)\*\*\s*(.*)$/
const OPTION_RE = /^- ([A-Z])\.\s+(.*)$/
const ANSWER_RE = /^\*\*([A-Z](?:\s*(?:,|and)\s*[A-Z])*)\*\*\s*[—–-]?\s*(.*)$/
const FENCE_RE = /^```(\w*)\s*$/
const CHECKPOINT_RE = /^### Checkpoint\s+([a-z0-9][a-z0-9-]*)\s+[—–-]\s+(.+)$/
const CHECKPOINT_SOURCE_RE = /^<!--\s*Sources:\s*(.*?)\s*-->$/i

const NODE_KINDS = new Set(['cloud', 'superspine', 'spine', 'leaf', 'server', 'host', 'router', 'vm'])
const LINK_KINDS = new Set(['link', 'ebgp', 'lag', 'tunnel', 'down'])

function validateTopology(spec: TopologySpec, id: string, problems: string[]) {
  if (!Array.isArray(spec.nodes) || spec.nodes.length === 0) {
    problems.push(`${id}: topology has no nodes`)
    return
  }
  const ids = new Set<string>()
  for (const n of spec.nodes) {
    if (!n.id) problems.push(`${id}: topology node without id`)
    else if (ids.has(n.id)) problems.push(`${id}: duplicate topology node id "${n.id}"`)
    ids.add(n.id)
    if (!NODE_KINDS.has(n.kind)) problems.push(`${id}: unknown topology node kind "${n.kind}"`)
  }
  for (const l of spec.links ?? []) {
    for (const end of [l.from, l.to])
      if (!ids.has(end)) problems.push(`${id}: topology link references unknown node "${end}"`)
    if (l.kind && !LINK_KINDS.has(l.kind)) problems.push(`${id}: unknown topology link kind "${l.kind}"`)
  }
  for (const g of spec.groups ?? [])
    for (const n of g.nodes ?? [])
      if (!ids.has(n)) problems.push(`${id}: topology group references unknown node "${n}"`)
  for (const c of spec.callouts ?? [])
    if (!ids.has(c.node)) problems.push(`${id}: topology callout references unknown node "${c.node}"`)
}

/** Split question body lines into markdown text + exhibits (cli/topology fences, images). */
function extractExhibits(qLines: string[], id: string, problems: string[]) {
  const textLines: string[] = []
  const exhibits: Exhibit[] = []
  for (let i = 0; i < qLines.length; i++) {
    const fence = qLines[i].match(FENCE_RE)
    if (!fence) {
      textLines.push(qLines[i])
      continue
    }
    const lang = fence[1] || 'cli'
    const buf: string[] = []
    i++
    while (i < qLines.length && !/^```\s*$/.test(qLines[i])) buf.push(qLines[i]), i++
    if (i >= qLines.length) problems.push(`${id}: unterminated \`\`\` fence`)
    const text = buf.join('\n').trimEnd()
    if (lang === 'topology') {
      try {
        const spec = JSON.parse(text) as TopologySpec
        validateTopology(spec, id, problems)
        exhibits.push({ type: 'topology', spec })
      } catch (e) {
        problems.push(`${id}: invalid topology JSON: ${e instanceof Error ? e.message : String(e)}`)
      }
    } else {
      exhibits.push({ type: 'cli', text })
    }
  }
  const cleaned = textLines.join('\n').replace(IMAGE_RE, (_, _alt: string, src: string) => {
    exhibits.push({ type: 'image', src })
    return ''
  })
  return { cleaned, exhibits }
}

interface PendingQuestion {
  id: string
  q: string[]
  options: { key: string; text: string }[]
  answer: string
  expl: string[]
}

interface PendingCheckpoint {
  id: string
  title: string
  body: string[]
  sources: string
  module: number
  cardIndex: number
}

export interface ParsedDeck {
  deck: Deck
  problems: string[]
}

export function parseDeckMarkdown(deckId: string, md: string): ParsedDeck {
  const lines = md.split(/\r?\n/)
  let title = deckId
  const descLines: string[] = []
  const modules: string[] = []
  const cards: Card[] = []
  const checkpointPositions: { checkpoint: Omit<Checkpoint, 'beforeCardId'>; cardIndex: number }[] = []
  const problems: string[] = []

  let page = ''
  let cur: PendingQuestion | null = null // question being accumulated
  let checkpoint: PendingCheckpoint | null = null
  let inDetails = false
  let sawFirstModule = false

  const flush = () => {
    if (!cur) return
    const { cleaned, exhibits } = extractExhibits(cur.q, cur.id, problems)
    const card: Card = {
      id: cur.id,
      module: Math.max(0, modules.length - 1),
      page,
      questionHtml: mdBlock(cleaned),
      exhibits,
      options: cur.options.map((o): CardOption => ({ key: o.key, html: mdInline(o.text) })),
      answer: cur.answer,
      explanationHtml: mdBlock(cur.expl.join('\n')),
    }
    if (card.options.length < 2) problems.push(`${cur.id}: only ${card.options.length} options`)
    if (!card.answer) problems.push(`${cur.id}: no answer found`)
    else if (!card.options.some((o) => o.key === card.answer))
      problems.push(`${cur.id}: answer "${card.answer}" not among options`)
    const saysExhibit = /consider the exhibit/i.test(cleaned)
    if (saysExhibit && exhibits.length === 0) problems.push(`${cur.id}: says "Consider the exhibit" but has none`)
    if (!saysExhibit && exhibits.length > 0) problems.push(`${cur.id}: has exhibit but does not say "Consider the exhibit"`)
    cards.push(card)
    cur = null
  }

  const flushCheckpoint = () => {
    if (!checkpoint) return
    const body = checkpoint.body.join('\n').trim()
    if (!checkpoint.title.trim()) problems.push(`Checkpoint ${checkpoint.id}: title is empty`)
    if (!body) problems.push(`Checkpoint ${checkpoint.id}: body is empty`)
    if (!checkpoint.sources) problems.push(`Checkpoint ${checkpoint.id}: no Sources comment found`)
    if (checkpointPositions.some((p) => p.checkpoint.id === checkpoint!.id))
      problems.push(`Checkpoint ${checkpoint.id}: duplicate id`)
    checkpointPositions.push({
      checkpoint: {
        id: checkpoint.id,
        title: checkpoint.title.trim(),
        contentHtml: mdBlock(body),
        sources: checkpoint.sources,
        module: checkpoint.module,
      },
      cardIndex: checkpoint.cardIndex,
    })
    checkpoint = null
  }

  let inFence = false
  for (const raw of lines) {
    const line = raw.trimEnd()

    // Inside a question, fenced exhibit blocks are kept verbatim and never
    // interpreted as options/headings/details markers.
    if (cur && !inDetails) {
      if (FENCE_RE.test(line)) {
        inFence = !inFence
        cur.q.push(line)
        continue
      }
      if (inFence) {
        cur.q.push(line)
        continue
      }
    }

    if (line.startsWith('## ') && !line.startsWith('###')) {
      flush()
      flushCheckpoint()
      modules.push(line.slice(3).trim())
      sawFirstModule = true
      continue
    }
    if (line.startsWith('### Checkpoint')) {
      flush()
      flushCheckpoint()
      const match = line.match(CHECKPOINT_RE)
      const id = match?.[1] ?? `invalid-${checkpointPositions.length + 1}`
      const title = match?.[2] ?? line.replace(/^### Checkpoint\s*/, '').trim()
      if (!match)
        problems.push(
          `Malformed checkpoint heading "${line.slice(4)}"; expected "### Checkpoint stable-id — Title"`,
        )
      checkpoint = {
        id,
        title,
        body: [],
        sources: '',
        module: Math.max(0, modules.length - 1),
        cardIndex: cards.length,
      }
      continue
    }
    if (line.startsWith('### ')) {
      flush()
      flushCheckpoint()
      page = line.slice(4).trim()
      continue
    }
    if (line.startsWith('# ') && title === deckId) {
      title = line.slice(2).trim()
      continue
    }

    const qm = line.match(QUESTION_RE)
    if (qm && !inDetails) {
      flush()
      flushCheckpoint()
      cur = { id: qm[1], q: qm[2] ? [qm[2]] : [], options: [], answer: '', expl: [] }
      continue
    }

    if (checkpoint) {
      const source = line.match(CHECKPOINT_SOURCE_RE)
      if (source) {
        if (checkpoint.sources) problems.push(`Checkpoint ${checkpoint.id}: multiple Sources comments found`)
        checkpoint.sources = source[1].trim()
      } else {
        checkpoint.body.push(line)
      }
      continue
    }

    if (!cur) {
      if (!sawFirstModule && line && line !== '---') descLines.push(line)
      continue
    }

    if (line.includes('<details')) {
      inDetails = true
      continue
    }
    if (line.includes('</details>')) {
      inDetails = false
      flush()
      continue
    }

    if (inDetails) {
      const am = !cur.answer && line.match(ANSWER_RE)
      if (am) {
        cur.answer = am[1].trim()
        if (am[2]) cur.expl.push(am[2])
      } else if (line) {
        cur.expl.push(line)
      }
      continue
    }

    const om = line.match(OPTION_RE)
    if (om) {
      cur.options.push({ key: om[1], text: om[2] })
      continue
    }

    if (cur.options.length > 0) {
      // continuation of the last option (wrapped line)
      if (line) cur.options[cur.options.length - 1].text += ' ' + line.trim()
    } else {
      cur.q.push(line)
    }
  }
  flush()
  flushCheckpoint()

  const checkpoints = checkpointPositions.map(({ checkpoint: value, cardIndex }): Checkpoint => ({
    ...value,
    beforeCardId: cards[cardIndex]?.id ?? null,
  }))
  const positions = new Set<number>()
  for (const { checkpoint: value, cardIndex } of checkpointPositions) {
    if (positions.has(cardIndex)) problems.push(`Checkpoint ${value.id}: another checkpoint uses the same position`)
    positions.add(cardIndex)
  }

  const description = descLines.join(' ').replace(/\s+/g, ' ').trim()
  const deck: Deck = {
    id: deckId,
    title,
    description: mdInline(description),
    modules,
    cards,
    checkpoints,
  }
  for (const alignment of checkpointAlignments(deck)) {
    if (!alignment.aligned)
      problems.push(
        `Checkpoint ${alignment.id}: anchor must be the first card of a Quest lesson${
          alignment.lessonKey ? ` (${alignment.lessonKey})` : ''
        }`,
      )
  }
  return {
    deck,
    problems,
  }
}

export function summarizeDeck(deck: Deck): DeckSummary {
  return {
    id: deck.id,
    title: deck.title,
    description: deck.description,
    cardCount: deck.cards.length,
    moduleCount: deck.modules.length,
    exhibitCount: deck.cards.filter((c) => c.exhibits.length > 0).length,
    checkpointCount: deck.checkpoints?.length ?? 0,
  }
}

/** Turn a deck title into a URL/storage-safe deck id. */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}
