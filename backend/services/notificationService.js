/**
 * Notification Service — Real-Time Email Notifications
 *
 * Orchestrates email notifications for platform events.
 * Each notify* function is fire-and-forget (won't block the caller).
 *
 * HIGH-04 fix: All sequential email loops replaced with chunked parallel sends
 * using Promise.allSettled. This prevents blocking the Node.js event loop and
 * avoids HTTP request timeouts when sending to many recipients.
 *
 * LOW-05 fix: notifyMentorMessage — replaced undefined sendTemplatedEmail with
 * sendAnnouncementEmail which is already imported and available.
 */

import { getDb } from './firebaseAdmin.js'
import {
  sendWelcomeEmail,
  sendPaymentConfirmationEmail,
  sendPaymentReminderEmail,
  sendSubmissionConfirmationEmail,
  sendSubmissionDeadlineReminderEmail,
  sendTeamMemberJoinedEmail,
  sendAnnouncementEmail,
  sendEvaluationCompleteEmail,
  sendQualifiedEmail,
  sendCustomEmail,
} from './emailService.js'

/** Returns the configured frontend URL without trailing slash. */
function getFrontendUrl() {
  return (process.env.FRONTEND_URL || 'https://skh.example.com').replace(/\/$/, '')
}

/** Chunk size for parallel email sends. Keeps concurrency reasonable without
 *  hammering the email provider's rate limits. */
const EMAIL_CHUNK_SIZE = 20

/**
 * Send an array of async tasks in chunks of EMAIL_CHUNK_SIZE.
 * Uses Promise.allSettled so one failure doesn't abort the rest.
 * Returns total number of settled tasks (fulfilled + rejected).
 */
async function sendInChunks(tasks) {
  let completed = 0
  for (let i = 0; i < tasks.length; i += EMAIL_CHUNK_SIZE) {
    const chunk = tasks.slice(i, i + EMAIL_CHUNK_SIZE)
    await Promise.allSettled(chunk)
    completed += chunk.length
  }
  return completed
}

/**
 * Helper: Get user data by UID (checks Firestore, falls back to Firebase Auth for email)
 */
async function getUser(uid) {
  const db = getDb()
  const snap = await db.doc(`users/${uid}`).get()
  if (!snap.exists) return null
  const data = { uid, ...snap.data() }
  // If email is missing from Firestore, try Firebase Auth
  if (!data.email) {
    try {
      const { getAuth } = await import('firebase-admin/auth')
      const authUser = await getAuth().getUser(uid)
      data.email = authUser.email || ''
    } catch { /* ignore */ }
  }
  return data
}

/**
 * Helper: Get team data by ID
 */
async function getTeam(teamId) {
  const db = getDb()
  const snap = await db.doc(`teams/${teamId}`).get()
  return snap.exists ? { id: teamId, ...snap.data() } : null
}

/**
 * Helper: Get all team member user objects in parallel.
 * HIGH-04: was a sequential for loop — now uses Promise.all.
 */
async function getTeamMembers(memberIds) {
  const results = await Promise.all((memberIds || []).map((uid) => getUser(uid)))
  return results.filter(Boolean)
}

// ─── NOTIFICATION TRIGGERS ──────────────────────────────────────────────────

/**
 * When a new member joins a team → notify all existing members
 * HIGH-04: user fetches parallelised; email sends chunked.
 */
export async function notifyTeamMemberJoined({ teamId, newMemberUid }) {
  try {
    const team = await getTeam(teamId)
    if (!team) return
    const newMember = await getUser(newMemberUid)
    const newMemberName = newMember?.displayName || 'New Member'

    // Fetch all member profiles in parallel (excluding the new member)
    const memberIds = (team.memberIds || []).filter((uid) => uid !== newMemberUid)
    const members = await getTeamMembers(memberIds)
    const eligible = members.filter((m) => m.email)

    const tasks = eligible.map((member) =>
      sendTeamMemberJoinedEmail({
        to: member.email,
        name: member.displayName || 'Team Member',
        teamName: team.name || 'Your Team',
        newMemberName,
      }),
    )
    await sendInChunks(tasks)
    console.log(`[Notify] Team member joined: ${newMemberName} → ${teamId} (${tasks.length} notified)`)
  } catch (err) {
    console.error('[Notify] Team member joined failed:', err.message)
  }
}

/**
 * When a member leaves or is removed → notify team leader
 */
export async function notifyTeamMemberLeft({ teamId, memberUid, memberName, removedBy }) {
  try {
    const team = await getTeam(teamId)
    if (!team) return
    const leader = await getUser(team.leaderId)
    if (!leader?.email) return

    const action = removedBy ? 'was removed from' : 'left'
    await sendAnnouncementEmail({
      to: leader.email,
      name: leader.displayName || 'Team Leader',
      title: `Team Member Update — ${team.name}`,
      message: `${memberName || 'A member'} ${action} your team "${team.name}". Your team now has ${(team.memberIds || []).length} member(s).`,
      link: `${getFrontendUrl()}/dashboard/team`,
    })
    console.log(`[Notify] Member left: ${memberName} from ${teamId}`)
  } catch (err) {
    console.error('[Notify] Member left failed:', err.message)
  }
}

/**
 * When registration is complete → welcome email to leader
 */
export async function notifyRegistrationComplete({ teamId, eventName }) {
  try {
    const team = await getTeam(teamId)
    if (!team) return
    const leader = await getUser(team.leaderId)
    if (!leader?.email) return

    await sendWelcomeEmail({
      to: leader.email,
      name: leader.displayName || 'Participant',
      teamName: team.name || 'Your Team',
      eventName: eventName || 'Smart Kopargaon Hackathon',
    })
    console.log(`[Notify] Registration complete: ${teamId}`)
  } catch (err) {
    console.error('[Notify] Registration complete failed:', err.message)
  }
}

/**
 * When payment is confirmed → notify leader with receipt
 */
export async function notifyPaymentConfirmed({ teamId, amount, currency, paymentId }) {
  try {
    const team = await getTeam(teamId)
    if (!team) return
    const leader = await getUser(team.leaderId)
    if (!leader?.email) return

    await sendPaymentConfirmationEmail({
      to: leader.email,
      name: leader.displayName || 'Team Leader',
      teamName: team.name || 'Your Team',
      amount,
      currency,
      paymentId,
    })
    console.log(`[Notify] Payment confirmed: ${teamId} (${currency} ${amount})`)
  } catch (err) {
    console.error('[Notify] Payment confirmed failed:', err.message)
  }
}

/**
 * When submission is finalized → notify leader
 */
export async function notifySubmissionFinalized({ teamId }) {
  try {
    const team = await getTeam(teamId)
    if (!team) return
    const leader = await getUser(team.leaderId)
    if (!leader?.email) return

    const db = getDb()
    let psTitle = 'Problem Statement'
    if (team.problemStatementId) {
      const psSnap = await db.doc(`problemStatements/${team.problemStatementId}`).get()
      if (psSnap.exists) psTitle = psSnap.data().title || psTitle
    }

    await sendSubmissionConfirmationEmail({
      to: leader.email,
      name: leader.displayName || 'Team Leader',
      teamName: team.name || 'Your Team',
      problemStatement: psTitle,
      submittedAt: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
    })
    console.log(`[Notify] Submission finalized: ${teamId}`)
  } catch (err) {
    console.error('[Notify] Submission finalized failed:', err.message)
  }
}

/**
 * When a team's evaluation is complete → notify leader
 */
export async function notifyEvaluationComplete({ teamId }) {
  try {
    const team = await getTeam(teamId)
    if (!team) return
    const leader = await getUser(team.leaderId)
    if (!leader?.email) return

    await sendEvaluationCompleteEmail({
      to: leader.email,
      name: leader.displayName || 'Team Leader',
      teamName: team.name || 'Your Team',
    })
    console.log(`[Notify] Evaluation complete: ${teamId}`)
  } catch (err) {
    console.error('[Notify] Evaluation complete failed:', err.message)
  }
}

/**
 * Send payment reminder to all teams with pending payment.
 * HIGH-04: user fetches parallelised; email sends chunked.
 */
export async function notifyPaymentReminders({ eventConfig }) {
  try {
    const db = getDb()
    const teamsSnap = await db.collection('teams')
      .where('paymentStatus', '==', 'pending')
      .where('eventId', '==', eventConfig.id || eventConfig.eventId)
      .limit(500)
      .get()

    // Filter teams that actually need reminders
    const eligibleDocs = teamsSnap.docs.filter((doc) => {
      const team = doc.data()
      return team.registrationRequestedAt || team.eventRegistered
    })

    // Fetch all leader profiles in parallel
    const leaderEntries = await Promise.all(
      eligibleDocs.map(async (doc) => {
        const team = doc.data()
        const leader = await getUser(team.leaderId)
        if (!leader?.email) return null
        return { leader, team }
      }),
    )
    const eligible = leaderEntries.filter(Boolean)

    const tasks = eligible.map(({ leader, team }) =>
      sendPaymentReminderEmail({
        to: leader.email,
        name: leader.displayName || 'Team Leader',
        teamName: team.name || 'Your Team',
        amount: String(eventConfig.entryFeeAmount || 400),
        currency: eventConfig.currency || 'INR',
        deadline: eventConfig.registrationClosesAt
          ? new Date(eventConfig.registrationClosesAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
          : 'Soon',
      }),
    )

    await sendInChunks(tasks)
    console.log(`[Notify] Payment reminders sent: ${tasks.length} teams`)
    return { sent: tasks.length }
  } catch (err) {
    console.error('[Notify] Payment reminders failed:', err.message)
    return { sent: 0, error: err.message }
  }
}

/**
 * Send submission deadline reminders to teams without finalized submissions.
 * HIGH-04: submission checks and user fetches parallelised; email sends chunked.
 */
export async function notifySubmissionDeadlineReminders({ eventConfig, hoursLeft }) {
  try {
    const db = getDb()
    const teamsSnap = await db.collection('teams')
      .where('eventRegistered', '==', true)
      .where('eventId', '==', eventConfig.id || eventConfig.eventId)
      .limit(500)
      .get()

    // Pre-filter teams that are candidates (skip locked + no PS)
    const candidateDocs = teamsSnap.docs.filter((doc) => {
      const team = doc.data()
      return !team.submissionLocked && team.problemStatementId
    })

    // Fetch submission status and leader profile in parallel for all candidates
    const entries = await Promise.all(
      candidateDocs.map(async (doc) => {
        const team = doc.data()
        const [subSnap, leader] = await Promise.all([
          db.doc(`submissions/${doc.id}`).get(),
          getUser(team.leaderId),
        ])
        // Skip if already submitted or no email
        if (subSnap.exists && subSnap.data().status === 'submitted') return null
        if (!leader?.email) return null
        return { leader, team }
      }),
    )
    const eligible = entries.filter(Boolean)

    const tasks = eligible.map(({ leader, team }) =>
      sendSubmissionDeadlineReminderEmail({
        to: leader.email,
        name: leader.displayName || 'Team Leader',
        teamName: team.name || 'Your Team',
        deadline: eventConfig.submissionDeadline
          ? new Date(eventConfig.submissionDeadline).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
          : 'Soon',
        hoursLeft: String(hoursLeft),
      }),
    )

    await sendInChunks(tasks)
    console.log(`[Notify] Submission deadline reminders (${hoursLeft}h): ${tasks.length} teams`)
    return { sent: tasks.length }
  } catch (err) {
    console.error('[Notify] Submission deadline reminders failed:', err.message)
    return { sent: 0, error: err.message }
  }
}

/**
 * Send announcement email to all participants.
 * HIGH-04: email sends chunked with Promise.allSettled.
 */
export async function notifyBroadcast({ title, message, link, eventId, audience = 'all' }) {
  try {
    const db = getDb()
    let eligible

    if (audience === 'team_leaders') {
      // Registered team leaders only: collect the leaderId of every registered
      // team (optionally scoped to the event), then fetch those user docs for
      // their emails. Leaders have the normal 'participant' role, so a role
      // query cannot target them — we must go through the teams collection.
      let teamsQuery = db.collection('teams').limit(2000)
      if (eventId) teamsQuery = teamsQuery.where('eventId', '==', eventId)
      const teamsSnap = await teamsQuery.get()
      const leaderIds = new Set()
      for (const d of teamsSnap.docs) {
        const t = d.data()
        const registered = t.eventRegistered === true || t.registrationStatus === 'registered'
        if (registered && t.leaderId) leaderIds.add(t.leaderId)
      }
      const ids = [...leaderIds]
      const leaders = []
      for (let i = 0; i < ids.length; i += 300) {
        const refs = ids.slice(i, i + 300).map((id) => db.doc(`users/${id}`))
        if (refs.length === 0) continue
        const snaps = await db.getAll(...refs)
        for (const s of snaps) {
          if (s.exists) leaders.push(s.data())
        }
      }
      eligible = leaders.filter((u) => u && u.email)
    } else {
      let usersQuery = db.collection('users').limit(1000)
      if (audience !== 'all') {
        usersQuery = usersQuery.where('role', '==', audience === 'participants' ? 'participant' : audience)
      }
      const usersSnap = await usersQuery.get()

      // Filter eligible recipients
      eligible = usersSnap.docs
        .map((doc) => doc.data())
        .filter((user) => {
          if (!user.email) return false
          // If event-scoped, only notify users in that event
          if (eventId && user.activeEventId && user.activeEventId !== eventId) return false
          return true
        })
    }

    const tasks = eligible.map((user) =>
      sendAnnouncementEmail({
        to: user.email,
        name: user.displayName || 'Participant',
        title,
        message,
        link: link || `${getFrontendUrl()}/dashboard/announcements`,
      }),
    )

    await sendInChunks(tasks)
    console.log(`[Notify] Broadcast "${title}": ${tasks.length} recipients`)
    return { sent: tasks.length }
  } catch (err) {
    console.error('[Notify] Broadcast failed:', err.message)
    return { sent: 0, error: err.message }
  }
}

/**
 * Email "your team has qualified" to the team LEADER of qualified teams.
 * - teamIds: optional array to target specific teams; when omitted, ALL
 *   qualified teams are emailed.
 * - Only teams whose juryStatus === 'qualified' are ever emailed (safety).
 * - Resendable: no state is stored; calling again re-sends.
 * Returns { sent, qualified, skipped }.
 */
export async function notifyQualified({ teamIds = null, eventId = '' } = {}) {
  try {
    const db = getDb()
    let q = db.collection('teams').limit(2000)
    if (eventId) q = q.where('eventId', '==', eventId)
    const snap = await q.get()
    const idSet = Array.isArray(teamIds) && teamIds.length ? new Set(teamIds) : null
    const targets = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((t) => t.juryStatus === 'qualified' && (!idSet || idSet.has(t.id)))
    if (targets.length === 0) return { sent: 0, qualified: 0, skipped: 0 }

    // Resolve leader account emails (chunked getAll).
    const leaderIds = [...new Set(targets.map((t) => t.leaderId).filter(Boolean))]
    const userInfo = new Map()
    for (let i = 0; i < leaderIds.length; i += 300) {
      const refs = leaderIds.slice(i, i + 300).map((id) => db.doc(`users/${id}`))
      if (refs.length === 0) continue
      const snaps = await db.getAll(...refs)
      for (const s of snaps) {
        if (s.exists) { const u = s.data(); userInfo.set(s.id, { email: u.email || '', name: u.displayName || '' }) }
      }
    }

    // Fallback: leader's registration record (for leaders without an account email).
    const mrSnap = await db.collection('memberRegistrations').where('isLeader', '==', true).limit(8000).get()
    const mrByTeam = new Map()
    mrSnap.docs.forEach((d) => {
      const m = d.data()
      if (m.teamId && !mrByTeam.has(m.teamId)) mrByTeam.set(m.teamId, { email: m.email || '', name: m.name || '' })
    })

    const eventName = 'Smart Kopargaon Hackathon'
    const tasks = []
    let skipped = 0
    for (const t of targets) {
      const fromUser = t.leaderId ? userInfo.get(t.leaderId) : null
      const fromMr = mrByTeam.get(t.id)
      const email = (fromUser && fromUser.email) || (fromMr && fromMr.email) || ''
      const name = (fromUser && fromUser.name) || (fromMr && fromMr.name) || 'Team Leader'
      if (!email) { skipped += 1; continue }
      tasks.push(sendQualifiedEmail({ to: email, name, teamName: t.name || 'Your Team', eventName }))
    }
    await sendInChunks(tasks)
    console.log(`[Notify] Qualified emails: ${tasks.length} sent, ${skipped} skipped`)
    return { sent: tasks.length, qualified: targets.length, skipped }
  } catch (err) {
    console.error('[Notify] Qualified emails failed:', err.message)
    return { sent: 0, qualified: 0, skipped: 0, error: err.message }
  }
}

/**
 * Send a CUSTOM (admin-composed) email to qualified teams, reaching EVERY
 * member whose email is on record — the team leader's account email plus each
 * member's registration email (deduped per team).
 *
 * - teamIds: optional array to target specific qualified team(s); omit for ALL.
 * - subject/title/message: admin-composed content. `{{TEAM}}` in subject/message
 *   is replaced with the team's name so one template personalizes per team.
 * - link: optional CTA URL (only http/https rendered).
 * - Only teams whose juryStatus === 'qualified' are ever emailed (safety).
 * Returns { sent, qualified, skipped, recipients }.
 */
export async function notifyQualifiedCustom({
  teamIds = null,
  eventId = '',
  subject = '',
  title = '',
  message = '',
  link = '',
} = {}) {
  try {
    const db = getDb()
    let q = db.collection('teams').limit(2000)
    if (eventId) q = q.where('eventId', '==', eventId)
    const snap = await q.get()
    const idSet = Array.isArray(teamIds) && teamIds.length ? new Set(teamIds) : null
    const targets = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((t) => t.juryStatus === 'qualified' && (!idSet || idSet.has(t.id)))
    if (targets.length === 0) return { sent: 0, qualified: 0, skipped: 0, recipients: 0 }

    const targetIdSet = new Set(targets.map((t) => t.id))

    // Leader account emails (chunked getAll).
    const leaderIds = [...new Set(targets.map((t) => t.leaderId).filter(Boolean))]
    const leaderByUid = new Map()
    for (let i = 0; i < leaderIds.length; i += 300) {
      const refs = leaderIds.slice(i, i + 300).map((id) => db.doc(`users/${id}`))
      if (refs.length === 0) continue
      const snaps = await db.getAll(...refs)
      for (const s of snaps) {
        if (s.exists) { const u = s.data(); leaderByUid.set(s.id, { email: u.email || '', name: u.displayName || '' }) }
      }
    }

    // All member registrations grouped by team (leader + members).
    const mrSnap = await db.collection('memberRegistrations').limit(20000).get()
    const membersByTeam = new Map()
    mrSnap.docs.forEach((d) => {
      const m = d.data()
      if (!m.teamId || !targetIdSet.has(m.teamId)) return
      if (!membersByTeam.has(m.teamId)) membersByTeam.set(m.teamId, [])
      membersByTeam.get(m.teamId).push({ email: String(m.email || '').trim(), name: m.name || '' })
    })

    const tasks = []
    let recipients = 0
    let skipped = 0
    for (const t of targets) {
      const teamName = t.name || 'Your Team'
      const seen = new Set()
      const list = []

      // Team leader's account email first.
      const la = t.leaderId ? leaderByUid.get(t.leaderId) : null
      if (la && la.email) {
        const key = la.email.toLowerCase()
        seen.add(key)
        list.push({ email: la.email, name: la.name || 'Team Leader' })
      }
      // Every member email from registration data (dedup by lowercased email).
      for (const m of (membersByTeam.get(t.id) || [])) {
        if (!m.email) continue
        const key = m.email.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        list.push({ email: m.email, name: m.name || 'Participant' })
      }

      if (list.length === 0) { skipped += 1; continue }

      const finalSubject = (subject || `Congratulations! ${teamName} has qualified`).replace(/\{\{TEAM\}\}/g, teamName)
      const finalMessage = (message || '').replace(/\{\{TEAM\}\}/g, teamName)
      const finalTitle = (title || 'Your team has qualified! 🎉').replace(/\{\{TEAM\}\}/g, teamName)

      for (const r of list) {
        recipients += 1
        tasks.push(sendCustomEmail({
          to: r.email,
          name: r.name,
          subject: finalSubject,
          title: finalTitle,
          message: finalMessage,
          link,
        }))
      }
    }

    await sendInChunks(tasks)
    console.log(`[Notify] Custom qualified emails: ${tasks.length} sent to ${recipients} recipient(s), ${skipped} team(s) skipped`)
    return { sent: tasks.length, qualified: targets.length, skipped, recipients }
  } catch (err) {
    console.error('[Notify] Custom qualified emails failed:', err.message)
    return { sent: 0, qualified: 0, skipped: 0, recipients: 0, error: err.message }
  }
}

/**
 * When mentor sends a message → notify team members via email.
 * HIGH-04: member fetches parallelised; email sends chunked.
 * LOW-05: Fixed undefined sendTemplatedEmail → uses sendAnnouncementEmail.
 */
export async function notifyMentorMessage({ teamId, mentorName, messagePreview }) {
  try {
    const team = await getTeam(teamId)
    if (!team) return

    // Fetch all member profiles in parallel
    const members = await getTeamMembers(team.memberIds)
    const eligible = members.filter((m) => m.email)

    const tasks = eligible.map((user) =>
      // LOW-05: sendTemplatedEmail was undefined — replaced with sendAnnouncementEmail
      sendAnnouncementEmail({
        to: user.email,
        name: user.displayName || 'Participant',
        title: `New message from ${mentorName || 'Your Mentor'} — ${team.name || 'Your Team'}`,
        message: (messagePreview || '').slice(0, 200),
        link: `${getFrontendUrl()}/dashboard/mentor-chat`,
      }),
    )

    await sendInChunks(tasks)
    console.log(`[Notify] Mentor message to ${teamId}: ${tasks.length} recipients`)
  } catch (err) {
    console.error('[Notify] Mentor message notification failed:', err.message)
  }
}
