#!/usr/bin/env node
/**
 * Build script: parses every public/decks/<deck-id>/questions.md into
 * public/decks/<deck-id>/deck.json plus a global public/decks/index.json.
 *
 * The actual parsing lives in src/lib/parseDeckMd.ts (shared with the runtime
 * deck importer); Node ≥ 22.18 runs it directly via type stripping.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseDeckMarkdown, summarizeDeck } from '../src/lib/parseDeckMd.ts'

const decksDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'decks')

function main() {
  if (!existsSync(decksDir)) {
    console.error(`No decks directory at ${decksDir}`)
    process.exit(1)
  }
  const index = []
  for (const entry of readdirSync(decksDir)) {
    const dir = join(decksDir, entry)
    if (!statSync(dir).isDirectory()) continue
    const mdPath = join(dir, 'questions.md')
    if (!existsSync(mdPath)) continue

    const { deck, problems } = parseDeckMarkdown(entry, readFileSync(mdPath, 'utf8'))
    writeFileSync(join(dir, 'deck.json'), JSON.stringify(deck))

    const summary = summarizeDeck(deck)
    index.push(summary)
    console.log(
      `✓ ${entry}: ${summary.cardCount} cards, ${summary.moduleCount} modules, ${summary.exhibitCount} with exhibits, ${summary.checkpointCount} checkpoints`,
    )
    for (const p of problems) console.warn(`  ⚠ ${p}`)
  }
  writeFileSync(join(decksDir, 'index.json'), JSON.stringify({ decks: index }))
  console.log(`✓ index.json: ${index.length} deck(s)`)
}

main()
