import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  FileUp,
  Megaphone,
  MessageCircle,
  Sparkles,
  Target,
  Users,
  RefreshCw,
  Rocket,
  Trophy,
  Zap,
  Hash,
  Copy,
  Check,
} from 'lucide-react'
import { formatDate } from '@/utils/format.js'
import { usePageSeo } from '@/hooks/usePageSeo.js'
import { useParticipantWorkspace } from '@/hooks/useParticipantWorkspace.js'
import { useAnnouncements } from '@/hooks/useAnnouncements.js'
import { Card, GlassCard } from '@/components/ui/Card.jsx'
import { Button } from '@/components/ui/Button.jsx'
import { Badge } from '@/components/ui/Badge.jsx'
import { Skeleton } from '@/components/ui/Skeleton.jsx'
import { PhaseProgressTimeline } from '@/components/participant/PhaseProgressTimeline.jsx'
import { buildParticipantSteps, submissionCompleteness } from '@/pages/dashboard/participant/progressUtils.js'

/** Animated circular progress ring */
function ProgressRing({ percent = 0, size = 100, strokeWidth = 8 }) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (percent / 100) * circumference
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke="rgb(var(--surface-muted))" strokeWidth={strokeWidth} />
        <motion.circle
          cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke="url(#progressGrad)" strokeWidth={strokeWidth} strokeLinecap="round"
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
          strokeDasharray={circumference}
        />
        <defs>
          <linearGradient id="progressGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#06b6d4" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-xl font-bold text-ink-900">{percent}%</span>
        <span className="text-[10px] text-ink-500">complete</span>
      </div>
    </div>
  )
}

/** Countdown to a deadline */
function CountdownChip({ deadline, label }) {
  const diff = new Date(deadline).getTime() - Date.now()
  if (diff <= 0) return <Badge tone="danger" dot pulse>{label}: Passed</Badge>
  const days = Math.floor(diff / 86400000)
  const hours = Math.floor((diff % 86400000) / 3600000)
  return (
    <Badge tone={days <= 2 ? 'warn' : 'info'} dot>
      {label}: {days > 0 ? `${days}d ${hours}h` : `${hours}h`} left
    </Badge>
  )
}

const stagger = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.06 } } }
const fadeUp = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } } }

export function ParticipantHomePage() {
  usePageSeo({ title: 'Home', description: 'Your hackathon workspace.' })

  const {
    user, team, submission, eventCfg, selectedProblem,
    loading, error, eventId, paymentLabel, reload,
  } = useParticipantWorkspace()

  const isRegisteredLeader = Boolean(
    team && user && team.leaderId === user.uid &&
    (team.eventRegistered === true || team.registrationStatus === 'registered'),
  )
  const { items: announcements, loading: annLoading } = useAnnouncements(4, { eventId, participantFeed: true, isRegisteredLeader })

  const [copiedId, setCopiedId] = useState(false)
  async function copyTeamId() {
    if (!team?.inviteCode) return
    try {
      await navigator.clipboard.writeText(team.inviteCode)
      setCopiedId(true)
      setTimeout(() => setCopiedId(false), 1800)
    } catch { /* clipboard unavailable */ }
  }

  const feeRequired = Boolean(eventCfg?.entryFeeEnabled && (eventCfg?.entryFeeAmount ?? 0) > 0)
  const paySt = team?.paymentStatus || ''
  const feeResolved = !feeRequired || paySt === 'paid' || paySt === 'waived' || paySt === 'not_required'
  const { steps, completed } = buildParticipantSteps({ eventCfg, team, submission, feeResolved, problemChosen: Boolean(team?.problemStatementId) })
  const subProgress = submissionCompleteness(submission)
  const progressPct = steps.length > 0 ? Math.round((completed / steps.length) * 100) : 0
  const regComplete = team && feeResolved && team.eventRegistered
  const regPending = team && feeRequired && paySt === 'pending' && (team.registrationStatus === 'pending' || team.registrationRequestedAt)

  const nextAction = !team
    ? { label: 'Create Your Team', to: '/dashboard/team', icon: Users }
    : !team.eventRegistered && !regPending
      ? { label: 'Register for Event', to: '/dashboard/registration', icon: CreditCard }
      : regPending
        ? { label: 'Complete Payment', to: '/dashboard/registration', icon: CreditCard }
        : !team.problemStatementId
          ? { label: 'Select Problem Statement', to: '/dashboard/problems', icon: Target }
          : !team.submissionLocked
            ? { label: 'Upload Submission', to: '/dashboard/submission', icon: FileUp }
            : null

  if (loading) return (
    <div className="mx-auto max-w-5xl space-y-6 p-2">
      <Skeleton className="h-44 w-full rounded-3xl" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}
      </div>
    </div>
  )

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="mx-auto max-w-5xl space-y-8">
      {/* ━━ Hero Header ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <motion.div variants={fadeUp} className="relative overflow-hidden rounded-3xl border border-[rgb(var(--border))] bg-gradient-to-br from-brand-500/5 via-[rgb(var(--surface))] to-cyan-500/5 p-6 sm:p-8">
        {/* Decorative blobs */}
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -left-10 bottom-0 h-40 w-40 rounded-full bg-cyan-500/10 blur-3xl" />

        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 text-brand-600">
              <Sparkles className="h-4 w-4" />
              <span className="text-[11px] font-bold uppercase tracking-widest">Participant Dashboard</span>
            </div>
            <h1 className="mt-2 font-display text-3xl font-extrabold leading-tight text-ink-900 sm:text-4xl">
              {user?.displayName ? `Hey, ${user.displayName.split(' ')[0]}!` : 'Welcome back!'}
            </h1>
            <p className="mt-2 max-w-md text-sm text-ink-500">
              {progressPct === 100
                ? 'All steps complete — you\'re all set for the hackathon!'
                : `${steps.length - completed} step${steps.length - completed !== 1 ? 's' : ''} remaining to be hackathon-ready.`}
            </p>

            {/* Team ID (replaces the old join code) */}
            {team?.inviteCode && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                  <Hash className="h-3 w-3" /> Team ID
                </span>
                <code className="rounded-md border border-[rgb(var(--border))] bg-white px-2 py-1 font-mono text-sm font-bold tracking-wider text-ink-800">
                  {team.inviteCode}
                </code>
                <button
                  type="button"
                  onClick={copyTeamId}
                  className="inline-flex items-center gap-1 rounded-md border border-[rgb(var(--border))] bg-white px-2 py-1 text-xs font-medium text-brand-600 transition-colors hover:bg-brand-500/5"
                >
                  {copiedId ? <><Check className="h-3.5 w-3.5" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}
                </button>
              </div>
            )}

            {/* Deadline chips */}
            <div className="mt-4 flex flex-wrap gap-2">
              {eventCfg?.registrationClosesAt && <CountdownChip deadline={eventCfg.registrationClosesAt} label="Registration" />}
              {eventCfg?.submissionDeadline && <CountdownChip deadline={eventCfg.submissionDeadline} label="Submission" />}
            </div>
          </div>

          {/* Progress Ring */}
          <div className="flex flex-col items-center gap-3">
            <ProgressRing percent={progressPct} size={110} strokeWidth={10} />
            {nextAction && (
              <Link to={nextAction.to}>
                <Button size="sm" className="gap-2 shadow-lg shadow-brand-500/20">
                  <nextAction.icon className="h-4 w-4" />
                  {nextAction.label}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            )}
          </div>
        </div>

        {/* Step pills row */}
        <div className="relative mt-6 flex flex-wrap gap-2">
          {steps.map((step, i) => (
            <div
              key={step.id}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                step.done
                  ? 'bg-emerald-500/15 text-emerald-700'
                  : i === completed
                    ? 'border border-brand-500/30 bg-brand-500/10 text-brand-700 ring-2 ring-brand-500/20'
                    : 'bg-[rgb(var(--surface-muted))] text-ink-400'
              }`}
            >
              {step.done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <span className="text-[10px]">{i + 1}</span>}
              <span>{step.title}</span>
            </div>
          ))}
        </div>
      </motion.div>

      {error && <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700">{error}</p>}

      {/* ━━ Phase Timeline ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {eventCfg?.competitionPhases?.length > 0 && (
        <motion.div variants={fadeUp}>
          <PhaseProgressTimeline phases={eventCfg.competitionPhases} team={team} />
        </motion.div>
      )}

      {/* ━━ Bento Grid ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Team */}
        <motion.div variants={fadeUp}>
          <Link to="/dashboard/team" className="group block h-full">
            <Card hover className="relative h-full overflow-hidden">
              <div className="pointer-events-none absolute -right-4 -top-4 h-20 w-20 rounded-full bg-brand-500/10 blur-xl transition-all group-hover:scale-150" />
              <div className="relative">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500/20 to-brand-500/5 text-brand-600">
                  <Users className="h-5 w-5" />
                </div>
                <h3 className="mt-3 font-display text-sm font-bold text-ink-900">My Team</h3>
                {team ? (
                  <>
                    <p className="mt-1 text-lg font-semibold text-ink-900">{team.name}</p>
                    <p className="text-xs text-ink-500">{(team.memberIds || []).length} member(s)</p>
                  </>
                ) : (
                  <p className="mt-1 text-xs text-ink-400">Create or join →</p>
                )}
              </div>
            </Card>
          </Link>
        </motion.div>

        {/* Registration */}
        <motion.div variants={fadeUp}>
          <Link to="/dashboard/registration" className="group block h-full">
            <Card hover className="relative h-full overflow-hidden">
              <div className="pointer-events-none absolute -right-4 -top-4 h-20 w-20 rounded-full bg-emerald-500/10 blur-xl transition-all group-hover:scale-150" />
              <div className="relative">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 text-emerald-600">
                  <CreditCard className="h-5 w-5" />
                </div>
                <h3 className="mt-3 font-display text-sm font-bold text-ink-900">Registration</h3>
                <div className="mt-1">
                  <Badge tone={regComplete ? 'success' : regPending ? 'warn' : 'neutral'} dot={regComplete || regPending} pulse={regPending}>
                    {regComplete ? 'Registered' : regPending ? 'Payment Pending' : team ? 'Not registered' : 'Need team'}
                  </Badge>
                </div>
                {paymentLabel && <p className="mt-1.5 text-xs text-ink-500">Fee: {paymentLabel}</p>}
              </div>
            </Card>
          </Link>
        </motion.div>

        {/* Problem Statement */}
        <motion.div variants={fadeUp}>
          <Link to="/dashboard/problems" className="group block h-full">
            <Card hover className="relative h-full overflow-hidden">
              <div className="pointer-events-none absolute -right-4 -top-4 h-20 w-20 rounded-full bg-violet-500/10 blur-xl transition-all group-hover:scale-150" />
              <div className="relative">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/20 to-violet-500/5 text-violet-600">
                  <Target className="h-5 w-5" />
                </div>
                <h3 className="mt-3 font-display text-sm font-bold text-ink-900">Problem</h3>
                {selectedProblem ? (
                  <>
                    <p className="mt-1 line-clamp-1 text-sm font-medium text-ink-900">{selectedProblem.title}</p>
                    <p className="text-xs text-ink-500">{selectedProblem.domain}</p>
                  </>
                ) : (
                  <p className="mt-1 text-xs text-ink-400">{regComplete ? 'Choose a problem →' : 'Register first'}</p>
                )}
              </div>
            </Card>
          </Link>
        </motion.div>

        {/* Submission */}
        <motion.div variants={fadeUp}>
          <Link to="/dashboard/submission" className="group block h-full">
            <Card hover className="relative h-full overflow-hidden">
              <div className="pointer-events-none absolute -right-4 -top-4 h-20 w-20 rounded-full bg-cyan-500/10 blur-xl transition-all group-hover:scale-150" />
              <div className="relative">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/20 to-cyan-500/5 text-cyan-600">
                  <FileUp className="h-5 w-5" />
                </div>
                <h3 className="mt-3 font-display text-sm font-bold text-ink-900">Submission</h3>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-lg font-bold text-ink-900">{subProgress.filled}/{subProgress.total}</span>
                  <span className="text-xs text-ink-500">files</span>
                  {team?.submissionLocked && <Badge tone="success" className="text-[9px]">Locked</Badge>}
                </div>
                {/* Mini progress bar */}
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[rgb(var(--surface-muted))]">
                  <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-brand-500 transition-all duration-700" style={{ width: `${subProgress.pct}%` }} />
                </div>
              </div>
            </Card>
          </Link>
        </motion.div>
      </div>

      {/* ━━ Bottom Row: Announcements + Chat + Quick Actions ━━━━━ */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Announcements */}
        <motion.div variants={fadeUp} className="md:col-span-2">
          <Card className="h-full">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/10 text-brand-600">
                  <Megaphone className="h-4 w-4" />
                </div>
                <h3 className="font-display text-sm font-bold text-ink-900">Latest Announcements</h3>
              </div>
              {announcements.length > 0 && (
                <Link to="/dashboard/announcements" className="text-xs font-medium text-brand-600 hover:underline">See all</Link>
              )}
            </div>
            {annLoading ? <Skeleton className="mt-4 h-20 w-full" /> : announcements.length === 0 ? (
              <p className="mt-4 text-sm text-ink-400">No announcements yet — check back later.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {announcements.slice(0, 3).map((a) => (
                  <div key={a.id} className="flex items-start gap-3 rounded-xl bg-[rgb(var(--surface-muted))]/50 px-4 py-3">
                    <Zap className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-ink-900">{a.title}</p>
                      <p className="mt-0.5 text-xs text-ink-500">{formatDate(a.createdAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </motion.div>

        {/* Quick Actions */}
        <motion.div variants={fadeUp}>
          <Card className="h-full">
            <h3 className="flex items-center gap-2 font-display text-sm font-bold text-ink-900">
              <Rocket className="h-4 w-4 text-brand-600" /> Quick Actions
            </h3>
            <div className="mt-4 space-y-2">
              <Link to="/dashboard/chat" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all hover:bg-brand-500/5">
                <MessageCircle className="h-4 w-4 text-brand-600" />
                <span className="font-medium text-ink-700">Team Chat</span>
                <ArrowRight className="ml-auto h-3.5 w-3.5 text-ink-300" />
              </Link>
              <Link to="/dashboard/mentor-chat" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all hover:bg-brand-500/5">
                <Trophy className="h-4 w-4 text-amber-500" />
                <span className="font-medium text-ink-700">Mentor Chat</span>
                <ArrowRight className="ml-auto h-3.5 w-3.5 text-ink-300" />
              </Link>
              <Link to="/dashboard/timeline" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all hover:bg-brand-500/5">
                <Calendar className="h-4 w-4 text-cyan-500" />
                <span className="font-medium text-ink-700">Timeline</span>
                <ArrowRight className="ml-auto h-3.5 w-3.5 text-ink-300" />
              </Link>
              <button
                type="button"
                onClick={reload}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all hover:bg-brand-500/5"
              >
                <RefreshCw className="h-4 w-4 text-ink-400" />
                <span className="font-medium text-ink-700">Refresh Data</span>
              </button>
            </div>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  )
}
