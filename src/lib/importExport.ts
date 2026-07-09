import { isProgressData, type LogEntry, type ProgressData } from './store'
import { todayKey } from './srs'

export interface ExportFile {
  app: 'recall'
  exportedAt: string
  data: ProgressData
}

export function exportProgress(data: ProgressData) {
  const file: ExportFile = { app: 'recall', exportedAt: new Date().toISOString(), data }
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `recall-progress-${todayKey(Date.now())}.json`
  a.click()
  URL.revokeObjectURL(url)
}

/** Accepts both the export wrapper and a raw ProgressData object. */
export function parseImport(text: string): ProgressData {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('Not a valid JSON file.')
  }
  const candidate =
    typeof parsed === 'object' && parsed !== null && 'app' in parsed && (parsed as ExportFile).app === 'recall'
      ? (parsed as ExportFile).data
      : parsed
  if (!isProgressData(candidate)) {
    throw new Error('This file does not look like a Recall progress export.')
  }
  return candidate
}

/**
 * Merge two progress snapshots (e.g. from two devices).
 * Per card the record with more activity wins; logs are unioned.
 */
export function mergeProgress(current: ProgressData, incoming: ProgressData): ProgressData {
  const cards = { ...current.cards }
  for (const [key, inc] of Object.entries(incoming.cards)) {
    const cur = cards[key]
    if (!cur) {
      cards[key] = inc
      continue
    }
    const curActivity = cur.reps + cur.seen
    const incActivity = inc.reps + inc.seen
    if (incActivity > curActivity || (incActivity === curActivity && inc.due > cur.due)) {
      cards[key] = inc
    }
  }

  const seen = new Set<string>()
  const log: LogEntry[] = []
  for (const entry of [...current.log, ...incoming.log]) {
    const k = `${entry.t}:${entry.deck}:${entry.card}:${entry.mode}`
    if (seen.has(k)) continue
    seen.add(k)
    log.push(entry)
  }
  log.sort((a, b) => a.t - b.t)

  const today = todayKey(Date.now())
  let day = current.day.date === today ? current.day : { date: today, byDeck: {} }
  if (incoming.day.date === today) {
    const byDeck = { ...day.byDeck }
    for (const [deck, c] of Object.entries(incoming.day.byDeck)) {
      const cur = byDeck[deck]
      byDeck[deck] = cur ? { n: Math.max(cur.n, c.n), r: Math.max(cur.r, c.r) } : c
    }
    day = { ...day, byDeck }
  }

  return { version: 1, settings: current.settings, cards, log, day }
}

export interface ImportSummary {
  cards: number
  reviews: number
  exportedAt: string | null
}

export function summarizeImport(text: string): { data: ProgressData; summary: ImportSummary } {
  const data = parseImport(text)
  let exportedAt: string | null = null
  try {
    const parsed = JSON.parse(text) as ExportFile
    if (parsed.app === 'recall' && typeof parsed.exportedAt === 'string') exportedAt = parsed.exportedAt
  } catch {
    // raw ProgressData without wrapper
  }
  return {
    data,
    summary: {
      cards: Object.keys(data.cards).length,
      reviews: data.log.length,
      exportedAt,
    },
  }
}
