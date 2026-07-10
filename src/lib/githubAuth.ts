/**
 * GitHub credentials intentionally live only in this module's memory.
 * A full page reload, closing the app, or clearGithubToken() discards them.
 */
let token = ''

export function getGithubToken(): string {
  return token
}

export function setGithubToken(value: string): void {
  token = value.trim()
}

export function clearGithubToken(): void {
  token = ''
}
