/**
 * In-Memory Response Cache for expensive reads.
 * Real-time data (event config, team state, chat) is NOT cached here.
 */

const MAX_ENTRIES = 200
const stores = new Map()

function getStore(namespace) {
  if (!stores.has(namespace)) stores.set(namespace, new Map())
  return stores.get(namespace)
}

export function cacheGet(namespace, key = '_default') {
  const store = getStore(namespace)
  const entry = store.get(key)
  if (!entry) return undefined
  if (Date.now() > entry.expiresAt) { store.delete(key); return undefined }
  return entry.data
}

export function cacheSet(namespace, key = '_default', data, ttlMs = 30000) {
  const store = getStore(namespace)
  if (store.size >= MAX_ENTRIES) { store.delete(store.keys().next().value) }
  store.set(key, { data, expiresAt: Date.now() + ttlMs })
}

export function cacheInvalidate(namespace) {
  const store = stores.get(namespace)
  if (store) store.clear()
}

export function cacheInvalidateKey(namespace, key) {
  const store = stores.get(namespace)
  if (store) store.delete(key)
}

export async function cachedFetch(namespace, key, ttlMs, fetchFn) {
  const cached = cacheGet(namespace, key)
  if (cached !== undefined) return cached
  const fresh = await fetchFn()
  cacheSet(namespace, key, fresh, ttlMs)
  return fresh
}

export const CACHE_NS = {
  PROBLEM_STATEMENTS: 'problemStatements',
  ANNOUNCEMENTS: 'announcements',
  TIMELINE: 'timeline',
  PATRONS: 'patrons',
  SPONSORS: 'sponsors',
  ADMIN_STATS: 'adminStats',
  PUBLIC_EVENTS: 'publicEvents',
  RESULTS: 'results',
}

export const CACHE_TTL = {
  PROBLEM_STATEMENTS: 60000,
  ANNOUNCEMENTS: 30000,
  TIMELINE: 120000,
  PATRONS: 300000,
  SPONSORS: 300000,
  ADMIN_STATS: 15000,
  PUBLIC_EVENTS: 60000,
  RESULTS: 30000,
}

setInterval(() => {
  const now = Date.now()
  for (const [, store] of stores) {
    for (const [key, entry] of store) {
      if (now > entry.expiresAt) store.delete(key)
    }
  }
}, 5 * 60 * 1000).unref()
