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
import { assertValidDocId, isValidDocId } from '../utils/sanitize.js'
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
import { getActivePhase, canTeamSubmit, isPhaseSubmissionOpen, phaseAcceptsSubmissions } from '../services/competitionPhases.js'
import {
  OPEN_INNOVATION_DOMAIN,
  OI_ORIGIN,
  OI_VISIBILITY,
  nextOpenInnovationId,
  normalizeOpenInnovationInput,
} from '../services/openInnovation.js'

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

/** ═══ First-login password change (OTP-verified) ═══ */
// NOTE: These password routes are intentionally registered BEFORE the
// participant-only guard below, so that ANY invited user (participant, judge,
// or mentor) can set their password on first login. They only ever act on the
// caller's own account (req.user.uid).

/**
 * POST /participant/password/request-otp
 * Issues a one-time code and emails it (Brevo). Called when the user lands on
 * the change-password screen. Rate-limited via the OTP service cooldown.
 */
r.post('/password/request-otp', async (req, res, next) => {
  try {
    const uid = req.user.uid
    const email = req.user.email || req.profile?.email
    if (!email) return res.status(400).json({ error: 'No email on file for this account.' })

    const { issueOtp } = await import('../services/passwordOtp.js')
    const issued = await issueOtp(uid)
    if (!issued.ok) {
      return res.status(429).json({ error: issued.error, retryAfterMs: issued.retryAfterMs || null })
    }

    const { sendOtpEmail } = await import('../services/emailService.js')
    const activeEvent = await getActiveEvent()

    let mail
    try {
      mail = await sendOtpEmail({
        to: email,
        name: req.profile?.displayName || 'there',
        otp: issued.otp,
        eventName: activeEvent?.name || 'Smart Kopargaon Hackathon',
      })
    } catch (e) {
      console.error('[password otp email] send threw:', e.message)
      mail = { success: false, error: e.message }
    }

    // If the email could not be sent, surface it instead of pretending success —
    // otherwise the user waits for a code that never arrives.
    if (!mail?.success) {
      console.error('[password otp email] not delivered:', mail?.error || 'unknown')
      return res.status(502).json({
        error: 'We could not send the verification code right now. Please try again in a minute or contact the organizers.',
      })
    }

    res.json({ ok: true, sentTo: email.replace(/(.{2}).*(@.*)/, '$1***$2') })
  } catch (e) {
    next(e)
  }
})

/**
 * POST /participant/password/change
 * Body: { otp, newPassword }. Verifies the OTP, updates the Firebase password
 * via Admin SDK, and clears the mustChangePassword flag.
 */
r.post('/password/change', async (req, res, next) => {
  try {
    const db = getDb()
    const uid = req.user.uid
    const otp = String(req.body?.otp || '').trim()
    const newPassword = String(req.body?.newPassword || '')

    if (!otp) return res.status(400).json({ error: 'Verification code is required.' })
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' })
    }

    const { verifyOtp } = await import('../services/passwordOtp.js')
    const check = await verifyOtp(uid, otp)
    if (!check.ok) return res.status(400).json({ error: check.error })

    const { getAuth } = await import('firebase-admin/auth')
    await getAuth().updateUser(uid, { password: newPassword })

    await db.doc(`users/${uid}`).set({
      mustChangePassword: false,
      passwordChangedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })

    res.json({ ok: true })
  } catch (e) {
    next(e)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Everything below this point is participant-only. (The password routes above
// are shared so judges/mentors can complete first-login password setup too.)
// ─────────────────────────────────────────────────────────────────────────────
r.use(requireRole('participant'))

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

/**
 * POST /participant/register-team-members
 *
 * New team-formation model: the team leader submits ALL member details in one
 * step (leader + up to (maxTeamSize-1) others). No invite codes, no self-join,
 * no ID card. Members do not need their own accounts.
 *
 * Body: {
 *   teamName?: string,
 *   members: [{ fullName, email, phone, college, collegeLocation, yearOfStudy, department }]
 * }
 * members[0] is treated as the team leader.
 */
r.post('/register-team-members', async (req, res, next) => {
  try {
    const db = getDb()
    const uid = req.user.uid
    const prof = req.profile || {}
    const teamId = prof.teamId
    if (!teamId) return res.status(400).json({ error: 'Create a team first.' })

    const merged = await getActiveEventConfig()
    const tf = allowTeamFormation(merged)
    if (!tf.ok) return res.status(403).json({ error: tf.reason })

    const teamRef = db.doc(`teams/${teamId}`)
    const teamSnap = await teamRef.get()
    if (!teamSnap.exists) return res.status(404).json({ error: 'Team not found.' })
    const team = teamSnap.data()

    if (team.leaderId !== uid) {
      return res.status(403).json({ error: 'Only the team leader can register team members.' })
    }
    if (team.submissionLocked) {
      return res.status(403).json({ error: 'Team is locked — member details can no longer be edited.' })
    }
    // Editable only until the team confirms its event registration.
    if (isRegistrationComplete(team, merged) || isAwaitingRegistrationPayment(team, merged)) {
      return res.status(403).json({ error: 'Your team is already registered — member details can no longer be edited.' })
    }
    const blockedMsg = participationBlockedMessage(team)
    if (blockedMsg) return res.status(403).json({ error: blockedMsg })

    const eventId = req.eventId
    const scope = await ensureTeamEventScope(teamRef, team, eventId)
    if (!scope.ok) return res.status(403).json({ error: scope.error })

    // ── Validate payload ──────────────────────────────────────────────
    const maxSize = merged.maxTeamSize || 4
    const rawMembers = Array.isArray(req.body?.members) ? req.body.members : null
    if (!rawMembers || rawMembers.length < 1) {
      return res.status(400).json({ error: 'At least one team member (the leader) is required.' })
    }
    if (rawMembers.length > maxSize) {
      return res.status(400).json({ error: `A team can have at most ${maxSize} members.` })
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    const phoneRegex = /^\d{10}$/
    const clean = (v, max) => String(v ?? '').trim().slice(0, max)

    const seenEmails = new Set()
    const seenPhones = new Set()
    const members = []

    for (let i = 0; i < rawMembers.length; i++) {
      const m = rawMembers[i] || {}
      const fullName = clean(m.fullName, 100)
      const email = clean(m.email, 120).toLowerCase()
      const phone = clean(m.phone, 10)
      const college = clean(m.college, 150)
      const collegeLocation = clean(m.collegeLocation, 150)
      const yearOfStudy = clean(m.yearOfStudy, 40)
      const department = clean(m.department, 100)
      const label = `Member ${i + 1}`

      if (!fullName) return res.status(400).json({ error: `${label}: full name is required.` })
      if (!email || !emailRegex.test(email)) return res.status(400).json({ error: `${label}: a valid email is required.` })
      if (!phoneRegex.test(phone)) return res.status(400).json({ error: `${label}: phone number must be exactly 10 digits.` })
      if (!college) return res.status(400).json({ error: `${label}: college name is required.` })
      if (!collegeLocation) return res.status(400).json({ error: `${label}: college location is required.` })
      if (!yearOfStudy) return res.status(400).json({ error: `${label}: year of study is required.` })
      if (!department) return res.status(400).json({ error: `${label}: department is required.` })

      if (seenEmails.has(email)) return res.status(400).json({ error: `Duplicate email within team: ${email}` })
      if (seenPhones.has(phone)) return res.status(400).json({ error: `Duplicate phone number within team: ${phone}` })
      seenEmails.add(email)
      seenPhones.add(phone)

      members.push({ fullName, email, phone, college, collegeLocation, yearOfStudy, department, isLeader: i === 0, order: i })
    }

    const teamName = clean(req.body?.teamName, 80) || team.name || 'Untitled team'
    const nowIso = new Date().toISOString()

    // ── Persist: replace member registrations + update team doc ───────
    const batch = db.batch()

    // Remove any previous member registrations for this team (idempotent re-submit).
    const existing = await db.collection('memberRegistrations').where('teamId', '==', teamId).get()
    existing.forEach((d) => batch.delete(d.ref))

    members.forEach((m) => {
      const ref = db.collection('memberRegistrations').doc()
      batch.set(ref, {
        name: m.fullName,
        institute: m.college,
        collegeLocation: m.collegeLocation,
        yearOfStudy: m.yearOfStudy,
        department: m.department,
        email: m.email,
        phone: m.phone,
        isLeader: m.isLeader,
        order: m.order,
        // Leader is a real account; other members are leader-entered (no account).
        userId: m.isLeader ? uid : '',
        teamId,
        teamName,
        registeredBy: uid,
        status: 'pending',
        createdAt: nowIso,
      })
    })

    batch.set(teamRef, {
      name: teamName,
      teamSize: members.length,
      membersRegisteredAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })

    await batch.commit()

    logActivity({ ...actorFromReq(req), activityType: ACTIVITY_TYPE.TEAM_CREATED, teamId, targetId: teamId, targetType: 'team', description: `Saved ${members.length} team member detail(s)`, metadata: { teamSize: members.length } }).catch(() => {})

    res.json({ ok: true, teamId, teamSize: members.length, teamName })
  } catch (e) {
    next(e)
  }
})

// Joining a team by invite code has been removed. Teams are now formed entirely
// by the team leader, who creates the team and enters all member details during
// registration. This endpoint is intentionally disabled and returns 410 Gone.
r.post('/join-team', async (req, res) => {
  return res.status(410).json({
    error: 'Joining teams by invite code is no longer supported. The team leader now adds all member details during registration.',
  })
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

    // New model: the leader declares team size (1-4) and enters all member
    // details via /register-team-members, which stores them in memberRegistrations
    // and records team.teamSize. Legacy teams fall back to memberIds length.
    const minSize = merged.minTeamSize || 1
    const legacySize = (team.memberIds || []).length
    const declaredSize = typeof team.teamSize === 'number' && team.teamSize > 0 ? team.teamSize : legacySize

    if (declaredSize < minSize) {
      return res.status(400).json({
        error: `Team must have at least ${minSize} member${minSize > 1 ? 's' : ''} to register.`,
        minTeamSize: minSize,
        currentSize: declaredSize,
      })
    }

    // Validate that member details have been submitted for the whole team.
    const memberRegsSnap = await db.collection('memberRegistrations')
      .where('teamId', '==', teamId)
      .get()

    const submittedCount = memberRegsSnap.size
    const requiredCount = declaredSize

    if (submittedCount < requiredCount) {
      return res.status(400).json({
        error: `Please add details for all ${requiredCount} team member${requiredCount > 1 ? 's' : ''} before registering. Currently saved: ${submittedCount}/${requiredCount}.`,
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

    // Set when the team's own Open Innovation idea is discarded by this switch.
    let discardedOwnIdea = ''

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
          const oldData = oldSnap.data() || {}
          // A team switching from its own Open Innovation idea to a curated
          // problem statement discards the idea — it exists only for that team.
          if (oldData.origin === OI_ORIGIN && oldData.ownerTeamId === teamId) {
            tx.delete(oldRef)
            discardedOwnIdea = oldPid
          } else {
            // MED-05: atomic server-side decrement — no read-then-write race
            tx.update(oldRef, { selectionCount: FieldValue.increment(-1), updatedAt: FieldValue.serverTimestamp() })
          }
        }
      }

      // MED-05: atomic server-side increment — no read-then-write race
      tx.update(newPsRef, { selectionCount: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() })
      tx.update(teamRef, {
        problemStatementId,
        updatedAt: FieldValue.serverTimestamp(),
      })
    })

    logActivity({ ...actorFromReq(req), activityType: ACTIVITY_TYPE.PROBLEM_SELECTED, teamId, targetId: problemStatementId, targetType: 'problemStatement', description: discardedOwnIdea ? `Selected problem statement (discarded Open Innovation idea ${discardedOwnIdea})` : `Selected problem statement`, metadata: { problemStatementId, discardedOpenInnovationId: discardedOwnIdea || null } }).catch(() => {})
    res.json({ ok: true, discardedOpenInnovationId: discardedOwnIdea || null })
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

/**
 * Select a Super PS (the flagship, domain-wide problem statement used in the
 * finals). This is a SEPARATE, ONE-TIME choice stored in `superProblemStatementId`
 * — it never touches the team's round-1 `problemStatementId`. Once set it cannot
 * be changed (enforced both up-front and inside the transaction).
 */
r.post('/select-super-problem', async (req, res, next) => {
  try {
    const db = getDb()
    const uid = req.user.uid
    const prof = req.profile || {}
    const teamId = prof.teamId
    if (!teamId) return res.status(400).json({ error: 'Join or create a team first.' })

    const { problemStatementId } = req.body || {}
    if (!problemStatementId) return res.status(400).json({ error: 'problemStatementId required' })
    assertValidDocId(problemStatementId, 'problemStatementId')

    const eventId = req.eventId

    const teamRef = db.doc(`teams/${teamId}`)
    const preSnap = await teamRef.get()
    if (!preSnap.exists) return res.status(404).json({ error: 'Team not found.' })
    const preTeam = preSnap.data()
    if (!isTeamMember(preTeam, uid)) return res.status(403).json({ error: 'Forbidden.' })

    const scopePre = await ensureTeamEventScope(teamRef, preTeam, eventId)
    if (!scopePre.ok) return res.status(403).json({ error: scopePre.error })

    const blocked = participationBlockedMessage(preTeam)
    if (blocked) return res.status(403).json({ error: blocked })

    if (!preTeam.eventRegistered) {
      return res.status(403).json({ error: 'Register your team before selecting a Super PS.' })
    }
    // One-time, final choice — refuse if already set.
    if (preTeam.superProblemStatementId) {
      return res.status(409).json({ error: 'You have already selected your Super PS. This is a one-time choice and cannot be changed.' })
    }

    const newPsRef = db.doc(`problemStatements/${problemStatementId}`)

    await db.runTransaction(async (tx) => {
      const teamSnap = await tx.get(teamRef)
      if (!teamSnap.exists) throw Object.assign(new Error('Team not found'), { status: 404 })
      const team = teamSnap.data()
      if (!isTeamMember(team, uid)) throw Object.assign(new Error('Forbidden'), { status: 403 })
      // Race-safe re-check of the one-time lock.
      if (team.superProblemStatementId) {
        throw Object.assign(new Error('You have already selected your Super PS. This is a one-time choice and cannot be changed.'), { status: 409 })
      }

      const newPsSnap = await tx.get(newPsRef)
      if (!newPsSnap.exists) throw Object.assign(new Error('Super PS not found'), { status: 404 })
      const psd = newPsSnap.data()
      if (psd.origin !== 'super_ps') {
        throw Object.assign(new Error('That problem statement is not a Super PS.'), { status: 400 })
      }
      if (!problemBelongsToEvent(psd, eventId)) {
        throw Object.assign(new Error('Super PS is not part of this event edition.'), { status: 400 })
      }
      if (psd.published === false) {
        throw Object.assign(new Error('This Super PS is not published yet.'), { status: 403 })
      }

      tx.update(newPsRef, { selectionCount: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() })
      tx.update(teamRef, {
        superProblemStatementId: problemStatementId,
        superProblemStatementSelectedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })
    })

    logActivity({ ...actorFromReq(req), activityType: ACTIVITY_TYPE.PROBLEM_SELECTED, teamId, targetId: problemStatementId, targetType: 'problemStatement', description: 'Selected Super PS (final, one-time)', metadata: { superProblemStatementId: problemStatementId } }).catch(() => {})
    res.json({ ok: true, superProblemStatementId: problemStatementId })
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

/** ═══ Open Innovation — participant-authored problem statements ═══ */

/**
 * Shared guard for creating/editing an Open Innovation idea.
 * Returns { ok, status, error, team, teamRef, merged }.
 */
async function openInnovationGuard(req) {
  const db = getDb()
  const uid = req.user.uid
  const teamId = req.profile?.teamId
  if (!teamId) return { ok: false, status: 400, error: 'Create a team first.' }

  const merged = await getActiveEventConfig()
  const gatePhase = allowSelectProblem(merged)
  if (!gatePhase.ok) return { ok: false, status: 403, error: gatePhase.reason }

  const teamRef = db.doc(`teams/${teamId}`)
  const teamSnap = await teamRef.get()
  if (!teamSnap.exists) return { ok: false, status: 404, error: 'Team not found.' }
  const team = teamSnap.data()

  if (!isTeamMember(team, uid)) return { ok: false, status: 403, error: 'Forbidden.' }
  if (team.leaderId !== uid) {
    return { ok: false, status: 403, error: 'Only the team leader can manage your Open Innovation idea.' }
  }

  const blocked = participationBlockedMessage(team)
  if (blocked) return { ok: false, status: 403, error: blocked }

  // Editable only until the submission is finalized/locked.
  if (team.submissionLocked) {
    return { ok: false, status: 403, error: 'Your submission is locked — the idea can no longer be edited.' }
  }

  const gateTeam = teamMaySelectProblem(merged, team)
  if (!gateTeam.ok) return { ok: false, status: 403, error: gateTeam.reason }

  const scope = await ensureTeamEventScope(teamRef, team, req.eventId)
  if (!scope.ok) return { ok: false, status: 403, error: scope.error }

  return { ok: true, team, teamRef, teamId, merged }
}

/** Shape an Open Innovation doc for the owning team. */
function openInnovationView(id, d) {
  return {
    id,
    title: d.title || '',
    track: d.category || '',
    domain: d.selfDomain || '',
    description: d.description || '',
    origin: d.origin || '',
    visibility: d.visibility || '',
    ownerTeamId: d.ownerTeamId || '',
    createdAt: d.createdAt || null,
    updatedAt: d.updatedAt || null,
  }
}

/**
 * GET /participant/open-innovation — the calling team's own idea (if any).
 * Never cached and never exposed publicly.
 */
r.get('/open-innovation', async (req, res, next) => {
  try {
    const db = getDb()
    const teamId = req.profile?.teamId
    if (!teamId) return res.json({ idea: null })

    const teamSnap = await db.doc(`teams/${teamId}`).get()
    if (!teamSnap.exists) return res.json({ idea: null })
    const team = teamSnap.data()
    if (!isTeamMember(team, req.user.uid)) return res.status(403).json({ error: 'Forbidden.' })

    const snap = await db.collection('problemStatements')
      .where('ownerTeamId', '==', teamId)
      .where('origin', '==', OI_ORIGIN)
      .limit(1)
      .get()

    if (snap.empty) return res.json({ idea: null })
    const doc = snap.docs[0]
    res.json({
      idea: openInnovationView(doc.id, doc.data()),
      selected: team.problemStatementId === doc.id,
      locked: Boolean(team.submissionLocked),
    })
  } catch (e) {
    next(e)
  }
})

/**
 * POST /participant/open-innovation — create or update the team's own idea.
 * Creates a private problem statement (skhoi###) and selects it for the team.
 */
r.post('/open-innovation', async (req, res, next) => {
  try {
    const db = getDb()
    const guard = await openInnovationGuard(req)
    if (!guard.ok) return res.status(guard.status).json({ error: guard.error })
    const { team, teamRef, teamId } = guard

    const parsed = normalizeOpenInnovationInput(req.body)
    if (!parsed.ok) return res.status(400).json({ error: parsed.error })
    const { title, track, selfDomain, description } = parsed.value

    const eventId = team.eventId || req.eventId || (await getActiveEvent())?.id || ''

    // Reuse the team's existing idea doc if it already has one (edit flow).
    const existingSnap = await db.collection('problemStatements')
      .where('ownerTeamId', '==', teamId)
      .where('origin', '==', OI_ORIGIN)
      .limit(1)
      .get()

    const isUpdate = !existingSnap.empty
    const psId = isUpdate ? existingSnap.docs[0].id : await nextOpenInnovationId(eventId)
    const psRef = db.doc(`problemStatements/${psId}`)

    const base = {
      title,
      description,
      category: track,               // Track (Software | Hardware)
      theme: OPEN_INNOVATION_DOMAIN,  // Domain used for judge assignment
      domain: OPEN_INNOVATION_DOMAIN, // legacy mirror kept in sync
      selfDomain,                     // participant's own domain choice (metadata)
      origin: OI_ORIGIN,
      visibility: OI_VISIBILITY,
      ownerTeamId: teamId,
      ownerTeamName: team.name || '',
      published: false,               // never listed publicly
      maxTeams: 1,                    // reserved for the owning team
      eventId,
      updatedAt: FieldValue.serverTimestamp(),
      updatedByUid: req.user.uid,
    }

    if (isUpdate) {
      await psRef.set(base, { merge: true })
    } else {
      await psRef.set({
        ...base,
        order: 9000,
        selectionCount: 0,
        assignedJudgeIds: [],
        createdAt: FieldValue.serverTimestamp(),
        createdByUid: req.user.uid,
      })
    }

    // Auto-select the idea for the team (increment only on first selection).
    if (team.problemStatementId !== psId) {
      await db.runTransaction(async (tx) => {
        const tSnap = await tx.get(teamRef)
        const t = tSnap.data() || {}
        const oldPid = t.problemStatementId || ''
        if (oldPid && oldPid !== psId) {
          const oldRef = db.doc(`problemStatements/${oldPid}`)
          const oldSnap = await tx.get(oldRef)
          if (oldSnap.exists) {
            tx.update(oldRef, { selectionCount: FieldValue.increment(-1), updatedAt: FieldValue.serverTimestamp() })
          }
        }
        tx.set(psRef, { selectionCount: 1, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
        tx.update(teamRef, { problemStatementId: psId, updatedAt: FieldValue.serverTimestamp() })
      })
    }

    logActivity({
      ...actorFromReq(req),
      activityType: ACTIVITY_TYPE.PROBLEM_SELECTED,
      teamId,
      targetId: psId,
      targetType: 'problemStatement',
      description: isUpdate ? 'Updated Open Innovation idea' : 'Submitted Open Innovation idea',
      metadata: { problemStatementId: psId, track, selfDomain },
    }).catch(() => {})

    const saved = await psRef.get()
    res.json({ ok: true, created: !isUpdate, idea: openInnovationView(psId, saved.data() || {}) })
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
    // Finals mode: when the event's finalists-only gate is on, the active phase
    // becomes a fresh, independent submission window for hand-picked finalists —
    // gated by team.finalist (NOT round-1 shortlisting) and its own lock
    // (finalsSubmissionLocked), so a round-1-finalized team can still submit.
    const finalsMode = merged.finalistsOnly === true

    if (finalsMode) {
      if (team.finalist !== true) {
        return res.status(403).json({ error: 'Finals submissions are open to selected finalists only.' })
      }
      if (team.finalsSubmissionLocked) {
        return res.status(403).json({ error: 'Your finals submission is finalized and locked.' })
      }
      if (!activePhase || !phaseAcceptsSubmissions(activePhase)) {
        return res.status(403).json({ error: 'The finals submission window is not open yet.' })
      }
      if (!isPhaseSubmissionOpen(activePhase)) {
        return res.status(403).json({ error: `Submissions for "${activePhase.name}" are not currently open.` })
      }
    } else if (activePhase) {
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
    const finalsModeFinalize = merged.finalistsOnly === true

    if (finalsModeFinalize) {
      // Finals finalization — gated by team.finalist, with its own lock.
      if (team.finalist !== true) {
        return res.status(403).json({ error: 'Finals submissions are open to selected finalists only.' })
      }
      if (team.finalsSubmissionLocked) {
        return res.status(403).json({ error: 'Your finals submission is already finalized and locked.' })
      }
      if (!activePhaseForFinalize || !phaseAcceptsSubmissions(activePhaseForFinalize)) {
        return res.status(403).json({ error: 'The finals submission window is not open yet.' })
      }
      if (!isPhaseSubmissionOpen(activePhaseForFinalize)) {
        return res.status(403).json({ error: `Submissions for "${activePhaseForFinalize.name}" are not currently open.` })
      }
    } else if (activePhaseForFinalize) {
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

    // Require that the actual submission artifacts are present before locking.
    // Prevents finalizing an empty submission.
    const subSnapForFinalize = await db.doc(`submissions/${teamId}`).get()
    const subDataForFinalize = subSnapForFinalize.exists ? subSnapForFinalize.data() : {}
    const effectiveSub = activePhaseForFinalize
      ? (subDataForFinalize.phases?.[activePhaseForFinalize.id] || {})
      : subDataForFinalize
    const reqs = activePhaseForFinalize?.requirements || {
      pptRequired: true, pdfRequired: true, videoRequired: false, githubRequired: false, deployedUrlRequired: false,
    }
    const anyUpload = Boolean(
      effectiveSub.pptUrl || effectiveSub.pdfUrl || effectiveSub.videoUrl || effectiveSub.githubUrl || effectiveSub.deployedUrl,
    )
    if (!anyUpload) {
      return res.status(400).json({ error: 'Upload your submission files before finalizing.' })
    }
    const missing = []
    if (reqs.pptRequired && !effectiveSub.pptUrl) missing.push('PPT')
    if (reqs.pdfRequired && !effectiveSub.pdfUrl) missing.push('PDF')
    if (reqs.videoRequired && !effectiveSub.videoUrl) missing.push('Video')
    if (reqs.githubRequired && !effectiveSub.githubUrl) missing.push('GitHub repo')
    if (reqs.deployedUrlRequired && !effectiveSub.deployedUrl) missing.push('Deployed URL')
    if (missing.length) {
      return res.status(400).json({ error: `Upload all required files before finalizing. Missing: ${missing.join(', ')}.` })
    }

    if (finalsModeFinalize) {
      // Finals: lock ONLY the finals submission (round-1 `submissionLocked`
      // stays as-is) and record finalization inside the active phase slot so
      // round-1's artifacts/lock are never disturbed.
      const finalsPhaseId = activePhaseForFinalize.id
      await teamRef.set(
        { finalsSubmissionLocked: true, finalsSubmissionFinalizedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      )
      await db.doc(`submissions/${teamId}`).set(
        {
          eventId: team.eventId || eventId || '',
          phases: {
            [finalsPhaseId]: { finalizedAt: new Date().toISOString(), finalizedBy: uid, status: 'submitted' },
          },
        },
        { merge: true },
      )
    } else {
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
    }

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
        // Feature 3: expose skills to teammates (non-sensitive, opt-in profile data)
        skills: Array.isArray(d.skills) ? d.skills : [],
      }
    })

    // New model: declared member details (leader-entered) live in memberRegistrations.
    // Expose them so the team page can show the full roster even though only the
    // leader has an account. Only the leader/self may view these details.
    let memberDetails = []
    if (uid === team.leaderId) {
      try {
        const regSnap = await db.collection('memberRegistrations').where('teamId', '==', teamId).get()
        memberDetails = regSnap.docs
          .map((d) => {
            const x = d.data()
            return {
              id: d.id,
              fullName: x.name || '',
              email: x.email || '',
              phone: x.phone || '',
              college: x.institute || '',
              collegeLocation: x.collegeLocation || '',
              yearOfStudy: x.yearOfStudy || '',
              department: x.department || '',
              isLeader: Boolean(x.isLeader),
              order: typeof x.order === 'number' ? x.order : 0,
            }
          })
          .sort((a, b) => a.order - b.order)
      } catch { memberDetails = [] }
    }

    res.json({
      members,
      memberDetails,
      teamSize: typeof team.teamSize === 'number' ? team.teamSize : memberDetails.length,
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
      // Finals: hand-picked finalist flag + the finals-only submission lock, so
      // the Submission Center can open a finals window gated by `finalist`.
      finalist: team.finalist === true,
      finalsSubmissionLocked: team.finalsSubmissionLocked === true,
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
      const minSize = merged.minTeamSize || 1
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
      const minSize = merged.minTeamSize || 1
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

/** ═══ Skill Tags & Profile (Feature 3) ═══ */

/** Allowed skill suggestions — used by the frontend for autocomplete chips. */
const SKILL_SUGGESTIONS = [
  'React', 'Vue', 'Angular', 'Next.js', 'Node.js', 'Express', 'Python', 'Django',
  'Flask', 'FastAPI', 'Java', 'Spring Boot', 'C++', 'C#', '.NET', 'Go', 'Rust',
  'TypeScript', 'JavaScript', 'PHP', 'Laravel', 'Ruby', 'Rails', 'Flutter',
  'React Native', 'Swift', 'Kotlin', 'Android', 'iOS', 'Machine Learning',
  'Deep Learning', 'Data Science', 'NLP', 'Computer Vision', 'TensorFlow',
  'PyTorch', 'UI/UX Design', 'Figma', 'Product Design', 'Graphic Design',
  'DevOps', 'Docker', 'Kubernetes', 'AWS', 'GCP', 'Azure', 'Firebase',
  'PostgreSQL', 'MongoDB', 'MySQL', 'Redis', 'GraphQL', 'Blockchain',
  'Solidity', 'Web3', 'IoT', 'Embedded Systems', 'Arduino', 'Raspberry Pi',
  'Cybersecurity', 'Cloud', 'Backend', 'Frontend', 'Full Stack', 'Mobile',
  'Game Dev', 'Unity', 'AR/VR', 'Project Management', 'Public Speaking',
]

/** Normalize and validate a skills array from user input. */
function normalizeSkills(raw) {
  if (!Array.isArray(raw)) return []
  const seen = new Set()
  const out = []
  for (const s of raw) {
    if (typeof s !== 'string') continue
    const skill = s.trim().slice(0, 30)
    if (!skill) continue
    const key = skill.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(skill)
    if (out.length >= 12) break
  }
  return out
}

/** GET /participant/my-profile — returns the current user's skill profile. */
r.get('/my-profile', async (req, res, next) => {
  try {
    const db = getDb()
    const uid = req.user.uid
    const snap = await db.doc(`users/${uid}`).get()
    const d = snap.exists ? snap.data() : {}
    res.json({
      skills: Array.isArray(d.skills) ? d.skills : [],
      bio: typeof d.bio === 'string' ? d.bio : '',
      lookingForTeam: typeof d.lookingForTeam === 'boolean' ? d.lookingForTeam : false,
      institute: typeof d.institute === 'string' ? d.institute : '',
      trackChoice: typeof d.trackChoice === 'string' ? d.trackChoice : '',
      suggestions: SKILL_SUGGESTIONS,
    })
  } catch (e) {
    next(e)
  }
})

/**
 * POST /participant/update-my-skills — set the current user's skills, bio, and
 * looking-for-team flag. Written via Admin SDK so it bypasses the strict
 * users/{uid} field allowlist in Firestore rules (consistent architecture).
 */
r.post('/update-my-skills', async (req, res, next) => {
  try {
    const db = getDb()
    const uid = req.user.uid
    const body = req.body || {}
    const patch = { updatedAt: FieldValue.serverTimestamp() }

    if (Array.isArray(body.skills)) {
      patch.skills = normalizeSkills(body.skills)
    }
    if (typeof body.bio === 'string') {
      patch.bio = body.bio.trim().slice(0, 300)
    }
    if (typeof body.lookingForTeam === 'boolean') {
      patch.lookingForTeam = body.lookingForTeam
    }

    const fields = Object.keys(patch).filter((k) => k !== 'updatedAt')
    if (fields.length === 0) {
      return res.status(400).json({ error: 'No valid fields provided (skills, bio, lookingForTeam).' })
    }

    await db.doc(`users/${uid}`).set(patch, { merge: true })
    res.json({ ok: true, ...Object.fromEntries(fields.map((f) => [f, patch[f]])) })
  } catch (e) {
    next(e)
  }
})

/** ═══ Team Matchmaking (Feature 1) ═══ */

/** Returns true if matchmaking is enabled for the active event. */
async function matchmakingGate() {
  const merged = await getActiveEventConfig()
  return Boolean(merged.matchmakingEnabled)
}

/**
 * GET /participant/matchmaking/candidates — list solo participants looking for a team.
 * Privacy: never exposes email. Only public profile fields (name, skills, bio, institute).
 * Optional ?skill= filter (case-insensitive substring match across skills).
 */
r.get('/matchmaking/candidates', async (req, res, next) => {
  try {
    if (!(await matchmakingGate())) {
      return res.status(403).json({ error: 'Team matchmaking is not enabled for this event.', disabled: true })
    }
    const db = getDb()
    const eventId = req.eventId
    const skillFilter = typeof req.query.skill === 'string' ? req.query.skill.trim().toLowerCase() : ''
    const limit = Math.min(Number(req.query.limit) || 60, 100)

    // Find participants who are looking for a team and not already on one.
    // Query is scoped to participants only; teamless check is done in-memory
    // because Firestore can't combine '==' on lookingForTeam with '==' empty teamId
    // efficiently without a composite index for every variant.
    let snap
    try {
      snap = await db.collection('users')
        .where('role', '==', 'participant')
        .where('lookingForTeam', '==', true)
        .limit(300)
        .get()
    } catch {
      // Fallback if composite index is missing
      snap = await db.collection('users').where('lookingForTeam', '==', true).limit(300).get()
    }

    let candidates = snap.docs
      .map((d) => ({ uid: d.id, ...d.data() }))
      .filter((u) => {
        if (u.uid === req.user.uid) return false // don't list self
        if (u.role && u.role !== 'participant') return false
        if (u.teamId) return false // already in a team
        // Scope to active event when the user has an activeEventId set
        if (eventId && u.activeEventId && u.activeEventId !== eventId) return false
        return true
      })
      .map((u) => ({
        uid: u.uid,
        displayName: u.displayName || 'Participant',
        institute: u.institute || '',
        trackChoice: u.trackChoice || '',
        skills: Array.isArray(u.skills) ? u.skills : [],
        bio: u.bio || '',
      }))

    if (skillFilter) {
      candidates = candidates.filter((c) =>
        c.skills.some((s) => s.toLowerCase().includes(skillFilter)),
      )
    }

    candidates = candidates.slice(0, limit)
    res.json({ candidates, count: candidates.length, eventId: eventId || null })
  } catch (e) {
    next(e)
  }
})

/**
 * GET /participant/matchmaking/open-teams — list teams that still have space and
 * haven't registered/locked yet, so solo participants can find a team to join.
 * Returns only the invite code visibility-safe summary (name, skills needed, size).
 */
r.get('/matchmaking/open-teams', async (req, res, next) => {
  try {
    if (!(await matchmakingGate())) {
      return res.status(403).json({ error: 'Team matchmaking is not enabled for this event.', disabled: true })
    }
    const db = getDb()
    const eventId = req.eventId
    const merged = await getActiveEventConfig()
    const maxSize = merged.maxTeamSize || 4
    const limit = Math.min(Number(req.query.limit) || 60, 100)

    let q = db.collection('teams').limit(300)
    if (eventId) q = q.where('eventId', '==', eventId)
    const snap = await q.get()

    const teams = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((t) => {
        const size = Array.isArray(t.memberIds) ? t.memberIds.length : 0
        if (size >= maxSize) return false // full
        if (t.submissionLocked) return false // already deep into competition
        if (t.registrationStatus === 'blocked' || t.registrationStatus === 'rejected') return false
        return true
      })
      .map((t) => ({
        teamId: t.id,
        name: t.name || 'Unnamed Team',
        memberCount: Array.isArray(t.memberIds) ? t.memberIds.length : 0,
        maxSize,
        spotsLeft: maxSize - (Array.isArray(t.memberIds) ? t.memberIds.length : 0),
        // Team's declared skills/needs from profile, if set by the leader
        skills: Array.isArray(t.profile?.skills) ? t.profile.skills : [],
        bio: t.profile?.bio || '',
        // inviteCode is intentionally NOT exposed — joining is via leader sharing it
      }))
      .slice(0, limit)

    res.json({ teams, count: teams.length, eventId: eventId || null })
  } catch (e) {
    next(e)
  }
})

/**
 * POST /participant/matchmaking/request — solo participant requests to join a team.
 * Creates a joinRequests document (status: pending). No invite code needed.
 * The team leader approves/declines from their My Team page.
 */
r.post('/matchmaking/request', async (req, res, next) => {
  try {
    if (!(await matchmakingGate())) {
      return res.status(403).json({ error: 'Team matchmaking is not enabled for this event.', disabled: true })
    }
    const db = getDb()
    const uid = req.user.uid
    const prof = req.profile || {}
    if (prof.teamId) return res.status(400).json({ error: 'You are already on a team.' })

    const teamId = String(req.body?.teamId || '').trim()
    if (!isValidDocId(teamId)) return res.status(400).json({ error: 'Invalid team ID.' })

    const eventId = req.eventId
    const merged = await getActiveEventConfig()
    const tf = allowTeamFormation(merged)
    if (!tf.ok) return res.status(403).json({ error: tf.reason })

    const teamSnap = await db.doc(`teams/${teamId}`).get()
    if (!teamSnap.exists) return res.status(404).json({ error: 'Team not found.' })
    const team = teamSnap.data()

    if (eventId && team.eventId && team.eventId !== eventId) {
      return res.status(400).json({ error: 'That team belongs to a different event edition.' })
    }
    if (isTeamMember(team, uid)) return res.status(400).json({ error: 'You are already on this team.' })

    const maxSize = merged.maxTeamSize || 4
    const memberCount = Array.isArray(team.memberIds) ? team.memberIds.length : 0
    if (memberCount >= maxSize) return res.status(400).json({ error: 'That team is already full.' })
    if (team.submissionLocked) return res.status(400).json({ error: 'That team has locked its roster.' })

    // Deduplicate: one pending request per (team, user)
    const existing = await db.collection('joinRequests')
      .where('teamId', '==', teamId)
      .where('userId', '==', uid)
      .where('status', '==', 'pending')
      .limit(1)
      .get()
    if (!existing.empty) {
      return res.status(400).json({ error: 'You already have a pending request for this team.' })
    }

    // Fetch requester profile for display on the leader's side
    const meSnap = await db.doc(`users/${uid}`).get()
    const me = meSnap.exists ? meSnap.data() : {}
    const message = String(req.body?.message || '').trim().slice(0, 300)

    const reqRef = await db.collection('joinRequests').add({
      teamId,
      teamName: team.name || 'Team',
      leaderId: team.leaderId || '',
      userId: uid,
      userName: me.displayName || req.user.name || 'Participant',
      userInstitute: me.institute || '',
      userSkills: Array.isArray(me.skills) ? me.skills : [],
      message,
      status: 'pending',
      eventId: eventId || team.eventId || '',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })

    logActivity({ ...actorFromReq(req), activityType: ACTIVITY_TYPE.TEAM_JOINED, teamId, targetId: reqRef.id, targetType: 'joinRequest', description: `Requested to join "${team.name || teamId}"` }).catch(() => {})

    res.json({ ok: true, requestId: reqRef.id })
  } catch (e) {
    next(e)
  }
})

/**
 * GET /participant/matchmaking/my-requests — requests the current user has SENT.
 * Lets the participant see pending/approved/declined status of their requests.
 */
r.get('/matchmaking/my-requests', async (req, res, next) => {
  try {
    const db = getDb()
    const uid = req.user.uid
    const snap = await db.collection('joinRequests')
      .where('userId', '==', uid)
      .limit(50)
      .get()
    const requests = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .map((r) => ({
        id: r.id,
        teamId: r.teamId,
        teamName: r.teamName || 'Team',
        status: r.status || 'pending',
        createdAt: r.createdAt?.toDate?.()?.toISOString() || null,
      }))
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
    res.json({ requests })
  } catch (e) {
    next(e)
  }
})

/**
 * GET /participant/team-join-requests — pending requests for the leader's team.
 * Only the team leader sees these.
 */
r.get('/team-join-requests', async (req, res, next) => {
  try {
    const db = getDb()
    const uid = req.user.uid
    const prof = req.profile || {}
    const teamId = prof.teamId
    if (!teamId) return res.json({ requests: [] })

    const teamSnap = await db.doc(`teams/${teamId}`).get()
    if (!teamSnap.exists) return res.json({ requests: [] })
    const team = teamSnap.data()
    if (team.leaderId !== uid) return res.status(403).json({ error: 'Only the team leader can view join requests.' })

    const snap = await db.collection('joinRequests')
      .where('teamId', '==', teamId)
      .where('status', '==', 'pending')
      .limit(50)
      .get()
    const requests = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .map((r) => ({
        id: r.id,
        userId: r.userId,
        userName: r.userName || 'Participant',
        userInstitute: r.userInstitute || '',
        userSkills: Array.isArray(r.userSkills) ? r.userSkills : [],
        message: r.message || '',
        createdAt: r.createdAt?.toDate?.()?.toISOString() || null,
      }))
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
    res.json({ requests, teamId })
  } catch (e) {
    next(e)
  }
})

/**
 * POST /participant/team-join-requests/:requestId/respond — leader approves or declines.
 * Body: { action: 'approve' | 'decline' }
 * On approve: adds the requester to the team (transaction, size-checked) and
 * declines all their other pending requests.
 */
r.post('/team-join-requests/:requestId/respond', async (req, res, next) => {
  try {
    const db = getDb()
    const uid = req.user.uid
    const prof = req.profile || {}
    const teamId = prof.teamId
    const { requestId } = req.params
    if (!isValidDocId(requestId)) return res.status(400).json({ error: 'Invalid request ID.' })
    const action = String(req.body?.action || '').toLowerCase()
    if (action !== 'approve' && action !== 'decline') {
      return res.status(400).json({ error: "action must be 'approve' or 'decline'." })
    }
    if (!teamId) return res.status(400).json({ error: 'You are not on a team.' })

    const reqRef = db.doc(`joinRequests/${requestId}`)
    const reqSnap = await reqRef.get()
    if (!reqSnap.exists) return res.status(404).json({ error: 'Join request not found.' })
    const reqData = reqSnap.data()

    if (reqData.teamId !== teamId) return res.status(403).json({ error: 'That request is not for your team.' })
    if (reqData.status !== 'pending') return res.status(400).json({ error: 'This request was already handled.' })

    const teamRef = db.doc(`teams/${teamId}`)
    const teamSnap = await teamRef.get()
    if (!teamSnap.exists) return res.status(404).json({ error: 'Team not found.' })
    const team = teamSnap.data()
    if (team.leaderId !== uid) return res.status(403).json({ error: 'Only the team leader can respond to requests.' })

    if (action === 'decline') {
      await reqRef.set({ status: 'declined', updatedAt: FieldValue.serverTimestamp(), respondedBy: uid }, { merge: true })
      return res.json({ ok: true, status: 'declined' })
    }

    // Approve — validate gates and add member atomically.
    const merged = await getActiveEventConfig()
    const tf = allowTeamFormation(merged)
    if (!tf.ok) return res.status(403).json({ error: tf.reason })

    const maxSize = merged.maxTeamSize || 4
    const newMemberUid = reqData.userId
    const eventId = req.eventId || team.eventId || ''

    // Make sure the requester isn't already on a team
    const newMemberSnap = await db.doc(`users/${newMemberUid}`).get()
    if (newMemberSnap.exists && newMemberSnap.data().teamId) {
      await reqRef.set({ status: 'declined', updatedAt: FieldValue.serverTimestamp(), respondedBy: uid, note: 'User already joined a team' }, { merge: true })
      return res.status(400).json({ error: 'That participant has already joined another team.' })
    }

    await db.runTransaction(async (tx) => {
      const tSnap = await tx.get(teamRef)
      if (!tSnap.exists) throw Object.assign(new Error('Team not found'), { status: 404 })
      const t = tSnap.data()
      const membersTx = Array.isArray(t.memberIds) ? t.memberIds : []
      if (membersTx.includes(newMemberUid)) {
        // Already a member — just mark request approved
        tx.set(reqRef, { status: 'approved', updatedAt: FieldValue.serverTimestamp(), respondedBy: uid }, { merge: true })
        return
      }
      if (membersTx.length >= maxSize) {
        throw Object.assign(new Error(`Team is full. Maximum ${maxSize} members allowed.`), { status: 400 })
      }
      const patch = { memberIds: FieldValue.arrayUnion(newMemberUid), updatedAt: FieldValue.serverTimestamp() }
      if (!t.eventId && eventId) patch.eventId = eventId
      tx.update(teamRef, patch)
      tx.set(db.doc(`users/${newMemberUid}`), { teamId, activeEventId: eventId, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
      tx.set(reqRef, { status: 'approved', updatedAt: FieldValue.serverTimestamp(), respondedBy: uid }, { merge: true })
    })

    // Auto-decline this user's other pending requests (they now have a team)
    try {
      const others = await db.collection('joinRequests')
        .where('userId', '==', newMemberUid)
        .where('status', '==', 'pending')
        .limit(50)
        .get()
      if (!others.empty) {
        const batch = db.batch()
        others.docs.forEach((d) => {
          if (d.id !== requestId) {
            batch.set(d.ref, { status: 'declined', updatedAt: FieldValue.serverTimestamp(), note: 'Joined another team' }, { merge: true })
          }
        })
        await batch.commit()
      }
    } catch { /* non-critical */ }

    notifyTeamMemberJoined({ teamId, newMemberUid }).catch(() => {})
    logActivity({ ...actorFromReq(req), activityType: ACTIVITY_TYPE.TEAM_JOINED, teamId, targetId: newMemberUid, targetType: 'team', description: 'Approved join request' }).catch(() => {})

    res.json({ ok: true, status: 'approved' })
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message })
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

/**
 * GET /participant/mentor-chat/status
 * Reports whether a mentor is assigned to the participant's team. Assignment can
 * happen three ways (mirrors mentorCanAccessTeam): direct team.mentorIds, the
 * team's problem-statement mentorIds, or a mentor's domain+track assignment that
 * matches the team's problem statement. Used to show a friendly "a mentor will
 * be assigned soon" state before anyone is attached. Read-only, never throws.
 */
r.get('/mentor-chat/status', async (req, res) => {
  try {
    const db = getDb()
    const prof = req.profile || {}
    const teamId = prof.teamId
    if (!teamId) return res.json({ assigned: false, hasTeam: false })

    const teamSnap = await db.doc(`teams/${teamId}`).get()
    if (!teamSnap.exists) return res.json({ assigned: false, hasTeam: false })
    const team = teamSnap.data()

    // 1. Direct assignment on the team document.
    if (Array.isArray(team.mentorIds) && team.mentorIds.length > 0) {
      return res.json({ assigned: true, hasTeam: true })
    }

    // 2 & 3. Via the team's problem statement (direct PS mentor, or domain/track).
    if (team.problemStatementId) {
      const psSnap = await db.doc(`problemStatements/${team.problemStatementId}`).get()
      if (psSnap.exists) {
        const psData = psSnap.data()
        if (Array.isArray(psData.mentorIds) && psData.mentorIds.length > 0) {
          return res.json({ assigned: true, hasTeam: true })
        }
        // Domain + track: any mentor whose assignments match this PS.
        const psDomain = psData.theme || psData.domain || ''
        const psTrack = psData.category || ''
        const mentorsSnap = await db.collection('users').where('role', '==', 'mentor').get()
        const matched = mentorsSnap.docs.some((d) => {
          const assignments = Array.isArray(d.data()?.mentorAssignments) ? d.data().mentorAssignments : []
          return assignments.some((a) => {
            const domainMatch = !a.domain || a.domain === psDomain
            const trackMatch = !a.track || a.track === psTrack
            return (a.domain || a.track) && domainMatch && trackMatch
          })
        })
        if (matched) return res.json({ assigned: true, hasTeam: true })
      }
    }

    return res.json({ assigned: false, hasTeam: true })
  } catch {
    // Fail open to the neutral "not assigned yet" state rather than erroring.
    res.json({ assigned: false, hasTeam: true })
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

/**
 * Judges' remarks for the participant's own team — FEEDBACK ONLY.
 *
 * Teams may read the qualitative remarks judges left on their submission, but
 * NEVER the numeric marks/scores. Judges are anonymized (Judge 1, Judge 2, …).
 * Only submitted evaluations with non-empty remarks are returned.
 */
r.get('/evaluation-remarks', async (req, res, next) => {
  try {
    const db = getDb()
    const teamId = req.profile?.teamId
    if (!teamId) return res.json({ remarks: [] })

    // Single-field filter (teamId) needs no composite index; filter status in code.
    const snap = await db.collection('evaluations').where('teamId', '==', teamId).limit(50).get()

    const remarks = []
    let n = 0
    snap.docs.forEach((d) => {
      const e = d.data()

      if (e.scoringMode === 'twoPart') {
        // Finals model — the judge submits Evaluation 1 (Part A) and
        // Evaluation 2 (Part B) separately. Only show remarks for parts that
        // have actually been submitted (statusA / statusB === 'submitted'),
        // even if the whole evaluation isn't complete yet. Still no scores.
        const fbA = e.statusA === 'submitted' && typeof e.feedbackA === 'string' ? e.feedbackA.trim() : ''
        const fbB = e.statusB === 'submitted' && typeof e.feedbackB === 'string' ? e.feedbackB.trim() : ''
        if (!fbA && !fbB) return
        n += 1
        const labelA = typeof e.partALabel === 'string' && e.partALabel ? e.partALabel : 'Part A'
        const labelB = typeof e.partBLabel === 'string' && e.partBLabel ? e.partBLabel : 'Part B'
        remarks.push({
          id: `judge-${n}`,
          judgeLabel: `Judge ${n}`,
          feedbackA: fbA ? fbA.slice(0, 8000) : '',
          feedbackB: fbB ? fbB.slice(0, 8000) : '',
          labelA,
          labelB,
        })
        return
      }

      if (e.evaluationStatus !== 'submitted') return
      const fb = typeof e.feedback === 'string' ? e.feedback.trim() : ''
      if (!fb) return
      n += 1
      remarks.push({ id: `judge-${n}`, judgeLabel: `Judge ${n}`, feedback: fb.slice(0, 8000) })
    })

    // Deliberately NO scores/marks are included in this response.
    res.json({ remarks })
  } catch (e) {
    next(e)
  }
})

export { r as participantRouter }
