/**
 * Leader account onboarding — admin bulk-creates team-leader accounts with a
 * temporary password and emails credentials via Brevo. Also implements Fix 1:
 * generate the Firebase password-reset link with the Admin SDK and deliver it
 * through Brevo (so it lands in the inbox, not Firebase's spam-prone sender).
 */

import { randomInt } from 'crypto'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue } from 'firebase-admin/firestore'
import { getDb } from './firebaseAdmin.js'
import { getActiveEvent } from './eventsService.js'
import { sendCredentialsEmail, sendPasswordResetLinkEmail } from './emailService.js'

const PW_CHARS = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** Generate a random temporary password like "hHdur43Ah" (10 chars). */
export function generateTempPassword(len = 10) {
  let s = ''
  for (let i = 0; i < len; i++) s += PW_CHARS[randomInt(0, PW_CHARS.length)]
  return s
}

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

/**
 * Create (or reuse) a Firebase Auth user for a leader email, set a temp password,
 * mark mustChangePassword, ensure a Firestore profile, and email credentials.
 * Idempotent-ish: if the user already exists it is SKIPPED (not overwritten).
 */
export async function inviteLeader(rawEmail) {
  const db = getDb()
  const auth = getAuth()
  if (!db) return { email: rawEmail, status: 'failed', error: 'Database unavailable' }

  const email = String(rawEmail || '').trim().toLowerCase()
  if (!isValidEmail(email)) return { email: rawEmail, status: 'failed', error: 'Invalid email' }

  // Skip if the user already exists (don't clobber real accounts/passwords)
  try {
    const existing = await auth.getUserByEmail(email)
    return { email, status: 'skipped', uid: existing.uid, reason: 'already exists' }
  } catch (e) {
    if (e.code !== 'auth/user-not-found') {
      return { email, status: 'failed', error: e.message || 'lookup failed' }
    }
  }

  const tempPassword = generateTempPassword()
  const activeEvent = await getActiveEvent()
  const eventName = activeEvent?.name || 'Smart Kopargaon Hackathon'

  let userRecord
  try {
    userRecord = await auth.createUser({ email, password: tempPassword, emailVerified: false })
  } catch (e) {
    return { email, status: 'failed', error: e.message || 'create failed' }
  }

  // Create the Firestore profile (Admin SDK — bypasses client rules)
  try {
    await db.doc(`users/${userRecord.uid}`).set({
      email,
      displayName: '',
      role: 'participant',
      teamId: '',
      activeEventId: activeEvent?.id || '',
      mustChangePassword: true,
      invitedAsLeader: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: false })
  } catch (e) {
    // Roll back the auth user if the profile write fails, to avoid orphans
    try { await auth.deleteUser(userRecord.uid) } catch { /* ignore */ }
    return { email, status: 'failed', error: e.message || 'profile write failed' }
  }

  // Email credentials via Brevo (fire, but await so we can report send status)
  const mail = await sendCredentialsEmail({ to: email, name: 'Team Leader', tempPassword, eventName })

  return { email, status: 'created', uid: userRecord.uid, emailed: Boolean(mail?.success) }
}

/**
 * Bulk invite. Accepts an array of emails, processes in small chunks to avoid
 * hammering Firebase/Brevo. Returns per-email results + summary counts.
 */
export async function bulkInviteLeaders(emails) {
  const list = Array.isArray(emails) ? emails : []
  const seen = new Set()
  const cleaned = []
  for (const e of list) {
    const em = String(e || '').trim().toLowerCase()
    if (!em || seen.has(em)) continue
    seen.add(em)
    cleaned.push(em)
    if (cleaned.length >= 1000) break // hard cap
  }

  const results = []
  const CHUNK = 10
  for (let i = 0; i < cleaned.length; i += CHUNK) {
    const chunk = cleaned.slice(i, i + CHUNK)
    const settled = await Promise.allSettled(chunk.map((em) => inviteLeader(em)))
    for (const s of settled) {
      if (s.status === 'fulfilled') results.push(s.value)
      else results.push({ status: 'failed', error: s.reason?.message || 'unknown' })
    }
  }

  const summary = {
    total: cleaned.length,
    created: results.filter((r) => r.status === 'created').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
    failed: results.filter((r) => r.status === 'failed').length,
  }
  return { summary, results }
}

/**
 * Fix 1: Generate a Firebase password-reset link via Admin SDK and email it
 * through Brevo (better deliverability than Firebase's built-in sender).
 */
export async function sendResetLinkViaBrevo(rawEmail) {
  const auth = getAuth()
  const email = String(rawEmail || '').trim().toLowerCase()
  if (!isValidEmail(email)) return { ok: false, error: 'Invalid email' }

  const activeEvent = await getActiveEvent()
  const eventName = activeEvent?.name || 'Smart Kopargaon Hackathon'

  const frontendUrl = (process.env.FRONTEND_URL || '').replace(/\/$/, '')
  const actionCodeSettings = frontendUrl ? { url: `${frontendUrl}/auth`, handleCodeInApp: false } : undefined

  let link
  try {
    link = actionCodeSettings
      ? await auth.generatePasswordResetLink(email, actionCodeSettings)
      : await auth.generatePasswordResetLink(email)
  } catch (e) {
    if (e.code === 'auth/user-not-found') return { ok: false, error: 'No account with that email' }
    return { ok: false, error: e.message || 'Could not generate reset link' }
  }

  const mail = await sendPasswordResetLinkEmail({ to: email, name: 'there', resetLink: link, eventName })
  if (!mail?.success) return { ok: false, error: mail?.error || 'Email send failed' }
  return { ok: true }
}
