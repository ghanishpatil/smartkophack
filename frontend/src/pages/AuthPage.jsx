import { useEffect, useState, useCallback } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '@/context/AuthContext.jsx'
import { publicApi } from '@/services/api.js'
import { Input } from '@/components/ui/Input.jsx'
import { Button } from '@/components/ui/Button.jsx'
import { usePageSeo } from '@/hooks/usePageSeo.js'
import { roleHome } from '@/utils/roles.js'
import { APP } from '@/utils/constants.js'

const slideVariants = {
  enter: (dir) => ({ x: dir > 0 ? 80 : -80, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir) => ({ x: dir > 0 ? -80 : 80, opacity: 0 }),
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
    const order = { login: 0, forgot: 1 }
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
      setErr(er.message || 'Authentication failed')
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

          <motion.div
            initial="hidden"
            animate="visible"
            variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.1, delayChildren: 0.6 } } }}
            className="relative mt-auto space-y-3 pt-10"
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
