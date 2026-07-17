import { useMemo, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Flame, Users as UsersIcon, Building2, Tag, Layers,
  CheckCircle2, Bell, Mail, MessageCircle, FileUp, AlertCircle,
} from 'lucide-react'
import { usePageSeo } from '@/hooks/usePageSeo.js'
import { useParticipantWorkspace } from '@/hooks/useParticipantWorkspace.js'
import { getActivePhase, isPhaseSubmissionOpen, phaseAcceptsSubmissions } from '@/utils/phaseStatus.js'
import {
  displayCategory,
  displayDepartment,
  displayOrganization,
  displayTheme,
} from '@/utils/problemStatementDisplay.js'
import { Card } from '@/components/ui/Card.jsx'
import { Button } from '@/components/ui/Button.jsx'
import { Badge } from '@/components/ui/Badge.jsx'
import { Skeleton } from '@/components/ui/Skeleton.jsx'

export function ParticipantProblemDetailPage() {
  const { psId } = useParams()
  const navigate = useNavigate()
  const { problems, team, api, loading, refreshTeam, eventCfg } = useParticipantWorkspace()

  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const problem = useMemo(
    () => problems.find((p) => String(p.id) === String(psId)) || null,
    [problems, psId],
  )

  usePageSeo({
    title: problem?.title ? `${problem.title}` : 'Problem Statement',
    description: 'Problem statement details and selection.',
  })

  const payOk =
    !eventCfg?.entryFeeEnabled ||
    (eventCfg?.entryFeeAmount ?? 0) <= 0 ||
    ['paid', 'waived', 'not_required'].includes(team?.paymentStatus || '')
  const canSelect = Boolean(team?.eventRegistered && payOk)

  const selectionLocked =
    eventCfg?.lifecyclePhase &&
    !['REGISTRATION_OPEN', 'SUBMISSION_OPEN'].includes(eventCfg.lifecyclePhase)

  // Phase-aware: PPT submission is only "open" when the active phase actually
  // accepts submissions (has required artifacts) and is within its window.
  // A registration / problem-statement phase does not count as open.
  const activePhase = eventCfg?.activePhase || getActivePhase(
    Array.isArray(eventCfg?.competitionPhases) ? eventCfg.competitionPhases : [],
  )
  const submissionsOpen = activePhase
    ? (isPhaseSubmissionOpen(activePhase) && phaseAcceptsSubmissions(activePhase))
    : Boolean(eventCfg?.submissionsOpen)

  const count = typeof problem?.selectionCount === 'number' ? problem.selectionCount : 0
  const maxTeams = typeof problem?.maxTeams === 'number' ? problem.maxTeams : null
  const full = maxTeams != null && count >= maxTeams
  const selected = team?.problemStatementId === problem?.id

  async function select() {
    if (!team || !problem) return
    setBusy(true)
    setMsg('')
    try {
      await api.selectProblem(problem.id)
      await refreshTeam()
      setMsg('Problem statement selected for your team.')
    } catch (e) {
      setMsg(e.message || 'Could not select problem')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <Skeleton className="h-6 w-40 rounded-lg" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    )
  }

  if (!problem) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <Link to="/dashboard/problems" className="inline-flex items-center gap-2 text-sm font-medium text-brand-600 hover:text-brand-700">
          <ArrowLeft className="h-4 w-4" /> Back to problem statements
        </Link>
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <AlertCircle className="h-8 w-8 text-ink-400" />
          <p className="font-semibold text-ink-900">Problem statement not found</p>
          <p className="text-sm text-ink-500">It may have been unpublished or removed.</p>
          <Button size="sm" onClick={() => navigate('/dashboard/problems')}>Browse all problems</Button>
        </Card>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto max-w-3xl space-y-6"
    >
      <Link to="/dashboard/problems" className="inline-flex items-center gap-2 text-sm font-medium text-brand-600 hover:text-brand-700">
        <ArrowLeft className="h-4 w-4" /> Back to problem statements
      </Link>

      {/* Header */}
      <Card className={`relative overflow-hidden ${selected ? 'border-brand-500/60 ring-2 ring-brand-500/20' : ''}`}>
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-brand-500/10 blur-3xl" />
        <div className="relative">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-ink-500">{problem.id}</span>
            {problem.track ? <Badge tone="neutral" className="gap-1"><Layers className="h-3 w-3" /> {problem.track}</Badge> : null}
            {count >= 8 ? <Badge tone="warn" className="gap-1"><Flame className="h-3 w-3" /> Popular</Badge> : null}
            {full ? <Badge tone="neutral">Full</Badge> : <Badge tone="brand" className="gap-1"><UsersIcon className="h-3 w-3" /> {count} teams</Badge>}
            {selected ? <Badge tone="success" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Selected</Badge> : null}
          </div>
          <h1 className="mt-3 font-display text-2xl font-extrabold text-ink-900 sm:text-3xl">{problem.title}</h1>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5 text-sm text-ink-600">
            {displayCategory(problem) ? <span className="flex items-center gap-1.5"><Tag className="h-4 w-4 text-ink-400" /> {displayCategory(problem)}</span> : null}
            {displayTheme(problem) ? <span className="flex items-center gap-1.5"><Layers className="h-4 w-4 text-ink-400" /> {displayTheme(problem)}</span> : null}
            {displayOrganization(problem) ? <span className="flex items-center gap-1.5"><Building2 className="h-4 w-4 text-ink-400" /> {displayOrganization(problem)}</span> : null}
            {displayDepartment(problem) ? <span className="flex items-center gap-1.5"><UsersIcon className="h-4 w-4 text-ink-400" /> {displayDepartment(problem)}</span> : null}
          </div>
        </div>
      </Card>

      {/* Description */}
      <Card>
        <h2 className="font-display text-lg font-bold text-ink-900">Description</h2>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink-600">
          {problem.description || 'No description provided.'}
        </p>
      </Card>

      {/* PPT submission notice */}
      <Card className="border-brand-500/20 bg-brand-500/5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/15 text-brand-600">
            {submissionsOpen ? <FileUp className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
          </div>
          <div>
            {submissionsOpen ? (
              <>
                <h3 className="font-semibold text-ink-900">PPT submission is open</h3>
                <p className="mt-1 text-sm text-ink-600">
                  You can now upload your idea presentation from the Submission page.
                </p>
                <Link to="/dashboard/submission" className="mt-3 inline-flex">
                  <Button size="sm" className="gap-2"><FileUp className="h-4 w-4" /> Go to Submission</Button>
                </Link>
              </>
            ) : (
              <>
                <h3 className="font-semibold text-ink-900">PPT submission opens soon</h3>
                <p className="mt-1 text-sm text-ink-600">
                  When PPT submission opens, you’ll be notified on your registered
                  <span className="mx-1 inline-flex items-center gap-1 font-medium text-ink-800"><Mail className="h-3.5 w-3.5" /> email</span>
                  and
                  <span className="mx-1 inline-flex items-center gap-1 font-medium text-emerald-700"><MessageCircle className="h-3.5 w-3.5" /> WhatsApp</span>.
                </p>
              </>
            )}
          </div>
        </div>
      </Card>

      {/* Selection */}
      {msg ? (
        <p className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))] px-4 py-3 text-sm text-ink-800">{msg}</p>
      ) : null}

      {!team?.eventRegistered ? (
        <Card className="border-amber-500/30 bg-amber-500/10">
          <p className="text-sm text-amber-950">
            Register your team (and complete payment if required) before selecting a problem.
          </p>
        </Card>
      ) : selectionLocked ? (
        <Card className="border-red-500/20 bg-red-500/10">
          <p className="text-sm text-red-900">
            Problem selection is closed for the current phase ({eventCfg?.lifecyclePhase || '—'}).
          </p>
        </Card>
      ) : (
        <div className="flex flex-wrap gap-3">
          <Button
            className="gap-2"
            disabled={busy || (full && !selected) || !canSelect}
            onClick={select}
          >
            {selected ? (<><CheckCircle2 className="h-4 w-4" /> Selected</>) : full ? 'Problem Full' : 'Select this problem'}
          </Button>
          <Link to="/dashboard/problems">
            <Button variant="secondary" className="gap-2">Browse other problems</Button>
          </Link>
        </div>
      )}
    </motion.div>
  )
}
