import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowRight,
  CalendarCheck,
  CheckCircle2,
  CreditCard,
  Sparkles,
  Users,
  AlertCircle,
  FileCheck,
} from 'lucide-react'
import { usePageSeo } from '@/hooks/usePageSeo.js'
import { useParticipantWorkspace } from '@/hooks/useParticipantWorkspace.js'
import { useAuth } from '@/context/AuthContext.jsx'
import { Card } from '@/components/ui/Card.jsx'
import { Button } from '@/components/ui/Button.jsx'
import { Badge } from '@/components/ui/Badge.jsx'
import { Skeleton } from '@/components/ui/Skeleton.jsx'
import { SnitchLoader } from '@/components/ui/SnitchLoader.jsx'
import { PaymentSuccessAnimation } from '@/components/ui/PaymentSuccessAnimation.jsx'
import { TeamMemberRegistrationForm } from '@/components/participant/TeamMemberRegistrationForm.jsx'
import { loadRazorpayScript } from '@/utils/loadRazorpay.js'
import { isRegistrationComplete } from '@/utils/teamRegistrationDisplay.js'
import { formatLifecyclePhase } from '@/utils/eventLifecycleDisplay.js'
import { formatDate } from '@/utils/format.js'

const API_BASE = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || 'http://localhost:4000'

const listVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.07, delayChildren: 0.05 },
  },
}

const cardVariants = {
  hidden: { opacity: 0, y: 16 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 380, damping: 28 },
  },
}

export function ParticipantRegistrationPage() {
  usePageSeo({ title: 'Event Registration', description: 'Register your team for the hackathon.' })
  const { user } = useAuth()
  const {
    api,
    team,
    eventCfg,
    loading,
    refreshTeam,
    paymentLabel,
    reload,
    registrationBlockedReason,
  } = useParticipantWorkspace()

  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [showSnitchLoader, setShowSnitchLoader] = useState(false)
  const [showPaymentAnimation, setShowPaymentAnimation] = useState(false)
  const [nowMs, setNowMs] = useState(null)
  const [roster, setRoster] = useState(null)
  const [memberRegistrations, setMemberRegistrations] = useState([])

  // Load team roster
  useEffect(() => {
    if (!team) return
    api.teamRoster().then(setRoster).catch(() => {})
  }, [api, team])

  // Load member registrations
  useEffect(() => {
    if (!team) return
    loadMemberRegistrations()
  }, [team])

  async function loadMemberRegistrations() {
    if (!team || !user) return
    try {
      const token = await user.getIdToken()
      const res = await fetch(`${API_BASE}/api/registrations/team/${team.id}/members`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setMemberRegistrations(data.registrations || [])
      }
    } catch (error) {
      console.error('Failed to load member registrations:', error)
    }
  }

  useEffect(() => {
    setNowMs(Date.now())
    const id = globalThis.setInterval(() => setNowMs(Date.now()), 60_000)
    return () => globalThis.clearInterval(id)
  }, [])

  const feeRequired = Boolean(eventCfg?.entryFeeEnabled && (eventCfg?.entryFeeAmount ?? 0) > 0)
  const registered = team ? isRegistrationComplete(team, { feeRequired }) : false
  const awaitingPayment =
    feeRequired &&
    !registered &&
    Boolean(team?.registrationRequestedAt || (String(team?.paymentStatus || '') === 'pending' && !team?.eventRegistered))

  // Calculate member registration progress
  const totalMembers = roster?.members?.length || 0
  const submittedMembers = memberRegistrations.length
  const allMembersSubmitted = totalMembers > 0 && submittedMembers === totalMembers
  const registrationProgress = totalMembers > 0 ? (submittedMembers / totalMembers) * 100 : 0

  // Determine registration close date
  const registrationCloseDate = (() => {
    const phases = eventCfg?.competitionPhases || []
    const phase1 = phases.find(p => p.order === 1)
    if (phase1?.deadline) return phase1.deadline
    return eventCfg?.registrationClosesAt
  })()
  
  const pastRegClose =
    Boolean(registrationCloseDate) &&
    typeof nowMs === 'number' &&
    new Date(registrationCloseDate).getTime() < nowMs
  
  const phase = eventCfg?.lifecyclePhase || ''
  const registrationOpen = eventCfg?.registrationOpen === true
  const windowClosed = !registrationOpen || pastRegClose
  const phaseLabel = formatLifecyclePhase(phase)
  const paySt = team?.paymentStatus || ''

  async function openRazorpayCheckout() {
    setShowSnitchLoader(true)
    try {
      await loadRazorpayScript()
      const order = await api.createRazorpayOrder()
      const keyId = order.keyId || eventCfg?.razorpayKeyId
      if (!keyId) {
        throw new Error('Razorpay is not configured on the server. Contact an organizer.')
      }
      
      return new Promise((resolve, reject) => {
        const options = {
          key: keyId,
          name: 'Smart Kopargaon Hackathon',
          description: 'Registration fee',
          order_id: order.orderId,
          handler: (response) => {
            setShowSnitchLoader(false)
            resolve(response)
          },
          modal: {
            ondismiss: () => {
              setShowSnitchLoader(false)
              reject(new Error('Payment window closed before completion.'))
            },
          },
          theme: { color: '#2563eb' },
        }
        const rzp = new globalThis.Razorpay(options)
        rzp.on('payment.failed', () => {
          setShowSnitchLoader(false)
          reject(new Error('Payment failed. Try again or contact support.'))
        })
        
        setTimeout(() => setShowSnitchLoader(false), 1000)
        rzp.open()
      })
    } catch (error) {
      setShowSnitchLoader(false)
      throw error
    }
  }

  async function payEntryFee() {
    setBusy(true)
    setMsg('')
    try {
      if (!team?.registrationRequestedAt && !team?.eventRegistered) {
        await api.registerTeamEvent('now')
        await refreshTeam()
        await reload()
      }

      const response = await openRazorpayCheckout()
      setShowPaymentAnimation(true)
      
      await api.verifyRazorpayPayment({
        razorpay_order_id: response.razorpay_order_id,
        razorpay_payment_id: response.razorpay_payment_id,
        razorpay_signature: response.razorpay_signature,
      })
      await refreshTeam()
      await reload()
      setMsg('Payment verified. Your team is fully registered!')
    } catch (e) {
      setShowPaymentAnimation(false)
      setMsg(e.message || 'Could not complete payment.')
    } finally {
      setBusy(false)
    }
  }

  async function registerEvent() {
    if (!allMembersSubmitted) {
      setMsg('All team members must submit their registration details before proceeding.')
      return
    }

    setMsg('')
    setBusy(true)
    try {
      const r = await api.registerTeamEvent('now')
      await refreshTeam()
      await reload()

      if (r.feeRequired && r.registrationStatus === 'pending') {
        setMsg(`Almost done — pay ${paymentLabel || 'the registration fee'} to finish.`)
        if (eventCfg?.razorpayConfigured) {
          try {
            const response = await openRazorpayCheckout()
            setShowPaymentAnimation(true)
            
            await api.verifyRazorpayPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            })
            await refreshTeam()
            await reload()
            setMsg('Payment verified. Your team is fully registered.')
          } catch (payErr) {
            setShowPaymentAnimation(false)
            setMsg(
              payErr?.message ||
                'Payment still pending. Use Pay below when you are ready — registration completes after payment.',
            )
          }
        }
        return
      }

      setMsg('You are registered for this hackathon.')
    } catch (e) {
      if (String(e.message || '').includes('pending payment')) {
        setMsg('Registration is already awaiting payment. Complete payment below.')
      } else {
        setMsg(e.message || 'Registration failed')
      }
    } finally {
      setBusy(false)
    }
  }

  async function registerEventPayLater() {
    if (!allMembersSubmitted) {
      setMsg('All team members must submit their registration details before proceeding.')
      return
    }

    setMsg('')
    setBusy(true)
    try {
      const r = await api.registerTeamEvent('later')
      await refreshTeam()
      await reload()

      if (r.feeRequired && r.registrationStatus === 'pending') {
        setMsg(`Registration saved! You chose "Pay Later". Remember: you must pay before ${eventCfg?.registrationClosesAt ? 'registration closes' : 'the deadline'} to unlock submissions.`)
        return
      }

      setMsg('You are registered for this hackathon.')
    } catch (e) {
      if (String(e.message || '').includes('pending payment')) {
        setMsg('Registration is already awaiting payment. Complete payment below.')
      } else {
        setMsg(e.message || 'Registration failed')
      }
    } finally {
      setBusy(false)
    }
  }

  function StepRow({ n, title, subtitle, done, active }) {
    return (
      <div className="flex gap-3">
        <div className="flex flex-col items-center">
          <motion.div
            initial={false}
            animate={{ scale: active ? 1.06 : 1 }}
            className={[
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors',
              done
                ? 'border-emerald-500 bg-emerald-500/15 text-emerald-800'
                : active
                  ? 'border-brand-500 bg-brand-500/15 text-brand-800'
                  : 'border-[rgb(var(--border))] text-ink-400',
            ].join(' ')}
          >
            {done ? <CheckCircle2 className="h-4 w-4" strokeWidth={2.5} /> : n}
          </motion.div>
          {n < 3 ? (
            <div
              className={[
                'my-1 min-h-[1.25rem] w-px flex-1 rounded-full',
                done ? 'bg-emerald-500/40' : 'bg-[rgb(var(--border))]',
              ].join(' ')}
              aria-hidden
            />
          ) : null}
        </div>
        <div className="min-w-0 pb-6 pt-1">
          <p className={`text-sm font-semibold ${active || done ? 'text-ink-900' : 'text-ink-500'}`}>
            {title}
          </p>
          <p className="mt-0.5 text-xs text-ink-500">{subtitle}</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <motion.div
        className="mx-auto max-w-4xl space-y-8"
        variants={listVariants}
        initial="hidden"
        animate="show"
      >
        {/* Header */}
        <motion.div variants={cardVariants} className="relative overflow-hidden rounded-3xl border border-brand-500/20 bg-gradient-to-br from-brand-500/10 via-[rgb(var(--surface))] to-cyan-500/10 p-6 shadow-lg shadow-brand-500/5 md:p-8">
          <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-brand-400/20 blur-3xl" />
          <div className="relative flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-500/20 text-brand-700">
              <Sparkles className="h-6 w-6" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-2xl font-bold tracking-tight text-ink-900 md:text-3xl">
                Team Event Registration
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-ink-600">
                {feeRequired ? (
                  <>
                    Team leader fills all member details, then completes registration and pays{' '}
                    <span className="font-medium text-ink-800">{paymentLabel || 'the fee'}</span> via Razorpay.
                  </>
                ) : (
                  <>
                    Team leader fills all member details, then confirms registration — no fee required for this edition.
                  </>
                )}
              </p>
            </div>
          </div>
        </motion.div>

        {registrationBlockedReason ? (
          <motion.div variants={cardVariants}>
            <Card className="border-amber-500/30 bg-amber-500/10">
              <p className="text-sm text-amber-950">{registrationBlockedReason}</p>
            </Card>
          </motion.div>
        ) : null}

        {/* Hackathon Status */}
        <motion.div variants={cardVariants}>
          <Card className="transition-shadow duration-300 hover:shadow-lg hover:shadow-brand-500/5">
            <div className="flex items-center gap-2">
              <CalendarCheck className="h-5 w-5 shrink-0 text-brand-600" aria-hidden />
              <h2 className="font-display text-lg font-semibold text-ink-900">Hackathon status</h2>
            </div>
            {loading ? (
              <Skeleton className="mt-4 h-16 w-full rounded-xl" />
            ) : (
              <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Current phase</p>
                  <p className="mt-1 text-lg font-semibold text-ink-900">{phaseLabel}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {windowClosed ? (
                    <Badge tone="warn" uppercase={false}>
                      Registration closed
                    </Badge>
                  ) : (
                    <Badge tone="success" uppercase={false}>
                      Registration open
                    </Badge>
                  )}
                </div>
              </div>
            )}
            {!loading && registrationCloseDate ? (
              <p className="mt-4 text-xs text-ink-500">
                Registration closes:{' '}
                <span className="font-medium text-ink-700">
                  {formatDate(registrationCloseDate) || registrationCloseDate}
                </span>
              </p>
            ) : null}
            {!loading && feeRequired ? (
              <div className="mt-4 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))]/50 px-4 py-3 text-sm">
                <p className="text-ink-600">
                  Fee:{' '}
                  <strong className="text-ink-900">{paymentLabel || '—'}</strong>
                  {eventCfg?.razorpayConfigured ? (
                    <span className="text-ink-500"> · Checkout ready</span>
                  ) : (
                    <span className="text-amber-700">
                      {' '}
                      · Online payments not configured — contact organizers if you need help paying.
                    </span>
                  )}
                </p>
              </div>
            ) : null}
          </Card>
        </motion.div>

        {!team ? (
          <motion.div variants={cardVariants}>
            <Card className="flex flex-col items-center gap-4 py-10 text-center transition-shadow hover:shadow-lg">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[rgb(var(--surface-muted))]">
                <Users className="h-7 w-7 text-brand-600" />
              </div>
              <div>
                <p className="font-display text-lg font-semibold text-ink-900">Create or join a team first</p>
                <p className="mt-2 max-w-sm text-sm text-ink-600">
                  Registration is per team. Head to My Team to create one or enter an invite code.
                </p>
              </div>
              <Link
                to="/dashboard/team"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 px-5 text-sm font-semibold text-white shadow-lg shadow-brand-500/25 transition-all hover:from-brand-500 hover:to-brand-400 active:scale-[0.98]"
              >
                Go to My Team <ArrowRight className="h-4 w-4" />
              </Link>
            </Card>
          </motion.div>
        ) : (
          <>
            {/* Progress Overview */}
            <motion.div variants={cardVariants}>
              <Card>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500">Registration progress</h3>
                <div className="mt-4">
                  <StepRow
                    n={1}
                    title="Member details"
                    subtitle={`${submittedMembers} of ${totalMembers} members completed`}
                    done={allMembersSubmitted}
                    active={Boolean(team) && !allMembersSubmitted}
                  />
                  <StepRow
                    n={2}
                    title={feeRequired ? 'Confirm & pay' : 'Confirm registration'}
                    subtitle={feeRequired ? 'Team leader submits + pays' : 'One click to join the roster'}
                    done={registered || awaitingPayment}
                    active={Boolean(team) && allMembersSubmitted && !registered && !awaitingPayment}
                  />
                  <StepRow
                    n={3}
                    title="Registered"
                    subtitle={feeRequired ? 'Fee settled with the server' : 'You are on the participant roster'}
                    done={registered}
                    active={Boolean(team) && awaitingPayment}
                  />
                </div>
              </Card>
            </motion.div>

            {/* Member Registration Progress Card */}
            <motion.div variants={cardVariants}>
              <Card className="transition-shadow duration-300 hover:shadow-lg hover:shadow-brand-500/5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileCheck className="h-5 w-5 shrink-0 text-brand-600" aria-hidden />
                    <h2 className="font-display text-lg font-semibold text-ink-900">Member Registrations</h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-ink-600">
                      {submittedMembers} / {totalMembers}
                    </span>
                    {allMembersSubmitted ? (
                      <Badge tone="success" uppercase={false}>Complete</Badge>
                    ) : (
                      <Badge tone="warn" uppercase={false}>In Progress</Badge>
                    )}
                  </div>
                </div>
                <div className="mt-4">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[rgb(var(--surface-muted))]">
                    <div
                      className="h-full rounded-full bg-brand-500 transition-all"
                      style={{ width: `${registrationProgress}%` }}
                    />
                  </div>
                </div>
                <p className="mt-2 text-xs text-ink-500">
                  Team leader must fill all member registration details (name, institute, email, phone, ID card) before the team can proceed.
                </p>
              </Card>
            </motion.div>

            {/* Member Forms - Only show if leader and not submitted */}
            {!allMembersSubmitted && team?.isLeader && (
              <motion.div variants={cardVariants}>
                {!roster ? (
                  <Card className="p-6">
                    <p className="text-sm text-ink-600">Loading team members...</p>
                  </Card>
                ) : roster.members && roster.members.length > 0 ? (
                  <TeamMemberRegistrationForm
                    members={roster.members}
                    teamId={team.id}
                    user={user}
                    onSuccess={loadMemberRegistrations}
                  />
                ) : (
                  <Card className="p-6">
                    <p className="text-sm text-red-600">No team members found. Please refresh or contact support.</p>
                  </Card>
                )}
              </motion.div>
            )}

            {/* Event Registration Card - Only show if all members submitted */}
            {allMembersSubmitted && (
              <motion.div variants={cardVariants}>
                <Card className="border-brand-500/15 bg-gradient-to-b from-[rgb(var(--surface))] to-brand-500/[0.03] transition-shadow hover:shadow-lg">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h2 className="font-display text-lg font-semibold text-ink-900">Event Registration</h2>
                      <p className="mt-1 text-sm text-ink-500">Complete team registration for the event.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge tone={registered ? 'success' : awaitingPayment ? 'warn' : 'neutral'} uppercase={false}>
                        {registered ? 'Complete' : awaitingPayment ? 'Payment pending' : 'Ready to register'}
                      </Badge>
                      {feeRequired ? (
                        <Badge tone={paySt === 'paid' || paySt === 'waived' ? 'success' : 'neutral'} uppercase={false}>
                          Payment: {paySt || '—'}
                        </Badge>
                      ) : null}
                    </div>
                  </div>

                  {msg ? (
                    <motion.p
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-4 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))]/60 px-4 py-3 text-sm text-ink-800"
                    >
                      {msg}
                    </motion.p>
                  ) : null}

                  {!registered && !awaitingPayment ? (
                    <div className="mt-6 space-y-3">
                      {feeRequired ? (
                        <div className="flex flex-wrap gap-3">
                          <Button
                            className="gap-2"
                            disabled={busy || windowClosed || Boolean(registrationBlockedReason)}
                            onClick={() => void registerEvent()}
                          >
                            Register & Pay Now
                            <CreditCard className="h-4 w-4 opacity-90" />
                          </Button>
                          <Button
                            variant="secondary"
                            className="gap-2"
                            disabled={busy || windowClosed || Boolean(registrationBlockedReason)}
                            onClick={() => void registerEventPayLater()}
                          >
                            Register & Pay Later
                            <ArrowRight className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <Button
                          className="w-full gap-2 sm:w-auto"
                          disabled={busy || windowClosed || Boolean(registrationBlockedReason)}
                          onClick={() => void registerEvent()}
                        >
                          Confirm registration
                          <ArrowRight className="h-4 w-4" />
                        </Button>
                      )}
                      {feeRequired ? (
                        <p className="text-xs text-amber-700">
                          ⚠️ If you choose "Pay Later", you must complete payment before registration closes to unlock submissions.
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {awaitingPayment && feeRequired ? (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-6 space-y-4">
                      <p className="text-sm text-amber-900">
                        {team?.paymentChoice === 'later' ? (
                          <>
                            You chose "Pay Later" during registration. Complete payment now to unlock submissions and finalize your registration.
                          </>
                        ) : (
                          <>
                            Almost there — pay the registration fee to finish. Your spot stays pending until payment succeeds.
                          </>
                        )}
                      </p>
                      {eventCfg?.razorpayConfigured ? (
                        <Button variant="secondary" className="gap-2" disabled={busy || windowClosed} onClick={() => void payEntryFee()}>
                          <CreditCard className="h-4 w-4" />
                          Pay {paymentLabel || 'now'} with Razorpay
                        </Button>
                      ) : (
                        <p className="text-sm text-ink-500">Ask an organizer to record your payment if checkout is unavailable.</p>
                      )}
                      {windowClosed && team?.paymentChoice === 'later' ? (
                        <p className="text-xs text-red-700">
                          ⚠️ Registration window has closed. Contact organizers if you need to complete payment.
                        </p>
                      ) : null}
                    </motion.div>
                  ) : null}

                  {registered ? (
                    <motion.p
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-6 flex items-center gap-2 text-sm font-medium text-emerald-800"
                    >
                      <CheckCircle2 className="h-5 w-5 shrink-0" />
                      You are fully registered{feeRequired ? ' and your fee is confirmed' : ''}. You can pick a problem statement next.
                    </motion.p>
                  ) : null}
                </Card>
              </motion.div>
            )}

            {!allMembersSubmitted && team && (
              <motion.div variants={cardVariants}>
                <Card className="border-amber-500/20 bg-amber-500/5">
                  <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/15">
                      <AlertCircle className="h-5 w-5 text-amber-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-ink-900">
                        {team?.isLeader ? 'Complete Team Registration' : 'Waiting for Team Leader'}
                      </h3>
                      <p className="mt-1 text-sm text-ink-600">
                        {team?.isLeader ? (
                          <>
                            As team leader, fill out registration details for all {totalMembers} team members above before proceeding.
                          </>
                        ) : (
                          <>
                            The team leader must complete registration for all {totalMembers} team members before you can proceed.
                          </>
                        )}
                      </p>
                      <p className="mt-2 text-sm font-medium text-amber-700">
                        Currently: {submittedMembers} of {totalMembers} completed
                      </p>
                    </div>
                  </div>
                </Card>
              </motion.div>
            )}
          </>
        )}
      </motion.div>

      {showSnitchLoader && <SnitchLoader message="Opening payment gateway..." />}
      <PaymentSuccessAnimation 
        show={showPaymentAnimation} 
        onComplete={() => setShowPaymentAnimation(false)} 
      />
    </>
  )
}
