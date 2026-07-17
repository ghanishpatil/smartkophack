import { FieldValue } from 'firebase-admin/firestore'
import { getDb } from './firebaseAdmin.js'

/** Single-hackathon install — auto-created in Firestore when missing (no env vars). */
export const INSTALL_EVENT_ID = 'skh2026'
export const INSTALL_EVENT_NAME = 'Smart Kopargaon Hackathon'

let bootstrapPromise = null

async function runBootstrap() {
  const db = getDb()
  if (!db) return INSTALL_EVENT_ID

  const eventRef = db.doc(`events/${INSTALL_EVENT_ID}`)
  const eventSnap = await eventRef.get()
  if (!eventSnap.exists) {
    await eventRef.set({
      name: INSTALL_EVENT_NAME,
      slug: 'skh',
      lifecyclePhase: 'REGISTRATION_OPEN',
      listedPublic: true,
      registrationOpen: true,
      entryFeeEnabled: false,
      entryFeeAmount: 0,
      currency: 'INR',
      active: true,
      minTeamSize: 1,
      maxTeamSize: 4,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
  }

  // Ensure the install event is marked as active if it exists
  if (eventSnap.exists && !eventSnap.data().active) {
    await eventRef.update({ active: true, updatedAt: FieldValue.serverTimestamp() })
  }

  // ARCH-01: Write config/platform.activeEventId if not already set.
  // This is the authoritative source for the active event going forward.
  const platformRef = db.doc('config/platform')
  const platformSnap = await platformRef.get()
  if (!platformSnap.exists || !platformSnap.data()?.activeEventId) {
    await platformRef.set(
      { activeEventId: INSTALL_EVENT_ID, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    )
  }

  return INSTALL_EVENT_ID
}

/** Idempotent: ensures `events/{INSTALL_EVENT_ID}` exists and is marked as active. */
export function ensureHackathonInstall() {
  if (!bootstrapPromise) {
    bootstrapPromise = runBootstrap().catch((err) => {
      bootstrapPromise = null
      throw err
    })
  }
  return bootstrapPromise
}
