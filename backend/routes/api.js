import { Router } from 'express'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { getDb } from '../services/firebaseAdmin.js'
import { verifyFirebaseToken, loadUserRole, requireRole, syncRoleClaim } from '../middleware/auth.js'
import { attachEventContext } from '../middleware/eventContext.js'
import { judgeMayEvaluateTeam } from '../services/eventConfig.js'
import {
  listPublicEvents,
  getActiveEventConfig,
  getActiveEvent,
  getEventDocById,
  setActiveEvent,
  invalidateEventCache,
} from '../services/eventsService.js'
import { evaluationPhaseAllowsJudge, isValidLifecyclePhase } from '../services/eventLifecycle.js'
import { getRazorpayPublicKeyId, isRazorpayConfigured } from '../services/razorpay.js'
import {
  cachedFetch,
  cacheInvalidate,
  CACHE_NS,
  CACHE_TTL,
} from '../services/responseCache.js'
import {
  normalizeJudgeScores,
  resolveEvaluationCriteria,
  defaultScoresFromCriteria,
  parseEvaluationCriteriaPayload,
  resolveScoringConfig,
  computePartTotal,
  computeFinalScorePct,
  normalizeCriteriaList,
} from '../utils/evaluationScores.js'
import { appendAuditLog } from '../services/auditLog.js'
import { clearTeamRegistration, teamHasRegistrationRecord } from '../services/clearTeamRegistration.js'
import {
  deriveRegistrationStatus,
  feeRequiredForEvent,
  isRegistrationComplete,
} from '../services/teamRegistration.js'
import { isValidDocId } from '../utils/sanitize.js'

function tsIso(ts) {
  if (!ts) return null
  if (typeof ts.toDate === 'function') return ts.toDate().toISOString()
  return null
}

function tsToMs(ts) {
  if (!ts) return null
  if (typeof ts.toMillis === 'function') return ts.toMillis()
  if (typeof ts.seconds === 'number') return ts.seconds * 1000
  return null
}

async function mergedPublicSnapshot(eventId) {
  const merged = await getActiveEventConfig()
  const rz = isRazorpayConfigured()
  // Include competition phases (publicly readable for participant UI)
  const phases = Array.isArray(merged.competitionPhases) ? merged.competitionPhases : []
  // Use the canonical getActivePhase() so the public snapshot, submission gating,
  // and participant UI all agree on what "active" means (manual ACTIVE override,
  // or date-driven UPCOMING within its window).
  const { getActivePhase } = await import('../services/competitionPhases.js')
  return {
    eventId: merged.eventId,
    lifecyclePhase: merged.lifecyclePhase,
    registrationOpen: merged.registrationOpen,
    submissionsOpen: merged.submissionsOpen,
    evaluationsOpen: merged.evaluationsOpen,
    resultsPublished: merged.resultsPublished,
    matchmakingEnabled: merged.matchmakingEnabled,
    entryFeeEnabled: merged.entryFeeEnabled,
    entryFeeAmount: merged.entryFeeAmount,
    currency: merged.currency,
    minTeamSize: merged.minTeamSize,
    maxTeamSize: merged.maxTeamSize,
    registrationOpensAt: tsIso(merged.registrationOpensAt),
    registrationClosesAt: tsIso(merged.registrationClosesAt),
    submissionDeadline: tsIso(merged.submissionDeadline),
    razorpayConfigured: rz,
    razorpayKeyId: rz ? getRazorpayPublicKeyId() : null,
    competitionPhases: phases,
    activePhase: getActivePhase({ competitionPhases: phases }),
  }
}

const r = Router()

r.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'skh-backend', time: new Date().toISOString() })
})

/**
 * Diagnostic endpoint — shows email + env config status WITHOUT exposing secrets.
 * Gated behind admin auth to prevent leaking deployment details.
 */
r.get('/health/email', verifyFirebaseToken, loadUserRole, requireRole('admin'), (_req, res) => {
  const brevoKey = process.env.BREVO_API_KEY || ''
  const fromAddr = process.env.EMAIL_FROM_ADDRESS || ''
  const frontendUrl = process.env.FRONTEND_URL || ''
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || ''
  const nodeEnv = process.env.NODE_ENV || 'development'
  const corsOrigin = process.env.CORS_ORIGIN || ''

  const checks = {
    nodeEnv,
    brevo: {
      configured: brevoKey.length > 0,
      keyPrefix: brevoKey ? brevoKey.slice(0, 12) + '...' : 'NOT SET',
      fromAddress: fromAddr || 'NOT SET',
      fromAddressWarning: (fromAddr.endsWith('@gmail.com') || fromAddr.endsWith('@yahoo.com'))
        ? 'Personal email — must be verified as sender in Brevo dashboard'
        : null,
    },
    frontendUrl: {
      value: frontendUrl || 'NOT SET',
      isLocalhost: frontendUrl.includes('localhost') || frontendUrl.includes('127.0.0.1'),
      warning: !frontendUrl
        ? 'FRONTEND_URL not set — email links will use placeholder'
        : frontendUrl.includes('localhost')
          ? 'FRONTEND_URL is localhost — email links will be broken in production'
          : null,
    },
    razorpay: {
      webhookSecretSet: webhookSecret.length > 0,
      webhookSecretIsUrl: webhookSecret.startsWith('http'),
      warning: !webhookSecret
        ? 'RAZORPAY_WEBHOOK_SECRET not set — payment webhooks will fail'
        : webhookSecret.startsWith('http')
          ? 'RAZORPAY_WEBHOOK_SECRET looks like a URL, not a secret — copy the signing secret from Razorpay dashboard'
          : null,
    },
    cors: {
      origin: corsOrigin || 'NOT SET (open in dev)',
      warning: nodeEnv === 'production' && !corsOrigin
        ? 'CORS_ORIGIN not set — server will refuse to start in production'
        : nodeEnv === 'production' && corsOrigin.includes('localhost')
          ? 'CORS_ORIGIN contains localhost in production — frontend requests will be blocked'
          : null,
    },
  }

  const warnings = []
  if (checks.brevo.fromAddressWarning) warnings.push(checks.brevo.fromAddressWarning)
  if (checks.frontendUrl.warning) warnings.push(checks.frontendUrl.warning)
  if (checks.razorpay.warning) warnings.push(checks.razorpay.warning)
  if (checks.cors.warning) warnings.push(checks.cors.warning)
  if (!checks.brevo.configured) warnings.push('BREVO_API_KEY not set — emails will not send')

  res.json({
    ok: warnings.length === 0,
    warnings,
    checks,
  })
})

/**
 * Email system health + stats endpoint for admin dashboard.
 * Shows SMTP/Brevo status + last 24h send stats.
 */
r.get('/admin/email-health', verifyFirebaseToken, loadUserRole, requireRole('admin'), async (_req, res) => {
  try {
    const { getEmailHealth } = await import('../services/emailService.js')
    const health = await getEmailHealth()
    res.json(health)
  } catch (error) {
    console.error('[API] /admin/email-health failed:', error)
    res.status(500).json({ error: 'Failed to check email health' })
  }
})

r.get('/events', async (_req, res, next) => {
  try {
    const data = await cachedFetch(CACHE_NS.PUBLIC_EVENTS, 'list', CACHE_TTL.PUBLIC_EVENTS, () =>
      listPublicEvents(80),
    )
    res.json(data)
  } catch (e) {
    next(e)
  }
})

/**
 * Public: Forgot password — generates a Firebase reset link via Admin SDK and
 * sends it through our email service (SMTP/Brevo) instead of Firebase's default
 * sender, which lands in spam. Always returns a generic success to avoid
 * revealing whether an email is registered (prevents account enumeration).
 */
const _forgotPwSeen = new Map() // ip -> last request ms (light in-memory throttle)
r.post('/auth/forgot-password', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase()
  const generic = { ok: true, message: 'If an account exists for that email, a reset link has been sent.' }
  try {
    if (!email || !email.includes('@')) return res.json(generic)

    // Light per-IP throttle (10s) to curb abuse
    const ip = (req.headers['x-forwarded-for']?.split(',')[0] || req.socket?.remoteAddress || '').trim()
    const now = Date.now()
    const last = _forgotPwSeen.get(ip) || 0
    if (now - last < 10_000) return res.json(generic)
    _forgotPwSeen.set(ip, now)
    if (_forgotPwSeen.size > 5000) _forgotPwSeen.clear()

    const { sendResetLinkViaBrevo } = await import('../services/leaderAccounts.js')
    // Fire-and-forget so we don't leak existence via timing; ignore result
    sendResetLinkViaBrevo(email).catch(() => {})
    return res.json(generic)
  } catch {
    return res.json(generic)
  }
})

r.get('/events/:eventId/public', async (req, res, next) => {
  try {
    const ev = await getEventDocById(req.params.eventId)
    if (!ev) return res.status(404).json({ error: 'Event not found' })
    const snapshot = await mergedPublicSnapshot(ev.id)
    res.json({ ...snapshot, name: ev.name || ev.id, slug: ev.slug || '', listedPublic: Boolean(ev.listedPublic) })
  } catch (e) {
    next(e)
  }
})

r.get('/event-config', async (req, res, next) => {
  try {
    const eventId = typeof req.query.eventId === 'string' ? req.query.eventId.trim() : null
    res.json(await mergedPublicSnapshot(eventId))
  } catch (e) {
    next(e)
  }
})

/** Public timeline (phases with dates for display) */
r.get('/timeline', async (req, res, next) => {
  try {
    const db = getDb()
    const activeEvent = await getActiveEvent()
    if (!activeEvent) return res.json({ phases: [] })

    const data = await cachedFetch(CACHE_NS.TIMELINE, activeEvent.id, CACHE_TTL.TIMELINE, async () => {
      const eventSnap = await db.doc(`events/${activeEvent.id}`).get()
      const evData = eventSnap.exists ? eventSnap.data() : {}
      const timelinePhases = Array.isArray(evData.timelinePhases) ? evData.timelinePhases : []
      return { phases: timelinePhases, eventId: activeEvent.id }
    })
    res.json(data)
  } catch (e) {
    next(e)
  }
})

r.get('/problem-statements', async (req, res, next) => {
  try {
    const db = getDb()
    if (!db) return res.json([])
    const activeEvent = await getActiveEvent()
    const eventId = activeEvent?.id
    if (!eventId) return res.json([])

    const data = await cachedFetch(CACHE_NS.PROBLEM_STATEMENTS, eventId, CACHE_TTL.PROBLEM_STATEMENTS, async () => {
      let snap
      if (eventId) {
        try {
          snap = await db.collection('problemStatements').where('eventId', '==', eventId).orderBy('order', 'asc').get()
        } catch {
          snap = await db.collection('problemStatements').where('eventId', '==', eventId).get()
        }
      } else {
        try {
          snap = await db.collection('problemStatements').orderBy('order', 'asc').get()
        } catch {
          snap = await db.collection('problemStatements').get()
        }
      }
      return snap.docs
        .map((d) => {
          const data = d.data()
          return {
            id: d.id,
            ...data,
            selectionCount: typeof data.selectionCount === 'number' ? data.selectionCount : 0,
          }
        })
        // SECURITY: participant-authored Open Innovation ideas are private.
        // They must never appear in the public/shared listing (this response is
        // cached per-event and served to everyone, including unauthenticated users).
        .filter((p) => p.visibility !== 'private')
    })
    res.json(data)
  } catch (e) {
    next(e)
  }
})

/** Public Results/Leaderboard - Only returns data when resultsPublished is true */
r.get('/results', async (req, res, next) => {
  try {
    const db = getDb()
    if (!db) return res.json({ published: false, teams: [] })
    const merged = await getActiveEventConfig()
    if (!merged.resultsPublished) return res.json({ published: false, teams: [] })

    const eventId = merged.eventId

    const data = await cachedFetch(CACHE_NS.RESULTS, eventId || '_global', CACHE_TTL.RESULTS, async () => {
      let teamsSnap
      if (eventId) {
        teamsSnap = await db.collection('teams').where('eventId', '==', eventId).limit(500).get()
      } else {
        teamsSnap = await db.collection('teams').limit(500).get()
      }
      const teams = teamsSnap.docs.map((d) => ({ id: d.id, ...d.data() }))

      // Problem statement → { title, domain (theme), track (category) }.
      let psSnap
      if (eventId) {
        psSnap = await db.collection('problemStatements').where('eventId', '==', eventId).limit(200).get()
      } else {
        psSnap = await db.collection('problemStatements').limit(200).get()
      }
      const psMap = {}
      psSnap.docs.forEach((d) => {
        const x = d.data()
        psMap[d.id] = { title: x.title || d.id, domain: x.theme || x.domain || '', track: x.category || '' }
      })

      // College per team — from the team leader's registration record.
      const mrSnap = await db.collection('memberRegistrations').limit(8000).get()
      const membersByTeam = {}
      mrSnap.docs.forEach((d) => {
        const m = d.data()
        const tid = m.teamId
        if (!tid) return
        ;(membersByTeam[tid] ||= []).push(m)
      })
      const collegeByTeam = {}
      for (const [tid, members] of Object.entries(membersByTeam)) {
        const sorted = members.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        const leader = sorted.find((m) => m.isLeader) || sorted[0] || {}
        collegeByTeam[tid] = leader.institute || leader.college || ''
      }

      // PUBLIC RESULTS POLICY: only teams marked "qualified" by the jury are
      // listed, and NO scores/ranks are exposed — just team, domain/track, college.
      const qualified = []
      for (const team of teams) {
        if (team.juryStatus !== 'qualified') continue
        const ps = team.problemStatementId ? psMap[team.problemStatementId] : null
        qualified.push({
          teamId: team.id,
          teamName: team.name || 'Unnamed',
          code: team.inviteCode || team.id.slice(0, 6),
          problemStatement: ps?.title || team.problemStatementId || '',
          domain: ps?.domain || '',
          track: ps?.track || '',
          college: collegeByTeam[team.id] || '',
        })
      }
      qualified.sort((a, b) => a.teamName.localeCompare(b.teamName))

      return { published: true, teams: qualified }
    })

    res.json(data)
  } catch (e) {
    next(e)
  }
})

r.get('/users/me', verifyFirebaseToken, loadUserRole, (req, res) => {
  const p = req.profile || {}
  res.json({
    uid: req.user.uid,
    email: req.user.email || p.email || '',
    role: p.role || 'participant',
    teamId: typeof p.teamId === 'string' ? p.teamId : '',
    activeEventId: typeof p.activeEventId === 'string' ? p.activeEventId : '',
    displayName: typeof p.displayName === 'string' ? p.displayName : '',
    photoURL: typeof p.photoURL === 'string' ? p.photoURL : '',
    institute: typeof p.institute === 'string' ? p.institute : '',
    trackChoice: typeof p.trackChoice === 'string' ? p.trackChoice : '',
    // Feature 3: Skill tags & profile
    skills: Array.isArray(p.skills) ? p.skills : [],
    bio: typeof p.bio === 'string' ? p.bio : '',
    lookingForTeam: typeof p.lookingForTeam === 'boolean' ? p.lookingForTeam : false,
    // First-login: forces password change (leader onboarding)
    mustChangePassword: p.mustChangePassword === true,
  })
})

r.patch('/users/active-event', verifyFirebaseToken, loadUserRole, async (req, res, next) => {
  try {
    const eventId = String(req.body?.eventId || '').trim()
    if (!eventId) return res.status(400).json({ error: 'eventId required' })
    const db = getDb()
    await db.doc(`users/${req.user.uid}`).set({ activeEventId: eventId, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
    res.json({ ok: true })
  } catch (e) {
    next(e)
  }
})

function parseOptionalTimestamp(v) {
  if (v == null || v === '') return null
  if (typeof v === 'string') {
    const d = new Date(v)
    if (Number.isNaN(d.getTime())) return null
    return Timestamp.fromDate(d)
  }
  return null
}

export function adminRouter() {
  const router = Router()
  const db = () => getDb()

  router.use(verifyFirebaseToken, loadUserRole, attachEventContext, requireRole('admin', 'viewer'))

  // Observer (viewer) role is STRICTLY READ-ONLY. Allow only safe GET requests;
  // reject every state-changing method so an Observer can never modify platform
  // data no matter which admin endpoint is hit. This is the authoritative
  // data-safety guard (the UI edit-hiding is only cosmetic on top of this).
  router.use((req, res, next) => {
    if (req.profile?.role === 'viewer' && req.method !== 'GET') {
      return res.status(403).json({ error: 'Read-only access — Observer accounts cannot make changes.' })
    }
    next()
  })

  /** Get competition phases for the active event */
  router.get('/phases', async (req, res, next) => {
    try {
      const activeEvent = await getActiveEvent()
      if (!activeEvent) return res.json({ phases: [], eventId: null })
      const eventRef = db().doc(`events/${activeEvent.id}`)
      const eventSnap = await eventRef.get()
      const data = eventSnap.data() || {}
      const { getPhases, PHASE_STATES } = await import('../services/competitionPhases.js')
      const phases = getPhases(data)
      
      // MIGRATION FIX: Auto-set registrationOpen flag if phase 1 is ACTIVE but flag isn't set
      // This ensures existing deployments work correctly after the auto-flag feature is deployed
      const hasActivePhaseOne = phases.some(p => p.order === 1 && p.status === PHASE_STATES.ACTIVE)
      if (hasActivePhaseOne && data.registrationOpen !== true) {
        await eventRef.set({ 
          registrationOpen: true, 
          updatedAt: FieldValue.serverTimestamp() 
        }, { merge: true })
        invalidateEventCache()
      }
      
      res.json({ phases, eventId: activeEvent.id })
    } catch (e) {
      next(e)
    }
  })

  /** Replace phases for the active event */
  router.put('/phases', async (req, res, next) => {
    try {
      const activeEvent = await getActiveEvent()
      if (!activeEvent) return res.status(503).json({ error: 'No active event.' })
      const phasesInput = Array.isArray(req.body?.phases) ? req.body.phases : []
      const { normalizePhase, PHASE_STATES } = await import('../services/competitionPhases.js')
      const normalized = []
      const seenIds = new Set()
      for (const p of phasesInput) {
        const n = normalizePhase(p)
        if (seenIds.has(n.id)) {
          return res.status(400).json({ error: `Duplicate phase id: ${n.id}` })
        }
        seenIds.add(n.id)
        normalized.push(n)
      }
      // Ensure only one phase is in ACTIVE state at a time
      const activeCount = normalized.filter((p) => p.status === PHASE_STATES.ACTIVE).length
      if (activeCount > 1) {
        return res.status(400).json({ error: 'Only one phase can be ACTIVE at a time.' })
      }

      await db().doc(`events/${activeEvent.id}`).set({
        competitionPhases: normalized,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: req.user.uid,
      }, { merge: true })

      // HIGH-03: Invalidate event cache — competitionPhases changed
      invalidateEventCache()

      await appendAuditLog({
        actorUid: req.user.uid,
        action: 'phases.update',
        targetType: 'event',
        targetId: activeEvent.id,
        metadata: {
          count: normalized.length,
          activePhaseId: normalized.find((p) => p.status === PHASE_STATES.ACTIVE)?.id || null,
        },
      })

      res.json({ ok: true, phases: normalized })
    } catch (e) {
      if (e.message) return res.status(400).json({ error: e.message })
      next(e)
    }
  })

  /** Transition a phase to a new state (state machine enforcement) */
  router.post('/phases/:phaseId/transition', async (req, res, next) => {
    try {
      const activeEvent = await getActiveEvent()
      if (!activeEvent) return res.status(503).json({ error: 'No active event.' })

      const { phaseId } = req.params
      const newStatus = String(req.body?.status || '').trim()
      const { PHASE_STATES, canTransition } = await import('../services/competitionPhases.js')

      if (!Object.values(PHASE_STATES).includes(newStatus)) {
        return res.status(400).json({ error: `Invalid status. Must be one of: ${Object.values(PHASE_STATES).join(', ')}` })
      }

      const eventRef = db().doc(`events/${activeEvent.id}`)
      const eventSnap = await eventRef.get()
      const phases = Array.isArray(eventSnap.data()?.competitionPhases) ? eventSnap.data().competitionPhases : []
      const idx = phases.findIndex((p) => p.id === phaseId)
      if (idx < 0) return res.status(404).json({ error: 'Phase not found.' })

      const phase = phases[idx]
      const fromStatus = phase.status

      if (!canTransition(fromStatus, newStatus)) {
        return res.status(400).json({
          error: `Invalid transition: ${fromStatus} → ${newStatus}. Check the state machine rules.`,
        })
      }

      // If activating, ensure no other phase is active
      if (newStatus === PHASE_STATES.ACTIVE) {
        const otherActive = phases.find((p) => p.id !== phaseId && p.status === PHASE_STATES.ACTIVE)
        if (otherActive) {
          return res.status(400).json({ error: `Phase "${otherActive.name}" is already ACTIVE. Lock it first.` })
        }
      }

      const updatedPhases = phases.map((p, i) => i === idx ? { ...p, status: newStatus } : p)
      
      // Auto-manage registrationOpen flag based on phase transitions
      const eventPatch = {
        competitionPhases: updatedPhases,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: req.user.uid,
      }
      
      // When activating a phase with order=1 (typically registration), auto-enable registration
      if (newStatus === PHASE_STATES.ACTIVE && phase.order === 1) {
        eventPatch.registrationOpen = true
      }
      
      // When locking or moving past the first phase, close registration
      if (newStatus === PHASE_STATES.SUBMISSION_LOCKED && phase.order === 1) {
        eventPatch.registrationOpen = false
      }

      // When any phase enters EVALUATION or SHORTLISTING, auto-enable judge scoring
      if (newStatus === PHASE_STATES.EVALUATION || newStatus === PHASE_STATES.SHORTLISTING) {
        eventPatch.evaluationsOpen = true
      }

      // When a phase moves out of EVALUATION/SHORTLISTING to COMPLETED/ARCHIVED,
      // close evaluations (only if no other phase is still in eval/shortlisting)
      if ((newStatus === PHASE_STATES.COMPLETED || newStatus === PHASE_STATES.ARCHIVED) &&
          (fromStatus === PHASE_STATES.EVALUATION || fromStatus === PHASE_STATES.SHORTLISTING)) {
        const anyOtherInEval = updatedPhases.some(p =>
          p.id !== phaseId && (p.status === PHASE_STATES.EVALUATION || p.status === PHASE_STATES.SHORTLISTING)
        )
        if (!anyOtherInEval) {
          eventPatch.evaluationsOpen = false
        }
      }
      
      // MIGRATION FIX: If any phase with order=1 is already ACTIVE, ensure registrationOpen is set
      // This handles existing deployments where phases were activated before this auto-flag logic
      const hasActivePhaseOne = updatedPhases.some(p => p.order === 1 && p.status === PHASE_STATES.ACTIVE)
      if (hasActivePhaseOne && eventSnap.data()?.registrationOpen !== true) {
        eventPatch.registrationOpen = true
      }
      
      await eventRef.set(eventPatch, { merge: true })

      // HIGH-03: Invalidate event cache — phase status changed
      invalidateEventCache()

      await appendAuditLog({
        actorUid: req.user.uid,
        action: 'phases.transition',
        targetType: 'phase',
        targetId: phaseId,
        metadata: { from: fromStatus, to: newStatus, phaseName: phase.name },
      })

      res.json({ ok: true, phaseId, from: fromStatus, to: newStatus })
    } catch (e) {
      next(e)
    }
  })

  /** Bulk shortlist teams for a specific phase */
  router.post('/phases/:phaseId/shortlist', async (req, res, next) => {
    try {
      const { phaseId } = req.params
      const teamIds = Array.isArray(req.body?.teamIds) ? req.body.teamIds : []
      if (teamIds.length === 0) return res.status(400).json({ error: 'teamIds required' })
      if (teamIds.length > 500) return res.status(400).json({ error: 'Max 500 teams per shortlist' })

      // HIGH-07: Use FieldValue.arrayUnion instead of read-modify-write loop.
      // arrayUnion is atomic and idempotent — safe under concurrent admin operations.
      // We still check existence to count actual updates, but no longer read the array.
      let updated = 0
      const skipped = []
      for (const teamId of teamIds) {
        const teamRef = db().doc(`teams/${teamId}`)
        const snap = await teamRef.get()
        if (!snap.exists) { skipped.push(teamId); continue }
        await teamRef.set({
          shortlistedPhases: FieldValue.arrayUnion(phaseId),
          shortlisted: true,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true })
        updated++
      }

      await appendAuditLog({
        actorUid: req.user.uid,
        action: 'phases.shortlist',
        targetType: 'phase',
        targetId: phaseId,
        metadata: { count: updated, skipped: skipped.length },
      })

      res.json({ ok: true, shortlisted: updated, skipped })
    } catch (e) {
      next(e)
    }
  })

  /** Remove teams from a phase shortlist */
  router.post('/phases/:phaseId/unshortlist', async (req, res, next) => {
    try {
      const { phaseId } = req.params
      const teamIds = Array.isArray(req.body?.teamIds) ? req.body.teamIds : []
      if (teamIds.length === 0) return res.status(400).json({ error: 'teamIds required' })

      // HIGH-07: Use FieldValue.arrayRemove inside a transaction so the
      // `shortlisted` flag is derived from a fresh read — prevents two concurrent
      // unshortlist (or shortlist) operations from leaving the flag inconsistent.
      let updated = 0
      for (const teamId of teamIds) {
        const teamRef = db().doc(`teams/${teamId}`)
        const didRemove = await db().runTransaction(async (tx) => {
          const snap = await tx.get(teamRef)
          if (!snap.exists) return false
          const currentPhases = Array.isArray(snap.data().shortlistedPhases) ? snap.data().shortlistedPhases : []
          if (!currentPhases.includes(phaseId)) return false // Not in list — skip

          const remaining = currentPhases.filter((p) => p !== phaseId)
          tx.set(teamRef, {
            shortlistedPhases: FieldValue.arrayRemove(phaseId),
            // Clear the flag only if this was the team's last shortlisted phase.
            shortlisted: remaining.length > 0,
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true })
          return true
        })
        if (didRemove) updated++
      }

      await appendAuditLog({
        actorUid: req.user.uid,
        action: 'phases.unshortlist',
        targetType: 'phase',
        targetId: phaseId,
        metadata: { count: updated },
      })

      res.json({ ok: true, removed: updated })
    } catch (e) {
      next(e)
    }
  })

  router.get('/evaluation-criteria', async (req, res, next) => {
    try {
      const activeEvent = await getActiveEvent()
      const eventId = activeEvent?.id
      if (!eventId) {
        return res.status(503).json({ error: 'Hackathon configuration is not ready yet. Retry shortly.' })
      }
      const merged = await getActiveEventConfig()
      const criteria = resolveEvaluationCriteria(merged)
      // Also surface the event-level two-part (Finals) rubric config so the
      // Evaluations page can show/edit two rubric uploaders.
      res.json({
        eventId,
        criteria,
        scoringMode: merged.scoringMode === 'twoPart' ? 'twoPart' : 'single',
        criteriaA: normalizeCriteriaList(Array.isArray(merged.evaluationCriteriaA) ? merged.evaluationCriteriaA : []),
        criteriaB: normalizeCriteriaList(Array.isArray(merged.evaluationCriteriaB) ? merged.evaluationCriteriaB : []),
        partAWeight: typeof merged.partAWeight === 'number' ? merged.partAWeight : 50,
        partBWeight: typeof merged.partBWeight === 'number' ? merged.partBWeight : 50,
        partALabel: typeof merged.partALabel === 'string' && merged.partALabel ? merged.partALabel : 'Part A',
        partBLabel: typeof merged.partBLabel === 'string' && merged.partBLabel ? merged.partBLabel : 'Part B',
      })
    } catch (e) {
      next(e)
    }
  })

  router.get('/events', async (_req, res, next) => {
    try {
      const snap = await db().collection('events').limit(100).get()
      res.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    } catch (e) {
      next(e)
    }
  })

  router.post('/events', async (req, res, next) => {
    try {
      const { id, name, lifecyclePhase = 'DRAFT', listedPublic = false, setAsDefault } = req.body || {}
      const docId =
        id && String(id).trim() ? String(id).trim().slice(0, 128) : db().collection('events').doc().id
      const phase = isValidLifecyclePhase(lifecyclePhase) ? lifecyclePhase : 'DRAFT'
      await db()
        .doc(`events/${docId}`)
        .set(
          {
            name: String(name || docId).slice(0, 200),
            slug: String(req.body?.slug || '').slice(0, 80),
            lifecyclePhase: phase,
            listedPublic: Boolean(listedPublic),
            entryFeeEnabled: Boolean(req.body?.entryFeeEnabled === true),
            entryFeeAmount: typeof req.body?.entryFeeAmount === 'number' ? req.body.entryFeeAmount : 0,
            currency: typeof req.body?.currency === 'string' ? req.body.currency.slice(0, 8) : 'INR',
            registrationOpen: typeof req.body?.registrationOpen === 'boolean' ? req.body.registrationOpen : true,
            active: Boolean(setAsDefault === true), // Phase 8: Set active flag directly
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: req.user.uid,
          },
          { merge: true },
        )
      // Phase 8: Set as active event if requested
      if (setAsDefault === true) await setActiveEvent(docId)
      await appendAuditLog({
        actorUid: req.user.uid,
        action: 'event.create',
        targetType: 'event',
        targetId: docId,
        metadata: { lifecyclePhase: phase },
      })
      res.json({ ok: true, eventId: docId })
    } catch (e) {
      next(e)
    }
  })

  router.patch('/events/:eventId', async (req, res, next) => {
    try {
      const eventId = req.params.eventId
      const ref = db().doc(`events/${eventId}`)
      const snap = await ref.get()
      if (!snap.exists) return res.status(404).json({ error: 'Event not found' })
      const body = req.body || {}
      const patch = { updatedAt: FieldValue.serverTimestamp(), updatedBy: req.user.uid }
      if (typeof body.name === 'string') patch.name = body.name.slice(0, 200)
      if (typeof body.slug === 'string') patch.slug = body.slug.slice(0, 80)
      if (typeof body.listedPublic === 'boolean') patch.listedPublic = body.listedPublic
      if (body.lifecyclePhase != null && isValidLifecyclePhase(body.lifecyclePhase)) patch.lifecyclePhase = body.lifecyclePhase
      const boolKeys = ['registrationOpen', 'submissionsOpen', 'evaluationsOpen', 'resultsPublished', 'entryFeeEnabled', 'matchmakingEnabled']
      for (const k of boolKeys) {
        if (typeof body[k] === 'boolean') patch[k] = body[k]
      }
      if (typeof body.entryFeeAmount === 'number' && body.entryFeeAmount >= 0) patch.entryFeeAmount = body.entryFeeAmount
      if (typeof body.currency === 'string' && body.currency.length <= 8) patch.currency = body.currency.trim()
      
      // Phase 6: Team size validation
      if (typeof body.minTeamSize === 'number' && body.minTeamSize >= 1 && body.minTeamSize <= 10) {
        patch.minTeamSize = Math.floor(body.minTeamSize)
      }
      if (typeof body.maxTeamSize === 'number' && body.maxTeamSize >= 1 && body.maxTeamSize <= 10) {
        patch.maxTeamSize = Math.floor(body.maxTeamSize)
      }

      const o = parseOptionalTimestamp(body.registrationOpensAt)
      if (o) patch.registrationOpensAt = o
      if (body.registrationOpensAt === null) patch.registrationOpensAt = FieldValue.delete()
      const c = parseOptionalTimestamp(body.registrationClosesAt)
      if (c) patch.registrationClosesAt = c
      if (body.registrationClosesAt === null) patch.registrationClosesAt = FieldValue.delete()
      const s = parseOptionalTimestamp(body.submissionDeadline)
      if (s) patch.submissionDeadline = s
      if (body.submissionDeadline === null) patch.submissionDeadline = FieldValue.delete()

      if (body.evaluationCriteria !== undefined) {
        if (body.evaluationCriteria === null) {
          patch.evaluationCriteria = FieldValue.delete()
        } else {
          const parsed = parseEvaluationCriteriaPayload(body.evaluationCriteria)
          if (!parsed.ok) return res.status(400).json({ error: parsed.error })
          patch.evaluationCriteria = parsed.criteria
        }
      }

      // Two-part (Finals 50:50) event-level rubric config. Lets the admin upload
      // two rubric sheets (Part A + Part B) from the Evaluations page and flip
      // the whole active evaluation into two-evaluation mode.
      if (body.scoringMode !== undefined) {
        patch.scoringMode = body.scoringMode === 'twoPart' ? 'twoPart' : 'single'
      }
      if (body.evaluationCriteriaA !== undefined) {
        if (body.evaluationCriteriaA === null) {
          patch.evaluationCriteriaA = FieldValue.delete()
        } else {
          const parsedA = parseEvaluationCriteriaPayload(body.evaluationCriteriaA)
          if (!parsedA.ok) return res.status(400).json({ error: `Part A: ${parsedA.error}` })
          patch.evaluationCriteriaA = parsedA.criteria
        }
      }
      if (body.evaluationCriteriaB !== undefined) {
        if (body.evaluationCriteriaB === null) {
          patch.evaluationCriteriaB = FieldValue.delete()
        } else {
          const parsedB = parseEvaluationCriteriaPayload(body.evaluationCriteriaB)
          if (!parsedB.ok) return res.status(400).json({ error: `Part B: ${parsedB.error}` })
          patch.evaluationCriteriaB = parsedB.criteria
        }
      }
      if (typeof body.partAWeight === 'number' && body.partAWeight >= 0) patch.partAWeight = Math.min(1000, body.partAWeight)
      if (typeof body.partBWeight === 'number' && body.partBWeight >= 0) patch.partBWeight = Math.min(1000, body.partBWeight)
      if (typeof body.partALabel === 'string') patch.partALabel = body.partALabel.trim().slice(0, 80)
      if (typeof body.partBLabel === 'string') patch.partBLabel = body.partBLabel.trim().slice(0, 80)

      await ref.set(patch, { merge: true })
      // Phase 8: Set as active event if requested
      if (body.setAsDefault === true) await setActiveEvent(eventId)
      // HIGH-03: Invalidate event cache — event config fields may have changed
      invalidateEventCache()
      await appendAuditLog({
        actorUid: req.user.uid,
        action: 'event.patch',
        targetType: 'event',
        targetId: eventId,
        metadata: { keys: Object.keys(patch) },
      })
      res.json({ ok: true })
    } catch (e) {
      next(e)
    }
  })

  router.get('/audit-logs', async (req, res, next) => {
    try {
      const lim = Math.min(Number(req.query.limit) || 100, 500)
      const snap = await db().collection('auditLogs').orderBy('createdAt', 'desc').limit(lim).get()
      res.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    } catch (e) {
      next(e)
    }
  })

  router.get('/stats', async (req, res, next) => {
    try {
      const rawAll = req.query.all === '1'
      const eventId = rawAll ? '' : typeof req.query.eventId === 'string' ? req.query.eventId.trim() : req.eventId

      const statsData = await cachedFetch(CACHE_NS.ADMIN_STATS, eventId || '_all', CACHE_TTL.ADMIN_STATS, async () => {
        let teamsQ = db().collection('teams').limit(800)
        if (eventId) teamsQ = teamsQ.where('eventId', '==', eventId)
        const teamsSnap = await teamsQ.get()
        const teams = teamsSnap.docs.map((d) => ({ id: d.id, ...d.data() }))

      const startToday = new Date()
      startToday.setHours(0, 0, 0, 0)
      const startTodayMs = startToday.getTime()

      const merged = await getActiveEventConfig()

      let registrationsToday = 0
      for (const t of teams) {
        if (!isRegistrationComplete(t, merged)) continue
        const ms = tsToMs(t.eventRegisteredAt)
        if (ms != null && ms >= startTodayMs) registrationsToday += 1
      }

      const feeRequired = feeRequiredForEvent(merged)
      const registered = teams.filter((t) => isRegistrationComplete(t, merged)).length
      const pendingPay = teams.filter((t) => {
        const ps = String(t.paymentStatus || '')
        return ps === 'pending' && (t.registrationRequestedAt || t.eventRegistered || t.registrationStatus === 'pending')
      }).length

      const regNeedPay = teams.filter(
        (t) => feeRequired && (t.registrationRequestedAt || t.registrationStatus === 'pending' || t.eventRegistered),
      ).length
      const regSettled = teams.filter((t) => isRegistrationComplete(t, merged) && feeRequired).length
      const paymentCompletionPct = regNeedPay ? Math.round((regSettled / regNeedPay) * 100) : null

      let psSnap
      if (eventId) {
        try {
          psSnap = await db().collection('problemStatements').where('eventId', '==', eventId).limit(300).get()
        } catch {
          psSnap = await db().collection('problemStatements').limit(300).get()
        }
      } else {
        psSnap = await db().collection('problemStatements').limit(300).get()
      }
      const problems = psSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
      const problemStatementsTop = [...problems]
        .map((p) => ({
          id: p.id,
          title: p.title || p.id,
          selectionCount: typeof p.selectionCount === 'number' ? p.selectionCount : 0,
        }))
        .sort((a, b) => b.selectionCount - a.selectionCount)
        .slice(0, 10)

      const teamIdSet = new Set(teams.map((t) => t.id))
      const subSnap = await db().collection('submissions').limit(1000).get()
      const submissions = subSnap.docs
        .map((d) => ({ teamId: d.id, ...d.data() }))
        .filter((s) => teamIdSet.has(s.teamId))

      function teamMaySubmit(t) {
        return Boolean(isRegistrationComplete(t, merged) && t.problemStatementId)
      }

      const submissionsEligibleTeams = teams.filter((t) => teamMaySubmit(t)).length
      let submissionsFinalized = 0
      let submissionsIncomplete = 0
      for (const t of teams) {
        if (!teamMaySubmit(t)) continue
        const sub = submissions.find((s) => s.teamId === t.id)
        const done = Boolean(t.submissionLocked || sub?.finalizedAt)
        if (done) submissionsFinalized += 1
        else submissionsIncomplete += 1
      }

      const eligibleTeamIds = new Set(
        teams.filter((t) => isRegistrationComplete(t, merged) && t.problemStatementId).map((t) => t.id),
      )
      const evalSnap = await db().collection('evaluations').limit(2000).get()
      const evaluations = evalSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
      const submittedEvals = evaluations.filter(
        (e) => e.evaluationStatus === 'submitted' && e.teamId && eligibleTeamIds.has(e.teamId),
      )
      const evaluationsSubmittedOnEligibleTeams = new Set(submittedEvals.map((e) => e.teamId)).size

      let judgeCount = 0
      try {
        const jSnap = await db().collection('users').where('role', '==', 'judge').limit(300).get()
        judgeCount = jSnap.size
      } catch {
        const uSnap = await db().collection('users').limit(500).get()
        judgeCount = uSnap.docs.filter((d) => d.data().role === 'judge').length
      }

      const shortlisted = teams.filter((t) => t.shortlisted).length

      const registrationStatusCounts = { registered: 0, pending: 0, blocked: 0, rejected: 0 }
      for (const t of teams) {
        const s = deriveRegistrationStatus(t, merged)
        registrationStatusCounts[s] = (registrationStatusCounts[s] || 0) + 1
      }

      const paymentBreakdown = { pending: 0, paid: 0, waived: 0, not_required: 0, other: 0 }
      for (const t of teams) {
        if (!t.registrationRequestedAt && !t.eventRegistered && t.registrationStatus !== 'pending') continue
        const p = String(t.paymentStatus || 'pending')
        if (Object.prototype.hasOwnProperty.call(paymentBreakdown, p)) paymentBreakdown[p] += 1
        else paymentBreakdown.other += 1
      }

      const problemSelectedCount = teams.filter(
        (t) => isRegistrationComplete(t, merged) && t.problemStatementId,
      ).length

      const eligibleEvalCount = eligibleTeamIds.size
      const evaluationCompletionPct =
        eligibleEvalCount > 0
          ? Math.round((evaluationsSubmittedOnEligibleTeams / eligibleEvalCount) * 100)
          : null

      return {
        eventId: eventId || null,
        teamsTotal: teams.length,
        teamsRegistered: registered,
        paymentsPending: pendingPay,
        registrationsToday,
        paymentCompletionPct,
        lifecyclePhase: merged.lifecyclePhase,
        registrationOpen: merged.registrationOpen,
        submissionDeadline: tsIso(merged.submissionDeadline),
        problemStatementsTop,
        submissionsEligibleTeams,
        submissionsFinalized,
        submissionsIncomplete,
        submissionCompletionPct:
          submissionsEligibleTeams > 0
            ? Math.round((submissionsFinalized / submissionsEligibleTeams) * 100)
            : null,
        evaluationsSubmittedOnEligibleTeams,
        evaluationCompletionPct,
        shortlistedTeams: shortlisted,
        judgeCount,
        razorpayConfigured: isRazorpayConfigured(),
        registrationStatusCounts,
        paymentBreakdown,
        registrationFunnel: {
          teamsTotal: teams.length,
          registered,
          teamsNeedingFee: regNeedPay,
          paymentSettledAmongFeeTeams: regSettled,
          problemSelected: problemSelectedCount,
          submissionsFinalized,
          submissionsEligibleTeams,
        },
      }
      }) // end cachedFetch

      res.json(statsData)
    } catch (e) {
      next(e)
    }
  })

  router.get('/teams', async (req, res, next) => {
    try {
      const rawAll = req.query.all === '1'
      const eventId = rawAll ? '' : typeof req.query.eventId === 'string' ? req.query.eventId.trim() : req.eventId
      const cursor = typeof req.query.cursor === 'string' ? req.query.cursor.trim() : null
      const pageSize = cursor ? Math.min(Number(req.query.limit) || 100, 200) : 800

      // ARCH-03: cursor-based pagination when ?cursor= is provided.
      // Without cursor, returns up to 800 docs (existing behavior preserved).
      let q = db().collection('teams').orderBy('createdAt', 'desc').limit(pageSize)
      if (eventId) q = q.where('eventId', '==', eventId)
      if (cursor) {
        const cursorSnap = await db().doc(`teams/${cursor}`).get()
        if (cursorSnap.exists) q = q.startAfter(cursorSnap)
      }

      const snap = await q.get()
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }))

      if (cursor) {
        const nextCursor = items.length === pageSize ? snap.docs[snap.docs.length - 1].id : null
        return res.json({ items, nextCursor })
      }
      res.json(items)
    } catch (e) {
      next(e)
    }
  })

  router.get('/submissions', async (req, res, next) => {
    try {
      const rawAll = req.query.all === '1'
      const eventId = rawAll ? '' : typeof req.query.eventId === 'string' ? req.query.eventId.trim() : req.eventId
      const cursor = typeof req.query.cursor === 'string' ? req.query.cursor.trim() : null
      const pageSize = cursor ? Math.min(Number(req.query.limit) || 100, 200) : 1000

      // ARCH-03: cursor-based pagination when ?cursor= is provided.
      let teamIds = null
      if (eventId) {
        const tsnap = await db().collection('teams').where('eventId', '==', eventId).limit(800).get()
        teamIds = new Set(tsnap.docs.map((d) => d.id))
      }

      let q = db().collection('submissions').orderBy('updatedAt', 'desc').limit(pageSize)
      if (cursor) {
        const cursorSnap = await db().doc(`submissions/${cursor}`).get()
        if (cursorSnap.exists) q = q.startAfter(cursorSnap)
      }

      const snap = await q.get()
      let rows = snap.docs.map((d) => ({ teamId: d.id, ...d.data() }))
      if (teamIds) rows = rows.filter((r) => teamIds.has(r.teamId))

      if (cursor) {
        const nextCursor = snap.docs.length === pageSize ? snap.docs[snap.docs.length - 1].id : null
        return res.json({ items: rows, nextCursor })
      }
      res.json(rows)
    } catch (e) {
      next(e)
    }
  })

  router.get('/evaluations', async (req, res, next) => {
    try {
      const rawAll = req.query.all === '1'
      const eventId = rawAll ? '' : typeof req.query.eventId === 'string' ? req.query.eventId.trim() : req.eventId
      const cursor = typeof req.query.cursor === 'string' ? req.query.cursor.trim() : null
      const pageSize = cursor ? Math.min(Number(req.query.limit) || 100, 200) : 2000

      // ARCH-03: cursor-based pagination when ?cursor= is provided.
      let teamIds = null
      if (eventId) {
        const tsnap = await db().collection('teams').where('eventId', '==', eventId).limit(800).get()
        teamIds = new Set(tsnap.docs.map((d) => d.id))
      }

      let q = db().collection('evaluations').orderBy('createdAt', 'desc').limit(pageSize)
      if (cursor) {
        const cursorSnap = await db().doc(`evaluations/${cursor}`).get()
        if (cursorSnap.exists) q = q.startAfter(cursorSnap)
      }

      const snap = await q.get()
      let rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      if (teamIds) rows = rows.filter((r) => r.teamId && teamIds.has(r.teamId))

      if (cursor) {
        const nextCursor = snap.docs.length === pageSize ? snap.docs[snap.docs.length - 1].id : null
        return res.json({ items: rows, nextCursor })
      }
      res.json(rows)
    } catch (e) {
      next(e)
    }
  })

  /**
   * Admin: Search Pro — find any person (team member, leader, judge, mentor,
   * admin) by name / email / phone and return their full team details.
   *
   * Team members are stored in the `memberRegistrations` collection (entered by
   * the team leader during registration) — most of them do NOT have auth
   * accounts, so a users-only search misses them. This endpoint searches both
   * memberRegistrations AND users, then attaches the matched person's team
   * details + full roster. Read-only; admin-gated.
   */
  router.get('/search', async (req, res, next) => {
    try {
      const q = String(req.query.q || '').trim().toLowerCase()
      if (q.length < 2) {
        return res.status(400).json({ error: 'Enter at least 2 characters to search.' })
      }

      const [memberSnap, usersSnap] = await Promise.all([
        db().collection('memberRegistrations').limit(8000).get(),
        db().collection('users').limit(5000).get(),
      ])

      const norm = (v) => String(v || '').toLowerCase()
      const hit = (rec, ...fields) => fields.some((f) => norm(rec[f]).includes(q))

      // Index every member registration by team so we can build full rosters.
      const membersByTeam = new Map()
      for (const d of memberSnap.docs) {
        const m = { id: d.id, ...d.data() }
        const tid = m.teamId || ''
        if (!tid) continue
        if (!membersByTeam.has(tid)) membersByTeam.set(tid, [])
        membersByTeam.get(tid).push(m)
      }

      const matchedTeamIds = new Set()
      const personMatches = []
      for (const d of memberSnap.docs) {
        const m = d.data()
        if (hit(m, 'name', 'email', 'phone')) {
          personMatches.push({
            name: m.name || '', email: m.email || '', phone: m.phone || '',
            // College details captured at registration time (stored on memberRegistrations).
            college: m.institute || m.college || '',
            collegeLocation: m.collegeLocation || '',
            yearOfStudy: m.yearOfStudy || '',
            department: m.department || '',
            isLeader: Boolean(m.isLeader), teamId: m.teamId || '', source: 'member',
          })
          if (m.teamId) matchedTeamIds.add(m.teamId)
        }
      }

      const userMatches = []
      for (const d of usersSnap.docs) {
        const u = d.data()
        if (norm(u.displayName).includes(q) || norm(u.email).includes(q) || norm(u.phone).includes(q)) {
          userMatches.push({
            uid: d.id, name: u.displayName || '', email: u.email || '', phone: u.phone || '',
            role: u.role || 'participant', teamId: u.teamId || '', source: 'user',
          })
          if (u.teamId) matchedTeamIds.add(u.teamId)
        }
      }

      // Fetch matched team docs (chunked getAll).
      const teamIds = [...matchedTeamIds]
      const teamDocs = new Map()
      for (let i = 0; i < teamIds.length; i += 300) {
        const refs = teamIds.slice(i, i + 300).map((id) => db().doc(`teams/${id}`))
        if (refs.length === 0) continue
        const snaps = await db().getAll(...refs)
        for (const s of snaps) if (s.exists) teamDocs.set(s.id, s.data())
      }

      // Resolve problem statement titles.
      const psIds = [...new Set([...teamDocs.values()].map((t) => t.problemStatementId).filter(Boolean))]
      const psTitles = new Map()
      for (let i = 0; i < psIds.length; i += 300) {
        const refs = psIds.slice(i, i + 300).map((id) => db().doc(`problemStatements/${id}`))
        if (refs.length === 0) continue
        const snaps = await db().getAll(...refs)
        for (const s of snaps) if (s.exists) psTitles.set(s.id, s.data().title || s.id)
      }

      const teamDetail = (teamId) => {
        const t = teamDocs.get(teamId)
        if (!t) return null
        const roster = (membersByTeam.get(teamId) || [])
          .slice()
          .sort((a, b) => (a.order || 0) - (b.order || 0))
          .map((m) => ({
            name: m.name || '', email: m.email || '', phone: m.phone || '',
            college: m.institute || m.college || '', collegeLocation: m.collegeLocation || '',
            yearOfStudy: m.yearOfStudy || '', department: m.department || '',
            isLeader: Boolean(m.isLeader),
          }))
        return {
          teamId,
          name: t.name || '',
          inviteCode: t.inviteCode || '',
          eventId: t.eventId || '',
          leaderId: t.leaderId || '',
          problemStatementId: t.problemStatementId || '',
          problemStatementTitle: t.problemStatementId ? (psTitles.get(t.problemStatementId) || t.problemStatementId) : '',
          registrationStatus: t.registrationStatus || (t.eventRegistered ? 'registered' : ''),
          eventRegistered: Boolean(t.eventRegistered),
          paymentStatus: t.paymentStatus || '',
          submissionLocked: Boolean(t.submissionLocked),
          shortlisted: Boolean(t.shortlisted),
          juryStatus: t.juryStatus || '',
          memberCount: (membersByTeam.get(teamId) || []).length,
        }
      }

      const results = []
      for (const p of personMatches) {
        results.push({ match: p, team: p.teamId ? teamDetail(p.teamId) : null })
      }
      for (const u of userMatches) {
        results.push({ match: u, team: u.teamId ? teamDetail(u.teamId) : null })
      }

      // De-duplicate by email+team (a leader appears both as member and user).
      const seen = new Set()
      const deduped = []
      for (const r of results) {
        const key = `${norm(r.match.email)}|${r.match.teamId}|${r.match.name}`
        if (seen.has(key)) continue
        seen.add(key)
        deduped.push(r)
      }

      res.json({ query: q, count: deduped.length, results: deduped.slice(0, 100) })
    } catch (e) {
      next(e)
    }
  })

  /**
   * Admin: per-team college + location, derived from memberRegistrations
   * (the leader's row, falling back to the first member). Powers the College /
   * Location filters on the Results and Reports pages. Read-only, single batch
   * read, admin/observer only.
   */
  router.get('/team-colleges', async (req, res, next) => {
    try {
      const snap = await db().collection('memberRegistrations').limit(8000).get()
      const byTeam = new Map()
      for (const d of snap.docs) {
        const m = d.data()
        const tid = m.teamId || ''
        if (!tid) continue
        if (!byTeam.has(tid)) byTeam.set(tid, [])
        byTeam.get(tid).push(m)
      }
      const teams = []
      for (const [teamId, members] of byTeam) {
        const sorted = members.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        const leader = sorted.find((m) => m.isLeader) || sorted[0] || {}
        teams.push({
          teamId,
          college: leader.institute || leader.college || '',
          collegeLocation: leader.collegeLocation || '',
        })
      }
      res.json({ teams })
    } catch (e) {
      next(e)
    }
  })

  /**
   * Admin: email qualified teams' leaders that they have qualified.
   * Body: { teamIds?: string[] } — omit (or empty) to email ALL qualified teams.
   * Only teams with juryStatus === 'qualified' are ever emailed. Resendable.
   */
  router.post('/results/notify-qualified', async (req, res, next) => {
    try {
      const raw = Array.isArray(req.body?.teamIds) ? req.body.teamIds : null
      const teamIds = raw ? raw.filter((x) => typeof x === 'string' && x.length > 0 && x.length <= 128) : null
      const { notifyQualified } = await import('../services/notificationService.js')
      const result = await notifyQualified({ teamIds, eventId: req.eventId || '' })
      await appendAuditLog({
        actorUid: req.user.uid,
        action: 'results.notify_qualified',
        targetType: 'teams',
        targetId: '',
        metadata: { sent: result.sent || 0, qualified: result.qualified || 0, scope: teamIds ? teamIds.length : 'all' },
      })
      res.json({ ok: true, ...result })
    } catch (e) {
      next(e)
    }
  })

  /**
   * Admin: send a CUSTOM email to qualified teams — reaching the team leader AND
   * every member whose email is on record (from registration).
   * Body: { teamIds?: string[], subject?, title?, message, link? }
   *  - Omit teamIds (or empty) to email ALL qualified teams; pass one id to email
   *    a single qualified team.
   *  - {{TEAM}} in subject/title/message is replaced with the team name.
   * Only teams with juryStatus === 'qualified' are ever emailed. Resendable.
   */
  router.post('/results/notify-qualified-custom', async (req, res, next) => {
    try {
      const raw = Array.isArray(req.body?.teamIds) ? req.body.teamIds : null
      const teamIds = raw ? raw.filter((x) => typeof x === 'string' && x.length > 0 && x.length <= 128) : null
      const subject = typeof req.body?.subject === 'string' ? req.body.subject.slice(0, 200) : ''
      const title = typeof req.body?.title === 'string' ? req.body.title.slice(0, 200) : ''
      const message = typeof req.body?.message === 'string' ? req.body.message.slice(0, 5000) : ''
      const link = typeof req.body?.link === 'string' ? req.body.link.slice(0, 500) : ''
      if (!message.trim()) {
        return res.status(400).json({ error: 'A message is required.' })
      }
      const { notifyQualifiedCustom } = await import('../services/notificationService.js')
      const result = await notifyQualifiedCustom({ teamIds, eventId: req.eventId || '', subject, title, message, link })
      await appendAuditLog({
        actorUid: req.user.uid,
        action: 'results.notify_qualified_custom',
        targetType: 'teams',
        targetId: '',
        metadata: {
          sent: result.sent || 0,
          recipients: result.recipients || 0,
          qualified: result.qualified || 0,
          scope: teamIds ? teamIds.length : 'all',
        },
      })
      res.json({ ok: true, ...result })
    } catch (e) {
      next(e)
    }
  })

  /**
   * Admin: delete a single evaluation doc (evaluations/{judgeId}_{teamId}).
   * Lets an admin remove a judge's evaluation so it can be redone.
   */
  router.delete('/evaluations/:id', async (req, res, next) => {
    try {
      const { id } = req.params
      // Eval doc id is `{judgeId}_{teamId}` — allow letters/digits/_- only.
      if (typeof id !== 'string' || id.length > 256 || /[/.#$[\]]/.test(id)) {
        return res.status(400).json({ error: 'Invalid evaluation id.' })
      }
      const ref = db().doc(`evaluations/${id}`)
      const snap = await ref.get()
      if (!snap.exists) return res.status(404).json({ error: 'Evaluation not found.' })
      const data = snap.data()
      await ref.delete()
      await appendAuditLog({
        actorUid: req.user.uid,
        action: 'evaluation.delete',
        targetType: 'evaluation',
        targetId: id,
        metadata: { judgeId: data.judgeId || '', teamId: data.teamId || '' },
      })
      res.json({ ok: true })
    } catch (e) {
      next(e)
    }
  })

  /**
   * Admin: Archive the current round's evaluations, then clear the live ones so
   * a NEW round of evaluation (e.g. the Finals two-part scoring) starts fresh.
   *
   * Why this exists: an evaluation doc is keyed `evaluations/{judgeId}_{teamId}`
   * — a single doc per judge+team. When the Finals reuse the same judges and
   * teams, a fresh Finals evaluation would otherwise OVERWRITE the Round 2
   * scores. This endpoint first copies every current evaluation into the
   * `evaluationsArchive` collection (full snapshot, tagged with a label like
   * "round-2"), then deletes the live docs. The archive is a permanent,
   * read-only record the admin can view/export later; deletion is therefore
   * safe (fully recoverable from the archive copy).
   *
   * Body: { label?: string }  (label defaults to "round-2")
   */
  router.post('/evaluations/archive', async (req, res, next) => {
    try {
      const rawLabel = String(req.body?.label || 'round-2').trim().toLowerCase()
      const label = rawLabel.replace(/[^a-z0-9_-]/g, '-').slice(0, 40) || 'round-2'

      const activeEvent = await getActiveEvent()
      const eventId = activeEvent?.id || null

      // Fetch all live evaluations, scoped to the active event when possible.
      const snap = await db().collection('evaluations').limit(5000).get()
      const docs = snap.docs.filter((d) => {
        const e = d.data()
        return !eventId || !e.eventId || e.eventId === eventId
      })

      if (docs.length === 0) {
        return res.json({ ok: true, archived: 0, cleared: 0, label, message: 'No evaluations to archive.' })
      }

      const archivedAtIso = new Date().toISOString()
      let archived = 0
      let cleared = 0

      // Firestore batches allow 500 writes. Each doc costs 2 writes here
      // (archive set + original delete), so process ~200 docs per batch.
      const CHUNK = 200
      for (let i = 0; i < docs.length; i += CHUNK) {
        const slice = docs.slice(i, i + CHUNK)
        const batch = db().batch()
        for (const d of slice) {
          const data = d.data()
          const archiveId = `${label}__${d.id}`.slice(0, 480)
          const archiveRef = db().doc(`evaluationsArchive/${archiveId}`)
          batch.set(archiveRef, {
            ...data,
            archiveLabel: label,
            originalId: d.id,
            archivedAt: FieldValue.serverTimestamp(),
            archivedAtIso,
            archivedBy: req.user.uid,
          })
          batch.delete(d.ref)
          archived += 1
          cleared += 1
        }
        await batch.commit()
      }

      await appendAuditLog({
        actorUid: req.user.uid,
        action: 'evaluations.archive',
        targetType: 'event',
        targetId: eventId || 'all',
        metadata: { label, archived, cleared },
      })

      res.json({ ok: true, archived, cleared, label })
    } catch (e) {
      next(e)
    }
  })

  /**
   * Admin: List archived evaluations (read-only). Optional ?label= filter.
   * Used by the Reports export and the Evaluations page archive viewer.
   */
  router.get('/evaluations/archived', async (req, res, next) => {
    try {
      const label = typeof req.query.label === 'string' ? req.query.label.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-').slice(0, 40) : ''
      let q = db().collection('evaluationsArchive').limit(5000)
      if (label) q = q.where('archiveLabel', '==', label)
      const snap = await q.get()
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      // Distinct labels present, for the UI to offer a filter.
      const labels = Array.from(new Set(items.map((x) => x.archiveLabel).filter(Boolean))).sort()
      res.json({ items, labels })
    } catch (e) {
      next(e)
    }
  })

  router.delete('/teams/:teamId/registration', async (req, res, next) => {
    try {
      const { teamId } = req.params
      if (!isValidDocId(teamId)) return res.status(400).json({ error: 'Invalid team ID.' })
      const teamRef = db().doc(`teams/${teamId}`)
      const snap = await teamRef.get()
      if (!snap.exists) return res.status(404).json({ error: 'Team not found.' })

      const team = snap.data()
      if (!teamHasRegistrationRecord(team) && !team.problemStatementId) {
        return res.status(400).json({ error: 'Team has no registration to remove.' })
      }

      await clearTeamRegistration(db(), teamId)

      await appendAuditLog({
        actorUid: req.user.uid,
        action: 'team.registration_delete',
        targetType: 'team',
        targetId: teamId,
        metadata: {
          hadEventRegistered: Boolean(team.eventRegistered),
          previousRegistrationStatus: team.registrationStatus || null,
          previousPaymentStatus: team.paymentStatus || null,
        },
      })

      res.json({ ok: true, teamId })
    } catch (e) {
      if (e.status) return res.status(e.status).json({ error: e.message })
      next(e)
    }
  })

  /** Full team delete — purges the team doc and all associated data. */
  router.delete('/teams/:teamId', async (req, res, next) => {
    try {
      const { teamId } = req.params
      if (!isValidDocId(teamId)) return res.status(400).json({ error: 'Invalid team ID.' })
      const teamRef = db().doc(`teams/${teamId}`)
      const snap = await teamRef.get()
      if (!snap.exists) return res.status(404).json({ error: 'Team not found.' })

      const team = snap.data()
      const memberIds = Array.isArray(team.memberIds) ? team.memberIds : []
      const oldPid = team.problemStatementId || ''

      // 1. Decrement the selected problem statement's count atomically.
      if (oldPid) {
        try {
          await db().doc(`problemStatements/${oldPid}`).update({
            selectionCount: FieldValue.increment(-1),
            updatedAt: FieldValue.serverTimestamp(),
          })
        } catch { /* ignore — PS may already be deleted */ }
      }

      // 2. Detach every member user from the team (batched).
      {
        const batch = db().batch()
        for (const uid of memberIds) {
          batch.set(db().doc(`users/${uid}`), { teamId: '', updatedAt: FieldValue.serverTimestamp() }, { merge: true })
        }
        try { await batch.commit() } catch { /* ignore */ }
      }

      // 3. Delete the submission doc (id === teamId).
      try { await db().doc(`submissions/${teamId}`).delete() } catch { /* ignore */ }

      // 4. Delete evaluations for this team (batched).
      try {
        const evalSnap = await db().collection('evaluations').where('teamId', '==', teamId).limit(500).get()
        if (!evalSnap.empty) {
          const batch = db().batch()
          evalSnap.docs.forEach((d) => batch.delete(d.ref))
          await batch.commit()
        }
      } catch { /* ignore */ }

      // 5. Delete member registrations for this team (batched).
      try {
        const regSnap = await db().collection('memberRegistrations').where('teamId', '==', teamId).limit(500).get()
        if (!regSnap.empty) {
          const batch = db().batch()
          regSnap.docs.forEach((d) => batch.delete(d.ref))
          await batch.commit()
        }
      } catch { /* ignore */ }

      // 6. Delete team chat metadata + messages subcollection.
      try {
        const chatMsgsSnap = await db().collection(`chats/${teamId}/messages`).limit(500).get()
        if (!chatMsgsSnap.empty) {
          const batch = db().batch()
          chatMsgsSnap.docs.forEach((d) => batch.delete(d.ref))
          await batch.commit()
        }
        await db().doc(`chats/${teamId}`).delete()
      } catch { /* ignore */ }

      // 7. Delete mentor chat metadata + messages subcollection.
      try {
        const mentorMsgsSnap = await db().collection(`mentorChats/${teamId}/messages`).limit(500).get()
        if (!mentorMsgsSnap.empty) {
          const batch = db().batch()
          mentorMsgsSnap.docs.forEach((d) => batch.delete(d.ref))
          await batch.commit()
        }
        await db().doc(`mentorChats/${teamId}`).delete()
      } catch { /* ignore */ }

      // 8. Delete mentor notes for this team (batched).
      try {
        const notesSnap = await db().collection('mentorNotes').where('teamId', '==', teamId).limit(500).get()
        if (!notesSnap.empty) {
          const batch = db().batch()
          notesSnap.docs.forEach((d) => batch.delete(d.ref))
          await batch.commit()
        }
      } catch { /* ignore */ }

      // 9. Delete the team doc itself.
      await teamRef.delete()

      await appendAuditLog({
        actorUid: req.user.uid,
        action: 'team.delete',
        targetType: 'team',
        targetId: teamId,
        metadata: { name: team.name || null, memberCount: memberIds.length },
      })

      res.json({ ok: true, teamId })
    } catch (e) {
      if (e.status) return res.status(e.status).json({ error: e.message })
      next(e)
    }
  })

  router.patch('/teams/:teamId', async (req, res, next) => {
    try {
      const { teamId } = req.params
      if (!isValidDocId(teamId)) return res.status(400).json({ error: 'Invalid team ID.' })
      const body = req.body || {}
      const patch = { updatedAt: FieldValue.serverTimestamp() }
      if (typeof body.submissionLocked === 'boolean') patch.submissionLocked = body.submissionLocked
      if (typeof body.shortlisted === 'boolean') patch.shortlisted = body.shortlisted

      const REG_STATUS = new Set(['registered', 'pending', 'blocked', 'rejected'])
      if (typeof body.registrationStatus === 'string') {
        const rs = body.registrationStatus.trim().toLowerCase()
        if (REG_STATUS.has(rs)) {
          patch.registrationStatus = rs
          patch.eventRegistered = rs === 'registered'
          // When admin manually sets 'registered', ensure paymentStatus is consistent
          if (rs === 'registered') {
            patch.paymentStatus = 'waived'
          }
        }
      }

      // Admin override of the jury qualification status (normally set by judges).
      // Accepts qualified | waitlist | not_qualified, or '' / 'none' to clear.
      if (typeof body.juryStatus === 'string') {
        const js = body.juryStatus.trim().toLowerCase()
        const JURY_STATUS = new Set(['qualified', 'waitlist', 'not_qualified'])
        if (js === '' || js === 'none') {
          patch.juryStatus = FieldValue.delete()
        } else if (JURY_STATUS.has(js)) {
          patch.juryStatus = js
        } else {
          return res.status(400).json({ error: 'juryStatus must be qualified, waitlist, not_qualified, or none.' })
        }
      }

      const metaKeys = Object.keys(patch).filter((k) => k !== 'updatedAt')
      if (!metaKeys.length) {
        return res
          .status(400)
          .json({ error: 'No valid fields (submissionLocked, shortlisted, registrationStatus, juryStatus).' })
      }
      await db().doc(`teams/${teamId}`).set(patch, { merge: true })
      await appendAuditLog({
        actorUid: req.user.uid,
        action: 'team.admin_patch',
        targetType: 'team',
        targetId: teamId,
        metadata: { keys: metaKeys },
      })
      res.json({ ok: true })
    } catch (e) {
      next(e)
    }
  })

  /**
   * Admin listing of problem statements — includes drafts AND private
   * participant-authored Open Innovation entries (which the public endpoint
   * deliberately filters out).
   */
  router.get('/problem-statements', async (req, res, next) => {
    try {
      const activeEvent = await getActiveEvent()
      const eventId = String(req.query.eventId || req.eventId || activeEvent?.id || '').trim()

      let snap
      let q = db().collection('problemStatements')
      if (eventId) q = q.where('eventId', '==', eventId)
      try {
        snap = await q.orderBy('order', 'asc').get()
      } catch {
        snap = await q.get()
      }

      const items = snap.docs.map((d) => {
        const data = d.data()
        return {
          id: d.id,
          ...data,
          selectionCount: typeof data.selectionCount === 'number' ? data.selectionCount : 0,
        }
      })
      res.json(items)
    } catch (e) {
      next(e)
    }
  })

  router.post('/problem-statements', async (req, res, next) => {
    try {
      const body = req.body || {}
      const activeEvent = await getActiveEvent()
      const eventId = activeEvent?.id
      if (!eventId) {
        return res.status(503).json({ error: 'Hackathon is starting up. Try again in a moment.' })
      }

      const ev = await getEventDocById(eventId)
      if (!ev) return res.status(404).json({ error: 'Event not found' })

      const title = typeof body.title === 'string' ? body.title.trim().slice(0, 200) : ''
      if (!title) return res.status(400).json({ error: 'title is required' })

      let psId = typeof body.id === 'string' ? body.id.trim().toLowerCase() : ''
      psId = psId.replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 80)
      if (!psId) psId = db().collection('problemStatements').doc().id

      const ref = db().doc(`problemStatements/${psId}`)
      const existing = await ref.get()
      if (existing.exists) return res.status(409).json({ error: 'That problem statement id is already in use. Choose another id or omit it for an auto id.' })

      const domain = typeof body.domain === 'string' ? body.domain.trim().slice(0, 120) : ''
      const poweredBy = typeof body.poweredBy === 'string' ? body.poweredBy.trim().slice(0, 200) : ''
      const organization = typeof body.organization === 'string' ? body.organization.trim().slice(0, 200) : ''
      const department = typeof body.department === 'string' ? body.department.trim().slice(0, 120) : ''
      const category = typeof body.category === 'string' ? body.category.trim().slice(0, 120) : ''
      const theme = typeof body.theme === 'string' ? body.theme.trim().slice(0, 120) : ''
      const description = typeof body.description === 'string' ? body.description.trim().slice(0, 20000) : ''
      const published = body.published !== false
      let maxTeams
      if (typeof body.maxTeams === 'number' && body.maxTeams >= 0) maxTeams = Math.min(1_000_000, Math.floor(body.maxTeams))

      let order = typeof body.order === 'number' && Number.isFinite(body.order) ? Math.round(body.order) : null
      if (order == null) {
        let maxO = -1
        try {
          const q = await db()
            .collection('problemStatements')
            .where('eventId', '==', eventId)
            .orderBy('order', 'desc')
            .limit(1)
            .get()
          if (!q.empty) {
            const o = q.docs[0].data().order
            if (typeof o === 'number' && o > maxO) maxO = o
          }
        } catch {
          const q = await db().collection('problemStatements').where('eventId', '==', eventId).limit(500).get()
          for (const d of q.docs) {
            const o = d.data().order
            if (typeof o === 'number' && o > maxO) maxO = o
          }
        }
        order = maxO + 1
      }

      const domainEffective = domain || category
      const poweredEffective = poweredBy || organization

      const payload = {
        eventId,
        title,
        domain: domainEffective,
        ...(poweredEffective ? { poweredBy: poweredEffective } : {}),
        ...(organization ? { organization } : {}),
        ...(department ? { department } : {}),
        ...(category ? { category } : {}),
        ...(theme ? { theme } : {}),
        description,
        published,
        order,
        selectionCount: 0,
        assignedJudgeIds: [],
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        createdBy: req.user.uid,
        updatedBy: req.user.uid,
      }
      if (maxTeams !== undefined) payload.maxTeams = maxTeams

      await ref.set(payload)
      // Invalidate problem statements cache so public page gets fresh data
      cacheInvalidate(CACHE_NS.PROBLEM_STATEMENTS)
      await appendAuditLog({
        actorUid: req.user.uid,
        action: 'problem_statement.create',
        targetType: 'problemStatement',
        targetId: psId,
        eventId,
        metadata: { title: title.slice(0, 80) },
      })
      res.json({ ok: true, id: psId, eventId })
    } catch (e) {
      next(e)
    }
  })

  /** Bulk import problem statements from CSV/Excel parsed payload */
  router.post('/problem-statements/bulk-import', async (req, res, next) => {
    try {
      const items = Array.isArray(req.body?.items) ? req.body.items : []
      if (items.length === 0) {
        return res.status(400).json({ error: 'items array required (parsed CSV/Excel rows)' })
      }
      if (items.length > 200) {
        return res.status(400).json({ error: 'Maximum 200 problem statements per bulk import' })
      }

      const activeEvent = await getActiveEvent()
      const eventId = activeEvent?.id
      if (!eventId) {
        return res.status(503).json({ error: 'Hackathon is starting up. Try again in a moment.' })
      }

      // Compute starting order (max existing + 1)
      let startOrder = 0
      try {
        const q = await db()
          .collection('problemStatements')
          .where('eventId', '==', eventId)
          .orderBy('order', 'desc')
          .limit(1)
          .get()
        if (!q.empty) {
          const o = q.docs[0].data().order
          if (typeof o === 'number') startOrder = o + 1
        }
      } catch {
        const q = await db().collection('problemStatements').where('eventId', '==', eventId).limit(500).get()
        let maxO = -1
        for (const d of q.docs) {
          const o = d.data().order
          if (typeof o === 'number' && o > maxO) maxO = o
        }
        startOrder = maxO + 1
      }

      const results = { success: 0, failed: 0, skipped: 0, errors: [], created: [] }
      let nextOrder = startOrder

      // Compute next sequential ID (skh001, skh002, ...) by scanning existing IDs in this event
      let nextSeq = 1
      try {
        const allSnap = await db()
          .collection('problemStatements')
          .where('eventId', '==', eventId)
          .limit(1000)
          .get()
        for (const d of allSnap.docs) {
          const m = /^skh(\d+)$/i.exec(d.id)
          if (m) {
            const n = parseInt(m[1], 10)
            if (!Number.isNaN(n) && n >= nextSeq) nextSeq = n + 1
          }
        }
      } catch {
        // If scan fails, fall back to 1 (collisions handled below)
      }

      // Track IDs reserved in this batch to avoid mid-batch collisions
      const usedIds = new Set()

      function nextSkhId() {
        let id = `skh${String(nextSeq).padStart(3, '0')}`
        nextSeq += 1
        return id
      }

      for (let i = 0; i < items.length; i++) {
        const row = items[i] || {}
        const lineNum = i + 2 // CSV line number (header is line 1)
        try {
          const title = typeof row.title === 'string' ? row.title.trim().slice(0, 200) : ''
          if (!title) {
            results.failed += 1
            results.errors.push({ line: lineNum, error: 'Missing required field: title' })
            continue
          }

          // System-assigned sequential ID (skh001, skh002, ...). User-supplied id is ignored.
          let psId = nextSkhId()
          // Defensive collision check against existing docs and this batch
          // (in case admin manually created an skh### id earlier)
          // eslint-disable-next-line no-await-in-loop
          while (usedIds.has(psId) || (await db().doc(`problemStatements/${psId}`).get()).exists) {
            psId = nextSkhId()
          }
          usedIds.add(psId)

          const ref = db().doc(`problemStatements/${psId}`)

          const organization = typeof row.organization === 'string' ? row.organization.trim().slice(0, 200) : ''
          const department = typeof row.department === 'string' ? row.department.trim().slice(0, 120) : ''

          // Track (was: category) — accept "track" or legacy "category" column. Only Software/Hardware allowed.
          const TRACKS = ['Software', 'Hardware']
          let category = ''
          const trackRaw = typeof row.track === 'string' ? row.track.trim() : (typeof row.category === 'string' ? row.category.trim() : '')
          if (trackRaw) {
            const matched = TRACKS.find((t) => t.toLowerCase() === trackRaw.toLowerCase())
            if (matched) category = matched
            else {
              results.failed += 1
              results.errors.push({ line: lineNum, error: `Invalid track "${trackRaw}". Must be one of: ${TRACKS.join(', ')}` })
              continue
            }
          }

          // Domain (was: theme) — accept "domain" or legacy "theme" column. Must be one of 8 official domains.
          const DOMAINS = [
            'Health', 'Education', 'Transportation', 'Food Safety & Security',
            'Waste Management', 'Agriculture', 'Industry & MSME Innovation', 'Open Innovation',
          ]
          // Normalize so common variants match the canonical domain:
          // "and" ↔ "&", inconsistent spacing, and case are all treated as equal.
          const normDomain = (s) => String(s)
            .toLowerCase()
            .replace(/\s*&\s*/g, ' & ')
            .replace(/\s+and\s+/g, ' & ')
            .replace(/\s+/g, ' ')
            .trim()
          // Explicit aliases for labels that aren't an exact official domain.
          const DOMAIN_ALIASES = {
            'biodiversity & waste management': 'Waste Management',
          }
          let theme = ''
          const domainRaw = typeof row.domain === 'string' ? row.domain.trim() : (typeof row.theme === 'string' ? row.theme.trim() : '')
          if (domainRaw) {
            const key = normDomain(domainRaw)
            let matched = DOMAINS.find((d) => normDomain(d) === key)
            if (!matched && DOMAIN_ALIASES[key]) matched = DOMAIN_ALIASES[key]
            if (matched) theme = matched
            else {
              results.failed += 1
              results.errors.push({ line: lineNum, error: `Invalid domain "${domainRaw}". Must be one of: ${DOMAINS.join(', ')}` })
              continue
            }
          }

          const description = typeof row.description === 'string' ? row.description.trim().slice(0, 20000) : ''

          // Published: accept boolean, "true"/"false", "yes"/"no", "1"/"0", default true
          let published = true
          if (row.published !== undefined && row.published !== null && row.published !== '') {
            const v = String(row.published).trim().toLowerCase()
            published = !['false', 'no', '0', 'draft', 'unpublished'].includes(v)
          }

          // maxTeams: optional number
          let maxTeams
          if (row.maxTeams !== undefined && row.maxTeams !== null && row.maxTeams !== '') {
            const n = Number(row.maxTeams)
            if (!Number.isNaN(n) && n >= 0) maxTeams = Math.min(1_000_000, Math.floor(n))
          }

          // Order: explicit or auto-incremented
          let order = nextOrder
          if (row.order !== undefined && row.order !== null && row.order !== '') {
            const n = Number(row.order)
            if (!Number.isNaN(n) && Number.isFinite(n)) order = Math.round(n)
          } else {
            nextOrder += 1
          }

          const payload = {
            eventId,
            title,
            domain: category, // mirror category as domain for display compat
            ...(organization ? { organization, poweredBy: organization } : {}),
            ...(department ? { department } : {}),
            ...(category ? { category } : {}),
            ...(theme ? { theme } : {}),
            description,
            published,
            order,
            selectionCount: 0,
            assignedJudgeIds: [],
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            createdBy: req.user.uid,
            updatedBy: req.user.uid,
          }
          if (maxTeams !== undefined) payload.maxTeams = maxTeams

          await ref.set(payload)
          results.success += 1
          results.created.push({ id: psId, title })
        } catch (err) {
          results.failed += 1
          results.errors.push({ line: lineNum, error: err.message || 'Unknown error' })
        }
      }

      await appendAuditLog({
        actorUid: req.user.uid,
        action: 'problem_statement.bulk_import',
        targetType: 'event',
        targetId: eventId,
        eventId,
        metadata: { total: items.length, success: results.success, failed: results.failed, skipped: results.skipped },
      })

      // Invalidate problem statements cache after bulk import
      cacheInvalidate(CACHE_NS.PROBLEM_STATEMENTS)

      res.json({ ok: true, ...results, eventId })
    } catch (e) {
      next(e)
    }
  })

  router.patch('/problem-statements/:psId', async (req, res, next) => {
    try {
      const { psId } = req.params
      const body = req.body || {}
      const ref = db().doc(`problemStatements/${psId}`)
      const snap = await ref.get()
      if (!snap.exists) return res.status(404).json({ error: 'Problem statement not found' })
      const patch = { updatedAt: FieldValue.serverTimestamp(), updatedBy: req.user.uid }
      const evScope = String(req.body?.eventId || req.eventId || '').trim()
      const ped = snap.data().eventId
      if (evScope && ped && ped !== evScope) {
        return res.status(400).json({ error: 'Problem statement belongs to a different edition.' })
      }
      // Open Innovation entries are participant-authored and reserved for their
      // team: they are never published publicly and stay private.
      const isOpenInnovationPs = snap.data().origin === 'open_innovation'
      if (isOpenInnovationPs) {
        patch.published = false
        patch.visibility = 'private'
      } else if (typeof body.published === 'boolean') {
        patch.published = body.published
      }
      if (body.maxTeams === null) patch.maxTeams = FieldValue.delete()
      else if (typeof body.maxTeams === 'number' && body.maxTeams >= 0) patch.maxTeams = body.maxTeams
      if (typeof body.title === 'string') patch.title = body.title.trim().slice(0, 200)
      if (typeof body.domain === 'string') patch.domain = body.domain.trim().slice(0, 120)
      if (body.poweredBy === null || body.poweredBy === '') patch.poweredBy = FieldValue.delete()
      else if (typeof body.poweredBy === 'string') patch.poweredBy = body.poweredBy.trim().slice(0, 200)
      if (body.organization === null || body.organization === '') patch.organization = FieldValue.delete()
      else if (typeof body.organization === 'string') patch.organization = body.organization.trim().slice(0, 200)
      if (body.department === null || body.department === '') patch.department = FieldValue.delete()
      else if (typeof body.department === 'string') patch.department = body.department.trim().slice(0, 120)
      if (body.category === null || body.category === '') patch.category = FieldValue.delete()
      else if (typeof body.category === 'string') patch.category = body.category.trim().slice(0, 120)
      if (body.theme === null || body.theme === '') patch.theme = FieldValue.delete()
      else if (typeof body.theme === 'string') patch.theme = body.theme.trim().slice(0, 120)
      if (typeof body.description === 'string') patch.description = body.description.trim().slice(0, 20000)
      if (typeof body.order === 'number') patch.order = body.order
      await ref.set(patch, { merge: true })
      // Invalidate problem statements cache
      cacheInvalidate(CACHE_NS.PROBLEM_STATEMENTS)
      await appendAuditLog({
        actorUid: req.user.uid,
        action: 'problem_statement.patch',
        targetType: 'problemStatement',
        targetId: psId,
        eventId: ped || evScope,
        metadata: { keys: Object.keys(patch).filter((k) => !['updatedAt', 'updatedBy'].includes(k)) },
      })
      res.json({ ok: true })
    } catch (e) {
      next(e)
    }
  })

  router.delete('/problem-statements/:psId', async (req, res, next) => {
    try {
      const { psId } = req.params
      const ref = db().doc(`problemStatements/${psId}`)
      const snap = await ref.get()
      if (!snap.exists) return res.status(404).json({ error: 'Problem statement not found' })
      const ped = snap.data().eventId || ''
      const evScope = String(req.query.eventId || req.eventId || '').trim()
      if (evScope && ped && ped !== evScope) {
        return res.status(400).json({ error: 'Problem statement belongs to a different edition.' })
      }

      const teamsSnap = await db().collection('teams').where('problemStatementId', '==', psId).limit(1).get()
      if (!teamsSnap.empty) {
        return res.status(400).json({ error: 'Cannot delete while a team is assigned to this problem.' })
      }
      const sc = snap.data().selectionCount || 0
      if (sc > 0) {
        return res.status(400).json({ error: 'Cannot delete: selection count is non-zero. Reconcile data or unpublish instead.' })
      }

      const judgesSnap = await db().collection('users').where('assignedProblemStatementIds', 'array-contains', psId).get()
      const judgeDocs = judgesSnap.docs

      const chunks = []
      let batch = db().batch()
      let ops = 0
      const pushOp = (fn) => {
        fn(batch)
        ops += 1
        if (ops >= 450) {
          chunks.push(batch)
          batch = db().batch()
          ops = 0
        }
      }
      pushOp((b) => b.delete(ref))
      for (const doc of judgeDocs) {
        const cur = doc.data().assignedProblemStatementIds || []
        const next = cur.filter((id) => id !== psId)
        pushOp((b) =>
          b.set(doc.ref, { assignedProblemStatementIds: next, updatedAt: FieldValue.serverTimestamp() }, { merge: true }),
        )
      }
      if (ops > 0) chunks.push(batch)
      for (const b of chunks) await b.commit()

      // Invalidate problem statements cache
      cacheInvalidate(CACHE_NS.PROBLEM_STATEMENTS)

      await appendAuditLog({
        actorUid: req.user.uid,
        action: 'problem_statement.delete',
        targetType: 'problemStatement',
        targetId: psId,
        eventId: ped || evScope,
        metadata: {},
      })
      res.json({ ok: true })
    } catch (e) {
      next(e)
    }
  })

  router.get('/system-health', async (req, res, next) => {
    try {
      const dbOk = Boolean(db())
      let firestorePing = false
      if (dbOk) {
        try {
          await db().collection('events').limit(1).get()
          firestorePing = true
        } catch {
          firestorePing = false
        }
      }
      res.json({
        ok: true,
        time: new Date().toISOString(),
        firebaseAdmin: dbOk,
        firestoreReachable: firestorePing,
        razorpayConfigured: isRazorpayConfigured(),
        nodeEnv: process.env.NODE_ENV || 'development',
      })
    } catch (e) {
      next(e)
    }
  })

  router.get('/users', async (req, res, next) => {
    try {
      const snap = await db().collection('users').limit(500).get()
      res.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    } catch (e) {
      next(e)
    }
  })

  // CRIT-03: Super admin emails moved to environment variable so they are not
  // exposed in source code. Set SUPER_ADMIN_EMAILS as a comma-separated list
  // in your .env / hosting platform secrets.
  // Falls back to empty list (no protected accounts) if the env var is unset.
  const SUPER_ADMINS = (process.env.SUPER_ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)

  router.patch('/users/:uid/role', async (req, res, next) => {
    try {
      const { role } = req.body || {}
      const allowedRoles = ['participant', 'admin', 'judge', 'mentor', 'viewer']
      if (!role || !allowedRoles.includes(role)) {
        return res.status(400).json({ error: 'role must be one of participant, admin, judge, mentor, viewer' })
      }

      // Protect super admin accounts
      const targetRef = db().doc(`users/${req.params.uid}`)
      const targetSnap = await targetRef.get()
      if (targetSnap.exists) {
        const targetEmail = targetSnap.data().email || ''
        if (SUPER_ADMINS.includes(targetEmail.toLowerCase())) {
          return res.status(403).json({ error: 'Cannot modify the super admin account.' })
        }
      }

      const updates = { role, updatedAt: FieldValue.serverTimestamp() }
      if (role === 'judge') {
        updates.assignedProblemStatementIds = []
      } else {
        updates.assignedProblemStatementIds = FieldValue.delete()
      }
      await targetRef.set(updates, { merge: true })
      // CRIT-03: Sync role to Firebase Auth custom claims so the change takes
      // effect on the user's next token refresh without a Firestore read.
      await syncRoleClaim(req.params.uid, role)
      await appendAuditLog({
        actorUid: req.user.uid,
        action: 'user.role',
        targetType: 'user',
        targetId: req.params.uid,
        metadata: { role },
      })
      res.json({ ok: true })
    } catch (e) {
      next(e)
    }
  })

  /** Ban a user (set role to 'banned', clear team) */
  router.post('/users/:uid/ban', async (req, res, next) => {
    try {
      const targetRef = db().doc(`users/${req.params.uid}`)
      const targetSnap = await targetRef.get()
      if (!targetSnap.exists) return res.status(404).json({ error: 'User not found.' })

      const targetEmail = targetSnap.data().email || ''
      if (SUPER_ADMINS.includes(targetEmail.toLowerCase())) {
        return res.status(403).json({ error: 'Cannot ban the super admin account.' })
      }

      await targetRef.set({
        role: 'banned',
        bannedAt: FieldValue.serverTimestamp(),
        bannedBy: req.user.uid,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true })
      // CRIT-03: Sync banned role to custom claims immediately.
      await syncRoleClaim(req.params.uid, 'banned')
      await appendAuditLog({
        actorUid: req.user.uid,
        action: 'user.ban',
        targetType: 'user',
        targetId: req.params.uid,
        metadata: { email: targetEmail },
      })
      res.json({ ok: true })
    } catch (e) {
      next(e)
    }
  })

  /** Unban a user (reset to participant) */
  router.post('/users/:uid/unban', async (req, res, next) => {
    try {
      const targetRef = db().doc(`users/${req.params.uid}`)
      const targetSnap = await targetRef.get()
      if (!targetSnap.exists) return res.status(404).json({ error: 'User not found.' })

      await targetRef.set({
        role: 'participant',
        bannedAt: FieldValue.delete(),
        bannedBy: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true })
      // CRIT-03: Restore participant claim so the user can access the platform again.
      await syncRoleClaim(req.params.uid, 'participant')
      await appendAuditLog({
        actorUid: req.user.uid,
        action: 'user.unban',
        targetType: 'user',
        targetId: req.params.uid,
      })
      res.json({ ok: true })
    } catch (e) {
      next(e)
    }
  })

  /** Full user purge — deletes Firestore profile + all associated data */
  async function purgeUser(db, uid, actorUid) {
    const targetRef = db.doc(`users/${uid}`)
    const targetSnap = await targetRef.get()
    if (!targetSnap.exists) return { ok: false, error: 'User not found.' }

    const userData = targetSnap.data()
    const targetEmail = userData.email || ''

    // Protect super admins
    const superAdmins = (process.env.SUPER_ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
    if (superAdmins.includes(targetEmail.toLowerCase())) {
      return { ok: false, error: 'Cannot delete the super admin account.' }
    }

    const teamId = userData.teamId || null

    // 1. Remove from team membership (memberIds / leaderId)
    if (teamId) {
      const teamRef = db.doc(`teams/${teamId}`)
      const teamSnap = await teamRef.get()
      if (teamSnap.exists) {
        const team = teamSnap.data()
        const memberIds = (team.memberIds || []).filter((m) => m !== uid)
        const patch = {
          memberIds,
          updatedAt: FieldValue.serverTimestamp(),
        }
        // If this user was the leader, clear leaderId
        if (team.leaderId === uid) patch.leaderId = memberIds[0] || null
        await teamRef.set(patch, { merge: true })
      }
    }

    // 2. Delete evaluations authored by this user
    try {
      const evalSnap = await db.collection('evaluations').where('judgeId', '==', uid).limit(500).get()
      for (const d of evalSnap.docs) await d.ref.delete()
    } catch { /* ignore */ }

    // 3. Delete mentor notes authored by this user
    try {
      const notesSnap = await db.collection('mentorNotes').where('mentorId', '==', uid).limit(500).get()
      for (const d of notesSnap.docs) await d.ref.delete()
    } catch { /* ignore */ }

    // 4. Delete mentor chat read state entries for this user
    // (stored as mentorChats/{teamId}/readState/{uid})
    // We can't query subcollections easily, so skip — they're harmless stale docs

    // 5. Delete notifications for this user
    try {
      const notifSnap = await db.collection('notifications').where('userId', '==', uid).limit(500).get()
      for (const d of notifSnap.docs) await d.ref.delete()
    } catch { /* ignore */ }

    // 6. Delete the user profile doc itself
    await targetRef.delete()

    // 7. Audit log
    await appendAuditLog({
      actorUid,
      action: 'user.purge',
      targetType: 'user',
      targetId: uid,
      metadata: { email: targetEmail, teamId },
    })

    return { ok: true, email: targetEmail }
  }

  /** Delete a user — full purge of all associated data */
  router.delete('/users/:uid', async (req, res, next) => {
    try {
      const result = await purgeUser(db(), req.params.uid, req.user.uid)
      if (!result.ok) return res.status(result.error.includes('not found') ? 404 : 403).json({ error: result.error })
      res.json({ ok: true })
    } catch (e) {
      next(e)
    }
  })

  /** Bulk delete users — full purge for each */
  router.post('/users/bulk-delete', async (req, res, next) => {
    try {
      const uids = Array.isArray(req.body?.uids) ? req.body.uids : []
      if (uids.length === 0) return res.status(400).json({ error: 'uids array required' })
      if (uids.length > 100) return res.status(400).json({ error: 'Max 100 users per bulk delete' })

      let success = 0
      let failed = 0
      const errors = []

      for (const uid of uids) {
        try {
          const result = await purgeUser(db(), uid, req.user.uid)
          if (result.ok) success++
          else { failed++; errors.push({ uid, error: result.error }) }
        } catch (e) {
          failed++
          errors.push({ uid, error: e.message || 'Unknown error' })
        }
      }

      await appendAuditLog({
        actorUid: req.user.uid,
        action: 'user.bulk_purge',
        targetType: 'users',
        targetId: uids.join(',').slice(0, 500),
        metadata: { count: uids.length, success, failed },
      })

      res.json({ ok: true, success, failed, errors })
    } catch (e) {
      next(e)
    }
  })

  router.patch('/event-config', async (req, res, next) => {
    try {
      const body = req.body || {}
      const patch = {}
      const boolKeys = ['registrationOpen', 'entryFeeEnabled']
      for (const k of boolKeys) {
        if (typeof body[k] === 'boolean') patch[k] = body[k]
      }
      if (typeof body.entryFeeAmount === 'number' && body.entryFeeAmount >= 0) patch.entryFeeAmount = body.entryFeeAmount
      if (typeof body.currency === 'string' && body.currency.length <= 8) patch.currency = body.currency.trim()

      const o = parseOptionalTimestamp(body.registrationOpensAt)
      if (o) patch.registrationOpensAt = o
      if (body.registrationOpensAt === null) patch.registrationOpensAt = FieldValue.delete()

      const c = parseOptionalTimestamp(body.registrationClosesAt)
      if (c) patch.registrationClosesAt = c
      if (body.registrationClosesAt === null) patch.registrationClosesAt = FieldValue.delete()

      const s = parseOptionalTimestamp(body.submissionDeadline)
      if (s) patch.submissionDeadline = s
      if (body.submissionDeadline === null) patch.submissionDeadline = FieldValue.delete()

      patch.updatedAt = FieldValue.serverTimestamp()
      patch.updatedBy = req.user.uid

      // Phase 8: Legacy config/event document removed - all config now stored in event documents
      // This endpoint is deprecated and does nothing. Use PATCH /events/:eventId instead.
      // await db().doc(`config/event`).set(patch, { merge: true })
      
      await appendAuditLog({
        actorUid: req.user.uid,
        action: 'legacy.event_config.patch',
        targetType: 'config',
        targetId: 'event',
      })
      res.json({ ok: true, deprecated: true, message: 'This endpoint is deprecated. Use PATCH /events/:eventId instead.' })
    } catch (e) {
      next(e)
    }
  })

  router.post('/assign-judge-problems', async (req, res, next) => {
    try {
      const { judgeId, problemStatementIds } = req.body || {}
      if (!judgeId || !Array.isArray(problemStatementIds)) {
        return res.status(400).json({ error: 'judgeId and problemStatementIds array required' })
      }
      if (problemStatementIds.length > 100) {
        return res.status(400).json({ error: 'Too many problem statement ids' })
      }
      const judgeSnap = await db().doc(`users/${judgeId}`).get()
      if (!judgeSnap.exists) return res.status(404).json({ error: 'User not found' })
      if (judgeSnap.data().role !== 'judge') return res.status(400).json({ error: 'User is not a judge' })

      const ids = [...new Set(problemStatementIds.map(String).filter(Boolean).map((id) => id.slice(0, 256)))]
      const eventScope = String(req.body?.eventId || req.eventId || '').trim()

      // BUG-3 FIX: Batch-read all PS docs in one call instead of N sequential reads.
      const psRefs = ids.map((pid) => db().doc(`problemStatements/${pid}`))
      const psSnaps = psRefs.length ? await db().getAll(...psRefs) : []
      for (let i = 0; i < ids.length; i++) {
        const pid = ids[i]
        const ps = psSnaps[i]
        if (!ps.exists) return res.status(400).json({ error: `Unknown problem statement ${pid}` })
        const ped = ps.data().eventId
        if (eventScope && ped && ped !== eventScope) {
          return res.status(400).json({ error: `Problem ${pid} does not belong to this event edition.` })
        }
      }

      await db().doc(`users/${judgeId}`).set({ assignedProblemStatementIds: ids, updatedAt: FieldValue.serverTimestamp() }, { merge: true })

      let allPsSnap
      if (eventScope) {
        allPsSnap = await db().collection('problemStatements').where('eventId', '==', eventScope).get()
      } else {
        allPsSnap = await db().collection('problemStatements').get()
      }

      // BUG-3 FIX: Use arrayUnion/arrayRemove instead of read-modify-write to prevent
      // race condition when two admins assign the same judge simultaneously.
      const batch = db().batch()
      for (const doc of allPsSnap.docs) {
        const should = ids.includes(doc.id)
        const cur = doc.data().assignedJudgeIds || []
        const has = cur.includes(judgeId)
        if (should === has) continue
        if (should) {
          batch.set(doc.ref, { assignedJudgeIds: FieldValue.arrayUnion(judgeId), updatedAt: FieldValue.serverTimestamp() }, { merge: true })
        } else {
          batch.set(doc.ref, { assignedJudgeIds: FieldValue.arrayRemove(judgeId), updatedAt: FieldValue.serverTimestamp() }, { merge: true })
        }
      }
      await batch.commit()

      await appendAuditLog({
        actorUid: req.user.uid,
        action: 'judge.assign_problems',
        targetType: 'user',
        targetId: judgeId,
        eventId: eventScope,
        metadata: { count: ids.length },
      })

      res.json({ ok: true })
    } catch (e) {
      next(e)
    }
  })

  // ─── JUDGE DOMAIN + TRACK ASSIGNMENT ─────────────────────────────────────
  // Judges can be assigned to specific problem statement IDs (existing) OR to
  // domain+track combinations that automatically cover all matching PS.
  // Both assignment types are resolved in GET /judges/assignments.

  const JUDGE_VALID_DOMAINS = [
    'Health', 'Education', 'Transportation', 'Food Safety & Security',
    'Waste Management', 'Agriculture', 'Industry & MSME Innovation', 'Open Innovation',
  ]
  const JUDGE_VALID_TRACKS = ['Software', 'Hardware']

  /** Assign a judge to a domain + track combination */
  router.post('/judges/assign-domain-track', async (req, res, next) => {
    try {
      const { judgeId, domain, track } = req.body || {}
      if (!judgeId) return res.status(400).json({ error: 'judgeId required' })
      if (!domain && !track) return res.status(400).json({ error: 'At least one of domain or track is required' })

      if (domain && !JUDGE_VALID_DOMAINS.includes(domain)) {
        return res.status(400).json({ error: `Invalid domain. Must be one of: ${JUDGE_VALID_DOMAINS.join(', ')}` })
      }
      if (track && !JUDGE_VALID_TRACKS.includes(track)) {
        return res.status(400).json({ error: `Invalid track. Must be one of: ${JUDGE_VALID_TRACKS.join(', ')}` })
      }

      const userRef = db().doc(`users/${judgeId}`)
      const userSnap = await userRef.get()
      if (!userSnap.exists) return res.status(404).json({ error: 'User not found.' })
      if (userSnap.data().role !== 'judge') return res.status(400).json({ error: 'User is not a judge.' })

      let alreadyExisted = false
      await db().runTransaction(async (tx) => {
        const snap = await tx.get(userRef)
        const existing = Array.isArray(snap.data()?.judgeAssignments) ? snap.data().judgeAssignments : []
        const dup = existing.some((a) => a.domain === (domain || null) && a.track === (track || null))
        if (dup) { alreadyExisted = true; return }
        tx.set(userRef, {
          judgeAssignments: [...existing, { domain: domain || null, track: track || null }],
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true })
      })

      if (alreadyExisted) return res.json({ ok: true, message: 'Assignment already exists.' })

      await appendAuditLog({
        actorUid: req.user.uid,
        action: 'judge.assign_domain_track',
        targetType: 'user',
        targetId: judgeId,
        metadata: { domain: domain || null, track: track || null },
      })
      res.json({ ok: true })
    } catch (e) {
      next(e)
    }
  })

  /** Remove a domain + track assignment from a judge */
  router.post('/judges/unassign-domain-track', async (req, res, next) => {
    try {
      const { judgeId, domain, track } = req.body || {}
      if (!judgeId) return res.status(400).json({ error: 'judgeId required' })

      const userRef = db().doc(`users/${judgeId}`)
      const userSnap = await userRef.get()
      if (!userSnap.exists) return res.status(404).json({ error: 'User not found.' })

      const existing = Array.isArray(userSnap.data()?.judgeAssignments) ? userSnap.data().judgeAssignments : []
      const updated = existing.filter(
        (a) => !(a.domain === (domain || null) && a.track === (track || null)),
      )
      await userRef.set({ judgeAssignments: updated, updatedAt: FieldValue.serverTimestamp() }, { merge: true })

      await appendAuditLog({
        actorUid: req.user.uid,
        action: 'judge.unassign_domain_track',
        targetType: 'user',
        targetId: judgeId,
        metadata: { domain: domain || null, track: track || null },
      })
      res.json({ ok: true })
    } catch (e) {
      next(e)
    }
  })

  /** Assign a judge directly to a specific team (adds to team.judgeIds). */
  router.post('/judges/assign-team', async (req, res, next) => {
    try {
      const { judgeId, teamId } = req.body || {}
      if (!judgeId || !teamId) return res.status(400).json({ error: 'judgeId and teamId required' })
      if (!isValidDocId(judgeId) || !isValidDocId(teamId)) return res.status(400).json({ error: 'Invalid id.' })

      const userSnap = await db().doc(`users/${judgeId}`).get()
      if (!userSnap.exists) return res.status(404).json({ error: 'User not found.' })
      if (userSnap.data().role !== 'judge') return res.status(400).json({ error: 'User is not a judge.' })

      const teamRef = db().doc(`teams/${teamId}`)
      const teamSnap = await teamRef.get()
      if (!teamSnap.exists) return res.status(404).json({ error: 'Team not found.' })

      // Single-judge lock: a team may be directly assigned to only ONE judge.
      // Run inside a transaction so two concurrent assigns can't both slip through.
      let conflictJudgeId = null
      let alreadyAssigned = false
      await db().runTransaction(async (tx) => {
        const snap = await tx.get(teamRef)
        if (!snap.exists) return // team deleted mid-request; treat as no-op
        const ids = Array.isArray(snap.data().judgeIds) ? snap.data().judgeIds : []
        if (ids.includes(judgeId)) { alreadyAssigned = true; return }
        const other = ids.find((id) => id && id !== judgeId)
        if (other) { conflictJudgeId = other; return }
        tx.set(
          teamRef,
          { judgeIds: FieldValue.arrayUnion(judgeId), updatedAt: FieldValue.serverTimestamp() },
          { merge: true },
        )
      })

      if (conflictJudgeId) {
        let who = conflictJudgeId
        try {
          const oSnap = await db().doc(`users/${conflictJudgeId}`).get()
          if (oSnap.exists) who = oSnap.data().email || oSnap.data().displayName || conflictJudgeId
        } catch { /* ignore lookup failure — fall back to uid */ }
        return res.status(409).json({ error: `Team is already assigned to another judge (${who}). Unassign it first.` })
      }

      if (alreadyAssigned) return res.json({ ok: true, alreadyAssigned: true })

      await appendAuditLog({
        actorUid: req.user.uid,
        action: 'judge.assign_team',
        targetType: 'team',
        targetId: teamId,
        metadata: { judgeId },
      })
      res.json({ ok: true })
    } catch (e) {
      next(e)
    }
  })

  /** Remove a judge's direct assignment to a team (clears team.judgeIds entry). */
  router.post('/judges/unassign-team', async (req, res, next) => {
    try {
      const { judgeId, teamId } = req.body || {}
      if (!judgeId || !teamId) return res.status(400).json({ error: 'judgeId and teamId required' })
      if (!isValidDocId(judgeId) || !isValidDocId(teamId)) return res.status(400).json({ error: 'Invalid id.' })

      const teamRef = db().doc(`teams/${teamId}`)
      const teamSnap = await teamRef.get()
      if (!teamSnap.exists) return res.status(404).json({ error: 'Team not found.' })

      await teamRef.set(
        { judgeIds: FieldValue.arrayRemove(judgeId), updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      )
      await appendAuditLog({
        actorUid: req.user.uid,
        action: 'judge.unassign_team',
        targetType: 'team',
        targetId: teamId,
        metadata: { judgeId },
      })
      res.json({ ok: true })
    } catch (e) {
      next(e)
    }
  })

  /** GET /admin/judges/assignments-overview — all judges with their PS + domain/track assignments */
  router.get('/judges/assignments-overview', async (req, res, next) => {
    try {
      const judgeSnap = await db().collection('users').where('role', '==', 'judge').limit(200).get()
      const judges = judgeSnap.docs.map((d) => ({
        id: d.id,
        email: d.data().email || '',
        displayName: d.data().displayName || '',
        assignedProblemStatementIds: Array.isArray(d.data().assignedProblemStatementIds) ? d.data().assignedProblemStatementIds : [],
        judgeAssignments: Array.isArray(d.data().judgeAssignments) ? d.data().judgeAssignments : [],
      }))
      res.json({ judges })
    } catch (e) {
      next(e)
    }
  })

  router.post('/record-team-payment', async (req, res, next) => {
    try {
      const { teamId, status } = req.body || {}
      const allowed = ['paid', 'waived', 'pending', 'not_required']
      if (!teamId || !allowed.includes(status)) {
        return res.status(400).json({ error: 'teamId and valid status required' })
      }
      const patch = {
        paymentStatus: status,
        paymentRecordedAt: FieldValue.serverTimestamp(),
        paymentRecordedBy: req.user.uid,
        updatedAt: FieldValue.serverTimestamp(),
      }
      if (status === 'paid' || status === 'waived' || status === 'not_required') {
        Object.assign(patch, {
          eventRegistered: true,
          registrationStatus: 'registered',
          eventRegisteredAt: FieldValue.serverTimestamp(),
        })
      }
      if (status === 'pending') {
        patch.eventRegistered = false
        patch.registrationStatus = 'pending'
      }
      await db().doc(`teams/${teamId}`).set(patch, { merge: true })
      await appendAuditLog({
        actorUid: req.user.uid,
        action: 'payment.record',
        targetType: 'team',
        targetId: teamId,
        metadata: { status },
      })
      res.json({ ok: true })
    } catch (e) {
      next(e)
    }
  })

  /**
   * BUG FIX #8: Admin endpoint to manually mark teams as registered
   * Useful for special cases: waived fees, offline registration, manual approvals
   */
  router.post('/record-team-registration', async (req, res, next) => {
    try {
      const { teamId, registrationStatus, paymentStatus } = req.body || {}
      const allowedRegStatus = ['registered', 'pending', 'blocked', 'rejected']
      const allowedPayStatus = ['paid', 'waived', 'pending', 'not_required']
      
      if (!teamId) {
        return res.status(400).json({ error: 'teamId required' })
      }
      
      if (registrationStatus && !allowedRegStatus.includes(registrationStatus)) {
        return res.status(400).json({ error: `Invalid registrationStatus. Allowed: ${allowedRegStatus.join(', ')}` })
      }
      
      if (paymentStatus && !allowedPayStatus.includes(paymentStatus)) {
        return res.status(400).json({ error: `Invalid paymentStatus. Allowed: ${allowedPayStatus.join(', ')}` })
      }

      const teamRef = db().doc(`teams/${teamId}`)
      const teamSnap = await teamRef.get()
      
      if (!teamSnap.exists) {
        return res.status(404).json({ error: 'Team not found' })
      }

      const patch = {
        updatedAt: FieldValue.serverTimestamp(),
        registrationRecordedBy: req.user.uid,
        registrationRecordedAt: FieldValue.serverTimestamp(),
      }

      // Set registration status
      if (registrationStatus) {
        patch.registrationStatus = registrationStatus
        
        if (registrationStatus === 'registered') {
          patch.eventRegistered = true
          patch.eventRegisteredAt = FieldValue.serverTimestamp()
        } else if (registrationStatus === 'pending') {
          patch.eventRegistered = false
          patch.registrationRequestedAt = FieldValue.serverTimestamp()
        } else if (registrationStatus === 'blocked' || registrationStatus === 'rejected') {
          patch.eventRegistered = false
        }
      }

      // Set payment status
      if (paymentStatus) {
        patch.paymentStatus = paymentStatus
        
        if (paymentStatus === 'paid' || paymentStatus === 'waived' || paymentStatus === 'not_required') {
          patch.eventRegistered = true
          patch.registrationStatus = 'registered'
          patch.eventRegisteredAt = FieldValue.serverTimestamp()
        }
      }

      await teamRef.set(patch, { merge: true })
      
      await appendAuditLog({
        actorUid: req.user.uid,
        action: 'registration.record',
        targetType: 'team',
        targetId: teamId,
        metadata: { registrationStatus, paymentStatus },
      })
      
      res.json({ ok: true })
    } catch (e) {
      next(e)
    }
  })

  /** Bulk operations endpoint - apply same operation to multiple teams at once */
  router.post('/bulk-operation', async (req, res, next) => {
    try {
      const { teamIds, operation, params = {} } = req.body || {}
      if (!Array.isArray(teamIds) || teamIds.length === 0) {
        return res.status(400).json({ error: 'teamIds array required (non-empty)' })
      }
      if (teamIds.length > 100) {
        return res.status(400).json({ error: 'Maximum 100 teams per bulk operation' })
      }
      const validOps = ['record_payment', 'update_registration', 'lock_submission', 'unlock_submission', 'shortlist', 'unshortlist', 'send_email']
      if (!validOps.includes(operation)) {
        return res.status(400).json({ error: `Invalid operation. Allowed: ${validOps.join(', ')}` })
      }

      const results = { success: 0, failed: 0, errors: [] }

      for (const teamId of teamIds) {
        try {
          const teamRef = db().doc(`teams/${teamId}`)
          const teamSnap = await teamRef.get()
          if (!teamSnap.exists) {
            results.failed += 1
            results.errors.push({ teamId, error: 'Team not found' })
            continue
          }

          let patch = { updatedAt: FieldValue.serverTimestamp() }

          switch (operation) {
            case 'record_payment': {
              const allowed = ['paid', 'waived', 'pending', 'not_required']
              const status = String(params.status || '').trim()
              if (!allowed.includes(status)) {
                results.failed += 1
                results.errors.push({ teamId, error: 'Invalid payment status' })
                continue
              }
              patch.paymentStatus = status
              patch.paymentRecordedAt = FieldValue.serverTimestamp()
              patch.paymentRecordedBy = req.user.uid
              if (status === 'paid' || status === 'waived' || status === 'not_required') {
                patch.eventRegistered = true
                patch.registrationStatus = 'registered'
                patch.eventRegisteredAt = FieldValue.serverTimestamp()
              }
              if (status === 'pending') {
                patch.eventRegistered = false
                patch.registrationStatus = 'pending'
              }
              break
            }
            case 'update_registration': {
              const REG_STATUS = ['registered', 'pending', 'blocked', 'rejected']
              const rs = String(params.registrationStatus || '').trim().toLowerCase()
              if (!REG_STATUS.includes(rs)) {
                results.failed += 1
                results.errors.push({ teamId, error: 'Invalid registration status' })
                continue
              }
              patch.registrationStatus = rs
              patch.eventRegistered = rs === 'registered'
              break
            }
            case 'lock_submission':
              patch.submissionLocked = true
              break
            case 'unlock_submission':
              patch.submissionLocked = false
              break
            case 'shortlist':
              patch.shortlisted = true
              break
            case 'unshortlist':
              patch.shortlisted = false
              break
            case 'send_email': {
              // Email sending is handled separately below
              break
            }
          }

          if (operation !== 'send_email') {
            await teamRef.set(patch, { merge: true })
          }

          // Handle email sending for send_email operation
          if (operation === 'send_email') {
            const { sendAnnouncementEmail } = await import('../services/emailService.js')
            const team = teamSnap.data()
            const leaderRef = db().doc(`users/${team.leaderId}`)
            const leaderSnap = await leaderRef.get()
            if (leaderSnap.exists) {
              const leader = leaderSnap.data()
              await sendAnnouncementEmail({
                to: leader.email,
                name: leader.displayName || 'Participant',
                title: params.emailTitle || 'Announcement',
                message: params.emailMessage || '',
                link: params.emailLink || '',
              })
            }
          }

          results.success += 1
        } catch (err) {
          results.failed += 1
          results.errors.push({ teamId, error: err.message })
        }
      }

      await appendAuditLog({
        actorUid: req.user.uid,
        action: `bulk.${operation}`,
        targetType: 'teams',
        targetId: teamIds.join(',').slice(0, 500),
        metadata: { count: teamIds.length, success: results.success, failed: results.failed, params },
      })

      res.json({ ok: true, ...results })
    } catch (e) {
      next(e)
    }
  })

  /** Export teams data as JSON (frontend converts to CSV) */
  router.get('/export/teams', async (req, res, next) => {
    try {
      const rawAll = req.query.all === '1'
      const eventId = rawAll ? '' : typeof req.query.eventId === 'string' ? req.query.eventId.trim() : req.eventId
      let q = db().collection('teams').limit(800)
      if (eventId) q = q.where('eventId', '==', eventId)
      const teamsSnap = await q.get()
      const teams = teamsSnap.docs.map((d) => ({ id: d.id, ...d.data() }))

      // Fetch member details for each team
      const exportData = []
      for (const team of teams) {
        const memberIds = team.memberIds || []
        const memberNames = []
        const memberEmails = []
        for (const mid of memberIds) {
          const uSnap = await db().doc(`users/${mid}`).get()
          if (uSnap.exists) {
            const u = uSnap.data()
            memberNames.push(u.displayName || '')
            memberEmails.push(u.email || '')
          }
        }
        exportData.push({
          teamId: team.id,
          teamName: team.name || '',
          inviteCode: team.inviteCode || '',
          leaderId: team.leaderId || '',
          memberCount: memberIds.length,
          memberNames: memberNames.join('; '),
          memberEmails: memberEmails.join('; '),
          eventId: team.eventId || '',
          registrationStatus: team.registrationStatus || '',
          eventRegistered: team.eventRegistered ? 'Yes' : 'No',
          paymentStatus: team.paymentStatus || '',
          problemStatementId: team.problemStatementId || '',
          submissionLocked: team.submissionLocked ? 'Yes' : 'No',
          shortlisted: team.shortlisted ? 'Yes' : 'No',
        })
      }

      res.json(exportData)
    } catch (e) {
      next(e)
    }
  })

  /** Export submissions data */
  router.get('/export/submissions', async (req, res, next) => {
    try {
      const rawAll = req.query.all === '1'
      const eventId = rawAll ? '' : typeof req.query.eventId === 'string' ? req.query.eventId.trim() : req.eventId
      let teamIds = null
      if (eventId) {
        const tsnap = await db().collection('teams').where('eventId', '==', eventId).limit(800).get()
        teamIds = new Set(tsnap.docs.map((d) => d.id))
      }

      // Get teams for name lookup
      const teamsSnap = await db().collection('teams').limit(800).get()
      const teamMap = new Map(teamsSnap.docs.map((d) => [d.id, d.data()]))

      const snap = await db().collection('submissions').limit(1000).get()
      let rows = snap.docs.map((d) => ({ teamId: d.id, ...d.data() }))
      if (teamIds) rows = rows.filter((r) => teamIds.has(r.teamId))

      const exportData = rows.map((sub) => {
        const team = teamMap.get(sub.teamId) || {}
        return {
          teamId: sub.teamId,
          teamName: team.name || '',
          status: sub.status || '',
          pptUrl: sub.pptUrl || '',
          pdfUrl: sub.pdfUrl || '',
          videoUrl: sub.videoUrl || '',
          githubUrl: sub.githubUrl || '',
          currentVersion: sub.currentVersion || 1,
          finalizedAt: sub.finalizedAt ? new Date(sub.finalizedAt._seconds * 1000).toISOString() : '',
        }
      })

      res.json(exportData)
    } catch (e) {
      next(e)
    }
  })

  /** Export mentor notes */
  router.get('/export/mentor-notes', async (req, res, next) => {
    try {
      const snap = await db().collection('mentorNotes').limit(2000).get()
      const notes = snap.docs.map((d) => {
        const data = d.data()
        return {
          mentorId: data.mentorId || '',
          teamId: data.teamId || '',
          body: data.body || '',
          nextSession: data.nextSession || '',
          updatedAt: data.updatedAt?.toDate?.()?.toISOString() || '',
        }
      })
      res.json(notes)
    } catch (e) {
      next(e)
    }
  })

  /** Save timeline phases (public landing page timeline) */
  router.put('/timeline', async (req, res, next) => {
    try {
      const activeEvent = await getActiveEvent()
      if (!activeEvent) return res.status(503).json({ error: 'No active event.' })
      const phases = Array.isArray(req.body?.phases) ? req.body.phases : []
      // Sanitize
      const cleaned = phases.map((p, i) => ({
        id: p.id || `tl-${Date.now()}-${i}`,
        phase: String(p.phase || '').trim().slice(0, 100),
        startDate: p.startDate || null,
        endDate: p.endDate || null,
        description: String(p.description || '').trim().slice(0, 500),
        status: p.status || 'upcoming',
      })).filter((p) => p.phase)

      await db().doc(`events/${activeEvent.id}`).set({
        timelinePhases: cleaned,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: req.user.uid,
      }, { merge: true })

      // HIGH-03: Invalidate event cache — timelinePhases changed
      invalidateEventCache()
      // Invalidate timeline cache so public page gets fresh data
      cacheInvalidate(CACHE_NS.TIMELINE)
      res.json({ ok: true, count: cleaned.length })
    } catch (e) {
      next(e)
    }
  })

  /** List all announcements (admin) */
  router.get('/announcements', async (req, res, next) => {
    try {
      const snap = await db().collection('announcements').orderBy('createdAt', 'desc').limit(100).get()
      res.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    } catch (e) {
      next(e)
    }
  })

  /** Delete announcement */
  router.delete('/announcements/:id', async (req, res, next) => {
    try {
      const ref = db().doc(`announcements/${req.params.id}`)
      const snap = await ref.get()
      if (!snap.exists) return res.status(404).json({ error: 'Announcement not found' })
      await ref.delete()
      await appendAuditLog({
        actorUid: req.user.uid,
        action: 'announcement.delete',
        targetType: 'announcement',
        targetId: req.params.id,
      })
      res.json({ ok: true })
    } catch (e) {
      next(e)
    }
  })

  /** Update announcement */
  router.patch('/announcements/:id', async (req, res, next) => {
    try {
      const ref = db().doc(`announcements/${req.params.id}`)
      const snap = await ref.get()
      if (!snap.exists) return res.status(404).json({ error: 'Announcement not found' })
      const patch = { updatedAt: FieldValue.serverTimestamp() }
      if (typeof req.body.title === 'string') patch.title = req.body.title.trim().slice(0, 200)
      if (typeof req.body.body === 'string') patch.body = req.body.body.trim().slice(0, 50000)
      if (typeof req.body.pinned === 'boolean') patch.pinned = req.body.pinned
      if (typeof req.body.audience === 'string') patch.audience = req.body.audience
      await ref.set(patch, { merge: true })
      res.json({ ok: true })
    } catch (e) {
      next(e)
    }
  })

  router.post('/announcements', async (req, res, next) => {
    try {
      let { title, body, audience = 'all', sendEmail: shouldEmail } = req.body || {}
      if (!title || !body) return res.status(400).json({ error: 'title and body required' })
      title = String(title).trim().slice(0, 200)
      body = String(body).trim().slice(0, 50000)
      if (!title || !body) return res.status(400).json({ error: 'title and body required' })
      const audAllowed = ['all', 'participants', 'team_leaders', 'mentors', 'judges', 'admins']
      const aud = audAllowed.includes(String(audience)) ? audience : 'all'
      const evId = String(req.body?.eventId || req.eventId || '').trim()
      await db().collection('announcements').add({
        title,
        body,
        audience: aud,
        eventId: evId,
        pinned: Boolean(req.body?.pinned),
        authorId: req.user.uid,
        createdAt: FieldValue.serverTimestamp(),
      })

      // Optionally send email to all matching users
      let emailResult = null
      if (shouldEmail) {
        const { notifyBroadcast } = await import('../services/notificationService.js')
        emailResult = await notifyBroadcast({
          title,
          message: body,
          link: req.body?.link || '',
          eventId: evId,
          audience: aud,
        })
      }

      res.json({ ok: true, emailSent: emailResult?.sent || 0 })
    } catch (e) {
      next(e)
    }
  })

  /** Admin: Send payment reminders to all unpaid teams */
  router.post('/send-payment-reminders', async (req, res, next) => {
    try {
      const { getActiveEventConfig } = await import('../services/eventsService.js')
      const merged = await getActiveEventConfig()
      const { notifyPaymentReminders } = await import('../services/notificationService.js')
      const result = await notifyPaymentReminders({ eventConfig: merged })
      await appendAuditLog({
        actorUid: req.user.uid,
        action: 'admin.send_payment_reminders',
        targetType: 'system',
        targetId: 'bulk',
        metadata: { sent: result.sent },
      })
      res.json({ ok: true, ...result })
    } catch (e) {
      next(e)
    }
  })

  /**
   * Admin: Bulk-invite team leaders. Creates Firebase Auth accounts with a
   * temporary password + mustChangePassword flag, and emails credentials via Brevo.
   * Body: { emails: string[] }  (or newline/comma-separated string in `emailsText`)
   */
  router.post('/participants/bulk-invite', async (req, res, next) => {
    try {
      let emails = Array.isArray(req.body?.emails) ? req.body.emails : []
      if (emails.length === 0 && typeof req.body?.emailsText === 'string') {
        emails = req.body.emailsText.split(/[\s,;]+/).filter(Boolean)
      }
      if (emails.length === 0) {
        return res.status(400).json({ error: 'Provide emails (array) or emailsText (string).' })
      }
      const { bulkInviteLeaders } = await import('../services/leaderAccounts.js')
      const result = await bulkInviteLeaders(emails)
      await appendAuditLog({
        actorUid: req.user.uid,
        action: 'participants.bulk_invite',
        targetType: 'users',
        targetId: '',
        metadata: result.summary,
      })
      res.json({ ok: true, ...result })
    } catch (e) {
      next(e)
    }
  })

  /**
   * Admin: Onboarding status of invited team leaders — read-only.
   * Shows who was emailed credentials, who has logged in, and who has set
   * their password (mustChangePassword flipped to false on first-login change).
   */
  router.get('/participants/status', async (req, res, next) => {
    try {
      const snap = await db()
        .collection('users')
        .where('invitedAsLeader', '==', true)
        .limit(1000)
        .get()

      const toIso = (v) => {
        try {
          if (!v) return null
          if (typeof v === 'string') return v
          if (typeof v.toDate === 'function') return v.toDate().toISOString()
          return null
        } catch { return null }
      }

      const rows = snap.docs.map((d) => {
        const x = d.data()
        return {
          uid: d.id,
          email: x.email || '',
          displayName: x.displayName || '',
          invitedAt: toIso(x.createdAt),
          credentialsSentAt: toIso(x.credentialsSentAt) || toIso(x.createdAt),
          passwordSet: x.mustChangePassword === false,
          passwordChangedAt: toIso(x.passwordChangedAt),
          lastSignInTime: null,
          loggedIn: false,
        }
      })

      // Enrich with Firebase Auth last-sign-in time (batched, 100 uids per call).
      try {
        const { getAuth } = await import('firebase-admin/auth')
        const auth = getAuth()
        for (let i = 0; i < rows.length; i += 100) {
          const chunk = rows.slice(i, i + 100)
          const result = await auth.getUsers(chunk.map((r) => ({ uid: r.uid })))
          const byUid = new Map(result.users.map((u) => [u.uid, u]))
          for (const r of chunk) {
            const u = byUid.get(r.uid)
            const t = u?.metadata?.lastSignInTime || null
            r.lastSignInTime = t ? new Date(t).toISOString() : null
            r.loggedIn = Boolean(r.lastSignInTime)
          }
        }
      } catch (e) {
        console.warn('[participants/status] auth enrich failed:', e.message)
      }

      rows.sort((a, b) => (b.credentialsSentAt || '').localeCompare(a.credentialsSentAt || ''))

      const summary = {
        total: rows.length,
        loggedIn: rows.filter((r) => r.loggedIn).length,
        passwordSet: rows.filter((r) => r.passwordSet).length,
        pending: rows.filter((r) => !r.passwordSet).length,
      }
      res.json({ ok: true, summary, participants: rows })
    } catch (e) {
      next(e)
    }
  })

  /**
   * Shared onboarding-status builder for invited staff (judges / mentors).
   * Mirrors the /participants/status logic but filters by staffRole so it never
   * touches the team-leader status view.
   */
  async function buildStaffInviteStatus(staffRole) {
    const snap = await db()
      .collection('users')
      .where('staffRole', '==', staffRole)
      .limit(1000)
      .get()

    const toIso = (v) => {
      try {
        if (!v) return null
        if (typeof v === 'string') return v
        if (typeof v.toDate === 'function') return v.toDate().toISOString()
        return null
      } catch { return null }
    }

    const rows = snap.docs.map((d) => {
      const x = d.data()
      return {
        uid: d.id,
        email: x.email || '',
        displayName: x.displayName || '',
        invitedAt: toIso(x.createdAt),
        credentialsSentAt: toIso(x.credentialsSentAt) || toIso(x.createdAt),
        passwordSet: x.mustChangePassword === false,
        passwordChangedAt: toIso(x.passwordChangedAt),
        lastSignInTime: null,
        loggedIn: false,
      }
    })

    try {
      const { getAuth } = await import('firebase-admin/auth')
      const auth = getAuth()
      for (let i = 0; i < rows.length; i += 100) {
        const chunk = rows.slice(i, i + 100)
        const result = await auth.getUsers(chunk.map((r) => ({ uid: r.uid })))
        const byUid = new Map(result.users.map((u) => [u.uid, u]))
        for (const r of chunk) {
          const u = byUid.get(r.uid)
          const t = u?.metadata?.lastSignInTime || null
          r.lastSignInTime = t ? new Date(t).toISOString() : null
          r.loggedIn = Boolean(r.lastSignInTime)
        }
      }
    } catch (e) {
      console.warn(`[${staffRole}/status] auth enrich failed:`, e.message)
    }

    rows.sort((a, b) => (b.credentialsSentAt || '').localeCompare(a.credentialsSentAt || ''))

    const summary = {
      total: rows.length,
      loggedIn: rows.filter((r) => r.loggedIn).length,
      passwordSet: rows.filter((r) => r.passwordSet).length,
      pending: rows.filter((r) => !r.passwordSet).length,
    }
    return { summary, participants: rows }
  }

  /** Admin: Bulk-invite jury members — creates accounts + emails credentials. */
  router.post('/judges/bulk-invite', async (req, res, next) => {
    try {
      let emails = Array.isArray(req.body?.emails) ? req.body.emails : []
      if (emails.length === 0 && typeof req.body?.emailsText === 'string') {
        emails = req.body.emailsText.split(/[\s,;]+/).filter(Boolean)
      }
      if (emails.length === 0) return res.status(400).json({ error: 'Provide emails (array) or emailsText (string).' })
      const { bulkInviteLeaders } = await import('../services/leaderAccounts.js')
      const result = await bulkInviteLeaders(emails, 'judge')
      await appendAuditLog({ actorUid: req.user.uid, action: 'judges.bulk_invite', targetType: 'users', targetId: '', metadata: result.summary })
      res.json({ ok: true, ...result })
    } catch (e) {
      next(e)
    }
  })

  /** Admin: Onboarding status of invited jury members — read-only. */
  router.get('/judges/status', async (req, res, next) => {
    try {
      const data = await buildStaffInviteStatus('judge')
      res.json({ ok: true, ...data })
    } catch (e) {
      next(e)
    }
  })

  /** Admin: Bulk-invite mentors — creates accounts + emails credentials. */
  router.post('/mentors/bulk-invite', async (req, res, next) => {
    try {
      let emails = Array.isArray(req.body?.emails) ? req.body.emails : []
      if (emails.length === 0 && typeof req.body?.emailsText === 'string') {
        emails = req.body.emailsText.split(/[\s,;]+/).filter(Boolean)
      }
      if (emails.length === 0) return res.status(400).json({ error: 'Provide emails (array) or emailsText (string).' })
      const { bulkInviteLeaders } = await import('../services/leaderAccounts.js')
      const result = await bulkInviteLeaders(emails, 'mentor')
      await appendAuditLog({ actorUid: req.user.uid, action: 'mentors.bulk_invite', targetType: 'users', targetId: '', metadata: result.summary })
      res.json({ ok: true, ...result })
    } catch (e) {
      next(e)
    }
  })

  /** Admin: Onboarding status of invited mentors — read-only. */
  router.get('/mentors/status', async (req, res, next) => {
    try {
      const data = await buildStaffInviteStatus('mentor')
      res.json({ ok: true, ...data })
    } catch (e) {
      next(e)
    }
  })

  /** Admin: Bulk-invite Registration Desk accounts — creates accounts + emails credentials. */
  router.post('/registration-desk/bulk-invite', async (req, res, next) => {
    try {
      let emails = Array.isArray(req.body?.emails) ? req.body.emails : []
      if (emails.length === 0 && typeof req.body?.emailsText === 'string') {
        emails = req.body.emailsText.split(/[\s,;]+/).filter(Boolean)
      }
      if (emails.length === 0) return res.status(400).json({ error: 'Provide emails (array) or emailsText (string).' })
      const { bulkInviteLeaders } = await import('../services/leaderAccounts.js')
      const result = await bulkInviteLeaders(emails, 'registration_desk')
      await appendAuditLog({ actorUid: req.user.uid, action: 'regdesk.bulk_invite', targetType: 'users', targetId: '', metadata: result.summary })
      res.json({ ok: true, ...result })
    } catch (e) {
      next(e)
    }
  })

  /** Admin: Registration Desk accounts + their assigned domains — read-only. */
  router.get('/registration-desk/status', async (req, res, next) => {
    try {
      const data = await buildStaffInviteStatus('registration_desk')
      const ids = data.participants.map((p) => p.uid)
      const domainMap = {}
      for (let i = 0; i < ids.length; i += 10) {
        const chunk = ids.slice(i, i + 10)
        const snaps = await Promise.all(chunk.map((id) => db().doc(`users/${id}`).get()))
        snaps.forEach((s) => {
          if (s.exists) domainMap[s.id] = Array.isArray(s.data().assignedDomains) ? s.data().assignedDomains : []
        })
      }
      data.participants = data.participants.map((p) => ({ ...p, assignedDomains: domainMap[p.uid] || [] }))
      res.json({ ok: true, ...data })
    } catch (e) {
      next(e)
    }
  })

  /** Admin: assign check-in domains to a Registration Desk account. */
  router.post('/registration-desk/assign-domains', async (req, res, next) => {
    try {
      const { uid, domains } = req.body || {}
      if (!uid) return res.status(400).json({ error: 'uid required' })
      const list = Array.isArray(domains) ? domains : []
      const invalid = list.filter((d) => !JUDGE_VALID_DOMAINS.includes(d))
      if (invalid.length) return res.status(400).json({ error: `Invalid domain(s): ${invalid.join(', ')}` })
      const userRef = db().doc(`users/${uid}`)
      const snap = await userRef.get()
      if (!snap.exists) return res.status(404).json({ error: 'User not found.' })
      if (snap.data().role !== 'registration_desk') return res.status(400).json({ error: 'User is not a Registration Desk account.' })
      await userRef.set({ assignedDomains: list, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
      await appendAuditLog({ actorUid: req.user.uid, action: 'regdesk.assign_domains', targetType: 'user', targetId: uid, metadata: { domains: list } })
      res.json({ ok: true })
    } catch (e) {
      next(e)
    }
  })

  /**
   * Admin: Bulk-invite Observers (read-only viewer role) — creates accounts +
   * emails credentials. Observers can view the admin dashboard but cannot make
   * any changes (enforced by the read-only guard on this router).
   */
  router.post('/viewers/bulk-invite', async (req, res, next) => {
    try {
      let emails = Array.isArray(req.body?.emails) ? req.body.emails : []
      if (emails.length === 0 && typeof req.body?.emailsText === 'string') {
        emails = req.body.emailsText.split(/[\s,;]+/).filter(Boolean)
      }
      if (emails.length === 0) return res.status(400).json({ error: 'Provide emails (array) or emailsText (string).' })
      const { bulkInviteLeaders } = await import('../services/leaderAccounts.js')
      const result = await bulkInviteLeaders(emails, 'viewer')
      await appendAuditLog({ actorUid: req.user.uid, action: 'viewers.bulk_invite', targetType: 'users', targetId: '', metadata: result.summary })
      res.json({ ok: true, ...result })
    } catch (e) {
      next(e)
    }
  })

  /** Admin: Onboarding status of invited Observers — read-only. */
  router.get('/viewers/status', async (req, res, next) => {
    try {
      const data = await buildStaffInviteStatus('viewer')
      res.json({ ok: true, ...data })
    } catch (e) {
      next(e)
    }
  })

  /**
   * Admin: Send a password-reset link to a user via Brevo (Fix 1 — better
   * deliverability than Firebase's default sender). Body: { email }
   */
  router.post('/participants/send-reset-link', async (req, res, next) => {
    try {
      const email = String(req.body?.email || '').trim()
      if (!email) return res.status(400).json({ error: 'email required' })
      const { sendResetLinkViaBrevo } = await import('../services/leaderAccounts.js')
      const result = await sendResetLinkViaBrevo(email)
      if (!result.ok) return res.status(400).json({ error: result.error })
      res.json({ ok: true })
    } catch (e) {
      next(e)
    }
  })

  /**
   * Admin: Test email delivery — sends a test email to the requesting admin's address.
   * Use this to verify Brevo API key, sender domain, and FRONTEND_URL are all correct
   * before going live. Does NOT send to participants.
   */
  router.post('/test-email', async (req, res, next) => {
    try {
      const { sendWelcomeEmail } = await import('../services/emailService.js')
      const adminEmail = req.user.email
      if (!adminEmail) {
        return res.status(400).json({ error: 'Admin account has no email address.' })
      }
      const result = await sendWelcomeEmail({
        to: adminEmail,
        name: 'Admin (Test)',
        teamName: 'Test Team',
        eventName: 'Smart Kopargaon Hackathon (TEST)',
      })
      await appendAuditLog({
        actorUid: req.user.uid,
        action: 'admin.test_email',
        targetType: 'system',
        targetId: 'email',
        metadata: { to: adminEmail, success: result.success, error: result.error || null },
      })
      if (result.success) {
        res.json({ ok: true, message: `Test email sent to ${adminEmail}`, messageId: result.messageId })
      } else {
        res.status(502).json({
          ok: false,
          error: result.error || result.reason || 'Email send failed',
          hint: result.reason === 'not_configured'
            ? 'Set BREVO_API_KEY in your backend .env file.'
            : 'Check BREVO_API_KEY validity and that EMAIL_FROM_ADDRESS is a verified sender in Brevo.',
        })
      }
    } catch (e) {
      next(e)
    }
  })

  /** Admin: Send submission deadline reminders */
  router.post('/send-submission-reminders', async (req, res, next) => {
    try {
      const hoursLeft = Number(req.body?.hoursLeft) || 24
      const { getActiveEventConfig } = await import('../services/eventsService.js')
      const merged = await getActiveEventConfig()
      const { notifySubmissionDeadlineReminders } = await import('../services/notificationService.js')
      const result = await notifySubmissionDeadlineReminders({ eventConfig: merged, hoursLeft })
      await appendAuditLog({
        actorUid: req.user.uid,
        action: 'admin.send_submission_reminders',
        targetType: 'system',
        targetId: 'bulk',
        metadata: { sent: result.sent, hoursLeft },
      })
      res.json({ ok: true, ...result })
    } catch (e) {
      next(e)
    }
  })

  router.post('/mentors/assign', async (req, res, next) => {
    try {
      const { teamId, mentorId } = req.body || {}
      if (!teamId || !mentorId) return res.status(400).json({ error: 'teamId and mentorId required' })
      if (!isValidDocId(teamId)) return res.status(400).json({ error: 'Invalid teamId.' })
      if (!isValidDocId(mentorId)) return res.status(400).json({ error: 'Invalid mentorId.' })

      // Verify team exists
      const teamSnap = await db().doc(`teams/${teamId}`).get()
      if (!teamSnap.exists) return res.status(404).json({ error: 'Team not found.' })

      // Verify mentor user exists and has mentor role
      const mentorSnap = await db().doc(`users/${mentorId}`).get()
      if (!mentorSnap.exists) return res.status(404).json({ error: 'Mentor user not found.' })
      if (mentorSnap.data().role !== 'mentor') {
        return res.status(400).json({ error: 'User does not have the mentor role.' })
      }

      await db()
        .doc(`teams/${teamId}`)
        .set(
          { mentorIds: FieldValue.arrayUnion(mentorId), updatedAt: FieldValue.serverTimestamp() },
          { merge: true },
        )

      await appendAuditLog({
        actorUid: req.user.uid,
        action: 'mentor.assign_team',
        targetType: 'team',
        targetId: teamId,
        metadata: { mentorId },
      })

      res.json({ ok: true })
    } catch (e) {
      next(e)
    }
  })

  /** Remove a mentor directly assigned to a team (clears team.mentorIds entry). */
  router.post('/mentors/unassign', async (req, res, next) => {
    try {
      const { teamId, mentorId } = req.body || {}
      if (!teamId || !mentorId) return res.status(400).json({ error: 'teamId and mentorId required' })
      if (!isValidDocId(teamId)) return res.status(400).json({ error: 'Invalid teamId.' })
      if (!isValidDocId(mentorId)) return res.status(400).json({ error: 'Invalid mentorId.' })

      const teamSnap = await db().doc(`teams/${teamId}`).get()
      if (!teamSnap.exists) return res.status(404).json({ error: 'Team not found.' })

      await db()
        .doc(`teams/${teamId}`)
        .set(
          { mentorIds: FieldValue.arrayRemove(mentorId), updatedAt: FieldValue.serverTimestamp() },
          { merge: true },
        )

      await appendAuditLog({
        actorUid: req.user.uid,
        action: 'mentor.unassign_team',
        targetType: 'team',
        targetId: teamId,
        metadata: { mentorId },
      })

      res.json({ ok: true })
    } catch (e) {
      next(e)
    }
  })

  /** Assign mentor to a problem statement (mentors all teams under that PS) */
  router.post('/mentors/assign-problem', async (req, res, next) => {
    try {
      const { problemStatementId, mentorId } = req.body || {}
      if (!problemStatementId || !mentorId) return res.status(400).json({ error: 'problemStatementId and mentorId required' })
      await db()
        .doc(`problemStatements/${problemStatementId}`)
        .set(
          { mentorIds: FieldValue.arrayUnion(mentorId), updatedAt: FieldValue.serverTimestamp() },
          { merge: true },
        )
      await appendAuditLog({
        actorUid: req.user.uid,
        action: 'mentor.assign_problem',
        targetType: 'problemStatement',
        targetId: problemStatementId,
        metadata: { mentorId },
      })
      res.json({ ok: true })
    } catch (e) {
      next(e)
    }
  })

  /** Remove mentor from a problem statement */
  router.post('/mentors/unassign-problem', async (req, res, next) => {
    try {
      const { problemStatementId, mentorId } = req.body || {}
      if (!problemStatementId || !mentorId) return res.status(400).json({ error: 'problemStatementId and mentorId required' })
      await db()
        .doc(`problemStatements/${problemStatementId}`)
        .set(
          { mentorIds: FieldValue.arrayRemove(mentorId), updatedAt: FieldValue.serverTimestamp() },
          { merge: true },
        )
      await appendAuditLog({
        actorUid: req.user.uid,
        action: 'mentor.unassign_problem',
        targetType: 'problemStatement',
        targetId: problemStatementId,
        metadata: { mentorId },
      })
      res.json({ ok: true })
    } catch (e) {
      next(e)
    }
  })

  /** Assign mentor to a domain + track combination */
  router.post('/mentors/assign-domain-track', async (req, res, next) => {
    try {
      const { mentorId, domain, track } = req.body || {}
      if (!mentorId) return res.status(400).json({ error: 'mentorId required' })
      if (!domain && !track) return res.status(400).json({ error: 'At least one of domain or track is required' })

      const VALID_DOMAINS = [
        'Health', 'Education', 'Transportation', 'Food Safety & Security',
        'Waste Management', 'Agriculture', 'Industry & MSME Innovation', 'Open Innovation',
      ]
      const VALID_TRACKS = ['Software', 'Hardware']

      if (domain && !VALID_DOMAINS.includes(domain)) {
        return res.status(400).json({ error: `Invalid domain. Must be one of: ${VALID_DOMAINS.join(', ')}` })
      }
      if (track && !VALID_TRACKS.includes(track)) {
        return res.status(400).json({ error: `Invalid track. Must be one of: ${VALID_TRACKS.join(', ')}` })
      }

      const userRef = db().doc(`users/${mentorId}`)
      const userSnap = await userRef.get()
      if (!userSnap.exists) return res.status(404).json({ error: 'Mentor user not found.' })

      // Use a transaction to prevent race conditions on concurrent assignments
      let alreadyExisted = false
      await db().runTransaction(async (tx) => {
        const snap = await tx.get(userRef)
        const existing = Array.isArray(snap.data()?.mentorAssignments) ? snap.data().mentorAssignments : []
        const dup = existing.some((a) => a.domain === (domain || null) && a.track === (track || null))
        if (dup) { alreadyExisted = true; return }
        tx.set(userRef, {
          mentorAssignments: [...existing, { domain: domain || null, track: track || null }],
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true })
      })

      if (alreadyExisted) return res.json({ ok: true, message: 'Assignment already exists.' })

      await appendAuditLog({
        actorUid: req.user.uid,
        action: 'mentor.assign_domain_track',
        targetType: 'user',
        targetId: mentorId,
        metadata: { domain, track },
      })

      res.json({ ok: true })
    } catch (e) {
      next(e)
    }
  })

  /** Remove a domain+track assignment from a mentor */
  router.post('/mentors/unassign-domain-track', async (req, res, next) => {
    try {
      const { mentorId, domain, track } = req.body || {}
      if (!mentorId) return res.status(400).json({ error: 'mentorId required' })

      const userRef = db().doc(`users/${mentorId}`)
      const userSnap = await userRef.get()
      if (!userSnap.exists) return res.status(404).json({ error: 'Mentor user not found.' })

      const existing = Array.isArray(userSnap.data().mentorAssignments) ? userSnap.data().mentorAssignments : []
      const updated = existing.filter(
        (a) => !(a.domain === (domain || null) && a.track === (track || null)),
      )
      await userRef.set({ mentorAssignments: updated, updatedAt: FieldValue.serverTimestamp() }, { merge: true })

      await appendAuditLog({
        actorUid: req.user.uid,
        action: 'mentor.unassign_domain_track',
        targetType: 'user',
        targetId: mentorId,
        metadata: { domain: domain || null, track: track || null },
      })

      res.json({ ok: true })
    } catch (e) {
      next(e)
    }
  })

  /** GET /admin/mentors/assignments-overview — list all mentors with their assignments */
  router.get('/mentors/assignments-overview', async (req, res, next) => {
    try {
      const mentorSnap = await db().collection('users').where('role', '==', 'mentor').limit(200).get()
      const mentors = mentorSnap.docs.map((d) => ({
        id: d.id,
        email: d.data().email || '',
        displayName: d.data().displayName || '',
        mentorAssignments: Array.isArray(d.data().mentorAssignments) ? d.data().mentorAssignments : [],
      }))
      res.json({ mentors })
    } catch (e) {
      next(e)
    }
  })

  // ─── SECURITY CENTER ENDPOINTS ────────────────────────────────────────────

  /** GET /admin/security/activity — platform-wide activity log (all roles) */
  router.get('/security/activity', async (req, res, next) => {
    try {
      const lim = Math.min(Number(req.query.limit) || 300, 1000)
      const snap = await db().collection('activityLog').orderBy('createdAt', 'desc').limit(lim).get()
      res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (e) {
      next(e)
    }
  })

  /** GET /admin/security/events — security event log */
  router.get('/security/events', async (req, res, next) => {
    try {
      const lim = Math.min(Number(req.query.limit) || 200, 500)
      const snap = await db().collection('securityEvents').orderBy('createdAt', 'desc').limit(lim).get()
      res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (e) {
      next(e)
    }
  })

  /** GET /admin/security/incidents — incident list */
  router.get('/security/incidents', async (req, res, next) => {
    try {
      const snap = await db().collection('securityIncidents').orderBy('createdAt', 'desc').limit(200).get()
      res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (e) {
      next(e)
    }
  })

  /** POST /admin/security/incidents — create incident */
  router.post('/security/incidents', async (req, res, next) => {
    try {
      const { title, description, severity, source, targetEntity, metadata } = req.body || {}
      if (!title) return res.status(400).json({ error: 'title required' })
      const { createIncident } = await import('../services/incidentManager.js')
      const id = await createIncident({
        title: String(title).slice(0, 200),
        description: String(description || '').slice(0, 2000),
        severity,
        source: String(source || 'manual').slice(0, 100),
        targetEntity: String(targetEntity || '').slice(0, 256),
        metadata: metadata || {},
        createdBy: req.user.uid,
      })
      await appendAuditLog({
        actorUid: req.user.uid,
        action: 'security.incident.create',
        targetType: 'incident',
        targetId: id || '',
        metadata: { title: String(title).slice(0, 80), severity },
      })
      res.json({ ok: true, id })
    } catch (e) {
      next(e)
    }
  })

  /** PATCH /admin/security/incidents/:id — update status / add note */
  router.patch('/security/incidents/:id', async (req, res, next) => {
    try {
      const { id } = req.params
      const { status, note, assignedTo } = req.body || {}
      const { updateIncidentStatus, addIncidentNote } = await import('../services/incidentManager.js')
      if (status) {
        await updateIncidentStatus(id, status, req.user.uid, note || '')
      } else if (note) {
        await addIncidentNote(id, req.user.uid, note)
      }
      if (assignedTo !== undefined) {
        await db().doc(`securityIncidents/${id}`).set({
          assignedTo: assignedTo ? String(assignedTo).slice(0, 128) : null,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true })
      }
      await appendAuditLog({
        actorUid: req.user.uid,
        action: 'security.incident.update',
        targetType: 'incident',
        targetId: id,
        metadata: { status, hasNote: Boolean(note) },
      })
      res.json({ ok: true })
    } catch (e) {
      next(e)
    }
  })

  /** GET /admin/security/webhook-log — Razorpay webhook event history */
  router.get('/security/webhook-log', async (req, res, next) => {
    try {
      const lim = Math.min(Number(req.query.limit) || 100, 300)
      const snap = await db().collection('webhookLog').orderBy('createdAt', 'desc').limit(lim).get()
      res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (e) {
      next(e)
    }
  })

  /** GET /admin/security/duplicate-teams — detect potential duplicate registrations */
  router.get('/security/duplicate-teams', async (req, res, next) => {
    try {
      const eventId = typeof req.query.eventId === 'string' ? req.query.eventId.trim() : req.eventId
      let q = db().collection('teams').limit(800)
      if (eventId) q = q.where('eventId', '==', eventId)
      const snap = await q.get()
      const teams = snap.docs.map(d => ({ id: d.id, ...d.data() }))

      // Batch-fetch all member user profiles in one call instead of N+1 individual reads
      const allUids = [...new Set(teams.flatMap(t => t.memberIds || []))]
      const userMap = new Map()
      if (allUids.length > 0) {
        // Firestore getAll supports up to 500 docs per call
        const chunks = []
        for (let i = 0; i < allUids.length; i += 500) chunks.push(allUids.slice(i, i + 500))
        for (const chunk of chunks) {
          const refs = chunk.map(uid => db().doc(`users/${uid}`))
          const snaps = await db().getAll(...refs)
          for (const snap of snaps) {
            if (snap.exists) userMap.set(snap.id, snap.data())
          }
        }
      }

      // Detect overlapping members across teams
      const memberToTeams = new Map()
      for (const team of teams) {
        for (const uid of (team.memberIds || [])) {
          if (!memberToTeams.has(uid)) memberToTeams.set(uid, [])
          memberToTeams.get(uid).push(team.id)
        }
      }

      const duplicates = []
      for (const [uid, teamIds] of memberToTeams.entries()) {
        if (teamIds.length > 1) {
          const u = userMap.get(uid) || {}
          duplicates.push({
            uid,
            email: u.email || '',
            displayName: u.displayName || '',
            teamIds,
            riskScore: Math.min(100, teamIds.length * 40),
          })
        }
      }

      // Detect teams with same leader
      const leaderToTeams = new Map()
      for (const team of teams) {
        if (!team.leaderId) continue
        if (!leaderToTeams.has(team.leaderId)) leaderToTeams.set(team.leaderId, [])
        leaderToTeams.get(team.leaderId).push(team.id)
      }
      const duplicateLeaders = []
      for (const [uid, teamIds] of leaderToTeams.entries()) {
        if (teamIds.length > 1) {
          const u = userMap.get(uid) || {}
          duplicateLeaders.push({ uid, email: u.email || '', displayName: u.displayName || '', teamIds, riskScore: 90 })
        }
      }

      res.json({ duplicateMembers: duplicates, duplicateLeaders, totalTeams: teams.length })
    } catch (e) {
      next(e)
    }
  })

  // ─── Chat monitor (read-only) ────────────────────────────────────
  // Admins can view every team chat and mentor↔team chat. Conversations are
  // returned newest-activity-first so the latest ones surface at the top.

  /** GET /admin/chats — all conversations (team + mentor), latest activity first. */
  router.get('/chats', async (req, res, next) => {
    try {
      const database = db()
      const [teamsSnap, teamChatsSnap, mentorChatsSnap] = await Promise.all([
        database.collection('teams').limit(2000).get(),
        database.collection('chats').limit(2000).get(),
        database.collection('mentorChats').limit(2000).get(),
      ])

      const teamName = new Map()
      const teamEvent = new Map()
      teamsSnap.forEach((d) => {
        const t = d.data() || {}
        teamName.set(d.id, t.name || 'Team')
        teamEvent.set(d.id, t.eventId || '')
      })

      const conversations = []
      const pushConv = (type, d) => {
        const c = d.data() || {}
        conversations.push({
          key: `${type}:${d.id}`,
          type,
          teamId: d.id,
          teamName: teamName.get(d.id) || c.teamId || d.id,
          eventId: teamEvent.get(d.id) || '',
          lastMessage: typeof c.lastMessage === 'string' ? c.lastMessage : '',
          lastSenderName: typeof c.lastSenderName === 'string' ? c.lastSenderName : '',
          lastMessageAt: tsIso(c.lastMessageAt),
        })
      }
      teamChatsSnap.forEach((d) => pushConv('team', d))
      mentorChatsSnap.forEach((d) => pushConv('mentor', d))

      // Newest activity first; conversations with no message (null time) sort last.
      conversations.sort((a, b) => (b.lastMessageAt || '').localeCompare(a.lastMessageAt || ''))

      res.json({ conversations })
    } catch (e) {
      next(e)
    }
  })

  /** GET /admin/chats/:type/:teamId/messages — full history for one conversation. */
  router.get('/chats/:type/:teamId/messages', async (req, res, next) => {
    try {
      const { type, teamId } = req.params
      if (type !== 'team' && type !== 'mentor') {
        return res.status(400).json({ error: 'type must be "team" or "mentor".' })
      }
      if (!isValidDocId(teamId)) return res.status(400).json({ error: 'Invalid team ID.' })

      const base = type === 'team' ? `chats/${teamId}/messages` : `mentorChats/${teamId}/messages`
      const limit = Math.min(Number(req.query.limit) || 300, 500)
      const snap = await db().collection(base).orderBy('createdAt', 'desc').limit(limit).get()

      const messages = snap.docs.map((d) => {
        const data = d.data() || {}
        return {
          id: d.id,
          text: data.text || '',
          senderId: data.senderId || '',
          senderName: data.senderName || '',
          senderRole: data.senderRole || '',
          type: data.type || 'text',
          file: data.file || null,
          createdAt: tsIso(data.createdAt),
        }
      }).reverse() // chronological (oldest first); the UI scrolls to the latest

      res.json({ type, teamId, messages })
    } catch (e) {
      next(e)
    }
  })

  return router
}

export function judgesRouter() {
  const router = Router()
  const db = () => getDb()

  const judgeTeamRow = (id, data, myEvaluation) => ({
    id,
    name: typeof data.name === 'string' ? data.name : 'Team',
    problemStatementId: data.problemStatementId || '',
    eventId: data.eventId || '',
    shortlisted: Boolean(data.shortlisted),
    submissionLocked: Boolean(data.submissionLocked),
    juryStatus: data.juryStatus || '',
    myEvaluation,
  })

  const evalSummaryFromSnap = (snap) => {
    if (!snap.exists) return null
    const e = snap.data()
    const st =
      e.evaluationStatus === 'submitted' ? 'submitted' : e.evaluationStatus === 'draft' ? 'draft' : 'pending'
    return {
      evaluationStatus: st,
      evaluationLocked: Boolean(e.evaluationLocked),
      updatedAt: tsIso(e.updatedAt),
      submittedAt: tsIso(e.submittedAt),
    }
  }

  /**
   * Build the judge-facing evaluation detail for a team.
   *
   * `scoringConfig` comes from `resolveScoringConfig()` and is either
   * `{ mode: 'single', criteria }` (legacy/default) or
   * `{ mode: 'twoPart', criteriaA, criteriaB, weightA, weightB, labelA, labelB }`
   * (Finals 50:50 model — two independent rubrics scored in one sitting).
   */
  const evaluationDetailFromSnap = (snap, scoringConfig) => {
    const isTwoPart = scoringConfig?.mode === 'twoPart'

    if (!isTwoPart) {
      const criteria = scoringConfig?.criteria || scoringConfig
      const fb = defaultScoresFromCriteria(criteria)
      if (!snap.exists) {
        return {
          evaluationStatus: 'pending',
          evaluationLocked: false,
          scores: fb,
          feedback: '',
          submittedAt: null,
          updatedAt: null,
        }
      }
      const e = snap.data()
      const locked = Boolean(e.evaluationLocked)
      const submitted = e.evaluationStatus === 'submitted'
      const scoresRaw = submitted ? e.scores : e.draftScores ?? e.scores ?? {}
      const scores = { ...fb, ...(scoresRaw && typeof scoresRaw === 'object' ? scoresRaw : {}) }
      const feedback = submitted ? String(e.feedback ?? '') : String(e.draftFeedback ?? e.feedback ?? '')
      return {
        evaluationStatus: submitted ? 'submitted' : e.evaluationStatus === 'draft' ? 'draft' : 'pending',
        evaluationLocked: locked,
        scores,
        feedback,
        submittedAt: tsIso(e.submittedAt),
        updatedAt: tsIso(e.updatedAt),
      }
    }

    // Two-part (50:50 Finals) shape — the judge submits TWO separate
    // evaluations for the team: "Evaluation 1" (Part A) and "Evaluation 2"
    // (Part B), one at a time. Each part has its own independent status.
    const fbA = defaultScoresFromCriteria(scoringConfig.criteriaA)
    const fbB = defaultScoresFromCriteria(scoringConfig.criteriaB)
    if (!snap.exists) {
      return {
        evaluationStatus: 'pending',
        evaluationLocked: false,
        scoringMode: 'twoPart',
        statusA: 'pending',
        statusB: 'pending',
        scoresA: fbA,
        scoresB: fbB,
        feedbackA: '',
        feedbackB: '',
        finalScorePct: null,
        submittedAtA: null,
        submittedAtB: null,
        submittedAt: null,
        updatedAt: null,
      }
    }
    const e = snap.data()
    const locked = Boolean(e.evaluationLocked)
    const statusA = e.statusA === 'submitted' ? 'submitted' : e.statusA === 'draft' ? 'draft' : 'pending'
    const statusB = e.statusB === 'submitted' ? 'submitted' : e.statusB === 'draft' ? 'draft' : 'pending'
    const scoresARaw = statusA === 'submitted' ? e.scoresA : e.draftScoresA ?? e.scoresA ?? {}
    const scoresBRaw = statusB === 'submitted' ? e.scoresB : e.draftScoresB ?? e.scoresB ?? {}
    const scoresA = { ...fbA, ...(scoresARaw && typeof scoresARaw === 'object' ? scoresARaw : {}) }
    const scoresB = { ...fbB, ...(scoresBRaw && typeof scoresBRaw === 'object' ? scoresBRaw : {}) }
    const feedbackA = statusA === 'submitted' ? String(e.feedbackA ?? '') : String(e.draftFeedbackA ?? e.feedbackA ?? '')
    const feedbackB = statusB === 'submitted' ? String(e.feedbackB ?? '') : String(e.draftFeedbackB ?? e.feedbackB ?? '')
    return {
      evaluationStatus: statusA === 'submitted' && statusB === 'submitted' ? 'submitted' : (statusA !== 'pending' || statusB !== 'pending') ? 'draft' : 'pending',
      evaluationLocked: locked,
      scoringMode: 'twoPart',
      statusA,
      statusB,
      scoresA,
      scoresB,
      feedbackA,
      feedbackB,
      finalScorePct: typeof e.finalScorePct === 'number' ? e.finalScorePct : null,
      submittedAtA: tsIso(e.submittedAtA),
      submittedAtB: tsIso(e.submittedAtB),
      submittedAt: tsIso(e.submittedAt),
      updatedAt: tsIso(e.updatedAt),
    }
  }

  router.use(verifyFirebaseToken, loadUserRole, attachEventContext, requireRole('judge'))

  router.get('/assignments', async (req, res, next) => {
    try {
      const uid = req.user.uid
      const eventId = req.eventId
      const uSnap = await db().doc(`users/${uid}`).get()
      const profile = uSnap.exists ? uSnap.data() : {}
      const assigned = Array.isArray(profile?.assignedProblemStatementIds) ? profile.assignedProblemStatementIds : []

      const merged = await getActiveEventConfig()
      const { getEvaluationPhase } = await import('../services/competitionPhases.js')
      const evalPhase = getEvaluationPhase(merged)
      const scoringConfig = resolveScoringConfig(merged, evalPhase)
      const edition = {
        submissionDeadline: tsIso(merged.submissionDeadline),
        lifecyclePhase: merged.lifecyclePhase,
        evaluationOpen: evaluationPhaseAllowsJudge(merged),
        scoringMode: scoringConfig.mode,
        // Legacy field kept for older clients — single-mode criteria only.
        evaluationCriteria: scoringConfig.mode === 'twoPart' ? scoringConfig.criteriaA : scoringConfig.criteria,
        ...(scoringConfig.mode === 'twoPart'
          ? {
              evaluationCriteriaA: scoringConfig.criteriaA,
              evaluationCriteriaB: scoringConfig.criteriaB,
              partAWeight: scoringConfig.rawWeightA,
              partBWeight: scoringConfig.rawWeightB,
              partALabel: scoringConfig.labelA,
              partBLabel: scoringConfig.labelB,
            }
          : {}),
      }

      // BUG-2 FIX: Add eventId filter to the Firestore query instead of fetching
      // all teams and filtering in-memory. Without this, teams from other events
      // consume the 500-doc limit and teams from the correct event may be silently dropped.
      let teamsQuery = db().collection('teams').limit(500)
      if (eventId) teamsQuery = teamsQuery.where('eventId', '==', eventId)
      const teamsSnap = await teamsQuery.get()

      // Domain+track assignments: fetch all PS for the event to resolve which teams match
      const judgeAssignments = Array.isArray(profile?.judgeAssignments) ? profile.judgeAssignments : []

      // Build a set of PS IDs the judge can see via domain+track assignments
      const domainTrackPsIds = new Set()
      if (judgeAssignments.length > 0) {
        let psQuery = db().collection('problemStatements').limit(500)
        if (eventId) psQuery = psQuery.where('eventId', '==', eventId)
        const psSnap = await psQuery.get()
        for (const psDoc of psSnap.docs) {
          const pd = psDoc.data()
          // Field mapping: domain stored as `theme` (primary) or `domain` (legacy)
          //                track stored as `category`
          const psDomain = pd.theme || pd.domain || ''
          const psTrack = pd.category || ''
          for (const ja of judgeAssignments) {
            const domainMatch = !ja.domain || psDomain === ja.domain
            const trackMatch = !ja.track || psTrack === ja.track
            if (domainMatch && trackMatch) {
              domainTrackPsIds.add(psDoc.id)
              break
            }
          }
        }
      }

      const teamsFiltered = teamsSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((t) => {
          // Direct team assignment (team.judgeIds) — include regardless of PS.
          if (Array.isArray(t.judgeIds) && t.judgeIds.includes(uid)) return true
          if (!t.problemStatementId) return false
          // Include if matched by direct PS assignment OR by domain+track assignment
          return judgeMayEvaluateTeam(profile, t) || domainTrackPsIds.has(t.problemStatementId)
        })

      const pidSet = new Set(assigned)
      for (const t of teamsFiltered) {
        if (t.problemStatementId) pidSet.add(t.problemStatementId)
      }

      const problems = []
      for (const pid of pidSet) {
        const ps = await db().doc(`problemStatements/${pid}`).get()
        if (!ps.exists) continue
        const pdata = ps.data()
        if (eventId && pdata.eventId && pdata.eventId !== eventId) continue
        problems.push({
          id: ps.id,
          title: pdata.title || '',
          domain: pdata.domain || '',
          description: String(pdata.description || '').slice(0, 600),
          selectionCount: typeof pdata.selectionCount === 'number' ? pdata.selectionCount : 0,
        })
      }

      const evalRefs = teamsFiltered.map((t) => db().doc(`evaluations/${uid}_${t.id}`))
      const evSnaps = evalRefs.length ? await db().getAll(...evalRefs) : []
      const teams = teamsFiltered.map((t, i) => judgeTeamRow(t.id, t, evalSummaryFromSnap(evSnaps[i])))

      res.json({
        problemStatementIds: assigned,
        teams,
        problems,
        edition,
      })
    } catch (e) {
      next(e)
    }
  })

  router.get('/review/:teamId', async (req, res, next) => {
    try {
      const uid = req.user.uid
      const { teamId } = req.params
      if (!isValidDocId(teamId)) return res.status(400).json({ error: 'Invalid team ID.' })
      const eventId = req.eventId

      const teamSnap = await db().doc(`teams/${teamId}`).get()
      if (!teamSnap.exists) return res.status(404).json({ error: 'Team not found' })
      const teamRaw = teamSnap.data()

      if (req.eventId && teamRaw.eventId && teamRaw.eventId !== req.eventId) {
        return res.status(403).json({ error: 'Team is outside your active event edition.' })
      }

      const directTeamAssignedReview = Array.isArray(teamRaw.judgeIds) && teamRaw.judgeIds.includes(req.user.uid)
      if (!directTeamAssignedReview && !judgeMayEvaluateTeam(req.profile, teamRaw)) {
        // Also check domain+track assignments
        const judgeAssignments = Array.isArray(req.profile?.judgeAssignments) ? req.profile.judgeAssignments : []
        const psId = teamRaw.problemStatementId || ''
        let allowedByDomainTrack = false
        if (judgeAssignments.length > 0 && psId) {
          const psSnap = await db().doc(`problemStatements/${psId}`).get()
          if (psSnap.exists) {
            const pd = psSnap.data()
            // Field mapping: domain stored as `theme` (primary) or `domain` (legacy)
            //                track stored as `category`
            const psDomain = pd.theme || pd.domain || ''
            const psTrack = pd.category || ''
            allowedByDomainTrack = judgeAssignments.some((ja) => {
              const domainMatch = !ja.domain || psDomain === ja.domain
              const trackMatch = !ja.track || psTrack === ja.track
              return domainMatch && trackMatch
            })
          }
        }
        if (!allowedByDomainTrack) {
          return res.status(403).json({ error: 'You are not assigned to review this team.' })
        }
      }

      const evtId = teamRaw.eventId || req.eventId || null
      const merged = await getActiveEventConfig()
      const { getEvaluationPhase: getEvalPhaseReview } = await import('../services/competitionPhases.js')
      const evalPhaseReview = getEvalPhaseReview(merged)
      const scoringConfig = resolveScoringConfig(merged, evalPhaseReview)
      const edition = {
        submissionDeadline: tsIso(merged.submissionDeadline),
        lifecyclePhase: merged.lifecyclePhase,
        evaluationOpen: evaluationPhaseAllowsJudge(merged),
        scoringMode: scoringConfig.mode,
        evaluationCriteria: scoringConfig.mode === 'twoPart' ? scoringConfig.criteriaA : scoringConfig.criteria,
        ...(scoringConfig.mode === 'twoPart'
          ? {
              evaluationCriteriaA: scoringConfig.criteriaA,
              evaluationCriteriaB: scoringConfig.criteriaB,
              partAWeight: scoringConfig.rawWeightA,
              partBWeight: scoringConfig.rawWeightB,
              partALabel: scoringConfig.labelA,
              partBLabel: scoringConfig.labelB,
            }
          : {}),
      }

      const psId = teamRaw.problemStatementId || ''
      let problemStatement = null
      if (psId) {
        const psSnap = await db().doc(`problemStatements/${psId}`).get()
        if (psSnap.exists) {
          const pd = psSnap.data()
          problemStatement = {
            id: psSnap.id,
            title: pd.title || '',
            domain: pd.domain || '',
            description: String(pd.description || '').slice(0, 20000),
          }
        }
      }

      const subSnap = await db().doc(`submissions/${teamId}`).get()
      const rawSub = subSnap.exists ? subSnap.data() : {}
      const submission = {
        status: rawSub.status || '',
        pptUrl: rawSub.pptUrl || '',
        pdfUrl: rawSub.pdfUrl || '',
        videoUrl: rawSub.videoUrl || '',
        githubUrl: rawSub.githubUrl || '',
        finalizedAt: tsIso(rawSub.finalizedAt),
        updatedAt: tsIso(rawSub.updatedAt),
      }

      const evSnap = await db().doc(`evaluations/${uid}_${teamId}`).get()
      const evaluation = evaluationDetailFromSnap(evSnap, scoringConfig)

      const team = judgeTeamRow(teamSnap.id, teamRaw, evalSummaryFromSnap(evSnap))

      res.json({
        team,
        problemStatement,
        submission,
        evaluation,
        evaluationCriteria: edition.evaluationCriteria,
        edition,
      })
    } catch (e) {
      next(e)
    }
  })

  /**
   * Submit (or save a draft of) an evaluation.
   *
   * Single-rubric phases: { teamId, scores, feedback, draft, status? }
   *
   * Two-part ("50:50 Finals") phases: the judge submits TWO separate
   * evaluations for the same team — Evaluation 1 (Part A: Existing Project)
   * and Evaluation 2 (Part B: New Challenge). Each call carries a `part`
   * flag: { teamId, part: 'A' | 'B', scores, feedback, draft, status? }.
   * Part B cannot be submitted (final) until Part A has been submitted —
   * this enforces the "submit 2 evaluations, one after another" flow.
   */
  router.post('/evaluations', async (req, res, next) => {
    try {
      const { teamId, part, scores, feedback, draft } = req.body || {}
      if (!teamId || !scores) {
        return res.status(400).json({ error: 'teamId and scores required' })
      }

      // Validate teamId format (prevent path traversal)
      if (typeof teamId !== 'string' || teamId.length > 128 || /[\/\.\#\$\[\]]/.test(teamId)) {
        return res.status(400).json({ error: 'Invalid teamId format.' })
      }

      const jid = req.user.uid
      const feedbackText = String(feedback ?? '').slice(0, 8000)
      const isDraft = draft === true
      const requestedPart = part === 'A' || part === 'B' ? part : null

      const teamSnap = await db().doc(`teams/${teamId}`).get()
      if (!teamSnap.exists) return res.status(404).json({ error: 'Team not found' })
      const team = teamSnap.data()

      const evtId = team.eventId || req.eventId || null
      const merged = await getActiveEventConfig()
      if (!evaluationPhaseAllowsJudge(merged)) {
        return res.status(403).json({ error: 'Evaluations are not open for this event phase.' })
      }

      if (req.eventId && team.eventId && team.eventId !== req.eventId) {
        return res.status(403).json({ error: 'Team is outside your active event edition.' })
      }

      const directTeamAssignedEval = Array.isArray(team.judgeIds) && team.judgeIds.includes(jid)
      if (!directTeamAssignedEval && !judgeMayEvaluateTeam(req.profile, team)) {
        // Also check domain+track assignments
        const judgeAssignments = Array.isArray(req.profile?.judgeAssignments) ? req.profile.judgeAssignments : []
        let allowedByDomainTrack = false
        if (judgeAssignments.length > 0 && team.problemStatementId) {
          const psSnap = await db().doc(`problemStatements/${team.problemStatementId}`).get()
          if (psSnap.exists) {
            const pd = psSnap.data()
            // Field mapping: domain stored as `theme` (primary) or `domain` (legacy)
            //                track stored as `category`
            const psDomain = pd.theme || pd.domain || ''
            const psTrack = pd.category || ''
            allowedByDomainTrack = judgeAssignments.some((ja) => {
              const domainMatch = !ja.domain || psDomain === ja.domain
              const trackMatch = !ja.track || psTrack === ja.track
              return domainMatch && trackMatch
            })
          }
        }
        if (!allowedByDomainTrack) {
          return res.status(403).json({ error: 'You are not assigned to evaluate this problem / team.' })
        }
      }

      const { getEvaluationPhase: getEvalPhaseSubmit } = await import('../services/competitionPhases.js')
      const evalPhaseSubmit = getEvalPhaseSubmit(merged)
      const scoringConfig = resolveScoringConfig(merged, evalPhaseSubmit)
      const isTwoPart = scoringConfig.mode === 'twoPart'

      // Two-part phases require a `part` flag ('A' or 'B') identifying which
      // of the two evaluations this submission is for. Single-rubric phases
      // must NOT send one — prevents a stale client writing the wrong shape.
      if (isTwoPart && !requestedPart) {
        return res.status(400).json({ error: "This phase requires two evaluations — pass part: 'A' or 'B'." })
      }
      if (!isTwoPart && requestedPart) {
        return res.status(400).json({ error: 'This phase uses single-rubric scoring (no part flag).' })
      }

      const partCriteria = isTwoPart ? (requestedPart === 'A' ? scoringConfig.criteriaA : scoringConfig.criteriaB) : scoringConfig.criteria

      let normalizedScores = null
      try {
        normalizedScores = normalizeJudgeScores(scores, partCriteria)
      } catch (e) {
        return res.status(e.status || 400).json({ error: e.message })
      }

      // Team status is REQUIRED before the FINAL (second) submission completes
      // the evaluation. For two-part phases it's only enforced on Part B, since
      // Part A alone doesn't finish the judge's assessment of the team yet.
      const VALID_STATUS = new Set(['qualified', 'waitlist', 'not_qualified'])
      const rawStatus = String(req.body?.status || '').trim().toLowerCase()
      const providedStatus = VALID_STATUS.has(rawStatus) ? rawStatus : ''
      const existingStatus = VALID_STATUS.has(team.juryStatus) ? team.juryStatus : ''
      const statusRequiredNow = !isDraft && (!isTwoPart || requestedPart === 'B')
      if (statusRequiredNow && !providedStatus && !existingStatus) {
        return res.status(400).json({ error: 'Set the team status (Qualified / Waitlist / Not Qualified) before submitting.' })
      }

      const evalRef = db().doc(`evaluations/${jid}_${teamId}`)

      // BUG-1 FIX: Wrap the check-then-write in a Firestore transaction to prevent
      // double-submission race condition. Two concurrent POST requests from the same
      // judge could both pass the 'submitted' check and both write without this guard.
      let alreadySubmitted = false
      let alreadyLocked = false
      let partANotSubmittedYet = false
      let finalScorePctOut = null

      await db().runTransaction(async (tx) => {
        const curEval = await tx.get(evalRef)
        const prev = curEval.exists ? curEval.data() : null

        if (prev?.evaluationLocked === true) { alreadyLocked = true; return }

        if (isTwoPart) {
          const curStatusForPart = requestedPart === 'A' ? prev?.statusA : prev?.statusB
          if (curStatusForPart === 'submitted') { alreadySubmitted = true; return }
          // Enforce the sequential order: Evaluation 2 (Part B) can only be
          // submitted (final) after Evaluation 1 (Part A) has been submitted.
          // Drafts of Part B are still allowed to be saved early (no lock-step
          // required for autosave), only the FINAL submit is gated.
          if (requestedPart === 'B' && !isDraft && prev?.statusA !== 'submitted') {
            partANotSubmittedYet = true
            return
          }
        } else {
          if (prev?.evaluationStatus === 'submitted') { alreadySubmitted = true; return }
        }

        const payload = {
          teamId,
          judgeId: jid,
          eventId: evtId || '',
          problemStatementId: team.problemStatementId || '',
          scoringMode: isTwoPart ? 'twoPart' : 'single',
          updatedAt: FieldValue.serverTimestamp(),
        }

        if (isTwoPart) {
          // Store a snapshot of both rubrics + weights used for this evaluation
          // (Issue B fix pattern) so admin views stay correct even if the rubric
          // changes after submission.
          payload.evaluationCriteriaA = scoringConfig.criteriaA
          payload.evaluationCriteriaB = scoringConfig.criteriaB
          payload.partAWeight = scoringConfig.rawWeightA
          payload.partBWeight = scoringConfig.rawWeightB
          payload.partALabel = scoringConfig.labelA
          payload.partBLabel = scoringConfig.labelB
          // Clear any legacy single-mode fields in case this doc was previously
          // scored under single mode and the phase was switched to twoPart.
          if (prev && prev.scoringMode !== 'twoPart') {
            payload.evaluationCriteria = FieldValue.delete()
            payload.scores = FieldValue.delete()
            payload.draftScores = FieldValue.delete()
            payload.feedback = FieldValue.delete()
            payload.draftFeedback = FieldValue.delete()
            payload.evaluationStatus = FieldValue.delete()
          }

          const scoreField = requestedPart === 'A' ? 'scoresA' : 'scoresB'
          const draftScoreField = requestedPart === 'A' ? 'draftScoresA' : 'draftScoresB'
          const feedbackField = requestedPart === 'A' ? 'feedbackA' : 'feedbackB'
          const draftFeedbackField = requestedPart === 'A' ? 'draftFeedbackA' : 'draftFeedbackB'
          const statusField = requestedPart === 'A' ? 'statusA' : 'statusB'
          const submittedAtField = requestedPart === 'A' ? 'submittedAtA' : 'submittedAtB'

          if (isDraft) {
            payload[draftScoreField] = normalizedScores
            payload[draftFeedbackField] = feedbackText
            payload[statusField] = 'draft'
            // Keep the doc-level evaluationStatus in sync for list/queue views
            // (evalSummaryFromSnap reads this raw field directly, it does not
            // recompute from statusA/statusB the way evaluationDetailFromSnap does).
            // Once either part has any progress, the whole evaluation is "in
            // progress" (draft) until Part B is finally submitted.
            if (prev?.evaluationStatus !== 'submitted') payload.evaluationStatus = 'draft'
          } else {
            payload[scoreField] = normalizedScores
            payload[feedbackField] = feedbackText
            payload[statusField] = 'submitted'
            payload[submittedAtField] = FieldValue.serverTimestamp()
            payload[draftScoreField] = FieldValue.delete()
            payload[draftFeedbackField] = FieldValue.delete()

            // If this submission completes both parts, compute the weighted
            // Final Score now (Part A's scores are already on `prev` since
            // Part B can only be finally submitted after Part A is submitted).
            if (requestedPart === 'B') {
              const scoresAFinal = prev?.scoresA && typeof prev.scoresA === 'object' ? prev.scoresA : {}
              const { total: totalA, max: maxA } = computePartTotal(scoresAFinal, scoringConfig.criteriaA)
              const { total: totalB, max: maxB } = computePartTotal(normalizedScores, scoringConfig.criteriaB)
              const computed = computeFinalScorePct({
                totalA, maxA, totalB, maxB,
                weightA: scoringConfig.weightA,
                weightB: scoringConfig.weightB,
              })
              payload.finalScorePct = computed.finalScorePct
              payload.evaluationStatus = 'submitted'
              payload.submittedAt = FieldValue.serverTimestamp()
              finalScorePctOut = computed.finalScorePct
            } else {
              // Only Part A submitted so far — overall evaluation is still "draft".
              payload.evaluationStatus = 'draft'
            }
          }
        } else {
          // Store a snapshot of the criteria used for this evaluation.
          // This allows the admin dashboard to normalize scores correctly
          // even if the rubric changes after submission (Issue B fix).
          payload.evaluationCriteria = scoringConfig.criteria
          // Clear any stale two-part fields in case this doc was previously
          // scored under twoPart mode and the phase was switched back.
          if (prev && prev.scoringMode === 'twoPart') {
            payload.scoresA = FieldValue.delete()
            payload.scoresB = FieldValue.delete()
            payload.draftScoresA = FieldValue.delete()
            payload.draftScoresB = FieldValue.delete()
            payload.feedbackA = FieldValue.delete()
            payload.feedbackB = FieldValue.delete()
            payload.draftFeedbackA = FieldValue.delete()
            payload.draftFeedbackB = FieldValue.delete()
            payload.finalScorePct = FieldValue.delete()
            payload.statusA = FieldValue.delete()
            payload.statusB = FieldValue.delete()
            payload.submittedAtA = FieldValue.delete()
            payload.submittedAtB = FieldValue.delete()
          }

          if (isDraft) {
            payload.draftScores = normalizedScores
            payload.draftFeedback = feedbackText
            payload.evaluationStatus = 'draft'
          } else {
            payload.scores = normalizedScores
            payload.feedback = feedbackText
            payload.evaluationStatus = 'submitted'
            payload.submittedAt = FieldValue.serverTimestamp()
            payload.draftScores = FieldValue.delete()
            payload.draftFeedback = FieldValue.delete()
          }
        }

        if (!curEval.exists) payload.createdAt = FieldValue.serverTimestamp()

        tx.set(evalRef, payload, { merge: true })
      })

      if (alreadyLocked) return res.status(403).json({ error: 'This evaluation has been locked.' })
      if (alreadySubmitted) return res.status(409).json({ error: 'This evaluation has already been submitted.' })
      if (partANotSubmittedYet) {
        return res.status(409).json({ error: 'Submit Evaluation 1 (first part) before submitting Evaluation 2.' })
      }

      // Persist the team status chosen at submit time (final submissions only,
      // and only once the WHOLE evaluation is complete — i.e. not on Part A alone).
      if (statusRequiredNow && providedStatus && providedStatus !== existingStatus) {
        await db().doc(`teams/${teamId}`).set(
          { juryStatus: providedStatus, updatedAt: FieldValue.serverTimestamp() },
          { merge: true },
        )
      }

      res.json({ ok: true, finalScorePct: finalScorePctOut })
    } catch (e) {
      next(e)
    }
  })

  /**
   * Judge sets a team's qualification status: qualified | waitlist | not_qualified
   * (or '' / 'none' to clear). Only judges assigned to the team may set it. The
   * admin views these statuses read-only in Jury Management.
   */
  router.post('/team-status', async (req, res, next) => {
    try {
      const { teamId } = req.body || {}
      const rawStatus = String(req.body?.status || '').trim().toLowerCase()
      if (!teamId || typeof teamId !== 'string' || teamId.length > 128 || /[\/.\\#$[\]]/.test(teamId)) {
        return res.status(400).json({ error: 'Invalid teamId.' })
      }
      const VALID = new Set(['qualified', 'waitlist', 'not_qualified'])
      const clearing = rawStatus === '' || rawStatus === 'none'
      if (!clearing && !VALID.has(rawStatus)) {
        return res.status(400).json({ error: 'status must be qualified, waitlist, not_qualified, or none.' })
      }

      const teamSnap = await db().doc(`teams/${teamId}`).get()
      if (!teamSnap.exists) return res.status(404).json({ error: 'Team not found' })
      const team = teamSnap.data()

      if (req.eventId && team.eventId && team.eventId !== req.eventId) {
        return res.status(403).json({ error: 'Team is outside your active event edition.' })
      }

      // Access: direct team assignment, direct PS, or domain+track match.
      let allowed = (Array.isArray(team.judgeIds) && team.judgeIds.includes(req.user.uid))
        || judgeMayEvaluateTeam(req.profile, team)
      if (!allowed) {
        const judgeAssignments = Array.isArray(req.profile?.judgeAssignments) ? req.profile.judgeAssignments : []
        if (judgeAssignments.length > 0 && team.problemStatementId) {
          const psSnap = await db().doc(`problemStatements/${team.problemStatementId}`).get()
          if (psSnap.exists) {
            const pd = psSnap.data()
            const psDomain = pd.theme || pd.domain || ''
            const psTrack = pd.category || ''
            allowed = judgeAssignments.some((ja) => (!ja.domain || psDomain === ja.domain) && (!ja.track || psTrack === ja.track))
          }
        }
      }
      if (!allowed) return res.status(403).json({ error: 'You are not assigned to this team.' })

      await db().doc(`teams/${teamId}`).set({
        juryStatus: clearing ? FieldValue.delete() : rawStatus,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true })

      res.json({ ok: true, juryStatus: clearing ? '' : rawStatus })
    } catch (e) {
      next(e)
    }
  })

  return router
}

export function mentorsRouter() {
  const router = Router()
  const db = () => getDb()

  router.use(verifyFirebaseToken, loadUserRole, attachEventContext, requireRole('mentor'))

  router.get('/assignments', async (req, res, next) => {
    try {
      const uid = req.user.uid
      const eventId = req.eventId

      // Scope queries to the active event when available — prevents cross-event data leaks
      let teamsQuery = db().collection('teams').limit(500)
      if (eventId) teamsQuery = teamsQuery.where('eventId', '==', eventId)
      const snap = await teamsQuery.get()
      const allTeams = snap.docs.map((d) => ({ id: d.id, ...d.data() }))

      // 1. Direct team assignments (mentorIds on team doc)
      const directTeams = allTeams.filter(
        (t) => Array.isArray(t.mentorIds) && t.mentorIds.includes(uid),
      )

      // 2. Problem statement assignments (mentorIds on PS doc)
      let psQuery = db().collection('problemStatements').limit(300)
      if (eventId) psQuery = psQuery.where('eventId', '==', eventId)
      const psSnap = await psQuery.get()
      const allPS = psSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
      const assignedPS = allPS.filter((ps) => Array.isArray(ps.mentorIds) && ps.mentorIds.includes(uid))
      const assignedPSIds = new Set(assignedPS.map((ps) => ps.id))

      const psTeams = allTeams.filter(
        (t) => t.problemStatementId && assignedPSIds.has(t.problemStatementId),
      )

      // 3. Domain + Track assignments (mentorAssignments on user doc)
      const userSnap = await db().doc(`users/${uid}`).get()
      const mentorAssignments = Array.isArray(userSnap.data()?.mentorAssignments)
        ? userSnap.data().mentorAssignments
        : []

      // Build a PS lookup map for domain+track matching
      const psById = {}
      for (const ps of allPS) psById[ps.id] = ps

      const domainTrackTeams = allTeams.filter((t) => {
        if (!t.problemStatementId) return false
        // Event scope: include team if no eventId filter, or if team's eventId matches
        if (eventId && t.eventId && t.eventId !== eventId) return false
        const ps = psById[t.problemStatementId]
        if (!ps) return false
        const psDomain = ps.theme || ps.domain || ''
        const psTrack = ps.category || ''
        return mentorAssignments.some((a) => {
          const domainMatch = !a.domain || a.domain === psDomain
          const trackMatch = !a.track || a.track === psTrack
          return domainMatch && trackMatch
        })
      })

      // Merge and deduplicate — priority: direct > PS > domain+track
      const seenIds = new Set(directTeams.map((t) => t.id))
      const mergedTeams = [...directTeams]

      for (const t of psTeams) {
        if (!seenIds.has(t.id)) {
          mergedTeams.push({ ...t, _viaProblemStatement: true })
          seenIds.add(t.id)
        }
      }

      for (const t of domainTrackTeams) {
        if (!seenIds.has(t.id)) {
          const ps = psById[t.problemStatementId]
          mergedTeams.push({
            ...t,
            _viaDomainTrack: true,
            _assignedDomain: ps?.theme || ps?.domain || null,
            _assignedTrack: ps?.category || null,
          })
          seenIds.add(t.id)
        }
      }

      // Return PS details for EVERY assigned team's problem statement (not just
      // the ones the mentor is directly assigned to). This includes private
      // Open Innovation entries so the mentor can see what their team is building.
      const neededPsIds = new Set(assignedPS.map((ps) => ps.id))
      for (const t of mergedTeams) if (t.problemStatementId) neededPsIds.add(t.problemStatementId)

      const psDetails = []
      for (const pid of neededPsIds) {
        let ps = psById[pid]
        if (!ps) {
          try {
            const d = await db().doc(`problemStatements/${pid}`).get()
            if (d.exists) ps = { id: d.id, ...d.data() }
          } catch { /* ignore missing */ }
        }
        if (!ps) continue
        psDetails.push({
          id: ps.id,
          title: ps.title || ps.id,
          category: ps.category || '',
          theme: ps.theme || ps.domain || '',
          description: ps.description || '',
          origin: ps.origin || '',
          selfDomain: ps.selfDomain || '',
          isOpenInnovation: ps.origin === 'open_innovation',
        })
      }

      res.json({
        teams: mergedTeams,
        problemStatements: psDetails,
        mentorAssignments,
      })
    } catch (e) {
      next(e)
    }
  })

  router.post('/notes', async (req, res, next) => {
    try {
      const { teamId, body, nextSession } = req.body || {}
      if (!teamId) return res.status(400).json({ error: 'teamId required' })

      const teamSnap = await db().doc(`teams/${teamId}`).get()
      if (!teamSnap.exists) return res.status(404).json({ error: 'Team not found' })
      const team = teamSnap.data()

      // Check direct assignment OR problem-statement-level assignment OR domain+track assignment
      const directlyAssigned = Array.isArray(team.mentorIds) && team.mentorIds.includes(req.user.uid)
      let psAssigned = false
      let domainTrackAssigned = false

      if (!directlyAssigned && team.problemStatementId) {
        // Fetch PS once and reuse for both psAssigned and domainTrackAssigned checks
        const psSnap = await db().doc(`problemStatements/${team.problemStatementId}`).get()
        if (psSnap.exists) {
          const psData = psSnap.data()
          psAssigned = Array.isArray(psData.mentorIds) && psData.mentorIds.includes(req.user.uid)
          if (!psAssigned) {
            const userSnap = await db().doc(`users/${req.user.uid}`).get()
            const mentorAssignments = Array.isArray(userSnap.data()?.mentorAssignments)
              ? userSnap.data().mentorAssignments : []
            if (mentorAssignments.length > 0) {
              const psDomain = psData.theme || psData.domain || ''
              const psTrack = psData.category || ''
              domainTrackAssigned = mentorAssignments.some((a) => {
                const domainMatch = !a.domain || a.domain === psDomain
                const trackMatch = !a.track || a.track === psTrack
                return domainMatch && trackMatch
              })
            }
          }
        }
      }

      if (!directlyAssigned && !psAssigned && !domainTrackAssigned) {
        return res.status(403).json({ error: 'You are not assigned to this team.' })
      }

      const bodyText = String(body ?? '').slice(0, 12000)
      const nextS = String(nextSession ?? '').slice(0, 2000)
      const id = `${req.user.uid}_${teamId}`
      await db()
        .doc(`mentorNotes/${id}`)
        .set(
          {
            mentorId: req.user.uid,
            teamId,
            body: bodyText,
            nextSession: nextS,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        )
      res.json({ ok: true })
    } catch (e) {
      next(e)
    }
  })

  /** Helper: check if mentor is assigned to a team (direct, via PS, or via domain+track) */
  async function mentorCanAccessTeam(dbRef, uid, teamId) {
    const teamSnap = await dbRef.doc(`teams/${teamId}`).get()
    if (!teamSnap.exists) return false
    const team = teamSnap.data()
    // 1. Direct
    if (Array.isArray(team.mentorIds) && team.mentorIds.includes(uid)) return true
    // 2. Via problem statement
    if (team.problemStatementId) {
      const psSnap = await dbRef.doc(`problemStatements/${team.problemStatementId}`).get()
      if (psSnap.exists) {
        const psData = psSnap.data()
        if (Array.isArray(psData.mentorIds) && psData.mentorIds.includes(uid)) return true
        // 3. Via domain+track
        const userSnap = await dbRef.doc(`users/${uid}`).get()
        const mentorAssignments = Array.isArray(userSnap.data()?.mentorAssignments)
          ? userSnap.data().mentorAssignments : []
        if (mentorAssignments.length > 0) {
          const psDomain = psData.theme || psData.domain || ''
          const psTrack = psData.category || ''
          if (mentorAssignments.some((a) => {
            const domainMatch = !a.domain || a.domain === psDomain
            const trackMatch = !a.track || a.track === psTrack
            return domainMatch && trackMatch
          })) return true
        }
      }
    }
    return false
  }

  /** GET /mentors/chat/:teamId/messages - Get mentor-team chat messages */
  router.get('/chat/:teamId/messages', async (req, res, next) => {
    try {
      const { teamId } = req.params
      if (!isValidDocId(teamId)) return res.status(400).json({ error: 'Invalid team ID.' })
      const canAccess = await mentorCanAccessTeam(db(), req.user.uid, teamId)
      if (!canAccess) return res.status(403).json({ error: 'Not assigned to this team.' })

      const limit = Math.min(Number(req.query.limit) || 50, 100)
      const snap = await db().collection(`mentorChats/${teamId}/messages`)
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get()

      const messages = snap.docs.map((d) => {
        const data = d.data()
        return {
          id: d.id,
          text: data.text || '',
          senderId: data.senderId || '',
          senderName: data.senderName || '',
          senderRole: data.senderRole || 'participant',
          replyTo: data.replyTo || null,
          createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
        }
      }).reverse()

      res.json({ messages, teamId })
    } catch (e) {
      next(e)
    }
  })

  /** POST /mentors/chat/:teamId/send - Send message to mentor-team chat */
  router.post('/chat/:teamId/send', async (req, res, next) => {
    try {
      const { teamId } = req.params
      if (!isValidDocId(teamId)) return res.status(400).json({ error: 'Invalid team ID.' })
      const canAccess = await mentorCanAccessTeam(db(), req.user.uid, teamId)
      if (!canAccess) return res.status(403).json({ error: 'Not assigned to this team.' })

      const text = String(req.body?.text || '').trim().slice(0, 2000)
      if (!text) return res.status(400).json({ error: 'Message text required.' })

      const replyTo = req.body?.replyTo ? String(req.body.replyTo).trim().slice(0, 100) : null

      // File attachment support
      const fileUrl = typeof req.body?.fileUrl === 'string' ? req.body.fileUrl.trim().slice(0, 2048) : null
      const fileName = typeof req.body?.fileName === 'string' ? req.body.fileName.trim().slice(0, 200) : null
      const fileType = typeof req.body?.fileType === 'string' ? req.body.fileType.trim().slice(0, 100) : null
      const fileSize = typeof req.body?.fileSize === 'number' ? req.body.fileSize : null
      const msgType = fileUrl ? 'file' : 'text'

      const userSnap = await db().doc(`users/${req.user.uid}`).get()
      const userData = userSnap.exists ? userSnap.data() : {}
      const senderName = userData.displayName || userData.email || 'Mentor'

      const msgData = {
        text,
        senderId: req.user.uid,
        senderName,
        senderRole: 'mentor',
        type: msgType,
        replyTo,
        createdAt: FieldValue.serverTimestamp(),
      }
      if (fileUrl) {
        msgData.file = { url: fileUrl, name: fileName || 'Attachment', type: fileType || 'application/octet-stream', size: fileSize || 0 }
      }

      const msgRef = db().collection(`mentorChats/${teamId}/messages`).doc()
      await msgRef.set(msgData)

      await db().doc(`mentorChats/${teamId}`).set({
        lastMessage: text.slice(0, 100),
        lastSenderId: req.user.uid,
        lastSenderName: senderName,
        lastMessageAt: FieldValue.serverTimestamp(),
      }, { merge: true })

      // Fire-and-forget email notification to team
      import('../services/notificationService.js').then(({ notifyMentorMessage }) => {
        notifyMentorMessage({ teamId, mentorName: senderName, messagePreview: text }).catch(() => {})
      })

      res.json({ ok: true, messageId: msgRef.id })
    } catch (e) {
      next(e)
    }
  })

  return router
}

/**
 * Registration Desk router — mounted at /api/reg-desk.
 * Domain-scoped attendance check-in for the on-ground registration desk. All
 * data access is server-side (Admin SDK), so no Firestore client rules change
 * is needed. Registration-desk accounts see ONLY teams in their assigned
 * domains; admins see all. Team domain is derived from the linked problem
 * statement's `theme` field.
 */
export function registrationDeskRouter() {
  const router = Router()
  const db = () => getDb()
  const DOMAINS = [
    'Health', 'Education', 'Transportation', 'Food Safety & Security',
    'Waste Management', 'Agriculture', 'Industry & MSME Innovation', 'Open Innovation',
  ]

  router.use(verifyFirebaseToken, loadUserRole, attachEventContext, requireRole('registration_desk', 'admin'))

  const isAdmin = (req) => req.profile?.role === 'admin'

  // null => all domains (admin); array => the desk account's assigned domains
  async function scopeDomains(req) {
    if (isAdmin(req)) return null
    const snap = await db().doc(`users/${req.user.uid}`).get()
    return snap.exists && Array.isArray(snap.data().assignedDomains) ? snap.data().assignedDomains : []
  }

  async function teamDomain(teamId) {
    const tSnap = await db().doc(`teams/${teamId}`).get()
    if (!tSnap.exists) return null
    const psId = tSnap.data().problemStatementId || ''
    if (!psId) return ''
    const psSnap = await db().doc(`problemStatements/${psId}`).get()
    return psSnap.exists ? (psSnap.data().theme || '') : ''
  }

  async function loadTeams(req) {
    const activeEvent = await getActiveEvent()
    const eventId = req.eventId || activeEvent?.id || ''
    const allowed = await scopeDomains(req)

    const psCol = db().collection('problemStatements')
    const psSnap = await (eventId ? psCol.where('eventId', '==', eventId).get() : psCol.get())
    const psMap = {}
    psSnap.forEach((d) => { const x = d.data(); psMap[d.id] = { domain: x.theme || '', track: x.track || '', title: x.title || '' } })

    const tCol = db().collection('teams')
    const tSnap = await (eventId ? tCol.where('eventId', '==', eventId).get() : tCol.get())
    const teams = []
    tSnap.forEach((d) => {
      const t = d.data()
      // Only teams that QUALIFIED for the Grand Finale (shortlisted) are checked in.
      if (!t.shortlisted) return
      const ps = psMap[t.problemStatementId] || { domain: '', track: '', title: '' }
      if (allowed && !allowed.includes(ps.domain)) return
      teams.push({ id: d.id, name: t.name || '', domain: ps.domain || '', track: ps.track || '', psTitle: ps.title || '' })
    })

    const ids = teams.map((t) => t.id)
    const regByTeam = {}
    for (let i = 0; i < ids.length; i += 10) {
      const chunk = ids.slice(i, i + 10)
      if (!chunk.length) break
      const snap = await db().collection('memberRegistrations').where('teamId', 'in', chunk).get()
      snap.forEach((d) => {
        const x = d.data()
        ;(regByTeam[x.teamId] ||= []).push({
          id: d.id, name: x.name || '', email: x.email || '',
          isLeader: Boolean(x.isLeader), order: typeof x.order === 'number' ? x.order : 0,
          present: Boolean(x.present),
        })
      })
    }

    return teams.map((t) => {
      const members = (regByTeam[t.id] || []).sort((a, b) => a.order - b.order)
      const presentCount = members.filter((m) => m.present).length
      return { ...t, members, presentCount, totalMembers: members.length }
    }).sort((a, b) => a.domain.localeCompare(b.domain) || a.name.localeCompare(b.name))
  }

  router.get('/me', async (req, res, next) => {
    try {
      const snap = await db().doc(`users/${req.user.uid}`).get()
      const d = snap.exists ? snap.data() : {}
      res.json({
        ok: true,
        role: req.profile?.role,
        assignedDomains: isAdmin(req) ? DOMAINS : (Array.isArray(d.assignedDomains) ? d.assignedDomains : []),
        displayName: d.displayName || '',
        email: d.email || req.user.email || '',
      })
    } catch (e) { next(e) }
  })

  router.get('/teams', async (req, res, next) => {
    try { res.json({ ok: true, teams: await loadTeams(req) }) } catch (e) { next(e) }
  })

  router.get('/stats', async (req, res, next) => {
    try {
      const teams = await loadTeams(req)
      const byDomain = {}
      let present = 0, total = 0, teamsFullyIn = 0
      for (const t of teams) {
        const key = t.domain || 'Unassigned'
        byDomain[key] ||= { domain: key, teams: 0, present: 0, total: 0 }
        byDomain[key].teams += 1
        byDomain[key].present += t.presentCount
        byDomain[key].total += t.totalMembers
        present += t.presentCount; total += t.totalMembers
        if (t.totalMembers > 0 && t.presentCount === t.totalMembers) teamsFullyIn += 1
      }
      res.json({
        ok: true,
        totals: { present, absent: total - present, total, teams: teams.length, teamsFullyIn },
        byDomain: Object.values(byDomain),
      })
    } catch (e) { next(e) }
  })

  router.post('/attendance', async (req, res, next) => {
    try {
      const { memberId, present } = req.body || {}
      if (!memberId) return res.status(400).json({ error: 'memberId required' })
      const ref = db().collection('memberRegistrations').doc(String(memberId))
      const snap = await ref.get()
      if (!snap.exists) return res.status(404).json({ error: 'Member not found.' })
      const allowed = await scopeDomains(req)
      if (allowed) {
        const domain = await teamDomain(snap.data().teamId)
        if (!allowed.includes(domain)) return res.status(403).json({ error: 'This team is outside your assigned domains.' })
      }
      await ref.set({ present: Boolean(present), attendanceAt: FieldValue.serverTimestamp(), attendanceBy: req.user.uid }, { merge: true })
      res.json({ ok: true })
    } catch (e) { next(e) }
  })

  router.post('/attendance/team', async (req, res, next) => {
    try {
      const { teamId, present } = req.body || {}
      if (!teamId) return res.status(400).json({ error: 'teamId required' })
      const allowed = await scopeDomains(req)
      if (allowed) {
        const domain = await teamDomain(String(teamId))
        if (!allowed.includes(domain)) return res.status(403).json({ error: 'This team is outside your assigned domains.' })
      }
      const snap = await db().collection('memberRegistrations').where('teamId', '==', String(teamId)).get()
      const batch = db().batch()
      snap.forEach((d) => batch.set(d.ref, { present: Boolean(present), attendanceAt: FieldValue.serverTimestamp(), attendanceBy: req.user.uid }, { merge: true }))
      await batch.commit()
      res.json({ ok: true, updated: snap.size })
    } catch (e) { next(e) }
  })

  router.get('/export', async (req, res, next) => {
    try {
      const teams = await loadTeams(req)
      const rows = []
      rows.push(['Team Name', 'Domain', 'Track', 'Problem Statement', 'Member Name', 'Email', 'Is Leader', 'Present', 'Total Present', 'Total Members', 'Attendance %'])
      
      for (const t of teams) {
        const pct = t.totalMembers > 0 ? Math.round((t.presentCount / t.totalMembers) * 100) : 0
        if (t.members.length === 0) {
          rows.push([t.name, t.domain, t.track, t.psTitle, '', '', '', '', t.presentCount, t.totalMembers, pct])
        } else {
          for (let i = 0; i < t.members.length; i++) {
            const m = t.members[i]
            rows.push([
              i === 0 ? t.name : '',
              i === 0 ? t.domain : '',
              i === 0 ? t.track : '',
              i === 0 ? t.psTitle : '',
              m.name,
              m.email,
              m.isLeader ? 'Yes' : 'No',
              m.present ? 'Yes' : 'No',
              i === 0 ? t.presentCount : '',
              i === 0 ? t.totalMembers : '',
              i === 0 ? pct : ''
            ])
          }
        }
      }

      const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n')
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="registration-desk-attendance-${new Date().toISOString().split('T')[0]}.csv"`)
      res.send(csv)
    } catch (e) { next(e) }
  })

  // Admin-only: Clear all attendance records (for testing/reset)
  router.delete('/attendance/clear', async (req, res, next) => {
    try {
      if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required.' })
      
      const snap = await db().collection('memberRegistrations').get()
      const batch = db().batch()
      let count = 0
      
      snap.forEach((d) => {
        batch.set(d.ref, { 
          present: false, 
          attendanceAt: FieldValue.delete(), 
          attendanceBy: FieldValue.delete() 
        }, { merge: true })
        count++
      })
      
      await batch.commit()
      res.json({ ok: true, cleared: count })
    } catch (e) { next(e) }
  })

  return router
}

export { r as publicRouter }
