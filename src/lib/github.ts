const API_ROOT = 'https://api.github.com'
const API_VERSION = '2026-03-10'
const DECK_FILES = new Set(['questions.md', 'deck.json'])

export type GithubLinkKind = 'repository' | 'tree' | 'file'

export interface GithubLocation {
  owner: string
  repo: string
  kind: GithubLinkKind
  ref: string | null
  path: string
  url: string
}

export interface DiscoveredGithubDeck {
  owner: string
  repo: string
  ref: string
  path: string
  sourceUrl: string
  visibility: 'public' | 'private'
}

interface RepositoryInfo {
  default_branch: string
  private: boolean
}

interface TreeResponse {
  truncated: boolean
  tree: Array<{ path: string; type: string }>
}

interface GithubErrorBody {
  message?: string
}

export class GithubApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'GithubApiError'
    this.status = status
  }
}

function normalizeRepo(value: string): string {
  return value.endsWith('.git') ? value.slice(0, -4) : value
}

function decodePath(parts: string[]): string {
  try {
    return parts.map(decodeURIComponent).join('/')
  } catch {
    return parts.join('/')
  }
}

/** Parse github.com and raw.githubusercontent.com repository links. */
export function parseGithubLink(input: string): GithubLocation {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    throw new Error('Not a valid URL.')
  }

  const parts = url.pathname.split('/').filter(Boolean)
  if (url.hostname === 'raw.githubusercontent.com') {
    if (parts.length < 4) throw new Error('The raw GitHub link must point to a file.')
    const [owner, rawRepo, ref, ...path] = parts
    return {
      owner,
      repo: normalizeRepo(rawRepo),
      kind: 'file',
      ref: decodeURIComponent(ref),
      path: decodePath(path),
      url: url.href,
    }
  }

  if (url.hostname !== 'github.com' && url.hostname !== 'www.github.com') {
    throw new Error('Expected a github.com or raw.githubusercontent.com link.')
  }
  if (parts.length < 2) throw new Error('The GitHub link must point to a repository, folder or file.')

  const [owner, rawRepo, kind, ref, ...rest] = parts
  const repo = normalizeRepo(rawRepo)
  if (!kind) return { owner, repo, kind: 'repository', ref: null, path: '', url: url.href }
  if ((kind === 'tree' || kind === 'blob' || kind === 'raw') && ref) {
    const path = decodePath(rest)
    if (kind !== 'tree' && !path) throw new Error('The GitHub file link is missing a file path.')
    return {
      owner,
      repo,
      kind: kind === 'tree' ? 'tree' : 'file',
      ref: decodeURIComponent(ref),
      path,
      url: url.href,
    }
  }
  throw new Error('The GitHub link must point to a repository, folder or file.')
}

function requestHeaders(token: string, accept = 'application/vnd.github+json'): HeadersInit {
  return {
    Accept: accept,
    'X-GitHub-Api-Version': API_VERSION,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

async function githubError(response: Response, hasToken: boolean): Promise<GithubApiError> {
  let detail = ''
  try {
    const body = (await response.clone().json()) as GithubErrorBody
    detail = typeof body.message === 'string' ? body.message : ''
  } catch {
    // GitHub may return an empty or non-JSON body.
  }

  if (response.status === 401) return new GithubApiError('The GitHub token is invalid or has expired.', 401)
  if (response.status === 404) {
    return new GithubApiError(
      hasToken
        ? 'The repository or path was not found, or this token does not have access to it.'
        : 'The repository or path was not found. If it is private, enter a read-only GitHub token.',
      404,
    )
  }
  if (response.status === 403) {
    if (response.headers.get('X-RateLimit-Remaining') === '0')
      return new GithubApiError('GitHub API rate limit reached. Wait for the limit to reset or use a token.', 403)
    if (response.headers.get('X-GitHub-SSO'))
      return new GithubApiError('The token must be authorized for this organization\'s single sign-on.', 403)
    return new GithubApiError(
      'GitHub denied access. Check that the token is approved and has read-only Contents permission for this repository.',
      403,
    )
  }
  return new GithubApiError(
    `GitHub request failed (HTTP ${response.status})${detail ? `: ${detail}` : '.'}`,
    response.status,
  )
}

async function apiJson<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${API_ROOT}${path}`, { headers: requestHeaders(token) })
  if (!response.ok) throw await githubError(response, !!token)
  return response.json() as Promise<T>
}

function apiPath(owner: string, repo: string, path: string): string {
  const encoded = path
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/')
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encoded}`
}

function inSubtree(file: string, prefix: string): boolean {
  const clean = prefix.replace(/^\/+|\/+$/g, '')
  return !clean || file === clean || file.startsWith(`${clean}/`)
}

function sourceUrl(owner: string, repo: string, ref: string, path: string): string {
  return `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/blob/${encodeURIComponent(ref)}/${path
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`
}

/** Discover all Recall deck files below a GitHub repository/folder link. */
export async function discoverGithubDecks(input: string, token = ''): Promise<DiscoveredGithubDeck[]> {
  const location = parseGithubLink(input)
  const repoInfo = await apiJson<RepositoryInfo>(
    `/repos/${encodeURIComponent(location.owner)}/${encodeURIComponent(location.repo)}`,
    token,
  )
  const ref = location.ref ?? repoInfo.default_branch
  const visibility = repoInfo.private ? 'private' : 'public'

  if (location.kind === 'file') {
    const filename = location.path.split('/').at(-1) ?? ''
    if (!DECK_FILES.has(filename)) throw new Error('The GitHub file must be named questions.md or deck.json.')
    return [
      {
        owner: location.owner,
        repo: location.repo,
        ref,
        path: location.path,
        sourceUrl: location.url,
        visibility,
      },
    ]
  }

  const tree = await apiJson<TreeResponse>(
    `/repos/${encodeURIComponent(location.owner)}/${encodeURIComponent(location.repo)}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
    token,
  )
  if (tree.truncated) {
    throw new Error('This repository is too large for complete discovery. Paste a narrower deck folder or file link.')
  }

  const byDirectory = new Map<string, string>()
  for (const item of tree.tree) {
    if (item.type !== 'blob' || !inSubtree(item.path, location.path)) continue
    const parts = item.path.split('/')
    const filename = parts.at(-1) ?? ''
    if (!DECK_FILES.has(filename)) continue
    const directory = parts.slice(0, -1).join('/')
    const current = byDirectory.get(directory)
    if (!current || filename === 'questions.md') byDirectory.set(directory, item.path)
  }

  const paths = [...byDirectory.values()].sort((a, b) => a.localeCompare(b))
  if (paths.length === 0) throw new Error('No questions.md or deck.json files were found at this GitHub location.')
  return paths.map((path) => ({
    owner: location.owner,
    repo: location.repo,
    ref,
    path,
    sourceUrl: sourceUrl(location.owner, location.repo, ref, path),
    visibility,
  }))
}

/** Fetch raw repository content. Authorization is only ever sent to api.github.com. */
export async function fetchGithubFile(deck: DiscoveredGithubDeck, token = ''): Promise<string> {
  const url = new URL(`${API_ROOT}${apiPath(deck.owner, deck.repo, deck.path)}`)
  url.searchParams.set('ref', deck.ref)
  const response = await fetch(url, { headers: requestHeaders(token, 'application/vnd.github.raw+json') })
  if (!response.ok) throw await githubError(response, !!token)
  return response.text()
}

export async function fetchGithubAsset(
  source: Pick<DiscoveredGithubDeck, 'owner' | 'repo' | 'ref'>,
  path: string,
  token = '',
): Promise<Blob> {
  const url = new URL(`${API_ROOT}${apiPath(source.owner, source.repo, path)}`)
  url.searchParams.set('ref', source.ref)
  const response = await fetch(url, { headers: requestHeaders(token, 'application/vnd.github.raw+json') })
  if (!response.ok) throw await githubError(response, !!token)
  const blob = await response.blob()
  if (blob.type.startsWith('image/')) return blob
  const extension = path.split('.').at(-1)?.toLowerCase() ?? ''
  const mime = new Map([
    ['png', 'image/png'],
    ['jpg', 'image/jpeg'],
    ['jpeg', 'image/jpeg'],
    ['gif', 'image/gif'],
    ['webp', 'image/webp'],
    ['avif', 'image/avif'],
    ['svg', 'image/svg+xml'],
  ]).get(extension)
  if (!mime || (blob.type && blob.type !== 'application/octet-stream'))
    throw new Error(`Private exhibit "${path}" is not an image.`)
  return new Blob([await blob.arrayBuffer()], { type: mime })
}
