/**
 * Password-change OTP service.
 * Stores one-time codes in Firestore `passwordOtps/{uid}` with a short expiry.
 * Server-only (Admin SDK). Never exposed to clients directly.
 */

import { randomInt, createHash, timingSafeEqual } from 'crypto'
import { FieldValue } from 'firebase-admin/firestore'
import { getDb } from './firebaseAdmin.js'

const OTP_TTL_MS = 10 * 60 * 1000 // 10 minutes
const RESEND_COOLDOWN_MS = 30 * 1000 // 30s between sends
const MAX_ATTEMPTS = 5

/** Hash an OTP before storing (never store raw codes). */
function hashOtp(uid, otp) {
  return createHash('sha256').update(`${uid}:${otp}`).digest('hex')
}

/** Generate a 6-digit numeric OTP (cryptographically secure). */
export function generateOtpCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

/**
 * Create + store an OTP for a user. Returns { ok, otp } or { ok:false, error, retryAfterMs }.
 * Enforces a resend cooldown.
 */
export async function issueOtp(uid) {
  const db = getDb()
  if (!db) return { ok: false, error: 'Database unavailable' }
  const ref = db.doc(`passwordOtps/${uid}`)
  const snap = await ref.get()
  if (snap.exists) {
    const d = snap.data()
    const lastSent = d.lastSentAt?.toMillis?.() ?? 0
    const since = Date.now() - lastSent
    if (since < RESEND_COOLDOWN_MS) {
      return { ok: false, error: 'Please wait before requesting another code.', retryAfterMs: RESEND_COOLDOWN_MS - since }
    }
  }
  const otp = generateOtpCode()
  await ref.set({
    hash: hashOtp(uid, otp),
    expiresAt: FieldValue.serverTimestamp(), // placeholder; real expiry checked via createdAtMs below
    createdAtMs: Date.now(),
    expiresAtMs: Date.now() + OTP_TTL_MS,
    attempts: 0,
    lastSentAt: FieldValue.serverTimestamp(),
  })
  return { ok: true, otp }
}

/**
 * Verify an OTP for a user. Returns { ok } or { ok:false, error }.
 * Deletes the OTP doc on success or when attempts are exhausted.
 */
export async function verifyOtp(uid, otp) {
  const db = getDb()
  if (!db) return { ok: false, error: 'Database unavailable' }
  const ref = db.doc(`passwordOtps/${uid}`)
  const snap = await ref.get()
  if (!snap.exists) return { ok: false, error: 'No active code. Request a new one.' }
  const d = snap.data()

  if (typeof d.expiresAtMs === 'number' && Date.now() > d.expiresAtMs) {
    await ref.delete().catch(() => {})
    return { ok: false, error: 'Code expired. Request a new one.' }
  }
  if ((d.attempts || 0) >= MAX_ATTEMPTS) {
    await ref.delete().catch(() => {})
    return { ok: false, error: 'Too many attempts. Request a new code.' }
  }

  const provided = String(otp || '').trim()
  const expectedHash = d.hash || ''
  const providedHash = hashOtp(uid, provided)

  let match = false
  try {
    match = expectedHash.length === providedHash.length &&
      timingSafeEqual(Buffer.from(expectedHash), Buffer.from(providedHash))
  } catch {
    match = false
  }

  if (!match) {
    await ref.set({ attempts: FieldValue.increment(1) }, { merge: true })
    const left = MAX_ATTEMPTS - ((d.attempts || 0) + 1)
    return { ok: false, error: left > 0 ? `Incorrect code. ${left} attempt(s) left.` : 'Too many attempts. Request a new code.' }
  }

  // Success — consume the OTP
  await ref.delete().catch(() => {})
  return { ok: true }
}
