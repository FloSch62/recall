import { DAY_MS, MIN_MS } from './srs'

const HOUR_MS = 3_600_000

/** "8m", "3h", "12d", "2.5mo", "1.2y" — used for grade previews and due times. */
export function formatDelay(ms: number): string {
  if (ms < MIN_MS) return '<1m'
  if (ms < 100 * MIN_MS) return `${Math.round(ms / MIN_MS)}m`
  if (ms < 36 * HOUR_MS) return `${Math.round(ms / HOUR_MS)}h`
  const days = ms / DAY_MS
  if (days < 31) return `${Math.round(days)}d`
  if (days < 365) {
    const mo = days / 30.44
    return `${mo < 10 ? mo.toFixed(1) : Math.round(mo)}mo`
  }
  const y = days / 365.25
  return `${y < 10 ? y.toFixed(1) : Math.round(y)}y`
}

export function formatDueIn(due: number, now: number): string {
  if (due <= now) return 'now'
  return `in ${formatDelay(due - now)}`
}

export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

export function formatPercent(num: number, den: number): string {
  if (den === 0) return '–'
  return `${Math.round((num / den) * 100)}%`
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
}

/** Plain text from rendered HTML, for search and list snippets. */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;|&lt;|&gt;|&quot;|&#39;/g, (e) => ENTITIES[e])
    .replace(/\s+/g, ' ')
    .trim()
}
