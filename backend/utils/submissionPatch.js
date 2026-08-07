const MAX_URL_LEN = 2048
const ALLOWED_STATUS = new Set(['draft', 'submitted'])

// Firebase Storage download URL patterns.
// Uploaded files must come from Firebase Storage to prevent participants from
// submitting arbitrary external URLs as their PPT/PDF/video (CRIT-02).
// Both the legacy storage.googleapis.com domain and the newer firebasestorage.app
// domain are accepted. The URL must also contain the team's own storage path.
const FIREBASE_STORAGE_HOSTS = [
  'firebasestorage.googleapis.com',
  'storage.googleapis.com',
]

/**
 * Returns true if the URL is a Firebase Storage download URL.
 * Accepts both:
 *   https://firebasestorage.googleapis.com/v0/b/{bucket}/o/...
 *   https://storage.googleapis.com/{bucket}/...
 */
function isFirebaseStorageUrl(url) {
  try {
    const u = new URL(url)
    return FIREBASE_STORAGE_HOSTS.some((host) => u.hostname === host || u.hostname.endsWith(`.${host}`))
  } catch {
    return false
  }
}

/**
 * Validates that a file upload URL belongs to Firebase Storage AND contains
 * the expected team path segment (submissions/{teamId}/...).
 * Throws a 400 error if the URL is present but invalid.
 */
function assertStorageUrl(fieldName, value, teamId) {
  if (value == null || value === '') return ''
  const s = String(value).trim().slice(0, MAX_URL_LEN)
  if (!s) return ''

  // Must be a valid https URL
  let u
  try {
    u = new URL(s)
  } catch {
    const e = new Error(`Invalid ${fieldName} URL`)
    e.status = 400
    throw e
  }
  if (u.protocol !== 'https:') {
    const e = new Error(`${fieldName} must use https`)
    e.status = 400
    throw e
  }
  if (u.username || u.password) {
    const e = new Error(`${fieldName} URL must not embed credentials`)
    e.status = 400
    throw e
  }

  // Must be a Firebase Storage URL (not an arbitrary external host)
  if (!isFirebaseStorageUrl(s)) {
    const e = new Error(`${fieldName} must be a Firebase Storage URL`)
    e.status = 400
    throw e
  }

  // Must contain the team's own storage path to prevent cross-team URL reuse.
  // Firebase Storage paths are URL-encoded in the download URL, so we check
  // both the raw and encoded form of the path segment.
  if (teamId) {
    const rawPath = `submissions/${teamId}/`
    const encodedPath = `submissions%2F${teamId}%2F`
    if (!s.includes(rawPath) && !s.includes(encodedPath)) {
      const e = new Error(`${fieldName} must be a storage URL for your team's submission`)
      e.status = 400
      throw e
    }
  }

  return s
}

// Allowed hosts for the demo video link. The video is now submitted as a
// YouTube link (not an uploaded file), so restrict to YouTube domains — this
// keeps it safe from arbitrary external URLs while allowing the common formats.
const YOUTUBE_HOSTS = new Set([
  'youtube.com', 'www.youtube.com', 'm.youtube.com',
  'youtu.be', 'www.youtu.be',
  'youtube-nocookie.com', 'www.youtube-nocookie.com',
])

function assertYouTubeUrl(fieldName, value) {
  if (value == null || value === '') return ''
  const s = String(value).trim().slice(0, MAX_URL_LEN)
  if (!s) return ''
  let u
  try {
    u = new URL(s)
  } catch {
    const e = new Error(`Invalid ${fieldName} URL`)
    e.status = 400
    throw e
  }
  if (u.protocol !== 'https:') {
    const e = new Error(`${fieldName} must use https`)
    e.status = 400
    throw e
  }
  if (u.username || u.password) {
    const e = new Error(`${fieldName} URL must not embed credentials`)
    e.status = 400
    throw e
  }
  if (!YOUTUBE_HOSTS.has(u.hostname.toLowerCase())) {
    const e = new Error('Demo video must be a YouTube link (youtube.com or youtu.be)')
    e.status = 400
    throw e
  }
  return s
}

function assertHttpsUrl(fieldName, value) {
  if (value == null || value === '') return ''
  const s = String(value).trim().slice(0, MAX_URL_LEN)
  if (!s) return ''
  let u
  try {
    u = new URL(s)
  } catch {
    const e = new Error(`Invalid ${fieldName} URL`)
    e.status = 400
    throw e
  }
  if (u.protocol !== 'https:') {
    const e = new Error(`${fieldName} must use https`)
    e.status = 400
    throw e
  }
  if (u.username || u.password) {
    const e = new Error(`${fieldName} URL must not embed credentials`)
    e.status = 400
    throw e
  }
  return s
}

/**
 * Normalizes and validates a submission metadata patch.
 *
 * File upload fields (pptUrl, pdfUrl, videoUrl) are restricted to Firebase
 * Storage URLs scoped to the team's own path (CRIT-02).
 *
 * External link fields (githubUrl, deployedUrl) accept any valid https URL
 * since they point to GitHub repos, Vercel deployments, etc.
 *
 * Pass `teamId` to enable the storage path ownership check. When omitted
 * (e.g. admin overrides), only the Firebase Storage host check applies.
 */
export function normalizeSubmissionPatch(patch, teamId = null) {
  const safe = {}
  // File uploads — must be Firebase Storage URLs scoped to this team
  if ('pptUrl' in patch) safe.pptUrl = assertStorageUrl('pptUrl', patch.pptUrl, teamId)
  if ('pdfUrl' in patch) safe.pdfUrl = assertStorageUrl('pdfUrl', patch.pdfUrl, teamId)
  // Demo video is now a YouTube link (not an uploaded file).
  if ('videoUrl' in patch) safe.videoUrl = assertYouTubeUrl('videoUrl', patch.videoUrl)
  // External links — any valid https URL is fine
  if ('githubUrl' in patch) safe.githubUrl = assertHttpsUrl('githubUrl', patch.githubUrl)
  if ('deployedUrl' in patch) safe.deployedUrl = assertHttpsUrl('deployedUrl', patch.deployedUrl)
  if ('status' in patch) {
    const st = String(patch.status || '').trim()
    if (!ALLOWED_STATUS.has(st)) {
      const e = new Error('status must be draft or submitted')
      e.status = 400
      throw e
    }
    safe.status = st
  }
  return safe
}
