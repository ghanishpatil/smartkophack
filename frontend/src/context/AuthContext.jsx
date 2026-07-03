import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth'
import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import { auth, db, isFirebaseConfigured } from '@/firebase/client.js'
import { ROLES } from '@/utils/roles.js'
import { mapFirebaseAuthError } from '@/utils/firebaseErrors.js'

const AuthContext = createContext(null)

const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:4000'

/** Server creates `users/{uid}` with Admin SDK (works even if client Firestore create fails). */
async function syncProfileFromServer(user) {
  try {
    const token = await user.getIdToken()
    const res = await fetch(`${apiBase}/api/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return null
    const data = await res.json()
    return {
      email: data.email || user.email || '',
      displayName: data.displayName || '',
      photoURL: data.photoURL || '',
      role: data.role || ROLES.PARTICIPANT,
      teamId: data.teamId || '',
      activeEventId: typeof data.activeEventId === 'string' ? data.activeEventId : '',
      institute: typeof data.institute === 'string' ? data.institute : '',
      trackChoice: typeof data.trackChoice === 'string' ? data.trackChoice : '',
      mustChangePassword: data.mustChangePassword === true,
    }
  } catch {
    return null
  }
}

async function ensureUserProfile(user, displayName) {
  if (!db || !user) return null
  const ref = doc(db, 'users', user.uid)
  const snap = await getDoc(ref)
  if (!snap.exists()) {   // ← was snap.exists (property, always truthy in v9 SDK)
    await setDoc(ref, {
      email: user.email,
      displayName: displayName || user.displayName || '',
      photoURL: user.photoURL || '',
      role: ROLES.PARTICIPANT,
      teamId: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    return { role: ROLES.PARTICIPANT, teamId: '', displayName: displayName || user.displayName || '' }
  }
  return snap.data()
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // Flag to suppress onAuthStateChanged during the registration flow.
  // createUserWithEmailAndPassword signs the user in immediately, but we don't
  // want the app to treat them as logged in until profile setup is complete.
  const registrationInProgress = useRef(false)

  useEffect(() => {
    if (!auth || !isFirebaseConfigured()) {
      setLoading(false)
      return undefined
    }

    let unsubProfile = null // holds the onSnapshot unsubscribe for the current user

    const unsubAuth = onAuthStateChanged(auth, async (u) => {
      setError(null)

      // Skip if registration is in progress — the register() function manages
      // state directly and will call setUser/setProfile once setup is complete.
      // Without this guard, onAuthStateChanged fires immediately after
      // createUserWithEmailAndPassword and redirects the user before their
      // profile is created.
      if (registrationInProgress.current) return

      // Clean up previous user's profile listener
      if (unsubProfile) {
        unsubProfile()
        unsubProfile = null
      }

      if (!u) {
        setUser(null)
        setProfile(null)
        setLoading(false)
        return
      }

      setUser(u)
      try {
        const fromApi = await syncProfileFromServer(u)
        if (fromApi) {
          // Force sign-out if account is banned
          if (fromApi.role === 'banned') {
            await signOut(auth).catch(() => {})
            return
          }
          setProfile(fromApi)
        } else if (db) {
          const ref = doc(db, 'users', u.uid)
          const snap = await getDoc(ref)
          if (snap.exists()) {
            const data = snap.data()
            if (data.role === 'banned') {
              await signOut(auth).catch(() => {})
              return
            }
            setProfile(data)
          } else {
            const created = await ensureUserProfile(u, u.displayName)
            setProfile(created)
          }
        } else {
          setProfile(null)
        }
      } catch (e) {
        console.error(e)
        const code = e?.code || ''
        setError(mapFirebaseAuthError(code, e.message))
      } finally {
        setLoading(false)
      }

      // MED-04: Subscribe to live profile updates so role changes (admin demote/ban)
      // propagate to the frontend without requiring a page refresh.
      // The server sets custom claims on role change (CRIT-03), but the frontend
      // profile state also needs to stay in sync for UI gating.
      if (db) {
        unsubProfile = onSnapshot(
          doc(db, 'users', u.uid),
          (snap) => {
            if (snap.exists()) {
              setProfile((prev) => {
                const fresh = snap.data()
                // Force sign-out if account was banned while user is logged in
                if (fresh.role === 'banned') {
                  signOut(auth).catch(() => {})
                  return prev
                }
                if (
                  prev?.role !== fresh.role ||
                  prev?.teamId !== fresh.teamId ||
                  Boolean(prev?.mustChangePassword) !== Boolean(fresh.mustChangePassword)
                ) {
                  return fresh
                }
                return prev
              })
            }
          },
          () => { /* ignore snapshot errors */ },
        )
      }
    })

    return () => {
      unsubAuth()
      if (unsubProfile) unsubProfile()
    }
  }, [])

  const register = useCallback(async (email, password, displayName) => {
    if (!auth || !db) throw new Error('Firebase is not configured.')
    setError(null)

    // Set flag BEFORE creating the account so onAuthStateChanged is suppressed
    // during the entire registration flow.
    registrationInProgress.current = true

    let cred = null
    try {
      cred = await createUserWithEmailAndPassword(auth, email, password)
      if (displayName) await updateProfile(cred.user, { displayName })
      await cred.user.getIdToken(true)
      const fromApi = await syncProfileFromServer(cred.user)
      if (!fromApi) await ensureUserProfile(cred.user, displayName)

      // Registration fully complete — now allow the app to treat user as logged in
      registrationInProgress.current = false
      // Send email verification (one-time, non-blocking)
      try { await sendEmailVerification(cred.user) } catch { /* ignore — user can resend */ }
      // Manually trigger the auth state update since we suppressed onAuthStateChanged
      setUser(cred.user)
      const profile = fromApi || await ensureUserProfile(cred.user, displayName)
      setProfile(profile)
      setLoading(false)
    } catch (e) {
      registrationInProgress.current = false
      // Clean up: delete the Firebase Auth account and sign out so the user
      // is not left in a partially-registered authenticated state
      if (cred?.user) {
        try { await deleteUser(cred.user) } catch { /* ignore */ }
      }
      try { await signOut(auth) } catch { /* ignore */ }
      // Reset state to unauthenticated
      setUser(null)
      setProfile(null)
      const code = e?.code || ''
      throw new Error(mapFirebaseAuthError(code, e.message), { cause: e })
    }
  }, [])

  const login = useCallback(async (email, password) => {
    if (!auth) throw new Error('Firebase is not configured.')
    setError(null)
    await signInWithEmailAndPassword(auth, email, password)
    // Ban check happens in onAuthStateChanged → syncProfileFromServer → onSnapshot
    // The backend will return 403 on any API call if banned, so this is defence-in-depth
  }, [])

  const loginGoogle = useCallback(async () => {
    if (!auth) throw new Error('Firebase is not configured.')
    setError(null)
    const provider = new GoogleAuthProvider()
    const cred = await signInWithPopup(auth, provider)
    try {
      await cred.user.getIdToken(true)
      const fromApi = await syncProfileFromServer(cred.user)
      // Check if account is banned before completing sign-in
      if (fromApi?.role === 'banned') {
        await signOut(auth)
        throw new Error('Your account has been suspended. Contact the admin.')
      }
      if (!fromApi) await ensureUserProfile(cred.user, cred.user.displayName)
    } catch (e) {
      await signOut(auth).catch(() => {})
      const code = e?.code || ''
      throw new Error(mapFirebaseAuthError(code, e.message), { cause: e })
    }
  }, [])

  const logout = useCallback(async () => {
    if (!auth) return
    await signOut(auth)
  }, [])

  const refreshProfile = useCallback(async () => {
    if (!user) return
    const fromApi = await syncProfileFromServer(user)
    if (fromApi) {
      setProfile(fromApi)
      return
    }
    if (!db) return
    const snap = await getDoc(doc(db, 'users', user.uid))
    if (snap.exists()) setProfile(snap.data())   // ← was snap.exists (property)
  }, [user])

  const updateUserProfile = useCallback(
    async (patch) => {
      if (!user || !db) return
      // LOW-07: Allowlist fields that can be updated from the client.
      // Prevents writing arbitrary fields (e.g. role, teamId) to the user document.
      const ALLOWED_FIELDS = ['displayName', 'photoURL', 'institute', 'trackChoice']
      const safePatch = Object.fromEntries(
        Object.entries(patch).filter(([k]) => ALLOWED_FIELDS.includes(k)),
      )
      if (Object.keys(safePatch).length === 0) return
      const ref = doc(db, 'users', user.uid)
      await updateDoc(ref, { ...safePatch, updatedAt: serverTimestamp() })
      await refreshProfile()
    },
    [user, refreshProfile],
  )

  const resendVerification = useCallback(async () => {
    if (!user || user.emailVerified) return
    await sendEmailVerification(user)
  }, [user])

  const value = useMemo(
    () => ({
      user,
      profile,
      loading,
      error,
      firebaseReady: isFirebaseConfigured() && Boolean(auth && db),
      emailVerified: !user || user.emailVerified || user.providerData?.some((p) => p.providerId === 'google.com'),
      register,
      login,
      loginGoogle,
      logout,
      refreshProfile,
      updateUserProfile,
      resendVerification,
    }),
    [
      user,
      profile,
      loading,
      error,
      register,
      login,
      loginGoogle,
      logout,
      refreshProfile,
      updateUserProfile,
      resendVerification,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
