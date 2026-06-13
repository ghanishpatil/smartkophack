import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db, isFirebaseConfigured } from '@/firebase/client.js'
import { publicApi } from '@/services/api.js'
import { getActivePhase } from '@/utils/phaseStatus.js'

const EventContext = createContext(null)

/**
 * EventProvider — single source of truth for event config.
 *
 * Strategy:
 * 1. Fetch event config from the API on mount (gets eventId + initial config).
 * 2. Once we have the eventId, open a Firestore onSnapshot listener on
 *    `events/{eventId}` — this pushes updates in ~100ms whenever admin
 *    changes phases, deadlines, or any event setting.
 * 3. The snapshot data is merged with the API-computed fields (activePhase,
 *    razorpayConfigured, etc.) so consumers always have a complete config.
 *
 * Result: phase changes by admin are reflected on participant dashboards
 * and submission pages instantly — no polling, no manual refresh needed.
 */
export function EventProvider({ children }) {
  const [eventId, setEventId] = useState(() => {
    try { return sessionStorage.getItem('skh_eventId') || '' } catch { return '' }
  })
  const [eventCfg, setEventCfg] = useState(null)
  const [loading, setLoading] = useState(true)
  // Keep a ref to the latest API-computed fields (activePhase, razorpayConfigured, etc.)
  // so we can merge them with Firestore snapshot updates
  const apiFieldsRef = useRef({})

  // Step 1: Fetch initial config from API (gets computed fields + eventId)
  useEffect(() => {
    let cancelled = false
    publicApi
      .getEventConfig()
      .then((cfg) => {
        if (cancelled || !cfg) return
        const id = String(cfg.eventId || '')
        if (id) {
          setEventId(id)
          try { sessionStorage.setItem('skh_eventId', id) } catch {}
        }
        // Store API-computed fields for merging with Firestore snapshots
        apiFieldsRef.current = {
          razorpayConfigured: cfg.razorpayConfigured,
          razorpayKeyId: cfg.razorpayKeyId,
          activePhase: cfg.activePhase,
        }
        setEventCfg(cfg)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  // Step 2: Real-time Firestore listener on events/{eventId}
  // Fires instantly whenever admin saves any change to the event document
  useEffect(() => {
    if (!eventId || !db || !isFirebaseConfigured()) return

    const unsub = onSnapshot(
      doc(db, 'events', eventId),
      (snap) => {
        if (!snap.exists()) return
        const data = snap.data()

        // Recompute activePhase from the fresh snapshot data
        const phases = Array.isArray(data.competitionPhases) ? data.competitionPhases : []
        const activePhase = getActivePhase(phases)

        setEventCfg((prev) => ({
          // Keep API-computed fields that Firestore doesn't have
          razorpayConfigured: apiFieldsRef.current.razorpayConfigured ?? prev?.razorpayConfigured,
          razorpayKeyId: apiFieldsRef.current.razorpayKeyId ?? prev?.razorpayKeyId,
          // Overwrite everything else from the live Firestore snapshot
          eventId,
          lifecyclePhase: data.lifecyclePhase || prev?.lifecyclePhase || '',
          registrationOpen: typeof data.registrationOpen === 'boolean' ? data.registrationOpen : prev?.registrationOpen,
          submissionsOpen: typeof data.submissionsOpen === 'boolean' ? data.submissionsOpen : prev?.submissionsOpen ?? false,
          evaluationsOpen: typeof data.evaluationsOpen === 'boolean' ? data.evaluationsOpen : prev?.evaluationsOpen ?? false,
          resultsPublished: typeof data.resultsPublished === 'boolean' ? data.resultsPublished : prev?.resultsPublished ?? false,
          entryFeeEnabled: typeof data.entryFeeEnabled === 'boolean' ? data.entryFeeEnabled : prev?.entryFeeEnabled,
          entryFeeAmount: typeof data.entryFeeAmount === 'number' ? data.entryFeeAmount : prev?.entryFeeAmount,
          currency: data.currency || prev?.currency || 'INR',
          minTeamSize: typeof data.minTeamSize === 'number' ? data.minTeamSize : prev?.minTeamSize ?? 2,
          maxTeamSize: typeof data.maxTeamSize === 'number' ? data.maxTeamSize : prev?.maxTeamSize ?? 4,
          registrationOpensAt: data.registrationOpensAt?.toDate?.()?.toISOString() ?? data.registrationOpensAt ?? prev?.registrationOpensAt ?? null,
          registrationClosesAt: data.registrationClosesAt?.toDate?.()?.toISOString() ?? data.registrationClosesAt ?? prev?.registrationClosesAt ?? null,
          submissionDeadline: data.submissionDeadline?.toDate?.()?.toISOString() ?? data.submissionDeadline ?? prev?.submissionDeadline ?? null,
          competitionPhases: phases,
          activePhase,
        }))
      },
      () => { /* ignore snapshot errors — API data is still available */ },
    )

    return () => unsub()
  }, [eventId])

  const setActiveEventId = useCallback(async () => {
    /* Single-hackathon install — scope is defined in Firestore, not switched in UI. */
  }, [])

  const value = useMemo(
    () => ({
      eventId,
      eventCfg,          // ← NEW: live event config available to all consumers
      eventLoading: loading,
      setActiveEventId,
    }),
    [eventId, eventCfg, loading, setActiveEventId],
  )

  return <EventContext.Provider value={value}>{children}</EventContext.Provider>
}

export function useEvent() {
  const ctx = useContext(EventContext)
  if (!ctx) throw new Error('useEvent must be used within EventProvider')
  return ctx
}
