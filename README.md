# Recall — markdown-fed spaced-repetition study app

An Anki-style learning app (React + Vite + MUI, pnpm) that turns markdown question
files into study decks. Decks are plain `questions.md` files — bundle them with the
app under `public/decks/`, or **import them at runtime**: paste markdown, load a
local file, or fetch from a GitHub repo / any URL.

## Features

- **Spaced repetition** (Anki-style SM-2): Again / Hard / Good / Easy with interval
  previews, learning steps (1m → 10m → 1d), lapses, daily new/review limits, undo.
- **Multiple choice** answering with instant feedback and explanations; accuracy is
  tracked separately from the schedule.
- **Deck import**: paste/upload a `questions.md`, or import from a GitHub link
  (repo, folder or file) or a direct URL. Imported decks are stored in the browser
  (IndexedDB) and can be updated from their source or removed at any time.
- **Exhibits**: fenced ```` ```cli ```` blocks render as terminal output; fenced
  ```` ```topology ```` blocks (JSON DSL) render as auto-laid-out network diagrams
  (React Flow) with spines/leaves/servers, LAG/eBGP links, AS groups and callouts.
- **Practice (cram) mode**: filter by module, shuffle, "weakest first", retry-wrong —
  never touches the review schedule.
- **Browse**: full-text search, module/state filters, per-card scheduling details.
- **Stats**: streak, reviews/day (30d), due forecast (14d), card states, per-module table.
- **Import/Export** of all progress as JSON (merge for multi-device sync, or replace).
- Dark/light/system theme, responsive desktop + phone layout, keyboard shortcuts
  (`A–D`/`1–4` answer · `Space` reveal/confirm · `1–4` grade · `U` undo).

Progress is stored in `localStorage`, imported decks in IndexedDB — both stay on
the device. Export progress regularly or before clearing browser data.

## Development

```sh
pnpm install
pnpm dev        # parses decks, serves on :5173
pnpm build      # typecheck + production build into dist/
pnpm decks      # re-parse decks only (run after editing questions.md)
```

Requires Node ≥ 22.18 (the build script imports the TypeScript deck parser
directly via type stripping).

## Importing decks

**Decks → Import deck** in the app offers three ways in:

1. **Paste / file** — paste `questions.md` content or load a local `.md`/`.json` file.
2. **GitHub** — a repository, folder or file link, e.g.
   `https://github.com/user/repo`,
   `https://github.com/user/repo/tree/main/decks/my-deck` or
   `https://github.com/user/repo/blob/main/decks/my-deck/questions.md`.
   Repo/folder links are searched for `questions.md` (or a compiled `deck.json`);
   the default branch is resolved via the GitHub API.
3. **URL** — a direct link to a `questions.md` or `deck.json`. The server must send
   CORS headers (raw.githubusercontent.com and most static hosts do).

Study progress is keyed by deck ID + question ID, so re-importing or updating a
deck with the same ID keeps your progress. Image exhibits in imported decks are
resolved relative to the source URL (pasted decks can't show relative images).

## Writing a deck

Bundled decks live in `public/decks/<deck-id>/questions.md` (compiled by
`pnpm decks`); imported decks use the exact same format. See
[`public/decks/networking-basics/questions.md`](public/decks/networking-basics/questions.md)
for a working example.

```markdown
# Deck title

Intro paragraph → becomes the deck description.

## Module 1 — First module title

### Optional page / context heading shown above each question

**Q1.1** Question text? Say "Consider the exhibit." when using one:

    ```cli
    A:leaf1# show network-instance summary
    ```

    ```topology
    { "nodes": [ { "id": "leaf1", "kind": "leaf" } ], "links": [] }
    ```

- A. First option.
- B. Second option.
- C. Third option.
- D. Fourth option.

<details><summary>Answer</summary>

**A** — Explanation for the answer.

</details>
```

(In a real file the exhibit fences are not indented — they sit at column 0 inside
the question body.) Topology JSON: `nodes` (`kind`: cloud/superspine/spine/leaf/
server/host/router/vm, optional `label`, `as`, `notes`, `tier`), `links`
(`from`/`to`, optional `label`, `fromEnd`/`toEnd`, `kind`: link/ebgp/lag/tunnel/down),
`groups` (AS boxes) and `callouts`. `![Exhibit](images/x.png)` images work too.

The parser warns about malformed questions (missing answer, answer not among
options, …) at build time and on the import preview. Raw `<tokens>` in text are
fine — everything is HTML-escaped before markdown rendering.

## Deploying to Cloudflare Pages (private, with auth)

Deploy with direct upload from CI (or your machine):

```sh
pnpm build
npx wrangler pages deploy dist --project-name recall
```

GitHub Actions example:

```yaml
on: { push: { branches: [main] } }
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - run: npx wrangler pages deploy dist --project-name recall
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

**Auth:** protect the Pages project with **Cloudflare Access** (Zero Trust →
Access → Applications → add the `*.pages.dev` domain / your custom domain, then a
policy such as "email is you@example.com" with One-Time PIN or Google login). No
app changes needed. Also disable the public `*.pages.dev` preview URLs or include
them in the Access application.

`public/_redirects` already contains the SPA fallback (`/* /index.html 200`).

## Repo layout

```
├── scripts/build-decks.mjs   # questions.md → deck.json + index.json (runs pre-dev/build)
├── public/decks/<deck-id>/   # bundled deck sources (questions.md [+ images])
└── src/
    ├── lib/                  # deck parser, imported-deck store (IndexedDB), srs
    │                         # scheduler, session queue, progress store, stats
    ├── components/           # question card, exhibits, grade bar, layout, …
    └── pages/                # decks, deck, study, practice, browse, import, stats, settings
```
