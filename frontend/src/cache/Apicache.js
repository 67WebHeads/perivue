// ─── apiCache.js ──────────────────────────────────────────────────────────────
//
// Lightweight in-memory fetch cache.  Lives for the lifetime of the browser
// tab, so a hard refresh always starts fresh.
//
// Usage:
//   import { cachedFetch, invalidate, invalidatePrefix } from '../cache/apiCache'
//
//   // read (uses cache if fresh)
//   const data = await cachedFetch(authFetch, '/api/patients/', { ttl: 5 * 60 * 1000 })
//
//   // after a mutation, bust the relevant key(s)
//   invalidate('/api/patients/')
//   invalidatePrefix('/api/visual-tests/sessions/')   // busts all keys that start with this

// ── Store ─────────────────────────────────────────────────────────────────────

const store = new Map()
// store shape: key → { data, expiresAt, promise }

// ── Core read ─────────────────────────────────────────────────────────────────

/**
 * Fetch with caching.
 *
 * @param {Function} authFetch   - your authenticated fetch wrapper
 * @param {string}   url         - full URL to fetch (used as cache key)
 * @param {object}   [options]
 * @param {number}   [options.ttl=60000]  - cache lifetime in ms (default 60s)
 * @param {boolean}  [options.force]      - bypass cache and re-fetch
 * @returns {Promise<any>}        - parsed JSON
 */
export async function cachedFetch(authFetch, url, { ttl = 60_000, force = false } = {}) {
  const now = Date.now()
  const entry = store.get(url)

  // Return cached data if still fresh and not forced
  if (!force && entry && entry.expiresAt > now) {
    return entry.data
  }

  // If a request is already in-flight for this key, piggyback on it
  // (prevents duplicate parallel fetches when multiple components mount at once)
  if (entry?.promise) {
    return entry.promise
  }

  // Fire the real fetch
  const promise = authFetch(url)
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`)
      return res.json()
    })
    .then(data => {
      store.set(url, { data, expiresAt: Date.now() + ttl, promise: null })
      return data
    })
    .catch(err => {
      // On error, remove the in-flight marker so a retry is possible
      const current = store.get(url)
      if (current?.promise) store.delete(url)
      throw err
    })

  // Store the in-flight promise so concurrent callers can share it
  store.set(url, { ...(entry || {}), promise })

  return promise
}

// ── Invalidation ──────────────────────────────────────────────────────────────

/** Remove a single cached key — call this after any mutation on that resource. */
export function invalidate(url) {
  store.delete(url)
}

/**
 * Remove all cached keys that start with `prefix`.
 * Useful when you can't predict the exact URL (e.g. with query strings).
 *
 * invalidatePrefix('/api/patients/')  →  busts '/api/patients/?search=foo' too
 */
export function invalidatePrefix(prefix) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key)
  }
}

/** Nuke everything — useful on logout. */
export function invalidateAll() {
  store.clear()
}