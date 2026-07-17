import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  CheckCircle2, Circle, Lock, ArrowRight, Trophy, Sparkles,
  Users, CreditCard, Target, FileUp, ClipboardCheck, Gavel, PartyPopper, MinusCircle,
} from 'lucide-react'
import { usePageSeo } from '@/hooks/usePageSeo.js'
import { useParticipantWorkspace } from '@/hooks/useParticipantWorkspace.js'
import { Card } from '@/components/ui/Card.jsx'
import { Button } from '@/components/ui/Button.jsx'
import { Badge } from '@/components/ui/Badge.jsx'
import { Skeleton } from '@/components/ui/Skeleton.jsx'
import { buildParticipantSteps } from '@/pages/dashboard/participant/progressUtils.js'

const ICONS = {
  hackathon: Sparkles,
  team: Users,
  register: ClipboardCheck,
  payment: CreditCard,
  problem: Target,
  submission: FileUp,
  evaluation: Gavel,
  results: Trophy,
}

const stagger = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.08 } } }
const fadeUp = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } } }

/** Big animated progress ring */
function BigRing({ percent = 0 }) {
  const size = 140
  const strokeWidth = 12
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
          stroke="url(#progGrad)" strokeWidth={strokeWidth} strokeLinecap="round"
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.4, ease: 'easeOut' }}
          strokeDasharray={circumference}
        />
        <defs>
          <linearGradient id="progGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#06b6d4" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4 }}
          className="font-display text-3xl font-bold text-ink-900"
        >
          {percent}%
        </motion.span>
        <span className="text-xs text-ink-500">complete</span>
      </div>
    </div>
  )
}

export function ParticipantProgressPage() {
  usePageSeo({ title: 'My Progress', description: 'Track your hackathon journey.' })

  const { team, submission, eventCfg, loading } = useParticipantWorkspace()

  const feeRequired = Boolean(eventCfg?.entryFeeEnabled && (eventCfg?.entryFeeAmount ?? 0) > 0)
  const paySt = team?.paymentStatus || ''
  const feeResolved = !feeRequired || paySt === 'paid' || paySt === 'waived' || paySt === 'not_required'

  const { steps: baseSteps, completed: baseCompleted } = buildParticipantSteps({
    eventCfg, team, submission, feeResolved, problemChosen: Boolean(team?.problemStatementId),
  })

  // Feature 2: extend with Evaluation + Results steps (frontend-only, derived)
  const evaluationsOpen = Boolean(eventCfg?.evaluationsOpen)
  const resultsPublished = Boolean(eventCfg?.resultsPublished)
  const submissionDone = Boolean(team?.submissionLocked || submission?.finalizedAt)

  const steps = [
    ...baseSteps,
    {
      id: 'evaluation',
      title: 'Evaluation',
      description: evaluationsOpen ? 'Judges are scoring' : 'Awaiting evaluation',
      done: resultsPublished, // evaluation considered "done" once results are out
      skipped: false,
    },
    {
      id: 'results',
      title: 'Results',
      description: resultsPublished ? 'Results are live!' : 'Coming after evaluation',
      done: resultsPublished,
      skipped: false,
    },
  ]

  const completed = steps.filter((s) => s.done).length
  const total = steps.filter((s) => !s.skipped).length
  const progressPct = total > 0 ? Math.round((completed / total) * 100) : 0
  const currentIndex = steps.findIndex((s) => !s.done && !s.skipped)
  const allDone = currentIndex === -1

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <Skeleton className="h-44 w-full rounded-3xl" />
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    )
  }

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="mx-auto max-w-3xl space-y-8">
      {/* Hero */}
      <motion.div
        variants={fadeUp}
        className="relative overflow-hidden rounded-3xl border border-[rgb(var(--border))] bg-gradient-to-br from-brand-500/5 via-[rgb(var(--surface))] to-cyan-500/5 p-6 sm:p-8"
      >
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand-500/10 blur-3xl" />
        <div className="relative flex flex-col items-center gap-6 sm:flex-row sm:justify-between">
          <div className="flex-1 text-center sm:text-left">
            <div className="flex items-center justify-center gap-2 text-brand-600 sm:justify-start">
              <Sparkles className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-wide">Your Journey</span>
            </div>
            <h1 className="mt-2 font-display text-2xl font-bold text-ink-900 sm:text-3xl">
              {allDone ? 'You did it! 🎉' : 'Hackathon Progress'}
            </h1>
            <p className="mt-1 text-sm text-ink-500">
              {allDone
                ? 'Every step complete. Sit tight for the results.'
                : `${completed} of ${total} milestones complete — keep going!`}
            </p>
          </div>
          <BigRing percent={progressPct} />
        </div>
      </motion.div>

      {/* Stepper */}
      <motion.div variants={fadeUp}>
        <Card>
          <div className="relative space-y-1">
            {steps.map((step, i) => {
              const Icon = ICONS[step.id] || (step.id.startsWith('phase-') ? FileUp : Circle)
              const isCurrent = i === currentIndex
              const isSkipped = step.skipped
              const isDone = step.done
              const isLast = i === steps.length - 1

              return (
                <div key={step.id} className="relative flex gap-4 pb-6 last:pb-0">
                  {/* Connector line */}
                  {!isLast && (
                    <div
                      className={`absolute left-[19px] top-10 h-[calc(100%-1rem)] w-0.5 ${
                        isDone ? 'bg-emerald-400/50' : 'bg-[rgb(var(--border))]'
                      }`}
                    />
                  )}

                  {/* Node */}
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: i * 0.06 + 0.2, type: 'spring', stiffness: 400, damping: 20 }}
                    className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 ${
                      isDone
                        ? 'border-emerald-400 bg-emerald-500/15 text-emerald-600'
                        : isSkipped
                          ? 'border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))] text-ink-300'
                          : isCurrent
                            ? 'border-brand-500 bg-brand-500/15 text-brand-600'
                            : 'border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-ink-400'
                    }`}
                  >
                    {isDone ? (
                      <CheckCircle2 className="h-5 w-5" />
                    ) : isSkipped ? (
                      <MinusCircle className="h-5 w-5" />
                    ) : (
                      <Icon className="h-4.5 w-4.5" />
                    )}
                    {isCurrent && (
                      <span className="absolute -inset-1 animate-ping rounded-full border-2 border-brand-500/40" />
                    )}
                  </motion.div>

                  {/* Content */}
                  <div className="flex-1 pt-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className={`font-semibold ${isSkipped ? 'text-ink-400' : 'text-ink-900'}`}>
                        {step.title}
                      </h3>
                      {isDone && <Badge tone="success">Done</Badge>}
                      {isCurrent && <Badge tone="brand" dot pulse>In Progress</Badge>}
                      {isSkipped && <Badge tone="neutral">Skipped</Badge>}
                    </div>
                    <p className="mt-0.5 text-sm text-ink-500">{step.description}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      </motion.div>

      {/* Celebration / Next action */}
      {allDone ? (
        <motion.div variants={fadeUp}>
          <Card className="border-emerald-500/20 bg-emerald-500/5 text-center">
            <PartyPopper className="mx-auto h-10 w-10 text-emerald-500" />
            <h3 className="mt-3 font-display text-lg font-bold text-ink-900">All milestones complete!</h3>
            <p className="mt-1 text-sm text-ink-500">
              {resultsPublished ? 'Results are out — check the leaderboard.' : 'Hang tight while judges review submissions.'}
            </p>
            {resultsPublished && (
              <Link to="/results" className="mt-4 inline-block">
                <Button>
                  <Trophy className="mr-1.5 h-4 w-4" /> View Results
                </Button>
              </Link>
            )}
          </Card>
        </motion.div>
      ) : (
        <motion.div variants={fadeUp}>
          <NextStepCard team={team} regPending={feeRequired && paySt === 'pending'} />
        </motion.div>
      )}
    </motion.div>
  )
}

/** Suggests the next concrete action based on team state. */
function NextStepCard({ team, regPending }) {
  const next = !team
    ? { label: 'Create Your Team', to: '/dashboard/team', icon: Users, hint: 'Teams have 1–4 members.' }
    : !team.eventRegistered && !regPending
      ? { label: 'Register for the Event', to: '/dashboard/registration', icon: CreditCard, hint: 'Confirm your participation.' }
      : regPending
        ? { label: 'Complete Payment', to: '/dashboard/registration', icon: CreditCard, hint: 'Finish your entry fee.' }
        : !team.problemStatementId
          ? { label: 'Select a Problem Statement', to: '/dashboard/problems', icon: Target, hint: 'Pick your challenge.' }
          : !team.submissionLocked
            ? { label: 'Work on Your Submission', to: '/dashboard/submission', icon: FileUp, hint: 'Upload your artifacts.' }
            : null

  if (!next) return null
  const Icon = next.icon

  return (
    <Card accent="brand" className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-600">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">Next Step</p>
          <h3 className="font-display text-base font-semibold text-ink-900">{next.label}</h3>
          <p className="text-xs text-ink-500">{next.hint}</p>
        </div>
      </div>
      <Link to={next.to}>
        <Button size="sm">
          Go <ArrowRight className="ml-1 h-4 w-4" />
        </Button>
      </Link>
    </Card>
  )
}
