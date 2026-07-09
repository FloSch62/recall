const CACHE_NAME = 'recall-v1'
const BASE_URL = self.registration.scope
const APP_SHELL_URL = new URL('index.html', BASE_URL).toString()

const PRECACHE_URLS = [
  '',
  'index.html',
  'manifest.webmanifest',
  'decks/index.json',
  'decks/networking-basics/deck.json',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-192.png',
  'icons/maskable-512.png',
  'icons/apple-touch-icon.png',
  'icons/recall-icon.svg',
].map((path) => new URL(path, BASE_URL).toString())

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  const scopeUrl = new URL(BASE_URL)
  if (url.origin !== scopeUrl.origin || !url.pathname.startsWith(scopeUrl.pathname)) return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstAppShell(request))
    return
  }

  event.respondWith(cacheFirst(request))
})

async function networkFirstAppShell(request) {
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME)
      await cache.put(APP_SHELL_URL, response.clone())
    }
    return response
  } catch {
    const cached = await caches.match(APP_SHELL_URL)
    return cached || Response.error()
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached

  const response = await fetch(request)
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME)
    await cache.put(request, response.clone())
  }
  return response
}
