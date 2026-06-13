import { useEffect, useRef } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db, isFirebaseConfigured } from '@/firebase/client.js'

/**
 * Keeps an admin view live without losing server-side enrichment.
 *
 * Admin pages fetch enriched data through the backend API (e.g. api.adminTeams()
 * joins user/payment/derived fields). Reading raw Firestore docs on the client
 * would drop that enrichment. Instead, this hook subscribes to the underlying
 * Firestore collection(s) and, whenever they change, re-invokes the page's
 * existing `onChange` (the API re-fetch) — so the admin dashboard reflects
 * admin actions and participant activity in real time.
 *
 * The initial snapshot for each collection is ignored (the page already loads
 * once on mount), and rapid bursts (bulk writes) are debounced into a single
 * refresh.
 *
 * @param {string|string[]} collections  Collection name(s) to watch.
 * @param {() => void} onChange          Callback to run on change (usually `load`).
 * @param {{ debounceMs?: number, enabled?: boolean }} [opts]
 */
export function useRealtimeRefresh(collections, onChange, { debounceMs = 400, enabled = true } = {}) {
  const cbRef = useRef(onChange)
  useEffect(() => {
    cbRef.current = onChange
  }, [onChange])

  const key = (Array.isArray(collections) ? collections : [collections]).filter(Boolean).join(',')

  useEffect(() => {
    if (!enabled || !db || !isFirebaseConfigured() || !key) return undefined

    const names = key.split(',')
    const pendingFirst = new Set(names) // skip the first snapshot per collection
    let timer = null

    const trigger = (name) => {
      if (pendingFirst.has(name)) {
        pendingFirst.delete(name)
        return
      }
      clearTimeout(timer)
      timer = setTimeout(() => cbRef.current?.(), debounceMs)
    }

    const unsubs = names.map((name) =>
      onSnapshot(
        collection(db, name),
        () => trigger(name),
        () => { /* ignore permission/transient errors — API data still loads */ },
      ),
    )

    return () => {
      clearTimeout(timer)
      unsubs.forEach((u) => u())
    }
  }, [key, debounceMs, enabled])
}
