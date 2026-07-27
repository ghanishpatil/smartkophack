/**
 * Open Innovation — participant-authored problem statements.
 *
 * A team that cannot find a suitable problem statement may submit their own
 * idea. It is stored in the SAME `problemStatements` collection so that the
 * existing selection, judge domain/track assignment, and evaluation pipelines
 * work unchanged. Two markers keep it separate from curated problems:
 *
 *   origin: 'open_innovation'   → identifies participant-authored entries
 *   visibility: 'private'       → hidden from the public site + other teams
 *   ownerTeamId: '<teamId>'     → only this team (and admins/judges) may see it
 *
 * Judge routing: `theme` is always set to the official 'Open Innovation' domain,
 * so any judge assigned that domain automatically picks these teams up. The
 * participant's own domain choice is kept in `selfDomain` as metadata.
 */

import { getDb } from './firebaseAdmin.js'

export const OPEN_INNOVATION_DOMAIN = 'Open Innovation'
export const OI_ORIGIN = 'open_innovation'
export const OI_VISIBILITY = 'private'

/** Official domains a participant may tag their idea with (plus "Other"). */
export const OI_SELF_DOMAINS = [
  'Health',
  'Education',
  'Transportation',
  'Food Safety & Security',
  'Waste Management',
  'Agriculture',
  'Industry & MSME Innovation',
  'Open Innovation',
  'Other',
]

export const OI_TRACKS = ['Software', 'Hardware']

/** True when a problem statement is a participant-authored Open Innovation entry. */
export function isOpenInnovation(ps) {
  return ps?.origin === OI_ORIGIN
}

/**
 * True when a problem statement must be hidden from public listings.
 * Private entries are only visible to their owning team, admins, and judges.
 */
export function isPrivateProblem(ps) {
  return ps?.visibility === OI_VISIBILITY
}

/**
 * Reserve the next sequential Open Innovation problem id (skhoi001, skhoi002…).
 * Scans existing ids for the event and skips any that already exist.
 */
export async function nextOpenInnovationId(eventId) {
  const db = getDb()
  let next = 1
  try {
    let q = db.collection('problemStatements')
    q = eventId ? q.where('eventId', '==', eventId) : q
    const snap = await q.limit(2000).get()
    for (const d of snap.docs) {
      const m = /^skhoi(\d+)$/i.exec(d.id)
      if (m) {
        const n = parseInt(m[1], 10)
        if (!Number.isNaN(n) && n >= next) next = n + 1
      }
    }
  } catch {
    // fall through — the existence loop below guards against collisions
  }

  // Guard against races / manually created ids.
  for (let attempt = 0; attempt < 50; attempt++) {
    const id = `skhoi${String(next).padStart(3, '0')}`
    // eslint-disable-next-line no-await-in-loop
    const exists = (await db.doc(`problemStatements/${id}`).get()).exists
    if (!exists) return id
    next += 1
  }
  throw Object.assign(new Error('Could not allocate an Open Innovation id. Please try again.'), { status: 503 })
}

/** Validate + normalize the participant-submitted payload. */
export function normalizeOpenInnovationInput(body = {}) {
  const clean = (v, max) => String(v ?? '').trim().slice(0, max)

  const title = clean(body.title, 200)
  const track = clean(body.track || body.category, 40)
  const selfDomain = clean(body.domain || body.selfDomain, 60)
  const description = clean(body.description, 20000)

  if (!title) return { ok: false, error: 'Idea title is required.' }
  if (title.length < 5) return { ok: false, error: 'Idea title is too short.' }
  if (!OI_TRACKS.includes(track)) {
    return { ok: false, error: `Track must be one of: ${OI_TRACKS.join(', ')}.` }
  }
  if (!OI_SELF_DOMAINS.includes(selfDomain)) {
    return { ok: false, error: 'Please choose a valid domain.' }
  }
  if (!description) return { ok: false, error: 'A brief of your idea is required.' }
  if (description.length < 50) {
    return { ok: false, error: 'Please describe your idea in at least 50 characters.' }
  }

  return { ok: true, value: { title, track, selfDomain, description } }
}
