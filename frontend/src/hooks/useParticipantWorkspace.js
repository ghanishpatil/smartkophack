import { useCallback, useEffect, useMemo, useState } from 'react'
import { collection, doc, getDoc, getDocs, onSnapshot } from 'firebase/firestore'
import { db, isFirebaseConfigured } from '@/firebase/client.js'
import { useAuth } from '@/context/AuthContext.jsx'
import { useEvent } from '@/context/EventContext.jsx'
import { useApi } from '@/hooks/useApi.js'
import { publicApi } from '@/services/api.js'

/**
 * Shared participant dashboard state.
 *
 * eventCfg now comes from EventContext which has a live Firestore onSnapshot
 * listener — phase/deadline changes by admin are reflected instantly.
 *
 * Team and submission data use Firestore onSnapshot too for real-time updates.
 */
export function useParticipantWorkspace() {
  const { profile, user, refreshProfile } = useAuth()
  const { eventId, eventCfg, eventLoading } = useEvent()
  const api = useApi()

  const [team, setTeam] = useState(null)
  const [submission, setSubmission] = useState(null)
  const [problems, setProblems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const teamId = profile?.teamId || ''

  // Real-time team listener
  useEffect(() => {
    if (!db || !teamId) { setTeam(null); return }
    const unsub = onSnapshot(
      doc(db, 'teams', teamId),
      (snap) => setTeam(snap.exists() ? { id: snap.id, ...snap.data() } : null),
      () => { /* ignore errors */ },
    )
    return () => unsub()
  }, [teamId])

  // Real-time submission listener
  useEffect(() => {
    if (!db || !teamId) { setSubmission(null); return }
    const unsub = onSnapshot(
      doc(db, 'submissions', teamId),
      (snap) => setSubmission(snap.exists() ? snap.data() : null),
      () => { /* ignore errors */ },
    )
    return () => unsub()
  }, [teamId])

  // Load problems once (they rarely change)
  useEffect(() => {
    if (!eventId) return
    let cancelled = false
    publicApi.listProblemStatements(eventId).catch(async () => {
      if (!db || !isFirebaseConfigured()) return []
      const snap = await getDocs(collection(db, 'problemStatements'))
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    }).then((probs) => {
      if (!cancelled) setProblems(Array.isArray(probs) ? probs : [])
    }).catch(() => {})
    return () => { cancelled = true }
  }, [eventId])

  // Loading state: done once eventCfg is available (from context) and team is resolved
  useEffect(() => {
    if (!eventLoading && eventCfg !== null) {
      setLoading(false)
    }
  }, [eventLoading, eventCfg])

  // Manual reload — refreshes problems and profile (team/submission/eventCfg are real-time)
  const reload = useCallback(async () => {
    setError('')
    try {
      const probs = await publicApi.listProblemStatements(eventId || undefined).catch(() => [])
      setProblems(Array.isArray(probs) ? probs : [])
      await refreshProfile()
    } catch (e) {
      setError(e?.message || 'Could not reload data.')
    }
  }, [eventId, refreshProfile])

  const selectedProblem = useMemo(
    () => problems.find((p) => p.id === team?.problemStatementId) || null,
    [problems, team?.problemStatementId],
  )

  const registrationBlockedReason = useMemo(() => {
    if (!eventCfg) return ''

    // Multi-phase system: registrationOpen flag is auto-managed by phase transitions
    // No need to check legacy lifecyclePhase field
    if (eventCfg.registrationOpen === false) return 'Registration is closed.'
    return ''
  }, [eventCfg])

  const paymentLabel =
    eventCfg?.entryFeeEnabled && eventCfg.entryFeeAmount > 0
      ? `${eventCfg.currency || 'INR'} ${eventCfg.entryFeeAmount}`
      : null

  return {
    user,
    profile,
    api,
    eventId,
    setActiveEventId: () => {},
    team,
    submission,
    eventCfg,
    problems,
    selectedProblem,
    loading,
    error,
    refreshProfile,
    refreshTeam: async () => {
      if (!db || !teamId) return
      const snap = await getDoc(doc(db, 'teams', teamId))
      setTeam(snap.exists() ? { id: snap.id, ...snap.data() } : null)
    },
    refreshSubmission: async () => {
      if (!db || !teamId) return
      const snap = await getDoc(doc(db, 'submissions', teamId))
      setSubmission(snap.exists() ? snap.data() : null)
    },
    reload,
    registrationBlockedReason,
    paymentLabel,
    teamId,
  }
}
