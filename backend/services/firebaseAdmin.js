import 'dotenv/config'
import { getApps, initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'

let initialized = false

export function initFirebaseAdmin() {
  if (initialized) return true
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (!json) {
    console.warn('[skh-backend] FIREBASE_SERVICE_ACCOUNT_JSON not set — API auth disabled.')
    return false
  }
  try {
    const cred = JSON.parse(json)
    if (!getApps().length) {
      initializeApp({ 
        credential: cert(cred),
        storageBucket: 'verify-sih.firebasestorage.app'
      })
    }
    initialized = true
    return true
  } catch (e) {
    console.error('[skh-backend] Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON', e.message)
    return false
  }
}

export function getDb() {
  if (!initFirebaseAdmin()) return null
  return getFirestore()
}

export function getBucket() {
  if (!initFirebaseAdmin()) return null
  return getStorage().bucket()
}
