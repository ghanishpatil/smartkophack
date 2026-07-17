import { getDb } from './firebaseAdmin.js'
import { FieldValue } from 'firebase-admin/firestore'
import { DEFAULT_EVENT_CONFIG } from './eventConfig.js'
import { effectivePhase } from './eventLifecycle.js'
import { ensureHackathonInstall, INSTALL_EVENT_ID } from './hackathonBootstrap.js'

// ─── HIGH-03: In-memory cache for active event ───────────────────────────────
// Reduced from 30s to 10s so phase changes by admin propagate faster to participants
const ACTIVE_EVENT_CACHE_TTL_MS = 10_000 // 10 seconds

let _activeEventCache = null
let _activeEventConfigCache = null

/** Invalidate both caches. Called by setActiveEvent() and exported for tests. */
export function invalidateEventCache() {
  _activeEventCache = null
  _activeEventConfigCache = null
}

/** Get the single active event.
 *  ARCH-01: Reads from config/platform.activeEventId first (single atomic document).
 *  Falls back to querying events where active==true for backward compatibility
 *  with deployments that haven't written config/platform yet.
 *  HIGH-03: Results cached for 30 seconds.
 */
export async function getActiveEvent() {
  const db = getDb()
  if (!db) return null

  const now = Date.now()
  if (_activeEventCache && (now - _activeEventCache.cachedAt) < ACTIVE_EVENT_CACHE_TTL_MS) {
    return _activeEventCache.event
  }

  // ARCH-01: Try config/platform.activeEventId first — single atomic read
  const platformSnap = await db.doc('config/platform').get()
  const platformEventId = platformSnap.exists ? platformSnap.data()?.activeEventId : null

  if (platformEventId) {
    const eventSnap = await db.doc(`events/${platformEventId}`).get()
    if (eventSnap.exists) {
      const event = { id: eventSnap.id, ...eventSnap.data() }
      _activeEventCache = { event, cachedAt: now }
      return event
    }
  }

  // Fallback: query events where active==true (backward compat for existing deployments)
  const activeSnap = await db.collection('events').where('active', '==', true).limit(1).get()
  if (!activeSnap.empty) {
    const doc = activeSnap.docs[0]
    const event = { id: doc.id, ...doc.data() }
    _activeEventCache = { event, cachedAt: now }
    return event
  }

  // Last resort: bootstrap install event
  await ensureHackathonInstall()
  const installSnap = await db.doc(`events/${INSTALL_EVENT_ID}`).get()
  if (installSnap.exists) {
    const event = { id: installSnap.id, ...installSnap.data() }
    _activeEventCache = { event, cachedAt: now }
    return event
  }

  _activeEventCache = { event: null, cachedAt: now }
  return null
}

/** Set which event is active.
 *  ARCH-01: Writes to config/platform.activeEventId — single atomic document write.
 *  Also keeps the events.active flag in sync for backward compatibility.
 *  Invalidates the in-memory cache immediately.
 */
export async function setActiveEvent(eventId) {
  const db = getDb()
  if (!db) throw new Error('Database unavailable')

  // ARCH-01: Write to config/platform atomically — this is the authoritative source.
  // A single document write cannot race with itself.
  await db.doc('config/platform').set(
    { activeEventId: eventId, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  )

  // Keep events.active flag in sync for backward compatibility with any code
  // that still reads it directly (e.g. admin scripts, fallback path above).
  const activeEvents = await db.collection('events').where('active', '==', true).limit(100).get()
  const batch = db.batch()
  activeEvents.docs.forEach(doc => {
    if (doc.id !== eventId) {
      batch.update(doc.ref, { active: false })
    }
  })
  const eventRef = db.doc(`events/${eventId}`)
  batch.update(eventRef, { active: true, updatedAt: FieldValue.serverTimestamp() })
  await batch.commit()

  // Invalidate cache immediately
  invalidateEventCache()
}

export async function getEventDocById(eventId) {
  const db = getDb()
  if (!db || !eventId) return null
  const snap = await db.doc(`events/${eventId}`).get()
  if (!snap.exists) return null
  return { id: snap.id, ...snap.data() }
}

/** Get active event configuration (single source of truth from events/{eventId}).
 *  HIGH-03: Results cached for 30 seconds. Cache is invalidated by setActiveEvent().
 */
export async function getActiveEventConfig() {
  await ensureHackathonInstall()

  const now = Date.now()
  if (_activeEventConfigCache && (now - _activeEventConfigCache.cachedAt) < ACTIVE_EVENT_CACHE_TTL_MS) {
    return _activeEventConfigCache.config
  }

  const event = await getActiveEvent()
  const db = getDb()

  if (!event || !db) {
    const config = {
      eventId: null,
      lifecyclePhase: effectivePhase({}),
      registrationOpen: DEFAULT_EVENT_CONFIG.registrationOpen,
      submissionsOpen: false,
      evaluationsOpen: false,
      resultsPublished: false,
      matchmakingEnabled: false,
      entryFeeEnabled: DEFAULT_EVENT_CONFIG.entryFeeEnabled,
      entryFeeAmount: DEFAULT_EVENT_CONFIG.entryFeeAmount,
      currency: DEFAULT_EVENT_CONFIG.currency,
      registrationOpensAt: null,
      registrationClosesAt: null,
      submissionDeadline: null,
      minTeamSize: 1,
      maxTeamSize: 4,
    }
    _activeEventConfigCache = { config, cachedAt: now }
    return config
  }

  const config = {
    eventId: event.id,
    lifecyclePhase: effectivePhase(event),
    registrationOpen: typeof event.registrationOpen === 'boolean' ? event.registrationOpen : DEFAULT_EVENT_CONFIG.registrationOpen,
    submissionsOpen: typeof event.submissionsOpen === 'boolean' ? event.submissionsOpen : false,
    evaluationsOpen: typeof event.evaluationsOpen === 'boolean' ? event.evaluationsOpen : false,
    resultsPublished: typeof event.resultsPublished === 'boolean' ? event.resultsPublished : false,
    matchmakingEnabled: typeof event.matchmakingEnabled === 'boolean' ? event.matchmakingEnabled : false,
    entryFeeEnabled: typeof event.entryFeeEnabled === 'boolean' ? event.entryFeeEnabled : DEFAULT_EVENT_CONFIG.entryFeeEnabled,
    entryFeeAmount: typeof event.entryFeeAmount === 'number' ? event.entryFeeAmount : DEFAULT_EVENT_CONFIG.entryFeeAmount,
    currency: typeof event.currency === 'string' ? event.currency : DEFAULT_EVENT_CONFIG.currency,
    registrationOpensAt: event.registrationOpensAt ?? null,
    registrationClosesAt: event.registrationClosesAt ?? null,
    submissionDeadline: event.submissionDeadline ?? null,
    evaluationCriteria: event.evaluationCriteria ?? null,
    minTeamSize: typeof event.minTeamSize === 'number' ? event.minTeamSize : 1,
    maxTeamSize: typeof event.maxTeamSize === 'number' ? event.maxTeamSize : 4,
    competitionPhases: Array.isArray(event.competitionPhases) ? event.competitionPhases : [],
  }
  _activeEventConfigCache = { config, cachedAt: now }
  return config
}

export async function listPublicEvents(limit = 50) {
  const db = getDb()
  if (!db) return []
  let snap
  try {
    snap = await db
      .collection('events')
      .where('listedPublic', '==', true)
      .limit(limit)
      .get()
  } catch (e) {
    console.warn('[listPublicEvents] Index may be missing for listedPublic query:', e.message)
    return []
  }

  return snap.docs
    .map((d) => {
      const x = d.data()
      const phase = effectivePhase({ ...x, id: d.id })
      if (phase === 'DRAFT' || phase === 'ARCHIVED') return null
      return {
        id: d.id,
        name: x.name || d.id,
        slug: x.slug || '',
        lifecyclePhase: phase,
        active: Boolean(x.active),
      }
    })
    .filter(Boolean)
}
