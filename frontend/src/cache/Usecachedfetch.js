// ─── useCachedFetch.js ────────────────────────────────────────────────────────
//
// React hook that wraps cachedFetch and returns { data, loading, error, refetch }
//
// Usage:
//   const { data: patients, loading, error, refetch } = useCachedFetch(
//     authFetch,
//     `${API_BASE_URL}/api/patients/`,
//     { ttl: 5 * 60 * 1000 }
//   )

import { useState, useEffect, useCallback, useRef } from 'react'
import { cachedFetch } from './Apicache'

/**
 * @param {Function}      authFetch  - authenticated fetch wrapper from AuthContext
 * @param {string|null}   url        - URL to fetch; pass null to skip fetching
 * @param {object}        [options]
 * @param {number}        [options.ttl=60000]  - cache TTL in ms
 * @param {any}           [options.initialData=null]
 */
export function useCachedFetch(authFetch, url, { ttl = 60_000, initialData = null } = {}) {
  const [data,    setData]    = useState(initialData)
  const [loading, setLoading] = useState(!!url)
  const [error,   setError]   = useState(null)

  // Keep a ref to the current URL so the refetch callback is always current
  const urlRef = useRef(url)
  useEffect(() => { urlRef.current = url }, [url])

  const fetchData = useCallback(async (force = false) => {
    const target = urlRef.current
    if (!target) return
    setLoading(true)
    setError(null)
    try {
      const result = await cachedFetch(authFetch, target, { ttl, force })
      setData(result)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [authFetch, ttl])

  useEffect(() => {
    if (!url) return
    fetchData()
  }, [url, fetchData])

  /** Call refetch() after a mutation to force a fresh network request. */
  const refetch = useCallback(() => fetchData(true), [fetchData])

  return { data, loading, error, refetch }
}