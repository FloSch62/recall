import assert from 'node:assert/strict'
import test from 'node:test'
import { deckFromText } from '../src/lib/importSource.ts'
import { parseDeckMarkdown } from '../src/lib/parseDeckMd.ts'
import { buildQuest, checkpointAlignments } from '../src/lib/questStructure.ts'

const question = (id, answer = 'A') => `
**${id}** Which option is correct?

- A. Alpha.
- B. Beta.
- C. Gamma.
- D. Delta.

<details><summary>Answer</summary>

**${answer}** — The source confirms the answer.

</details>`

test('parses a grounded checkpoint without changing card page context', () => {
  const md = `# Checkpoint deck

Deck description.

## Module 1 — Foundations

### Page 10 — First topic

### Checkpoint foundations-start — Build the mental model

<!-- Sources: pages 10–12 -->

#### Essentials
- Learn the model before answering.

#### Key takeaway
The model connects the facts in the questions.
${question('Q10.1')}
${question('Q10.2')}
`
  const { deck, problems } = parseDeckMarkdown('checkpoint-deck', md)
  assert.deepEqual(problems, [])
  assert.equal(deck.description, 'Deck description.')
  assert.equal(deck.cards.length, 2)
  assert.equal(deck.cards[0].page, 'Page 10 — First topic')
  assert.deepEqual(deck.checkpoints, [
    {
      id: 'foundations-start',
      title: 'Build the mental model',
      contentHtml:
        '<h4>Essentials</h4>\n<ul>\n<li>Learn the model before answering.</li>\n</ul>\n<h4>Key takeaway</h4>\n<p>The model connects the facts in the questions.</p>',
      sources: 'pages 10–12',
      module: 0,
      beforeCardId: 'Q10.1',
    },
  ])
})

test('reports malformed, duplicate, ungrounded and empty checkpoints', () => {
  const md = `# Broken checkpoints

## Module 1

### Page 1

### Checkpoint bad heading

### Checkpoint same — First

<!-- Sources: page 1 -->

Body.

### Checkpoint same — Second

<!-- Sources: page 1 -->
${question('Q1.1')}
`
  const { problems } = parseDeckMarkdown('broken', md)
  assert.ok(problems.some((problem) => problem.startsWith('Malformed checkpoint heading')))
  assert.ok(problems.some((problem) => problem.includes('body is empty')))
  assert.ok(problems.some((problem) => problem.includes('no Sources comment')))
  assert.ok(problems.some((problem) => problem.includes('duplicate id')))
  assert.ok(problems.some((problem) => problem.includes('same position')))
})

test('compiled JSON remains backward compatible and retains new checkpoints', () => {
  const legacy = {
    id: 'legacy',
    title: 'Legacy',
    description: '',
    modules: ['Module 1'],
    cards: [
      {
        id: 'Q1.1',
        module: 0,
        page: 'Page 1',
        questionHtml: '<p>Question?</p>',
        exhibits: [],
        options: [
          { key: 'A', html: 'A' },
          { key: 'B', html: 'B' },
        ],
        answer: 'A',
        explanationHtml: '<p>Because.</p>',
      },
    ],
  }
  const oldDeck = deckFromText(JSON.stringify(legacy), { type: 'manual' }).deck
  assert.deepEqual(oldDeck.checkpoints, [])

  const checkpoint = {
    id: 'start',
    title: 'Foundation',
    contentHtml: '<p>Read this.</p>',
    sources: 'page 1',
    module: 0,
    beforeCardId: 'Q1.1',
  }
  const newDeck = deckFromText(JSON.stringify({ ...legacy, checkpoints: [checkpoint] }), { type: 'manual' }).deck
  assert.deepEqual(newDeck.checkpoints, [checkpoint])
})

test('interleaves checkpoints without changing existing lessons or keys', () => {
  const cards = Array.from({ length: 17 }, (_, i) => ({
    id: `Q${i + 1}.1`,
    module: 0,
    page: `Page ${i + 1}`,
    questionHtml: '<p>Question?</p>',
    exhibits: [],
    options: [],
    answer: 'A',
    explanationHtml: '',
  }))
  const base = { id: 'deck', title: 'Deck', description: '', modules: ['Module 1'], cards, checkpoints: [] }
  const original = buildQuest(base)
  const lessonStarts = original[0].lessons.map((lesson) => lesson.cards[0].id)
  const withCheckpoints = {
    ...base,
    checkpoints: [
      {
        id: 'start',
        title: 'Start',
        contentHtml: '<p>Start.</p>',
        sources: 'page 1',
        module: 0,
        beforeCardId: lessonStarts[0],
      },
      {
        id: 'middle',
        title: 'Middle',
        contentHtml: '<p>Middle.</p>',
        sources: 'pages 6–12',
        module: 0,
        beforeCardId: lessonStarts[1],
      },
    ],
  }
  const updated = buildQuest(withCheckpoints)
  assert.deepEqual(
    updated[0].lessons.map(({ key, cards: lessonCards }) => [key, lessonCards.map((card) => card.id)]),
    original[0].lessons.map(({ key, cards: lessonCards }) => [key, lessonCards.map((card) => card.id)]),
  )
  assert.deepEqual(
    updated[0].steps.map((step) => step.key),
    ['c-start', 'u0-l0', 'c-middle', 'u0-l1', 'u0-l2'],
  )
  assert.deepEqual(checkpointAlignments(withCheckpoints), [
    { id: 'start', lessonKey: 'u0-l0', aligned: true },
    { id: 'middle', lessonKey: 'u0-l1', aligned: true },
  ])
})

test('flags a checkpoint anchored inside an existing lesson', () => {
  const cards = Array.from({ length: 9 }, (_, i) => ({
    id: `Q${i + 1}.1`,
    module: 0,
    page: '',
    questionHtml: '',
    exhibits: [],
    options: [],
    answer: '',
    explanationHtml: '',
  }))
  const deck = {
    id: 'deck',
    title: 'Deck',
    description: '',
    modules: ['Module 1'],
    cards,
    checkpoints: [
      {
        id: 'misaligned',
        title: 'Misaligned',
        contentHtml: '<p>Text.</p>',
        sources: 'page 2',
        module: 0,
        beforeCardId: cards[1].id,
      },
    ],
  }
  assert.deepEqual(checkpointAlignments(deck), [{ id: 'misaligned', lessonKey: 'u0-l0', aligned: false }])
})
