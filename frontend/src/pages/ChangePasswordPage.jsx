import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ShieldCheck, Eye, EyeOff, KeyRound, Loader2, CheckCircle2, MailCheck } from 'lucide-react'
import { useAuth } from '@/context/AuthContext.jsx'
import { useApi } from '@/hooks/useApi.js'
import { Input } from '@/components/ui/Input.jsx'
import { Button } from '@/components/ui/Button.jsx'
import { usePageSeo } from '@/hooks/usePageSeo.js'
import { roleHome } from '@/utils/roles.js'

/**
 * First-login Change Password screen.
 * On mount, an OTP is automatically emailed to the user. They enter the OTP
 * plus a new password to unlock the platform.
 */
export function ChangePasswordPage() {
  usePageSeo({ title: 'Set your password', description: 'Set a new password to continue.' })
  const { profile, refreshProfile, logout } = useAuth()
  const api = useApi()
  const navigate = useNavigate()

  const [otp, setOtp] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [sentTo, setSentTo] = useState('')
  const [sending, setSending] = useState(true)
  const [resendIn, setResendIn] = useState(0)
  const [done, setDone] = useState(false)
  const requestedRef = useRef(false)

  // If the user doesn't actually need to change password, bounce them home.
  useEffect(() => {
    if (profile && profile.mustChangePassword !== true && !done) {
      navigate(roleHome(profile.role), { replace: true })
    }
  }, [profile, done, navigate])

  const requestOtp = useCallback(async () => {
    setErr('')
    setSending(true)
    try {
      const res = await api.requestPasswordOtp()
      setSentTo(res?.sentTo || '')
      setResendIn(30)
    } catch (e) {
      const msg = e?.message || 'Could not send code.'
      setErr(msg)
      // If rate-limited, still start a cooldown so the button re-enables
      setResendIn(30)
    } finally {
      setSending(false)
    }
  }, [api])

  // Auto-send OTP once when the screen loads
  useEffect(() => {
    if (requestedRef.current) return
    requestedRef.current = true
    requestOtp()
  }, [requestOtp])

  // Resend cooldown ticker
  useEffect(() => {
    if (resendIn <= 0) return
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [resendIn])

  async function onSubmit(e) {
    e.preventDefault()
    setErr('')
    if (otp.trim().length !== 6) { setErr('Enter the 6-digit code from your email.'); return }
    if (password.length < 8) { setErr('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setErr('Passwords do not match.'); return }

    setBusy(true)
    try {
      await api.changePasswordWithOtp(otp.trim(), password)
      setDone(true)
      await refreshProfile()
      // Brief success beat, then route to the dashboard
      setTimeout(() => navigate(roleHome(profile?.role || 'participant'), { replace: true }), 1200)
    } catch (e2) {
      setErr(e2?.message || 'Could not change password.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-[85vh] items-center justify-center px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md overflow-hidden rounded-3xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-8 shadow-lift sm:p-10"
      >
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-600">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <h1 className="mt-4 font-display text-2xl font-bold text-ink-900">Set your password</h1>
          <p className="mt-1.5 text-sm text-ink-500">
            For security, set a new password before continuing.
          </p>
        </div>

        {/* OTP status */}
        <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))]/40 px-4 py-3 text-sm">
          {sending ? (
            <>
              <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-brand-600" />
              <span className="text-ink-600">Sending a verification code to your email…</span>
            </>
          ) : (
            <>
              <MailCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <span className="text-ink-600">
                We sent a 6-digit code to <strong>{sentTo || 'your email'}</strong>. Enter it below.
              </span>
            </>
          )}
        </div>

        {done ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center py-6 text-center"
          >
            <CheckCircle2 className="h-12 w-12 text-emerald-500" />
            <p className="mt-3 font-semibold text-ink-900">Password updated!</p>
            <p className="mt-1 text-sm text-ink-500">Taking you to your dashboard…</p>
          </motion.div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-ink-700">
                <KeyRound className="h-3.5 w-3.5 text-ink-400" /> Verification code
              </label>
              <Input
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                placeholder="6-digit code"
                className="tracking-[0.4em] text-center font-mono text-lg"
              />
              <div className="mt-1.5 flex justify-end">
                <button
                  type="button"
                  disabled={resendIn > 0 || sending}
                  onClick={requestOtp}
                  className="text-xs font-medium text-brand-600 transition-colors hover:text-brand-500 disabled:opacity-50"
                >
                  {resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
                </button>
              </div>
            </div>

            <div className="relative">
              <Input
                label="New password"
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                minLength={8}
                autoComplete="new-password"
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

            <Input
              label="Confirm new password"
              type={showPw ? 'text' : 'password'}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Re-enter password"
              minLength={8}
              autoComplete="new-password"
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
            </AnimatePresence>

            <Button type="submit" className="w-full" loading={busy}>
              Set password & continue
            </Button>
          </form>
        )}

        {!done && (
          <p className="mt-5 text-center text-sm text-ink-500">
            <button
              type="button"
              onClick={() => logout().then(() => navigate('/'))}
              className="font-medium text-ink-500 transition-colors hover:text-ink-700"
            >
              Sign out
            </button>
          </p>
        )}
      </motion.div>
    </div>
  )
}
