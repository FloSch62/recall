import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import { deckFromText, prepareGithubImport } from '../src/lib/importSource.ts'
import { discoverGithubDecks, parseGithubLink } from '../src/lib/github.ts'

const json = (value, status = 200, headers = {}) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })

function mockFetch(t, implementation) {
  const original = globalThis.fetch
  globalThis.fetch = implementation
  t.after(() => {
    globalThis.fetch = original
  })
}

test('parses repository, folder, file, and raw GitHub links', () => {
  assert.deepEqual(parseGithubLink('https://github.com/acme/decks'), {
    owner: 'acme',
    repo: 'decks',
    kind: 'repository',
    ref: null,
    path: '',
    url: 'https://github.com/acme/decks',
  })
  assert.equal(parseGithubLink('https://github.com/acme/decks/tree/main/networking').path, 'networking')
  assert.equal(parseGithubLink('https://github.com/acme/decks/blob/main/networking/questions.md').kind, 'file')
  assert.equal(
    parseGithubLink('https://raw.githubusercontent.com/acme/decks/main/networking/questions.md').path,
    'networking/questions.md',
  )
})

test('discovers decks recursively and prefers questions.md over deck.json', async (t) => {
  const requests = []
  mockFetch(t, async (input, init) => {
    const url = String(input)
    requests.push({ url, headers: new Headers(init?.headers) })
    if (!url.includes('/git/trees/'))
      return json({ default_branch: 'trunk', private: true, html_url: 'https://github.com/acme/decks' })
    return json({
      truncated: false,
      tree: [
        { path: 'alpha/deck.json', type: 'blob' },
        { path: 'alpha/questions.md', type: 'blob' },
        { path: 'beta/deck.json', type: 'blob' },
        { path: 'notes/readme.md', type: 'blob' },
      ],
    })
  })

  const found = await discoverGithubDecks('https://github.com/acme/decks', 'secret-token')
  assert.deepEqual(
    found.map((deck) => deck.path),
    ['alpha/questions.md', 'beta/deck.json'],
  )
  assert.ok(found.every((deck) => deck.visibility === 'private' && deck.ref === 'trunk'))
  assert.ok(requests.every((request) => request.headers.get('Authorization') === 'Bearer secret-token'))
  assert.ok(requests.every((request) => request.headers.get('X-GitHub-Api-Version') === '2026-03-10'))
})

test('prepares a private deck and embeds authenticated relative images without persisting the token', async (t) => {
  const markdown = `# Private deck

## Module

**Q1.1** Consider the exhibit. Which option is correct?

![Exhibit](images/example.png)

- A. First
- B. Second

<details><summary>Answer</summary>

**A** — Correct.

</details>`
  const requests = []
  mockFetch(t, async (input, init) => {
    const url = new URL(String(input))
    requests.push({ url, headers: new Headers(init?.headers) })
    if (url.pathname.endsWith('/contents/course/questions.md'))
      return new Response(markdown, { headers: { 'Content-Type': 'text/plain' } })
    if (url.pathname.endsWith('/contents/course/images/example.png'))
      return new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'Content-Type': 'image/png' } })
    return json({ message: 'Not Found' }, 404)
  })

  const prepared = await prepareGithubImport(
    {
      owner: 'acme',
      repo: 'private-decks',
      ref: 'main',
      path: 'course/questions.md',
      sourceUrl: 'https://github.com/acme/private-decks/blob/main/course/questions.md',
      visibility: 'private',
    },
    'secret-token',
  )

  const image = prepared.deck.cards[0].exhibits.find((exhibit) => exhibit.type === 'image')
  assert.ok(image && image.src.startsWith('data:image/png;base64,'))
  assert.equal(prepared.source.type, 'github')
  assert.doesNotMatch(JSON.stringify(prepared.source), /secret-token/)
  assert.ok(requests.every((request) => request.headers.get('Authorization') === 'Bearer secret-token'))
})

test('returns actionable private-repository authentication errors', async (t) => {
  mockFetch(t, async () => json({ message: 'Bad credentials' }, 401))
  await assert.rejects(
    discoverGithubDecks('https://github.com/acme/private', 'expired-token'),
    /token is invalid or has expired/i,
  )
})

test('rejects unsafe compiled-deck image schemes', () => {
  const compiled = {
    id: 'unsafe',
    title: 'Unsafe',
    description: '',
    modules: ['One'],
    cards: [
      {
        id: 'Q1.1',
        module: 0,
        page: '',
        questionHtml: '<p>Question</p>',
        exhibits: [{ type: 'image', src: 'javascript:alert(1)' }],
        options: [
          { key: 'A', html: 'A' },
          { key: 'B', html: 'B' },
        ],
        answer: 'A',
        explanationHtml: '<p>Explanation</p>',
      },
    ],
    checkpoints: [],
  }
  assert.throws(() => deckFromText(JSON.stringify(compiled), { type: 'manual' }), /unsafe image URL scheme/i)
})

test('sanitizes executable HTML while preserving markdown formatting', async () => {
  const dom = new JSDOM('<!doctype html>')
  globalThis.window = dom.window
  try {
    const { sanitizeDeckHtml } = await import(`../src/lib/sanitizeHtml.ts?test=${Date.now()}`)
    const safe = sanitizeDeckHtml(
      '<p onclick="steal()"><strong>safe</strong><script>steal()</script><a href="javascript:steal()">link</a><img src=x onerror=steal()></p>',
    )
    assert.match(safe, /<strong>safe<\/strong>/)
    assert.doesNotMatch(safe, /onclick|script|javascript|onerror|<img/i)
  } finally {
    dom.window.close()
    delete globalThis.window
  }
})
