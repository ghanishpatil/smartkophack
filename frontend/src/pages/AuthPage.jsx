import { useEffect, useState, useCallback } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, Eye, EyeOff, ExternalLink, Info, Mail, AlertCircle } from 'lucide-react'
import { useAuth } from '@/context/AuthContext.jsx'
import { publicApi } from '@/services/api.js'
import { Input } from '@/components/ui/Input.jsx'
import { Button } from '@/components/ui/Button.jsx'
import { usePageSeo } from '@/hooks/usePageSeo.js'
import { roleHome } from '@/utils/roles.js'
import { APP, REGISTRATION_URL } from '@/utils/constants.js'

const slideVariants = {
  enter: (dir) => ({ x: dir > 0 ? 80 : -80, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir) => ({ x: dir > 0 ? -80 : 80, opacity: 0 }),
}

// Map Firebase/auth errors to clear, user-friendly messages (no raw codes).
function friendlyAuthError(err) {
  const code = err?.code || ''
  const raw = err?.message || ''
  const map = {
    'auth/invalid-credential': 'Incorrect email or password. Please try again.',
    'auth/invalid-login-credentials': 'Incorrect email or password. Please try again.',
    'auth/wrong-password': 'Incorrect email or password. Please try again.',
    'auth/user-not-found': 'No account found with this email. Check the address or contact the organizers.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/user-disabled': 'This account has been disabled. Please contact the organizers.',
    'auth/too-many-requests': 'Too many attempts. Please wait a few minutes and try again.',
    'auth/network-request-failed': 'Network error. Check your internet connection and try again.',
    'auth/missing-password': 'Please enter your password.',
  }
  if (map[code]) return map[code]
  if (/not configured/i.test(raw)) return raw
  if (/auth\//i.test(raw) || /firebase/i.test(raw)) {
    return 'Sign in failed. Please check your email and password and try again.'
  }
  return raw || 'Sign in failed. Please try again.'
}

export function AuthPage() {
  usePageSeo({ title: 'Sign in', description: 'Sign in to the hackathon platform.' })
  const { login, user, profile, firebaseReady, loading } = useAuth()
  const [mode, setMode] = useState('login') // login | forgot
  const [direction, setDirection] = useState(1)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [success, setSuccess] = useState('')
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from

  useEffect(() => {
    if (loading || !user || !profile || !firebaseReady) return
    navigate(from || roleHome(profile.role), { replace: true })
  }, [loading, user, profile, firebaseReady, from, navigate])

  const switchMode = useCallback((newMode) => {
    const order = { login: 0, forgot: 1, register: 2 }
    setDirection(order[newMode] > order[mode] ? 1 : -1)
    setMode(newMode)
    setErr('')
    setSuccess('')
  }, [mode])

  async function onSubmit(e) {
    e.preventDefault()
    setErr('')
    setSuccess('')
    setBusy(true)
    try {
      if (mode === 'login') {
        await login(email, password)
      } else if (mode === 'forgot') {
        await publicApi.forgotPassword(email)
        setSuccess('If an account exists for that email, a reset link has been sent. Check your inbox (and spam).')
      }
    } catch (er) {
      setErr(friendlyAuthError(er))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-[85vh] items-center justify-center px-4 py-12 sm:py-16">
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="grid w-full max-w-5xl overflow-hidden rounded-3xl border border-[rgb(var(--border))] shadow-lift lg:grid-cols-5"
      >
        {/* ─── Branding Panel ─── */}
        <div className="relative hidden overflow-hidden bg-gradient-to-br from-brand-50 via-white to-cyan-50 p-10 lg:col-span-2 lg:flex lg:flex-col lg:justify-between">
          <div className="pointer-events-none absolute inset-0 grid-pattern opacity-30" />
          <div className="pointer-events-none absolute -right-20 -top-20 h-60 w-60 rounded-full bg-brand-300/30 blur-[80px]" />
          <div className="pointer-events-none absolute -bottom-16 -left-16 h-40 w-40 rounded-full bg-cyan-300/25 blur-[60px]" />

          <div className="relative">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl bg-white shadow-lg shadow-brand-500/20 ring-1 ring-brand-500/10"
            >
              <img src="/logo.png" alt={APP.name} className="h-11 w-11 object-contain" />
            </motion.div>
            <motion.h2
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              className="mt-6 font-display text-2xl font-bold text-ink-900"
            >
              {APP.name}
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.5 }}
              className="mt-3 text-sm leading-relaxed text-ink-700"
            >
              Sign in to manage your team for the 2026 edition.
            </motion.p>
          </div>

          {/* Floating mascot — fills the middle so the panel stays balanced */}
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.45, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="relative flex flex-1 items-center justify-center py-6"
          >
            <div className="pointer-events-none absolute h-44 w-44 rounded-full bg-brand-400/25 blur-3xl" aria-hidden />
            <motion.img
              src="/skh3d.png"
              alt=""
              draggable={false}
              className="relative h-40 w-40 object-contain drop-shadow-2xl xl:h-48 xl:w-48"
              animate={{ y: [0, -12, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            />
          </motion.div>

          <motion.div
            initial="hidden"
            animate="visible"
            variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.1, delayChildren: 0.6 } } }}
            className="relative space-y-3 pt-2"
          >
            {['Team management & invites', 'Structured submissions', 'Real-time jury evaluation', 'Email notifications'].map((f) => (
              <motion.div
                key={f}
                variants={{ hidden: { opacity: 0, x: -12 }, visible: { opacity: 1, x: 0 } }}
                className="flex items-center gap-2.5 text-sm text-ink-700"
              >
                <ArrowRight className="h-3.5 w-3.5 text-brand-600" />
                {f}
              </motion.div>
            ))}
          </motion.div>
        </div>

        {/* ─── Form Panel ─── */}
        <div className="relative overflow-hidden bg-[rgb(var(--surface))] p-6 sm:p-8 lg:col-span-3 lg:p-10">
          {/* Animated Form Content */}
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={mode}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="mt-6"
            >
              {mode === 'forgot' ? (
                <ForgotPasswordForm
                  email={email}
                  setEmail={setEmail}
                  onSubmit={onSubmit}
                  busy={busy}
                  err={err}
                  success={success}
                  firebaseReady={firebaseReady}
                  onBack={() => switchMode('login')}
                />
              ) : mode === 'register' ? (
                <RegistrationInfo onBack={() => switchMode('login')} />
              ) : (
                <>
                  {/* Header */}
                  <div className="mb-6">
                    <h1 className="font-display text-2xl font-bold text-ink-900">
                      Welcome back
                    </h1>
                    <p className="mt-1.5 text-sm text-ink-500">
                      Sign in to access your dashboard.
                    </p>
                  </div>

                  {/* Access rule notice */}
                  <div className="mb-6 rounded-xl border border-brand-500/20 bg-brand-500/5 p-4">
                    <div className="flex gap-3">
                      <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                      <div className="space-y-1.5 text-sm text-ink-700">
                        <p className="font-semibold text-ink-900">Dashboard access requires team registration</p>
                        <p className="leading-relaxed">
                          You can sign in only after your team is registered on the{' '}
                          <span className="font-medium text-ink-900">Sanjivani University UMS portal</span>. The
                          team leader receives dashboard login credentials by email within{' '}
                          <span className="font-semibold text-ink-900">24 to 48 hours</span> of registration.
                        </p>
                        <button
                          type="button"
                          onClick={() => switchMode('register')}
                          className="inline-flex items-center gap-1 font-medium text-brand-600 transition-colors hover:text-brand-500"
                        >
                          How to register your team
                          <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {!firebaseReady && (
                    <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-950">
                      Firebase not configured. Check environment variables.
                    </div>
                  )}

                  {/* Form */}
                  <form onSubmit={onSubmit} className="space-y-4">
                    <Input
                      label="Email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      placeholder="you@university.edu"
                    />

                    <div className="relative">
                      <Input
                        label="Password"
                        type={showPw ? 'text' : 'password'}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="current-password"
                        placeholder="••••••••"
                        minLength={6}
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-[2.1rem] rounded-md p-1 text-ink-400 transition-colors hover:text-ink-600"
                        onClick={() => setShowPw((v) => !v)}
                        tabIndex={-1}
                        aria-label={showPw ? 'Hide password' : 'Show password'}
                      >
                        {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>

                    {/* Forgot password link (only in login mode) */}
                    {mode === 'login' && (
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => switchMode('forgot')}
                          className="text-xs font-medium text-brand-600 transition-colors hover:text-brand-500"
                        >
                          Forgot password?
                        </button>
                      </div>
                    )}

                    {/* Error */}
                    <AnimatePresence>
                      {err && (
                        <motion.div
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          role="alert"
                          className="flex items-start gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-3 text-sm text-red-700 shadow-sm"
                        >
                          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                          <span className="font-medium">{err}</span>
                        </motion.div>
                      )}
                      {success && (
                        <motion.p
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-700"
                        >
                          {success}
                        </motion.p>
                      )}
                    </AnimatePresence>

                    {/* Submit */}
                    <Button
                      type="submit"
                      className="w-full"
                      loading={busy}
                      disabled={!firebaseReady}
                    >
                      Sign in
                    </Button>
                  </form>
                </>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Back to home */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mt-6 text-center text-sm text-ink-500"
          >
            <Link
              className="font-medium text-brand-600 transition-colors hover:text-brand-500"
              to="/"
            >
              ← Back to home
            </Link>
          </motion.p>
        </div>
      </motion.div>
    </div>
  )
}

/** Forgot Password sub-form */
function ForgotPasswordForm({ email, setEmail, onSubmit, busy, err, success, firebaseReady, onBack }) {
  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-4 text-sm font-medium text-brand-600 transition-colors hover:text-brand-500"
      >
        ← Back to sign in
      </button>

      <h1 className="font-display text-2xl font-bold text-ink-900">
        Reset your password
      </h1>
      <p className="mt-1.5 text-sm text-ink-500">
        Enter your email and we'll send you a link to reset your password.
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <Input
          label="Email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          placeholder="you@university.edu"
        />

        <AnimatePresence>
          {err && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-700"
            >
              {err}
            </motion.p>
          )}
          {success && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-700"
            >
              {success}
            </motion.p>
          )}
        </AnimatePresence>

        <Button type="submit" className="w-full" loading={busy} disabled={!firebaseReady}>
          Send reset link
        </Button>
      </form>
    </div>
  )
}

/** How-to-register instructions + link to the UMS portal */
function RegistrationInfo({ onBack }) {
  const steps = [
    {
      title: 'Open the UMS registration portal',
      detail: 'Use the button below to open the Sanjivani University event registration page, then choose "New Registration" (or "Check Registration" to review an existing one).',
    },
    {
      title: 'Enter the leader\u2019s details',
      detail: 'Fill in Name, Mobile No., and a valid Email, then pick how you participate: Participant, Volunteer, or Viewer.',
    },
    {
      title: 'Set up your group',
      detail: 'Under Group Selection, choose "Create New Group" (or "Join Existing Group"). Enter the Group Name and the No. of Members.',
    },
    {
      title: 'Choose your institute',
      detail: 'Select your Institute from the list (Sanjivani colleges) or pick an External Institute / Organization and add the Department and Year (FY / SY / TY / Final).',
    },
    {
      title: 'Add your group members',
      detail: 'For every member row, enter their Name, Mobile No., and Email. Make sure all details are correct before submitting.',
    },
    {
      title: 'Submit & wait for credentials',
      detail: 'After submission, the team leader receives dashboard login credentials by email within 24 to 48 hours. Use those to sign in here.',
    },
  ]

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-4 text-sm font-medium text-brand-600 transition-colors hover:text-brand-500"
      >
        ← Back to sign in
      </button>

      <h1 className="font-display text-2xl font-bold text-ink-900">
        How to register your team
      </h1>
      <p className="mt-1.5 text-sm text-ink-500">
        Registration happens on the Sanjivani University UMS portal. Dashboard access is enabled only after your
        team is registered there.
      </p>

      {/* Primary CTA — external UMS portal */}
      <a
        href={REGISTRATION_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-5 block"
      >
        <Button className="w-full gap-2">
          Register on the UMS portal
          <ExternalLink className="h-4 w-4" />
        </Button>
      </a>

      {/* Steps */}
      <ol className="mt-6 space-y-4">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500/10 text-xs font-bold text-brand-700">
              {i + 1}
            </span>
            <div className="text-sm">
              <p className="font-semibold text-ink-900">{s.title}</p>
              <p className="mt-0.5 leading-relaxed text-ink-600">{s.detail}</p>
            </div>
          </li>
        ))}
      </ol>

      {/* Credential note */}
      <div className="mt-6 flex gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-ink-700">
        <Mail className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
        <p className="leading-relaxed">
          Login credentials are sent to the team leader's email within{' '}
          <span className="font-semibold text-ink-900">24 to 48 hours</span> after team registration. Check your
          inbox (and spam folder) once registered.
        </p>
      </div>
    </div>
  )
}
