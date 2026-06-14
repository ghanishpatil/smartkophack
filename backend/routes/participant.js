import { Router } from 'express'
import { FieldValue } from 'firebase-admin/firestore'
import { randomInt } from 'crypto'
import { getDb } from '../services/firebaseAdmin.js'
import { verifyFirebaseToken, loadUserRole, requireRole } from '../middleware/auth.js'
import { attachEventContext } from '../middleware/eventContext.js'
import { teamMaySelectProblem } from '../services/eventConfig.js'
import { getActiveEventConfig, getActiveEvent } from '../services/eventsService.js'
import {
  allowFeeSettlement,
  allowRegisterTeamForEvent,
  allowSelectProblem,
  allowTeamFormation,
  submissionEditingAllowed,
} from '../services/eventLifecycle.js'
import { isRazorpayConfigured, createOrder, getRazorpayPublicKeyId } from '../services/razorpay.js'
import { expectedEntryMinorAndCurrency, verifyAndMarkTeamPaid } from '../services/teamPaymentRazorpay.js'
import { normalizeSubmissionPatch } from '../utils/submissionPatch.js'
import { assertValidDocId } from '../utils/sanitize.js'
import { participationBlockedMessage } from '../services/teamRegistrationGate.js'
import {
  completeRegistrationPatch,
  deriveRegistrationStatus,
  feeRequiredForEvent,
  isAwaitingRegistrationPayment,
  isRegistrationComplete,
  pendingRegistrationPatch,
} from '../services/teamRegistration.js'
import { notifyTeamMemberJoined, notifyRegistrationComplete, notifySubmissionFinalized } from '../services/notificationService.js'
import { logActivity, actorFromReq, ACTIVITY_TYPE } from '../services/activityLog.js'
import { getActivePhase, canTeamSubmit } from '../services/competitionPhases.js'

// LOW-02: Use crypto.randomInt instead of Math.random() for cryptographically
// secure invite codes. Math.random() is predictable; randomInt is not.
function randomInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 6; i++) s += chars[randomInt(0, chars.length)]
  return s
}

async function ensureTeamEventScope(teamRef, team, eventId) {
  if (!eventId) return { ok: true }
  if (team.eventId === eventId) return { ok: true }
  const db = getDb()
  if (!team.eventId && eventId) {
    await teamRef.set({ eventId, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
    return { ok: true }
  }
  return { ok: false, error: 'This team belongs to a different event edition.' }
}

function problemBelongsToEvent(psData, eventId) {
  if (!eventId) return true
  const pe = psData?.eventId
  if (!pe) return true
  return pe === eventId
}

const r = Router()
r.use(verifyFirebaseToken, loadUserRole, attachEventContext)
r.use(requireRole('participant'))

/** Authenticated: resolve invite code to team id (scoped by active event). */
r.post('/lookup-invite', async (req, res, next) => {
  try {
    const db = getDb()
    const code = String(req.body?.inviteCode || '')
      .trim()
      .slice(0, 20)
      .toUpperCase()
    if (code.length < 4) return res.status(400).json({ error: 'Invalid code' })
    const eventId = req.eventId
    if (!eventId) return res.status(400).json({ error: 'event edition required (header x-sk-event-id or profile).' })

    let snap = await db.collection('teams').where('inviteCode', '==', code).where('eventId', '==', eventId).limit(1).get()
    // MED-06: Removed cross-event fallback — only match teams in the current event
    if (snap.empty) return res.json({ found: false })
    const doc = snap.docs[0]
    const data = doc.data()
    if (data.eventId && data.eventId !== eventId) return res.json({ found: false })
    res.json({ found: true, teamId: doc.id, name: data.name, eventId: data.eventId || eventId })
  } catch (e) {
    next(e)
  }
})

function isTeamMember(team, uid) {
  return team.leaderId === uid || (Array.isArray(team.memberIds) && team.memberIds.includes(uid))
}

r.post('/create-team', async (req, res, next) => {
  try {
    const db = getDb()
    const uid = req.user.uid
    const prof = req.profile || {}
    if (prof.teamId) return res.status(400).json({ error: 'Already in a team.' })

    const eventId = (await getActiveEvent())?.id || String(req.body?.eventId || req.eventId || '').trim()
    if (!eventId) {
      return res.status(503).json({ error: 'Hackathon is starting up. Try again in a moment.' })
    }

    const merged = await getActiveEventConfig()
    const tf = allowTeamFormation(merged)
    if (!tf.ok) return res.status(403).json({ error: tf.reason })

    const name = String(req.body?.name || 'Untitled team').trim().slice(0, 80)
    let inviteCode = randomInviteCode()
    let inviteCodeResolved = false
    for (let attempt = 0; attempt < 8; attempt++) {
      const clash = await db
        .collection('teams')
        .where('inviteCode', '==', inviteCode)
        .where('eventId', '==', eventId)
        .limit(1)
        .get()
      if (clash.empty) { inviteCodeResolved = true; break }
      inviteCode = randomInviteCode()
    }
    if (!inviteCodeResolved) {
      return res.status(503).json({ error: 'Unable to generate a unique invite code. Please try again.' })
    }

    const tid = db.collection('teams').doc().id
    await db.doc(`teams/${tid}`).set({
      eventId,
      name,
      inviteCode,
      leaderId: uid,
      memberIds: [uid],
      problemStatementId: '',
      status: 'active',
      eventRegistered: false,
      paymentStatus: 'pending',
      submissionLocked: false,
      judgeIds: [],
      mentorIds: [],
      shortlisted: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
    await db.doc(`users/${uid}`).set({ teamId: tid, activeEventId: eventId, updatedAt: FieldValue.serverTimestamp() }, { merge: true })

    logActivity({ ...actorFromReq(req), activityType: ACTIVITY_TYPE.TEAM_CREATED, teamId: tid, targetId: tid, targetType: 'team', description: `Created team "${name}"`, metadata: { teamName: name, inviteCode } }).catch(() => {})
    res.json({ ok: true, teamId: tid, inviteCode, eventId })
  } catch (e) {
    next(e)
  }
})

r.post('/join-team', async (req, res, next) => {
  try {
    const db = getDb()
    const uid = req.user.uid
    const prof = req.profile || {}
    if (prof.teamId) return res.status(400).json({ error: 'Already in a team.' })

    const code = String(req.body?.inviteCode || '')
      .trim()
      .slice(0, 20)
      .toUpperCase()
    const eventId = (await getActiveEvent())?.id || req.eventId
    if (!eventId) {
      return res.status(503).json({ error: 'Hackathon is starting up. Try again in a moment.' })
    }

    let snap = await db.collection('teams').where('inviteCode', '==', code).where('eventId', '==', eventId).limit(1).get()
    // MED-06: Removed cross-event fallback lookup — if event-scoped lookup fails,
    // return 404. Prevents joining teams from different event editions.
    if (snap.empty) return res.status(404).json({ error: 'Invalid invite code.' })
    const tdoc = snap.docs[0]
    const team = tdoc.data()
    if (team.eventId && team.eventId !== eventId) {
      return res.status(400).json({ error: 'Invite code is for a different event edition.' })
    }

    const merged = await getActiveEventConfig()
    const tf = allowTeamFormation(merged)
    if (!tf.ok) return res.status(403).json({ error: tf.reason })

    const members = team.memberIds || []
    if (members.includes(uid)) return res.status(400).json({ error: 'Already a member.' })
    
    // Phase 6: Team size validation using event config
    const maxSize = merged.maxTeamSize || 4
    if (members.length >= maxSize) {
      return res.status(400).json({ error: `Team is full. Maximum ${maxSize} members allowed.` })
    }

    // Use transaction to prevent race condition on member count
    await db.runTransaction(async (tx) => {
      const teamSnapTx = await tx.get(db.doc(`teams/${tdoc.id}`))
      if (!teamSnapTx.exists) throw Object.assign(new Error('Team not found'), { status: 404 })
      const teamTx = teamSnapTx.data()
      const membersTx = teamTx.memberIds || []
      if (membersTx.includes(uid)) throw Object.assign(new Error('Already a member.'), { status: 400 })
      if (membersTx.length >= maxSize) {
        throw Object.assign(new Error(`Team is full. Maximum ${maxSize} members allowed.`), { status: 400 })
      }
      const txPatch = { memberIds: FieldValue.arrayUnion(uid), updatedAt: FieldValue.serverTimestamp() }
      if (!teamTx.eventId) txPatch.eventId = eventId
      tx.update(db.doc(`teams/${tdoc.id}`), txPatch)
      tx.set(db.doc(`users/${uid}`), { teamId: tdoc.id, activeEventId: eventId, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
    })

    // Notify existing team members (fire-and-forget)
    notifyTeamMemberJoined({ teamId: tdoc.id, newMemberUid: uid }).catch(() => {})

    logActivity({ ...actorFromReq(req), activityType: ACTIVITY_TYPE.TEAM_JOINED, teamId: tdoc.id, targetId: tdoc.id, targetType: 'team', description: `Joined team "${tdoc.data()?.name || tdoc.id}"` }).catch(() => {})
    res.json({ ok: true, teamId: tdoc.id })
  } catch (e) {
    next(e)
  }
})

r.post('/register-team-event', async (req, res, next) => {
  try {
    const db = getDb()
    const uid = req.user.uid
    const prof = req.profile || {}
    const teamId = prof.teamId
    if (!teamId) return res.status(400).json({ error: 'Join or create a team first.' })

    const eventId = req.eventId
    const merged = await getActiveEventConfig()
    const reg = allowRegisterTeamForEvent(merged)
    if (!reg.ok) return res.status(403).json({ error: reg.reason })

    const teamRef = db.doc(`teams/${teamId}`)
    const teamSnap = await teamRef.get()
    if (!teamSnap.exists) return res.status(404).json({ error: 'Team not found.' })
    const team = teamSnap.data()
    if (!isTeamMember(team, uid)) return res.status(403).json({ error: 'Not a member of this team.' })

    const scope = await ensureTeamEventScope(teamRef, team, eventId)
    if (!scope.ok) return res.status(403).json({ error: scope.error })

    const blockedMsg = participationBlockedMessage(team)
    if (blockedMsg) return res.status(403).json({ error: blockedMsg })

    if (isRegistrationComplete(team, merged)) {
      return res.status(400).json({ error: 'Team is already registered for the event.' })
    }
    if (isAwaitingRegistrationPayment(team, merged)) {
      return res.status(400).json({
        error: 'Registration is pending payment. Complete payment via Razorpay to finish.',
        registrationStatus: 'pending',
        paymentStatus: team.paymentStatus || 'pending',
        paymentChoice: team.paymentChoice || null,
      })
    }

    // Phase 6: Validate minimum team size before registration
    const minSize = merged.minTeamSize || 2
    const currentSize = (team.memberIds || []).length
    if (currentSize < minSize) {
      return res.status(400).json({ 
        error: `Team must have at least ${minSize} members to register. Current: ${currentSize}`,
        minTeamSize: minSize,
        currentSize,
      })
    }

    // BUG FIX #1: Validate that ALL team members have submitted their registration details
    const memberRegsSnap = await db.collection('memberRegistrations')
      .where('teamId', '==', teamId)
      .get()

    const submittedCount = memberRegsSnap.size
    const requiredCount = currentSize

    if (submittedCount < requiredCount) {
      return res.status(400).json({ 
        error: `All ${requiredCount} team members must submit their registration details before team registration. Currently: ${submittedCount}/${requiredCount} completed.`,
        requiredCount,
        submittedCount,
      })
    }

    const feeRequired = feeRequiredForEvent(merged)
    const paymentChoice = String(req.body?.paymentChoice || '').toLowerCase() // 'now' or 'later'
    const paymentStatus = feeRequired ? 'pending' : 'not_required'
    const patch = feeRequired
      ? {
          ...pendingRegistrationPatch(),
          registrationRequestedAt: FieldValue.serverTimestamp(),
          paymentChoice: paymentChoice === 'later' ? 'later' : 'now', // Track user's choice
        }
      : {
          ...completeRegistrationPatch('not_required'),
          eventRegisteredAt: FieldValue.serverTimestamp(),
        }

    await teamRef.set({ ...patch, updatedAt: FieldValue.serverTimestamp() }, { merge: true })

    // Only notify registration complete if no fee is required (immediate registration)
    if (!feeRequired) {
      notifyRegistrationComplete({ teamId, eventName: 'Smart Kopargaon Hackathon' }).catch(() => {})
    }

    logActivity({ ...actorFromReq(req), activityType: ACTIVITY_TYPE.TEAM_REGISTERED, teamId, targetId: teamId, targetType: 'team', description: feeRequired ? `Registered team (payment ${patch.paymentChoice === 'later' ? 'deferred' : 'pending'})` : 'Registered team (no fee)', metadata: { feeRequired, paymentChoice: patch.paymentChoice || null } }).catch(() => {})

    res.json({
      ok: true,
      paymentStatus,
      registrationStatus: feeRequired ? 'pending' : 'registered',
      feeRequired,
      paymentChoice: patch.paymentChoice || null,
    })
  } catch (e) {
    next(e)
  }
})

r.post('/create-razorpay-order', async (req, res, next) => {
  try {
    const db = getDb()
    const uid = req.user.uid
    const prof = req.profile || {}
    const teamId = prof.teamId
    if (!teamId) return res.status(400).json({ error: 'Join or create a team first.' })

    if (!isRazorpayConfigured()) {
      return res.status(503).json({
        error:
          'Online payments are not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET on the API, or ask an admin to record payment manually.',
      })
    }

    const eventId = req.eventId
    const merged = await getActiveEventConfig()
    const feeGate = allowFeeSettlement(merged)
    if (!feeGate.ok) return res.status(403).json({ error: feeGate.reason })

    const exp = expectedEntryMinorAndCurrency(merged)
    if (!exp.ok) return res.status(400).json({ error: exp.reason })

    const teamRef = db.doc(`teams/${teamId}`)
    const teamSnap = await teamRef.get()
    if (!teamSnap.exists) return res.status(404).json({ error: 'Team not found.' })
    const team = teamSnap.data()
    if (!isTeamMember(team, uid)) return res.status(403).json({ error: 'Forbidden.' })

    const scope = await ensureTeamEventScope(teamRef, team, eventId)
    if (!scope.ok) return res.status(403).json({ error: scope.error })

    const blockedMsg = participationBlockedMessage(team)
    if (blockedMsg) return res.status(403).json({ error: blockedMsg })

    if (!isAwaitingRegistrationPayment(team, merged) && !isRegistrationComplete(team, merged)) {
      return res.status(400).json({ error: 'Register your team for the event before paying.' })
    }
    if (isRegistrationComplete(team, merged)) {
      return res.status(400).json({ error: 'Registration is already complete for this team.' })
    }

    const st = team.paymentStatus || 'pending'
    if (st === 'paid' || st === 'waived' || st === 'not_required') {
      return res.status(400).json({ error: 'No payment is due for this team.' })
    }

    const order = await createOrder({
      amountMinor: exp.amountMinor,
      currency: exp.currency,
      teamId,
      eventId: eventId || '',
    })

    await teamRef.set(
      {
        razorpayLastOrderId: order.id,
        razorpayLastOrderAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    )

    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: getRazorpayPublicKeyId(),
    })
  } catch (e) {
    next(e)
  }
})

r.post('/verify-razorpay-payment', async (req, res, next) => {
  try {
    const db = getDb()
    const uid = req.user.uid
    const prof = req.profile || {}
    const teamId = prof.teamId
    if (!teamId) return res.status(400).json({ error: 'Join or create a team first.' })

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {}
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        error: 'razorpay_order_id, razorpay_payment_id, and razorpay_signature are required.',
      })
    }

    const result = await verifyAndMarkTeamPaid(db, {
      teamId,
      razorpayOrderId: String(razorpay_order_id),
      razorpayPaymentId: String(razorpay_payment_id),
      razorpaySignature: String(razorpay_signature),
      actorUid: uid,
    })

    if (!result.ok) return res.status(result.status).json({ error: result.error })

    // verifyAndMarkTeamPaid already sends the payment receipt email.
    // notifyRegistrationComplete sends the welcome email — only fire if this
    // request actually wrote the payment (result.didWrite). This prevents a
    // duplicate welcome email when the user double-submits the payment form.
    if (result.didWrite) {
      notifyRegistrationComplete({ teamId, eventName: 'Smart Kopargaon Hackathon' }).catch(() => {})
    }

    logActivity({ ...actorFromReq(req), activityType: ACTIVITY_TYPE.PAYMENT_VERIFIED, teamId, targetId: teamId, targetType: 'team', description: 'Payment verified — team fully registered', metadata: { razorpay_order_id, razorpay_payment_id } }).catch(() => {})
    res.json({ ok: true })
  } catch (e) {
    next(e)
  }
})

r.post('/select-problem', async (req, res, next) => {
  try {
    const db = getDb()
    const uid = req.user.uid
    const prof = req.profile || {}
    const teamId = prof.teamId
    if (!teamId) return res.status(400).json({ error: 'Join or create a team first.' })

    const { problemStatementId } = req.body || {}
    if (!problemStatementId) {
      return res.status(400).json({ error: 'problemStatementId required' })
    }
    assertValidDocId(problemStatementId, 'problemStatementId')

    const eventId = req.eventId
    const merged = await getActiveEventConfig()
    const ph = allowSelectProblem(merged)
    if (!ph.ok) return res.status(403).json({ error: ph.reason })

    const teamRef = db.doc(`teams/${teamId}`)
    const preSnap = await teamRef.get()
    if (!preSnap.exists) return res.status(404).json({ error: 'Team not found.' })
    const preTeam = preSnap.data()
    if (!isTeamMember(preTeam, uid)) return res.status(403).json({ error: 'Forbidden.' })

    const scopePre = await ensureTeamEventScope(teamRef, preTeam, eventId)
    if (!scopePre.ok) return res.status(403).json({ error: scopePre.error })

    const blockedPs = participationBlockedMessage(preTeam)
    if (blockedPs) return res.status(403).json({ error: blockedPs })

    const newPsRef = db.doc(`problemStatements/${problemStatementId}`)

    await db.runTransaction(async (tx) => {
      const teamSnap = await tx.get(teamRef)
      if (!teamSnap.exists) throw Object.assign(new Error('Team not found'), { status: 404 })
      const team = teamSnap.data()
      if (!isTeamMember(team, uid)) throw Object.assign(new Error('Forbidden'), { status: 403 })

      const bm = participationBlockedMessage(team)
      if (bm) throw Object.assign(new Error(bm), { status: 403 })

      const gate = teamMaySelectProblem(merged, team)
      if (!gate.ok) throw Object.assign(new Error(gate.reason), { status: 403 })

      const newPsSnap = await tx.get(newPsRef)
      if (!newPsSnap.exists) throw Object.assign(new Error('Problem statement not found'), { status: 404 })
      const psd = newPsSnap.data()
      if (!problemBelongsToEvent(psd, eventId)) {
        throw Object.assign(new Error('Problem statement is not part of this event edition.'), { status: 400 })
      }
      if (psd.published === false) {
        throw Object.assign(new Error('This problem statement is not published yet.'), { status: 403 })
      }

      const oldPid = team.problemStatementId || ''
      if (oldPid === problemStatementId) return

      if (oldPid) {
        const oldRef = db.doc(`problemStatements/${oldPid}`)
        const oldSnap = await tx.get(oldRef)
        if (oldSnap.exists) {
          // MED-05: atomic server-side decrement — no read-then-write race
          tx.update(oldRef, { selectionCount: FieldValue.increment(-1), updatedAt: FieldValue.serverTimestamp() })
        }
      }

      // MED-05: atomic server-side increment — no read-then-write race
      tx.update(newPsRef, { selectionCount: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() })
      tx.update(teamRef, {
        problemStatementId,
        updatedAt: FieldValue.serverTimestamp(),
      })
    })

    logActivity({ ...actorFromReq(req), activityType: ACTIVITY_TYPE.PROBLEM_SELECTED, teamId, targetId: problemStatementId, targetType: 'problemStatement', description: `Selected problem statement`, metadata: { problemStatementId } }).catch(() => {})
    res.json({ ok: true })
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

r.post('/submission-metadata', async (req, res, next) => {
  try {
    const db = getDb()
    const uid = req.user.uid
    const prof = req.profile || {}
    const teamId = prof.teamId
    if (!teamId) return res.status(400).json({ error: 'Join or create a team first.' })

    const { patch } = req.body || {}
    if (!patch || typeof patch !== 'object') {
      return res.status(400).json({ error: 'patch object required' })
    }

    const allowed = ['pptUrl', 'pdfUrl', 'videoUrl', 'githubUrl', 'deployedUrl', 'status']
    const keys = Object.keys(patch).filter((k) => allowed.includes(k))
    if (!keys.length) return res.status(400).json({ error: 'No allowed fields in patch' })

    let safe
    try {
      const slice = {}
      for (const k of keys) slice[k] = patch[k]
      // CRIT-02: Pass teamId so file upload URLs are validated against the team's
      // own Firebase Storage path (submissions/{teamId}/...).
      safe = normalizeSubmissionPatch(slice, teamId)
    } catch (e) {
      return res.status(e.status || 400).json({ error: e.message })
    }

    const eventId = req.eventId
    const merged = await getActiveEventConfig()
    const teamSnap = await db.doc(`teams/${teamId}`).get()
    if (!teamSnap.exists) return res.status(404).json({ error: 'Team not found' })
    const team = teamSnap.data()
    if (!isTeamMember(team, uid)) return res.status(403).json({ error: 'Forbidden' })

    const teamRef = db.doc(`teams/${teamId}`)
    const scope = await ensureTeamEventScope(teamRef, team, eventId)
    if (!scope.ok) return res.status(403).json({ error: scope.error })

    const blockedSub = participationBlockedMessage(team)
    if (blockedSub) return res.status(403).json({ error: blockedSub })

    const feeGate = teamMaySelectProblem(merged, team)
    if (!feeGate.ok) return res.status(403).json({ error: feeGate.reason })
    if (!team?.problemStatementId) return res.status(403).json({ error: 'Select a problem statement first.' })

    // Block submissions if payment is pending
    if (!isRegistrationComplete(team, merged)) {
      const paymentChoice = team.paymentChoice || 'now'
      if (paymentChoice === 'later') {
        return res.status(403).json({
          error: 'Complete your registration payment before submitting. Go to Dashboard → Registration to pay.',
          paymentPending: true,
          redirectTo: '/dashboard/registration',
        })
      }
      return res.status(403).json({ error: 'Complete registration and payment before submitting.', redirectTo: '/dashboard/registration' })
    }

    // Phase gating (only when phases configured) — uses new state machine
    const activePhase = getActivePhase(merged)

    if (activePhase) {
      // BUG-2 FIX: Check submissionLocked even when an active phase exists.
      // canTeamSubmit() does not check this flag.
      if (team.submissionLocked) {
        return res.status(403).json({ error: 'Submission is finalized and locked for your team.' })
      }
      if (!canTeamSubmit(team, activePhase)) {
        const isFirstPhase = activePhase.order === 1
        if (!isFirstPhase && !(team.shortlistedPhases || []).includes(activePhase.id)) {
          return res.status(403).json({ error: `Your team is not shortlisted for "${activePhase.name}".` })
        }
        if (activePhase.deadline && new Date(activePhase.deadline).getTime() < Date.now()) {
          return res.status(403).json({ error: `Submission deadline for "${activePhase.name}" has passed.` })
        }
        return res.status(403).json({ error: `Submissions for "${activePhase.name}" are not currently open.` })
      }
    } else {
      const subGate = submissionEditingAllowed(merged, team)
      if (!subGate.ok) return res.status(403).json({ error: subGate.reason })
    }

    // BUG-3 FIX: Wrap phase-scoped write in a transaction to prevent race
    // condition when two concurrent requests from the same team both read
    // phasesData and then overwrite each other's changes.
    const subRef = db.doc(`submissions/${teamId}`)

    if (activePhase) {
      await db.runTransaction(async (tx) => {
        const subSnap = await tx.get(subRef)
        const existingSub = subSnap.exists ? subSnap.data() : {}
        const phasesData = existingSub.phases || {}
        const currentPhaseData = phasesData[activePhase.id] || {}
        tx.set(subRef, {
          teamId,
          eventId: team.eventId || eventId || '',
          phases: {
            ...phasesData,
            [activePhase.id]: { ...currentPhaseData, ...safe, updatedAt: new Date().toISOString(), updatedBy: uid },
          },
          currentPhaseId: activePhase.id,
          ...safe, // Top-level mirror for easy access
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: uid,
        }, { merge: true })
      })
    } else {
      // Simple flat storage when no phases configured — no race risk here
      await subRef.set({
        teamId,
        eventId: team.eventId || eventId || '',
        ...safe,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: uid,
      }, { merge: true })
    }

    res.json({ ok: true, phaseId: activePhase?.id || null })
  } catch (e) {
    next(e)
  }
})

/** Locks submission metadata edits for the team (until admin unlock). */
r.post('/finalize-submission', async (req, res, next) => {
  try {
    const db = getDb()
    const uid = req.user.uid
    const prof = req.profile || {}
    const teamId = prof.teamId
    if (!teamId) return res.status(400).json({ error: 'Join or create a team first.' })

    const eventId = req.eventId
    const merged = await getActiveEventConfig()
    const teamRef = db.doc(`teams/${teamId}`)
    const teamSnap = await teamRef.get()
    if (!teamSnap.exists) return res.status(404).json({ error: 'Team not found' })
    const team = teamSnap.data()
    if (!isTeamMember(team, uid)) return res.status(403).json({ error: 'Forbidden' })

    const scope = await ensureTeamEventScope(teamRef, team, eventId)
    if (!scope.ok) return res.status(403).json({ error: scope.error })

    const blockedFin = participationBlockedMessage(team)
    if (blockedFin) return res.status(403).json({ error: blockedFin })

    // BUG-1 FIX: Add phase gating to finalize-submission.
    // Previously this endpoint only called submissionEditingAllowed() which
    // has no phase awareness — a team could finalize even when the active
    // phase deadline had passed or they weren't shortlisted.
    const activePhaseForFinalize = getActivePhase(merged)

    if (activePhaseForFinalize) {
      // When phases are configured, use phase-aware gate
      if (!canTeamSubmit(team, activePhaseForFinalize)) {
        const isFirstPhase = activePhaseForFinalize.order === 1
        if (!isFirstPhase && !(team.shortlistedPhases || []).includes(activePhaseForFinalize.id)) {
          return res.status(403).json({ error: `Your team is not shortlisted for "${activePhaseForFinalize.name}".` })
        }
        if (activePhaseForFinalize.deadline && new Date(activePhaseForFinalize.deadline).getTime() < Date.now()) {
          return res.status(403).json({ error: `Submission deadline for "${activePhaseForFinalize.name}" has passed.` })
        }
        return res.status(403).json({ error: `Submissions for "${activePhaseForFinalize.name}" are not currently open.` })
      }
    } else {
      // No phases — use the event-level flag gate
      const subGate = submissionEditingAllowed(merged, team)
      if (!subGate.ok) return res.status(403).json({ error: subGate.reason })
    }

    // Block finalization if payment is pending (Phase 3: Pay Later flow)
    if (!isRegistrationComplete(team, merged)) {
      const paymentChoice = team.paymentChoice || 'now'
      if (paymentChoice === 'later') {
        return res.status(403).json({ 
          error: 'Complete your registration payment before finalizing submission. Go to Dashboard → Registration to pay now.',
          paymentPending: true,
          redirectTo: '/dashboard/registration',
        })
      }
      return res.status(403).json({ error: 'Complete registration and payment before finalizing submission.', redirectTo: '/dashboard/registration' })
    }

    await teamRef.set({ submissionLocked: true, submissionFinalizedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true })
    await db.doc(`submissions/${teamId}`).set(
      {
        finalizedAt: FieldValue.serverTimestamp(),
        finalizedBy: uid,
        status: 'submitted',
        eventId: team.eventId || eventId || '',
      },
      { merge: true },
    )

    // Notify submission finalized (fire-and-forget)
    notifySubmissionFinalized({ teamId }).catch(() => {})

    logActivity({ ...actorFromReq(req), activityType: ACTIVITY_TYPE.SUBMISSION_FINALIZED, teamId, targetId: teamId, targetType: 'submission', description: 'Submission finalized and locked' }).catch(() => {})
    res.json({ ok: true })
  } catch (e) {
    next(e)
  }
})

/** Get submission data per phase (replaces old version history) */
r.get('/submission-versions', async (req, res, next) => {
  try {
    const db = getDb()
    const uid = req.user.uid
    const prof = req.profile || {}
    const teamId = prof.teamId
    if (!teamId) return res.status(400).json({ error: 'Join or create a team first.' })

    const teamSnap = await db.doc(`teams/${teamId}`).get()
    if (!teamSnap.exists) return res.status(404).json({ error: 'Team not found' })
    const team = teamSnap.data()
    if (!isTeamMember(team, uid)) return res.status(403).json({ error: 'Forbidden' })

    const subSnap = await db.doc(`submissions/${teamId}`).get()
    if (!subSnap.exists) {
      return res.json({ versions: [], currentVersion: 0, phases: {} })
    }

    const sub = subSnap.data()

    // BUG-7 FIX: Return current phase data when a phase is active, not just
    // the top-level mirror. The top-level mirror reflects the last write across
    // ALL phases — if Phase 1 was submitted and Phase 2 is now active, the
    // mirror shows Phase 1 data, causing the form to pre-populate with stale URLs.
    const merged = await getActiveEventConfig()
    const currentActivePhase = getActivePhase(merged)
    const currentPhaseId = currentActivePhase?.id || sub.currentPhaseId || null
    const phaseData = currentPhaseId && sub.phases?.[currentPhaseId]
      ? sub.phases[currentPhaseId]
      : null

    // Use phase-scoped data if available, fall back to top-level mirror
    const current = phaseData
      ? {
          pptUrl: phaseData.pptUrl || '',
          pdfUrl: phaseData.pdfUrl || '',
          videoUrl: phaseData.videoUrl || '',
          githubUrl: phaseData.githubUrl || '',
          deployedUrl: phaseData.deployedUrl || '',
        }
      : {
          pptUrl: sub.pptUrl || '',
          pdfUrl: sub.pdfUrl || '',
          videoUrl: sub.videoUrl || '',
          githubUrl: sub.githubUrl || '',
          deployedUrl: sub.deployedUrl || '',
        }

    res.json({
      versions: [],
      currentVersion: 0,
      phases: sub.phases || {},
      currentPhaseId,
      current,
    })
  } catch (e) {
    next(e)
  }
})

/** Names/emails for current team (members only). */
r.get('/team-roster', async (req, res, next) => {
  try {
    const db = getDb()
    const uid = req.user.uid
    const prof = req.profile || {}
    const teamId = prof.teamId
    if (!teamId) return res.json({ members: [], teamId: '', inviteCode: '', name: '', leaderId: '' })

    const teamRef = db.doc(`teams/${teamId}`)
    const teamSnap = await teamRef.get()
    if (!teamSnap.exists) return res.status(404).json({ error: 'Team not found' })
    const team = teamSnap.data()
    if (!isTeamMember(team, uid)) return res.status(403).json({ error: 'Forbidden' })

    const eventId = req.eventId
    const merged = await getActiveEventConfig()
    const scope = await ensureTeamEventScope(teamRef, team, eventId)
    if (!scope.ok) return res.status(403).json({ error: scope.error })

    const ids = Array.isArray(team.memberIds) ? team.memberIds : []
    // MED-02: parallel reads instead of sequential loop
    const userSnaps = await Promise.all(ids.map((mid) => db.doc(`users/${mid}`).get()))
    const members = userSnaps.map((us, i) => {
      const mid = ids[i]
      const d = us.exists ? us.data() : {}
      return {
        uid: mid,
        displayName: typeof d.displayName === 'string' ? d.displayName : '',
        // HIGH-09: Only expose email to the requesting user (self) or the team leader.
        // Other members see an empty string to protect participant privacy.
        email: (mid === uid || uid === team.leaderId)
          ? String(req.user.email && mid === uid ? req.user.email : d.email || '')
          : '',
        isLeader: team.leaderId === mid,
      }
    })

    res.json({
      members,
      leaderId: team.leaderId || '',
      teamId,
      inviteCode: team.inviteCode || '',
      name: team.name || '',
      submissionLocked: Boolean(team.submissionLocked),
      eventRegistered: Boolean(team.eventRegistered),
      registrationStatus: deriveRegistrationStatus(team, merged),
      paymentChoice: team.paymentChoice || null,
      // HIGH-05: Added so SubmissionPage can use API instead of direct Firestore reads
      paymentStatus: typeof team.paymentStatus === 'string' ? team.paymentStatus : 'pending',
      shortlistedPhases: Array.isArray(team.shortlistedPhases) ? team.shortlistedPhases : [],
    })
  } catch (e) {
    next(e)
  }
})

r.post('/remove-team-member', async (req, res, next) => {
  try {
    const db = getDb()
    const uid = req.user.uid
    const prof = req.profile || {}
    const teamId = prof.teamId
    const memberUid = String(req.body?.memberUid || '').trim()
    if (!teamId || !memberUid) return res.status(400).json({ error: 'memberUid required' })
    if (memberUid === uid) return res.status(400).json({ error: 'Use leave-team to leave yourself.' })

    const eventId = req.eventId
    const merged = await getActiveEventConfig()
    const tf = allowTeamFormation(merged)
    if (!tf.ok) return res.status(403).json({ error: tf.reason })

    const teamRef = db.doc(`teams/${teamId}`)
    const teamSnap = await teamRef.get()
    if (!teamSnap.exists) return res.status(404).json({ error: 'Team not found' })
    const team = teamSnap.data()
    if (team.leaderId !== uid) return res.status(403).json({ error: 'Only the team leader can remove members.' })
    if (!isTeamMember(team, uid)) return res.status(403).json({ error: 'Forbidden.' })

    const scope = await ensureTeamEventScope(teamRef, team, eventId)
    if (!scope.ok) return res.status(403).json({ error: scope.error })

    const members = team.memberIds || []
    if (!members.includes(memberUid)) return res.status(400).json({ error: 'That user is not on this team.' })

    // Warn if removing would break minimum team size for a registered team
    if (team.eventRegistered) {
      const minSize = merged.minTeamSize || 2
      const afterRemoveCount = members.filter(Boolean).length - 1
      if (afterRemoveCount < minSize) {
        return res.status(400).json({
          error: `Cannot remove: your team is registered and would drop below the minimum size of ${minSize} members.`,
          minTeamSize: minSize,
          currentSize: members.filter(Boolean).length,
        })
      }
    }

    const targetSnap = await db.doc(`users/${memberUid}`).get()
    if (!targetSnap.exists || targetSnap.data().teamId !== teamId) {
      return res.status(400).json({ error: 'Member profile does not match this team.' })
    }

    await db.runTransaction(async (tx) => {
      tx.update(teamRef, {
        memberIds: FieldValue.arrayRemove(memberUid),
        updatedAt: FieldValue.serverTimestamp(),
      })
      tx.set(
        db.doc(`users/${memberUid}`),
        { teamId: '', updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      )
    })

    res.json({ ok: true })
  } catch (e) {
    next(e)
  }
})

r.post('/leave-team', async (req, res, next) => {
  try {
    const db = getDb()
    const uid = req.user.uid
    const prof = req.profile || {}
    const teamId = prof.teamId
    if (!teamId) return res.status(400).json({ error: 'You are not on a team.' })

    const eventId = req.eventId
    const merged = await getActiveEventConfig()
    const tf = allowTeamFormation(merged)
    if (!tf.ok) return res.status(403).json({ error: tf.reason })

    const teamRef = db.doc(`teams/${teamId}`)
    const teamSnap = await teamRef.get()
    if (!teamSnap.exists) return res.status(404).json({ error: 'Team not found' })
    const team = teamSnap.data()
    if (!isTeamMember(team, uid)) return res.status(403).json({ error: 'Forbidden.' })

    const scope = await ensureTeamEventScope(teamRef, team, eventId)
    if (!scope.ok) return res.status(403).json({ error: scope.error })

    const members = team.memberIds || []
    const leaderId = team.leaderId

    const soleMember = members.filter(Boolean).length <= 1

    // Warn if leaving would break minimum team size for a registered team
    if (!soleMember && team.eventRegistered) {
      const minSize = merged.minTeamSize || 2
      const afterLeaveCount = members.filter(Boolean).length - 1
      if (afterLeaveCount < minSize) {
        return res.status(400).json({
          error: `Cannot leave: your team is registered and would drop below the minimum size of ${minSize} members. Ask an admin for help.`,
          minTeamSize: minSize,
          currentSize: members.filter(Boolean).length,
        })
      }
    }

    if (soleMember) {
      // Clean up orphaned data before dissolving team
      const batch = db.batch()
      batch.delete(teamRef)
      batch.set(db.doc(`users/${uid}`), { teamId: '', updatedAt: FieldValue.serverTimestamp() }, { merge: true })
      // Delete submission and chat metadata (subcollections are handled by Firestore TTL or manual cleanup)
      const subRef = db.doc(`submissions/${teamId}`)
      const subSnap = await subRef.get()
      if (subSnap.exists) batch.delete(subRef)
      const chatRef = db.doc(`chats/${teamId}`)
      const chatSnap = await chatRef.get()
      if (chatSnap.exists) batch.delete(chatRef)
      // Decrement problem statement selection count atomically
      if (team.problemStatementId) {
        const psRef = db.doc(`problemStatements/${team.problemStatementId}`)
        const psSnap = await psRef.get()
        if (psSnap.exists) {
          batch.update(psRef, { selectionCount: FieldValue.increment(-1), updatedAt: FieldValue.serverTimestamp() })
        }
      }
      await batch.commit()
      return res.json({ ok: true, teamDissolved: true })
    }

    if (uid !== leaderId) {
      await db.runTransaction(async (tx) => {
        tx.update(teamRef, {
          memberIds: FieldValue.arrayRemove(uid),
          updatedAt: FieldValue.serverTimestamp(),
        })
        tx.set(db.doc(`users/${uid}`), { teamId: '', updatedAt: FieldValue.serverTimestamp() }, { merge: true })
      })
      logActivity({ ...actorFromReq(req), activityType: ACTIVITY_TYPE.TEAM_LEFT, teamId, targetId: teamId, targetType: 'team', description: 'Left team' }).catch(() => {})
      return res.json({ ok: true })
    }

    const others = members.filter((m) => m && m !== uid)
    const newLeader = others[0]
    if (!newLeader) return res.status(400).json({ error: 'Cannot determine new leader.' })

    await db.runTransaction(async (tx) => {
      tx.update(teamRef, {
        leaderId: newLeader,
        memberIds: FieldValue.arrayRemove(uid),
        updatedAt: FieldValue.serverTimestamp(),
      })
      tx.set(db.doc(`users/${uid}`), { teamId: '', updatedAt: FieldValue.serverTimestamp() }, { merge: true })
    })

    res.json({ ok: true, newLeaderId: newLeader })
  } catch (e) {
    next(e)
  }
})

/** Update team profile (bio, skills, social links) — leader only */
r.post('/update-team-profile', async (req, res, next) => {
  try {
    const db = getDb()
    const uid = req.user.uid
    const prof = req.profile || {}
    const teamId = prof.teamId
    if (!teamId) return res.status(400).json({ error: 'Join or create a team first.' })

    const teamRef = db.doc(`teams/${teamId}`)
    const teamSnap = await teamRef.get()
    if (!teamSnap.exists) return res.status(404).json({ error: 'Team not found.' })
    const team = teamSnap.data()
    if (team.leaderId !== uid) return res.status(403).json({ error: 'Only the team leader can update the team profile.' })

    const body = req.body || {}
    const profile = {}

    if (typeof body.bio === 'string') profile.bio = body.bio.trim().slice(0, 500)
    if (Array.isArray(body.skills)) {
      profile.skills = body.skills
        .filter((s) => typeof s === 'string')
        .map((s) => s.trim().slice(0, 30))
        .slice(0, 10)
    }
    if (body.socialLinks && typeof body.socialLinks === 'object') {
      profile.socialLinks = {}
      if (typeof body.socialLinks.github === 'string') profile.socialLinks.github = body.socialLinks.github.trim().slice(0, 200)
      if (typeof body.socialLinks.linkedin === 'string') profile.socialLinks.linkedin = body.socialLinks.linkedin.trim().slice(0, 200)
      if (typeof body.socialLinks.website === 'string') profile.socialLinks.website = body.socialLinks.website.trim().slice(0, 200)
    }

    if (Object.keys(profile).length === 0) {
      return res.status(400).json({ error: 'No valid profile fields provided (bio, skills, socialLinks).' })
    }

    await teamRef.set({ profile, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
    res.json({ ok: true })
  } catch (e) {
    next(e)
  }
})

/** Update member designation within team — leader can set for anyone, members can set their own */
r.post('/update-member-designation', async (req, res, next) => {
  try {
    const db = getDb()
    const uid = req.user.uid
    const prof = req.profile || {}
    const teamId = prof.teamId
    if (!teamId) return res.status(400).json({ error: 'Join or create a team first.' })

    const { memberUid, designation } = req.body || {}
    const targetUid = memberUid || uid
    if (typeof designation !== 'string') return res.status(400).json({ error: 'designation string required.' })

    const teamRef = db.doc(`teams/${teamId}`)
    const teamSnap = await teamRef.get()
    if (!teamSnap.exists) return res.status(404).json({ error: 'Team not found.' })
    const team = teamSnap.data()

    if (!isTeamMember(team, uid)) return res.status(403).json({ error: 'Not a member of this team.' })
    // Only leader can set other members' designations
    if (targetUid !== uid && team.leaderId !== uid) {
      return res.status(403).json({ error: 'Only the leader can set other members\' designations.' })
    }
    // Verify target is actually a team member
    if (!isTeamMember(team, targetUid)) {
      return res.status(400).json({ error: 'Target user is not in this team.' })
    }

    // Store designations in a map on the team document
    const designations = team.memberDesignations || {}
    designations[targetUid] = designation.trim().slice(0, 60)

    await teamRef.set({ memberDesignations: designations, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
    res.json({ ok: true })
  } catch (e) {
    next(e)
  }
})

/** ═══ Mentor Chat (participant side) ═══ */

/** GET /participant/mentor-chat/unread - Get unread count for mentor chat */
r.get('/mentor-chat/unread', async (req, res, next) => {
  try {
    const db = getDb()
    const uid = req.user.uid
    const prof = req.profile || {}
    const teamId = prof.teamId
    if (!teamId) return res.json({ unread: 0 })

    // Get last read timestamp for this user
    const readRef = db.doc(`mentorChats/${teamId}/readState/${uid}`)
    const readSnap = await readRef.get()
    const lastRead = readSnap.exists ? readSnap.data().lastRead : null

    // Count messages after lastRead that weren't sent by this user
    let query = db.collection(`mentorChats/${teamId}/messages`)
      .where('senderId', '!=', uid)
      .orderBy('senderId')
      .orderBy('createdAt', 'desc')
      .limit(50)

    const snap = await query.get()
    let unread = 0
    if (lastRead) {
      const lastReadMs = lastRead.toMillis ? lastRead.toMillis() : 0
      for (const d of snap.docs) {
        const ts = d.data().createdAt
        if (ts && ts.toMillis && ts.toMillis() > lastReadMs) unread++
      }
    } else {
      unread = snap.size
    }

    res.json({ unread })
  } catch {
    res.json({ unread: 0 })
  }
})

/** POST /participant/mentor-chat/mark-read - Mark mentor chat as read */
r.post('/mentor-chat/mark-read', async (req, res, next) => {
  try {
    const db = getDb()
    const uid = req.user.uid
    const prof = req.profile || {}
    const teamId = prof.teamId
    if (!teamId) return res.json({ ok: true })

    await db.doc(`mentorChats/${teamId}/readState/${uid}`).set({
      lastRead: FieldValue.serverTimestamp(),
    }, { merge: true })

    res.json({ ok: true })
  } catch (e) {
    next(e)
  }
})

/** GET /participant/mentor-chat/messages - Get mentor chat messages for participant's team */
r.get('/mentor-chat/messages', async (req, res, next) => {
  try {
    const db = getDb()
    const uid = req.user.uid
    const prof = req.profile || {}
    const teamId = prof.teamId
    if (!teamId) return res.status(400).json({ error: 'Join or create a team first.' })

    const teamSnap = await db.doc(`teams/${teamId}`).get()
    if (!teamSnap.exists) return res.status(404).json({ error: 'Team not found.' })
    const team = teamSnap.data()
    const isMember = team.leaderId === uid || (Array.isArray(team.memberIds) && team.memberIds.includes(uid))
    if (!isMember) return res.status(403).json({ error: 'Forbidden.' })

    const limit = Math.min(Number(req.query.limit) || 50, 100)
    const snap = await db.collection(`mentorChats/${teamId}/messages`)
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

/** POST /participant/mentor-chat/send - Send message to mentor chat */
r.post('/mentor-chat/send', async (req, res, next) => {
  try {
    const db = getDb()
    const uid = req.user.uid
    const prof = req.profile || {}
    const teamId = prof.teamId
    if (!teamId) return res.status(400).json({ error: 'Join or create a team first.' })

    const teamSnap = await db.doc(`teams/${teamId}`).get()
    if (!teamSnap.exists) return res.status(404).json({ error: 'Team not found.' })
    const team = teamSnap.data()
    const isMember = team.leaderId === uid || (Array.isArray(team.memberIds) && team.memberIds.includes(uid))
    if (!isMember) return res.status(403).json({ error: 'Forbidden.' })

    const text = String(req.body?.text || '').trim().slice(0, 2000)
    if (!text) return res.status(400).json({ error: 'Message text required.' })

    const replyTo = req.body?.replyTo ? String(req.body.replyTo).trim().slice(0, 100) : null

    // File attachment support
    const fileUrl = typeof req.body?.fileUrl === 'string' ? req.body.fileUrl.trim().slice(0, 2048) : null
    const fileName = typeof req.body?.fileName === 'string' ? req.body.fileName.trim().slice(0, 200) : null
    const fileType = typeof req.body?.fileType === 'string' ? req.body.fileType.trim().slice(0, 100) : null
    const fileSize = typeof req.body?.fileSize === 'number' ? req.body.fileSize : null
    const msgType = fileUrl ? 'file' : 'text'

    const userSnap = await db.doc(`users/${uid}`).get()
    const userData = userSnap.exists ? userSnap.data() : {}
    const senderName = userData.displayName || userData.email || 'Participant'

    const msgData = {
      text,
      senderId: uid,
      senderName,
      senderRole: 'participant',
      type: msgType,
      replyTo,
      createdAt: FieldValue.serverTimestamp(),
    }
    if (fileUrl) {
      msgData.file = { url: fileUrl, name: fileName || 'Attachment', type: fileType || 'application/octet-stream', size: fileSize || 0 }
    }

    const msgRef = db.collection(`mentorChats/${teamId}/messages`).doc()
    await msgRef.set(msgData)

    await db.doc(`mentorChats/${teamId}`).set({
      lastMessage: text.slice(0, 100),
      lastSenderId: uid,
      lastSenderName: senderName,
      lastMessageAt: FieldValue.serverTimestamp(),
    }, { merge: true })

    res.json({ ok: true, messageId: msgRef.id })
  } catch (e) {
    next(e)
  }
})

export { r as participantRouter }
