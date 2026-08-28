import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  FileText,
  Github,
  Presentation,
  Video,
  Lock,
  Send,
  Save,
  CheckCircle2,
  Zap,
} from 'lucide-react'
import { usePageSeo } from '@/hooks/usePageSeo.js'
import { useApi } from '@/hooks/useApi.js'
import {
  displayCategory,
  displayDepartment,
  displayOrganization,
  displayTheme,
} from '@/utils/problemStatementDisplay.js'
import { Card } from '@/components/ui/Card.jsx'
import { Button } from '@/components/ui/Button.jsx'
import { Badge } from '@/components/ui/Badge.jsx'
import { Textarea } from '@/components/ui/Input.jsx'
import { Skeleton } from '@/components/ui/Skeleton.jsx'

/** Mirrors backend `LEGACY_DEFAULT_CRITERIA` if API returns nothing (should be rare). */
const FALLBACK_CRITERIA = [
  { key: 'originality', label: 'Originality', maxScore: 10, hint: 'Novelty of idea and differentiation.' },
  { key: 'feasibility', label: 'Feasibility', maxScore: 10, hint: 'Technical and operational viability.' },
  { key: 'impact', label: 'Impact', maxScore: 10, hint: 'Value for users / theme fit.' },
  { key: 'presentation', label: 'Presentation', maxScore: 10, hint: 'Clarity of deck, demo, and artifact quality.' },
]

function defaultScoresFromCriteria(criteria) {
  const o = {}
  for (const c of criteria) {
    const max = typeof c.maxScore === 'number' && c.maxScore > 0 ? c.maxScore : 10
    o[c.key] = Math.round((max / 2) * 10) / 10
  }
  return o
}

/** Ensure POST body matches server-resolved rubric keys only. */
function buildScoresPayload(criteria, scores) {
  const o = {}
  for (const c of criteria) {
    const max = typeof c.maxScore === 'number' && c.maxScore > 0 ? c.maxScore : 10
    const raw = scores[c.key]
    o[c.key] = typeof raw === 'number' && Number.isFinite(raw) ? raw : Math.round((max / 2) * 10) / 10
  }
  return o
}

/** Sum of awarded + max possible for a rubric part, for a live score readout. */
function partTotal(criteria, scores) {
  let total = 0
  let max = 0
  for (const c of criteria) {
    const m = typeof c.maxScore === 'number' && c.maxScore > 0 ? c.maxScore : 10
    max += m
    const v = Number(scores[c.key])
    total += Number.isFinite(v) ? v : 0
  }
  return { total, max }
}

function httpsUrl(url) {
  const u = String(url || '').trim()
  return u.startsWith('https://') ? u : ''
}

/** One rubric block — a set of sliders for a criteria list. */
function RubricSliders({ criteria, scores, onChange, canEdit }) {
  return (
    <div className="space-y-3">
      {criteria.map(({ key, label, hint, maxScore }) => {
        const m = typeof maxScore === 'number' && maxScore > 0 ? maxScore : 10
        // Small scales (e.g. the 0–3 Universal Challenge items) step by whole
        // points; mid scales allow half points; large scales step by 1.
        const step = m <= 3 ? 1 : m <= 10 ? 0.5 : 1
        const raw = scores[key]
        const value = typeof raw === 'number' && Number.isFinite(raw) ? raw : Math.round((m / 2) * 10) / 10
        const hintText = hint?.trim() ? hint : `Score from 0 to ${m}.`
        const pct = m > 0 ? Math.round((value / m) * 100) : 0
        return (
          <div
            key={key}
            className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3.5 transition-colors hover:border-brand-500/40"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <label htmlFor={`score-${key}`} className="block text-sm font-semibold text-ink-900">
                  {label}
                </label>
                <p className="mt-0.5 text-[11px] leading-snug text-ink-500">{hintText}</p>
              </div>
              <span className="shrink-0 rounded-lg bg-brand-500/10 px-2.5 py-1 font-mono text-sm font-bold tabular-nums text-brand-700">
                {value}
                <span className="text-brand-400"> / {m}</span>
              </span>
            </div>
            <input
              id={`score-${key}`}
              type="range"
              min={0}
              max={m}
              step={step}
              disabled={!canEdit}
              value={value}
              onChange={(e) => onChange(key, Number(e.target.value))}
              aria-valuetext={`${value} out of ${m}`}
              className="mt-3 h-1.5 w-full cursor-pointer accent-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
            />
            <div className="mt-1.5 flex items-center justify-between text-[10px] font-medium text-ink-400">
              <span>0</span>
              <span aria-hidden="true" className="tabular-nums text-brand-500">{pct}%</span>
              <span>{m}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/**
 * Ordered progress strip. `position` is the 1-based current step; steps with
 * n < position render as done, n === position as the active step. Used for the
 * 4-step finals flow (Part A project → Part A challenge → Part B project →
 * Part B challenge), or the 2-step flow when no challenge rubric exists.
 */
function StepStrip({ steps, position }) {
  return (
    <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))]/40 p-3">
      {steps.map((s, i) => {
        const done = position > s.n
        const current = position === s.n
        return (
          <div key={s.n}>
            <div className="flex items-center gap-3">
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                  done
                    ? 'bg-emerald-500 text-white'
                    : current
                      ? 'bg-brand-500 text-white'
                      : 'border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-ink-500'
                }`}
              >
                {done ? <CheckCircle2 className="h-4 w-4" /> : s.n}
              </span>
              <span className={`text-sm ${current ? 'font-semibold text-ink-900' : done ? 'text-ink-500' : 'text-ink-600'}`}>
                {s.label}
              </span>
              {done ? (
                <Badge tone="success" className="ml-auto text-[10px]">Done</Badge>
              ) : current ? (
                <Badge tone="brand" className="ml-auto text-[10px]">Current</Badge>
              ) : null}
            </div>
            {i < steps.length - 1 ? (
              <span className="ml-[13px] block h-3 w-px bg-[rgb(var(--border))]" aria-hidden="true" />
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

export function JudgeTeamReviewPage() {
  const { teamId } = useParams()
  const api = useApi()
  const dirty = useRef(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [team, setTeam] = useState(null)
  const [problemStatement, setProblemStatement] = useState(null)
  const [submission, setSubmission] = useState(null)
  const [evaluation, setEvaluation] = useState(null)
  const [edition, setEdition] = useState(null)

  // Single-mode state (legacy / default rubric — one evaluation per team)
  const [criteria, setCriteria] = useState(FALLBACK_CRITERIA)
  const [scores, setScores] = useState(() => defaultScoresFromCriteria(FALLBACK_CRITERIA))
  const [feedback, setFeedback] = useState('')

  // Two-part mode state (Finals — judge submits TWO separate evaluations
  // for the team: Evaluation 1 = Part A, Evaluation 2 = Part B)
  const [twoPart, setTwoPart] = useState(false)
  const [criteriaA, setCriteriaA] = useState([])
  const [criteriaB, setCriteriaB] = useState([])
  // Shared "Universal Challenge" rubric — scored inside BOTH parts (may be empty).
  const [criteriaU, setCriteriaU] = useState([])
  const [scoresA, setScoresA] = useState({})
  const [scoresB, setScoresB] = useState({})
  const [feedbackA, setFeedbackA] = useState('')
  const [feedbackB, setFeedbackB] = useState('')
  const [labelA, setLabelA] = useState('Part A')
  const [labelB, setLabelB] = useState('Part B')
  const [statusA, setStatusA] = useState('pending')
  const [statusB, setStatusB] = useState('pending')
  // Within the active part the judge fills two ordered sub-steps: the project
  // rubric first, then the shared Universal Challenge. Only used when a
  // challenge rubric exists; otherwise the part is a single step.
  const [microStep, setMicroStep] = useState('project') // 'project' | 'challenge'

  const [msg, setMsg] = useState('')
  const [saving, setSaving] = useState(false)
  const [lastAutosave, setLastAutosave] = useState(null)
  const [juryStatus, setJuryStatus] = useState('')
  const [statusBusy, setStatusBusy] = useState(false)

  usePageSeo({ title: 'Team review', description: 'Scoped jury evaluation.' })

  const load = useCallback(async () => {
    if (!teamId) return
    setLoading(true)
    setError('')
    setMsg('')
    dirty.current = false
    try {
      const data = await api.judgeTeamReview(teamId)
      setTeam(data.team)
      setJuryStatus(data.team?.juryStatus || '')
      setProblemStatement(data.problemStatement)
      setSubmission(data.submission)
      setEvaluation(data.evaluation)
      setEdition(data.edition)

      const isTwoPart = data.edition?.scoringMode === 'twoPart'
      setTwoPart(isTwoPart)

      if (isTwoPart) {
        const critA = Array.isArray(data.edition?.evaluationCriteriaA) && data.edition.evaluationCriteriaA.length > 0
          ? data.edition.evaluationCriteriaA
          : FALLBACK_CRITERIA
        const critB = Array.isArray(data.edition?.evaluationCriteriaB) && data.edition.evaluationCriteriaB.length > 0
          ? data.edition.evaluationCriteriaB
          : FALLBACK_CRITERIA
        // Shared Universal Challenge — scored inside BOTH parts (may be empty).
        const critU = Array.isArray(data.edition?.challengeCriteria) ? data.edition.challengeCriteria : []
        setCriteriaA(critA)
        setCriteriaB(critB)
        setCriteriaU(critU)
        setLabelA(data.edition?.partALabel || 'Part A')
        setLabelB(data.edition?.partBLabel || 'Part B')
        setStatusA(data.evaluation?.statusA || 'pending')
        setStatusB(data.evaluation?.statusB || 'pending')

        // Seed defaults from each part's COMBINED criteria (project + challenge)
        // so the challenge sliders have values even before a server snapshot.
        const baseA = defaultScoresFromCriteria([...critA, ...critU])
        const baseB = defaultScoresFromCriteria([...critB, ...critU])
        const prevA = data.evaluation?.scoresA && typeof data.evaluation.scoresA === 'object' ? data.evaluation.scoresA : {}
        const prevB = data.evaluation?.scoresB && typeof data.evaluation.scoresB === 'object' ? data.evaluation.scoresB : {}
        setScoresA({ ...baseA, ...prevA })
        setScoresB({ ...baseB, ...prevB })
        setFeedbackA(data.evaluation?.feedbackA ?? '')
        setFeedbackB(data.evaluation?.feedbackB ?? '')
      } else {
        const crit =
          Array.isArray(data.evaluationCriteria) && data.evaluationCriteria.length > 0 ? data.evaluationCriteria : FALLBACK_CRITERIA
        setCriteria(crit)
        const base = defaultScoresFromCriteria(crit)
        const prev = data.evaluation?.scores && typeof data.evaluation.scores === 'object' ? data.evaluation.scores : {}
        setScores({ ...base, ...prev })
        setFeedback(data.evaluation?.feedback ?? '')
      }
    } catch (e) {
      setError(e.message || 'Could not load review')
      setTeam(null)
    } finally {
      setLoading(false)
    }
  }, [api, teamId])

  useEffect(() => {
    void load()
  }, [load])

  const uiStatus = useMemo(() => {
    if (!evaluation) return 'pending'
    if (evaluation.evaluationLocked) return 'locked'
    if (evaluation.evaluationStatus === 'submitted') return 'submitted'
    if (evaluation.evaluationStatus === 'draft') return 'in-progress'
    return 'pending'
  }, [evaluation])

  const canEditAtAll = Boolean(edition?.evaluationOpen && uiStatus !== 'submitted' && uiStatus !== 'locked')

  // Which of the two evaluations is currently active (the judge fills these
  // in strict order: Evaluation 1 first, then Evaluation 2 unlocks).
  const activeStep = useMemo(() => {
    if (!twoPart) return null
    if (statusA !== 'submitted') return 'A'
    if (statusB !== 'submitted') return 'B'
    return 'done'
  }, [twoPart, statusA, statusB])

  const canEditA = canEditAtAll && activeStep === 'A'
  const canEditB = canEditAtAll && activeStep === 'B'

  // When we advance to a different part (A → B), restart at its first sub-step.
  useEffect(() => {
    setMicroStep('project')
  }, [activeStep])

  // Totals for the read-only summary of a completed part.
  const totalsA = useMemo(
    () => partTotal(criteriaU.length ? [...criteriaA, ...criteriaU] : criteriaA, scoresA),
    [criteriaA, criteriaU, scoresA],
  )
  const totalsB = useMemo(
    () => partTotal(criteriaU.length ? [...criteriaB, ...criteriaU] : criteriaB, scoresB),
    [criteriaB, criteriaU, scoresB],
  )

  function buildSinglePayload(draft) {
    return {
      teamId,
      scores: buildScoresPayload(criteria, scores),
      feedback,
      draft,
      ...(draft ? {} : { status: juryStatus }),
    }
  }

  function buildPartPayload(part, draft) {
    const isA = part === 'A'
    // Each part's payload includes its project criteria PLUS the shared
    // Universal Challenge, so the challenge is scored within both parts.
    const projectCrit = isA ? criteriaA : criteriaB
    const combinedCrit = criteriaU.length ? [...projectCrit, ...criteriaU] : projectCrit
    return {
      teamId,
      part,
      scores: buildScoresPayload(combinedCrit, isA ? scoresA : scoresB),
      feedback: isA ? feedbackA : feedbackB,
      draft,
      // Team status is only required/sent with the FINAL (Part B) submission —
      // that's the point at which the whole evaluation is complete.
      ...(!draft && !isA ? { status: juryStatus } : {}),
    }
  }

  // Autosave the currently-active step's draft only.
  useEffect(() => {
    if (!teamId || !dirty.current) return
    if (twoPart ? !canEditAtAll || activeStep === 'done' : !canEditAtAll) return
    const id = setTimeout(async () => {
      setSaving(true)
      try {
        if (twoPart) {
          await api.submitEvaluation(buildPartPayload(activeStep, true))
        } else {
          await api.submitEvaluation(buildSinglePayload(true))
        }
        setLastAutosave(Date.now())
      } catch {
        /* offline / phase — silent */
      } finally {
        setSaving(false)
      }
    }, 900)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, teamId, scores, scoresA, scoresB, feedback, feedbackA, feedbackB, canEditAtAll, twoPart, activeStep])

  async function submitSingleFinal() {
    if (!teamId || !canEditAtAll) return
    setMsg('')
    if (!juryStatus) {
      setMsg('Please set the team status (Qualified / Waitlist / Not Qualified) before submitting.')
      return
    }
    try {
      await api.submitEvaluation(buildSinglePayload(false))
      dirty.current = false
      setMsg('Evaluation submitted. Thank you.')
      await load()
    } catch (e) {
      setMsg(e.message || 'Submit failed')
    }
  }

  async function submitPart(part) {
    if (!teamId || !canEditAtAll) return
    setMsg('')
    if (part === 'B' && !juryStatus) {
      setMsg('Please set the team status (Qualified / Waitlist / Not Qualified) before submitting Evaluation 2.')
      return
    }
    try {
      await api.submitEvaluation(buildPartPayload(part, false))
      dirty.current = false
      setMsg(part === 'A' ? 'Evaluation 1 submitted. Evaluation 2 is now unlocked.' : 'Evaluation 2 submitted. Final Score computed — thank you.')
      await load()
    } catch (e) {
      setMsg(e.message || 'Submit failed')
    }
  }

  async function saveDraftNow() {
    if (!teamId) return
    setSaving(true)
    try {
      if (twoPart) {
        await api.submitEvaluation(buildPartPayload(activeStep, true))
      } else {
        await api.submitEvaluation(buildSinglePayload(true))
      }
      setLastAutosave(Date.now())
      setMsg('Draft saved.')
    } catch (e) {
      setMsg(e.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function updateJuryStatus(next) {
    if (!teamId) return
    setStatusBusy(true)
    setMsg('')
    try {
      const res = await api.judgeSetTeamStatus({ teamId, status: next || 'none' })
      setJuryStatus(res?.juryStatus || '')
    } catch (e) {
      setMsg(e.message || 'Could not update team status')
    } finally {
      setStatusBusy(false)
    }
  }

  function updateScore(key, value) {
    dirty.current = true
    setScores((s) => ({ ...s, [key]: value }))
  }

  function updateScoreA(key, value) {
    dirty.current = true
    setScoresA((s) => ({ ...s, [key]: value }))
  }

  function updateScoreB(key, value) {
    dirty.current = true
    setScoresB((s) => ({ ...s, [key]: value }))
  }

  function updateFeedback(v) {
    dirty.current = true
    setFeedback(v)
  }

  function updateFeedbackA(v) {
    dirty.current = true
    setFeedbackA(v)
  }

  function updateFeedbackB(v) {
    dirty.current = true
    setFeedbackB(v)
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <Skeleton className="h-8 w-48 rounded-lg" />
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-96 rounded-2xl" />
          <Skeleton className="h-96 rounded-2xl" />
        </div>
      </div>
    )
  }

  if (error || !team) {
    return (
      <div className="mx-auto max-w-lg space-y-6">
        <Link to="/judge/evaluate" className="inline-flex items-center gap-2 text-sm font-medium text-brand-600">
          <ArrowLeft className="h-4 w-4" />
          Back to queue
        </Link>
        <Card className="border-red-500/30 bg-red-500/5">
          <h1 className="font-display text-xl font-semibold text-ink-900">Access denied or unavailable</h1>
          <p className="mt-2 text-sm text-ink-600">
            {error || 'This team is outside your jury scope. Only use links from your dashboard.'}
          </p>
        </Card>
      </div>
    )
  }

  const pdf = httpsUrl(submission?.pdfUrl)
  const ppt = httpsUrl(submission?.pptUrl)
  const video = httpsUrl(submission?.videoUrl)
  const gh = httpsUrl(submission?.githubUrl)

  // Ordered finals steps. With a challenge rubric it's four sub-steps
  // (project + challenge per part); without one it's the plain two-part flow.
  const hasChallenge = criteriaU.length > 0
  const stepperSteps = hasChallenge
    ? [
        { n: 1, label: `${labelA} · Project` },
        { n: 2, label: `${labelA} · Challenge` },
        { n: 3, label: `${labelB} · Project` },
        { n: 4, label: `${labelB} · Challenge` },
      ]
    : [
        { n: 1, label: `Evaluation 1 — ${labelA}` },
        { n: 2, label: `Evaluation 2 — ${labelB}` },
      ]
  const stepperPosition = hasChallenge
    ? activeStep === 'A'
      ? microStep === 'challenge' ? 2 : 1
      : activeStep === 'B'
        ? microStep === 'challenge' ? 4 : 3
        : 5
    : activeStep === 'A' ? 1 : activeStep === 'B' ? 2 : 3

  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-24 lg:pb-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to="/judge/evaluate" className="inline-flex items-center gap-2 text-sm font-medium text-brand-600">
            <ArrowLeft className="h-4 w-4" />
            Evaluate queue
          </Link>
          <h1 className="mt-4 font-display text-3xl font-bold text-ink-900">{team.name}</h1>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge tone="neutral" className="font-mono text-[10px]">
              {team.id}
            </Badge>
            <Badge tone={uiStatus === 'submitted' ? 'success' : uiStatus === 'locked' ? 'warn' : 'brand'}>{uiStatus}</Badge>
            {twoPart ? <Badge tone="brand">Finals — 2 evaluations required</Badge> : null}
            {!edition?.evaluationOpen ? <Badge tone="warn">Evaluations closed</Badge> : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-500">
          {saving ? <span>Saving draft…</span> : null}
          {lastAutosave && canEditAtAll ? <span>Autosaved {new Date(lastAutosave).toLocaleTimeString()}</span> : null}
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Card>
            <h2 className="font-display text-lg font-semibold text-ink-900">Problem statement</h2>
            {problemStatement ? (
              <>
                <p className="mt-2 font-mono text-[11px] text-ink-500">{problemStatement.id || team?.problemStatementId}</p>
                <p className="mt-2 font-display text-xl text-ink-900">{problemStatement.title}</p>
                <dl className="mt-3 space-y-1.5 text-xs text-ink-600">
                  {displayOrganization(problemStatement) ? (
                    <div>
                      <dt className="inline font-semibold text-ink-500">Organization </dt>
                      <dd className="inline">{displayOrganization(problemStatement)}</dd>
                    </div>
                  ) : null}
                  {displayDepartment(problemStatement) ? (
                    <div>
                      <dt className="inline font-semibold text-ink-500">Department </dt>
                      <dd className="inline">{displayDepartment(problemStatement)}</dd>
                    </div>
                  ) : null}
                  {displayCategory(problemStatement) ? (
                    <div>
                      <dt className="inline font-semibold text-ink-500">Category </dt>
                      <dd className="inline">{displayCategory(problemStatement)}</dd>
                    </div>
                  ) : null}
                  {displayTheme(problemStatement) ? (
                    <div>
                      <dt className="inline font-semibold text-ink-500">Theme </dt>
                      <dd className="inline">{displayTheme(problemStatement)}</dd>
                    </div>
                  ) : null}
                </dl>
                <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-ink-700">
                  {problemStatement.description || '—'}
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm text-ink-500">No problem metadata.</p>
            )}
          </Card>

          <Card>
            <h2 className="font-display text-lg font-semibold text-ink-900">Submission</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {ppt ? (
                <a href={ppt} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-xs font-medium hover:bg-[rgb(var(--surface-muted))]">
                  <Presentation className="h-3.5 w-3.5" />
                  Deck
                  <ExternalLink className="h-3 w-3 opacity-60" />
                </a>
              ) : null}
              {pdf ? (
                <a href={pdf} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-xs font-medium hover:bg-[rgb(var(--surface-muted))]">
                  <FileText className="h-3.5 w-3.5" />
                  PDF
                  <ExternalLink className="h-3 w-3 opacity-60" />
                </a>
              ) : null}
              {video ? (
                <a href={video} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-xs font-medium hover:bg-[rgb(var(--surface-muted))]">
                  <Video className="h-3.5 w-3.5" />
                  Demo / video
                  <ExternalLink className="h-3 w-3 opacity-60" />
                </a>
              ) : null}
              {gh ? (
                <a href={gh} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-xs font-medium hover:bg-[rgb(var(--surface-muted))]">
                  <Github className="h-3.5 w-3.5" />
                  Repository
                  <ExternalLink className="h-3 w-3 opacity-60" />
                </a>
              ) : null}
              {!ppt && !pdf && !video && !gh ? (
                <p className="text-sm text-ink-500">No submission links recorded yet.</p>
              ) : null}
            </div>

            <p className="mt-4 text-xs text-ink-500">
              Open each artifact in a new tab using the links above.
            </p>
          </Card>

          <Card>
            <h2 className="font-display text-lg font-semibold text-ink-900">Submission timeline</h2>
            <ul className="mt-4 space-y-2 text-sm text-ink-600">
              <li>
                <span className="font-medium text-ink-800">Submission status:</span> {submission?.status || '—'}
              </li>
              <li>
                <span className="font-medium text-ink-800">Locked by team:</span>{' '}
                {team.submissionLocked ? 'yes' : 'no'}
              </li>
              <li>
                <span className="font-medium text-ink-800">Materials updated:</span>{' '}
                {submission?.updatedAt || '—'}
              </li>
              <li>
                <span className="font-medium text-ink-800">Finalized:</span> {submission?.finalizedAt || '—'}
              </li>
            </ul>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card className="lg:sticky lg:top-24">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-ink-400" />
              <h2 className="font-display text-lg font-semibold text-ink-900">
                {twoPart ? 'Evaluations (2 required)' : 'Rubric & remarks'}
              </h2>
            </div>

            {msg ? <p className="mt-3 text-sm text-brand-700">{msg}</p> : null}

            {twoPart ? (
              <div className="mt-4 space-y-6">
                <p className="text-xs text-ink-500">
                  This is a Grand Finale team.{' '}
                  {hasChallenge
                    ? `Score it in four ordered steps — the ${labelA} project, then the ${labelA} challenge, then the ${labelB} project, then the ${labelB} challenge.`
                    : `You submit two separate evaluations — ${labelA}, then ${labelB}.`}{' '}
                  {labelB} unlocks only after {labelA} is submitted, and submitted evaluations cannot be edited.
                </p>

                <StepStrip steps={stepperSteps} position={stepperPosition} />

                {/* Evaluation 1 summary once submitted — read-only recap */}
                {statusA === 'submitted' ? (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-ink-900">Evaluation 1 — {labelA} ✓ submitted</p>
                      <span className="font-mono text-xs font-semibold text-ink-900">{totalsA.total} / {totalsA.max}</span>
                    </div>
                    {feedbackA ? <p className="mt-1 text-xs text-ink-600">“{feedbackA}”</p> : null}
                  </div>
                ) : null}

                {/* Active: Evaluation 1 (Part A) — project first, then the challenge. */}
                {activeStep === 'A' ? (
                  <div>
                    <h3 className="font-display text-base font-semibold text-ink-900">
                      Evaluation 1 of 2 — {labelA}
                    </h3>
                    <p className="mt-1 text-[11px] text-ink-500">
                      {hasChallenge
                        ? microStep === 'challenge'
                          ? `Step 2 of 4 — score the Universal Challenge as demonstrated in ${labelA}.`
                          : 'Step 1 of 4 — score the project that qualified this team for the finals.'
                        : 'Score the project that qualified this team for the finals.'}
                    </p>

                    {!hasChallenge || microStep === 'project' ? (
                      <div className="mt-4">
                        <RubricSliders criteria={criteriaA} scores={scoresA} onChange={updateScoreA} canEdit={canEditA} />
                      </div>
                    ) : null}

                    {hasChallenge && microStep === 'challenge' ? (
                      <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
                        <div className="mb-3 flex items-center gap-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600">
                            <Zap className="h-4 w-4" />
                          </span>
                          <div className="min-w-0">
                            <h4 className="font-display text-sm font-semibold text-ink-900">Universal Challenge</h4>
                            <p className="text-[11px] text-ink-500">Common to all teams · counts inside {labelA}</p>
                          </div>
                        </div>
                        <RubricSliders criteria={criteriaU} scores={scoresA} onChange={updateScoreA} canEdit={canEditA} />
                      </div>
                    ) : null}

                    {!hasChallenge || microStep === 'challenge' ? (
                      <div className="mt-4">
                        <Textarea
                          label={`Remarks — ${labelA}`}
                          value={feedbackA}
                          disabled={!canEditA}
                          onChange={(e) => updateFeedbackA(e.target.value)}
                          rows={4}
                        />
                      </div>
                    ) : null}

                    <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                      <Button variant="secondary" type="button" disabled={!canEditA} className="gap-2" onClick={saveDraftNow}>
                        <Save className="h-4 w-4" />
                        Save draft
                      </Button>
                      {hasChallenge && microStep === 'project' ? (
                        <Button variant="primary" type="button" className="gap-2" onClick={() => setMicroStep('challenge')}>
                          Next: {labelA} Challenge
                          <ArrowRight className="h-4 w-4" />
                        </Button>
                      ) : (
                        <>
                          {hasChallenge ? (
                            <Button variant="secondary" type="button" className="gap-2" onClick={() => setMicroStep('project')}>
                              <ArrowLeft className="h-4 w-4" />
                              Back
                            </Button>
                          ) : null}
                          <Button variant="primary" type="button" disabled={!canEditA} className="gap-2" onClick={() => submitPart('A')}>
                            <Send className="h-4 w-4" />
                            Submit Evaluation 1
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ) : null}

                {/* Active: Evaluation 2 (Part B) — project first, then the challenge.
                    Unlocks only after Evaluation 1 (Part A) is submitted. */}
                {activeStep === 'B' ? (
                  <div className="border-t border-[rgb(var(--border))] pt-6">
                    <h3 className="font-display text-base font-semibold text-ink-900">
                      Evaluation 2 of 2 — {labelB}
                    </h3>
                    <p className="mt-1 text-[11px] text-ink-500">
                      {hasChallenge
                        ? microStep === 'challenge'
                          ? `Step 4 of 4 — score the Universal Challenge as demonstrated in ${labelB}.`
                          : "Step 3 of 4 — score the team's response to the new / Super problem statement."
                        : "Score the team's response to the new problem statement / challenge."}
                    </p>

                    {!hasChallenge || microStep === 'project' ? (
                      <div className="mt-4">
                        <RubricSliders criteria={criteriaB} scores={scoresB} onChange={updateScoreB} canEdit={canEditB} />
                      </div>
                    ) : null}

                    {hasChallenge && microStep === 'challenge' ? (
                      <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
                        <div className="mb-3 flex items-center gap-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600">
                            <Zap className="h-4 w-4" />
                          </span>
                          <div className="min-w-0">
                            <h4 className="font-display text-sm font-semibold text-ink-900">Universal Challenge</h4>
                            <p className="text-[11px] text-ink-500">Common to all teams · counts inside {labelB}</p>
                          </div>
                        </div>
                        <RubricSliders criteria={criteriaU} scores={scoresB} onChange={updateScoreB} canEdit={canEditB} />
                      </div>
                    ) : null}

                    {!hasChallenge || microStep === 'challenge' ? (
                      <>
                        <div className="mt-4">
                          <Textarea
                            label={`Remarks — ${labelB}`}
                            value={feedbackB}
                            disabled={!canEditB}
                            onChange={(e) => updateFeedbackB(e.target.value)}
                            rows={4}
                          />
                        </div>

                        {/* Team status — required before this final submission completes the evaluation. */}
                        <div className="mt-4">
                          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
                            Team status <span className="text-red-500">*</span>
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {[['qualified', 'Qualified'], ['waitlist', 'Waitlist'], ['not_qualified', 'Not Qualified']].map(([val, label]) => {
                              const active = juryStatus === val
                              return (
                                <Button
                                  key={val}
                                  type="button"
                                  size="sm"
                                  variant={active ? 'primary' : 'secondary'}
                                  disabled={statusBusy || !canEditB}
                                  onClick={() => updateJuryStatus(active ? '' : val)}
                                >
                                  {label}{active ? ' ✓' : ''}
                                </Button>
                              )
                            })}
                          </div>
                          <p className="mt-1 text-[11px] text-ink-400">Required before you can submit Evaluation 2.</p>
                        </div>
                      </>
                    ) : null}

                    <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                      <Button variant="secondary" type="button" disabled={!canEditB} className="gap-2" onClick={saveDraftNow}>
                        <Save className="h-4 w-4" />
                        Save draft
                      </Button>
                      {hasChallenge && microStep === 'project' ? (
                        <Button variant="primary" type="button" className="gap-2" onClick={() => setMicroStep('challenge')}>
                          Next: {labelB} Challenge
                          <ArrowRight className="h-4 w-4" />
                        </Button>
                      ) : (
                        <>
                          {hasChallenge ? (
                            <Button variant="secondary" type="button" className="gap-2" onClick={() => setMicroStep('project')}>
                              <ArrowLeft className="h-4 w-4" />
                              Back
                            </Button>
                          ) : null}
                          <Button variant="primary" type="button" disabled={!canEditB || !juryStatus} className="gap-2" onClick={() => submitPart('B')}>
                            <Send className="h-4 w-4" />
                            Submit Evaluation 2 (final)
                          </Button>
                        </>
                      )}
                    </div>
                    {canEditB && (!hasChallenge || microStep === 'challenge') && !juryStatus ? (
                      <p className="mt-2 text-xs text-amber-600">Set the team status above to enable the final submission.</p>
                    ) : null}
                  </div>
                ) : null}

                {/* Both done */}
                {activeStep === 'done' ? (
                  <div className="rounded-xl border border-brand-500/30 bg-brand-500/5 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Final Score</p>
                    <p className="mt-1 font-display text-3xl font-bold text-brand-700">
                      {evaluation?.finalScorePct != null ? `${evaluation.finalScorePct}%` : '—'}
                    </p>
                    <p className="mt-2 text-[11px] text-ink-500">
                      {labelA}: {totalsA.total} / {totalsA.max} · {labelB}: {totalsB.total} / {totalsB.max}
                    </p>
                    {feedbackB ? (
                      <div className="mt-3 border-t border-brand-500/20 pt-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">
                          Remarks — {labelB}
                        </p>
                        <p className="mt-0.5 text-xs text-ink-700">{feedbackB}</p>
                      </div>
                    ) : null}
                    <p className="mt-3 text-xs text-emerald-700">
                      Both evaluations are submitted and locked. Thank you.
                    </p>
                  </div>
                ) : null}
              </div>
            ) : (
              <>
                <p className="mt-2 text-xs text-ink-500">
                  Tab through sliders, type remarks, drafts autosave. Final submit locks your sheet from further edits.
                </p>

                <div className="mt-4">
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
                    Team status <span className="text-red-500">*</span>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {[['qualified', 'Qualified'], ['waitlist', 'Waitlist'], ['not_qualified', 'Not Qualified']].map(([val, label]) => {
                      const active = juryStatus === val
                      return (
                        <Button
                          key={val}
                          type="button"
                          size="sm"
                          variant={active ? 'primary' : 'secondary'}
                          disabled={statusBusy || !canEditAtAll}
                          onClick={() => updateJuryStatus(active ? '' : val)}
                        >
                          {label}{active ? ' ✓' : ''}
                        </Button>
                      )
                    })}
                  </div>
                  <p className="mt-1 text-[11px] text-ink-400">Required before you can submit your evaluation.</p>
                </div>

                <div className="mt-6">
                  <RubricSliders criteria={criteria} scores={scores} onChange={updateScore} canEdit={canEditAtAll} />
                </div>

                <div className="mt-6">
                  <Textarea
                    label="Remarks for organizers / finalists"
                    value={feedback}
                    disabled={!canEditAtAll}
                    onChange={(e) => updateFeedback(e.target.value)}
                    rows={5}
                  />
                </div>

                <div className="mt-6 flex flex-col gap-2 sm:flex-row">
                  <Button variant="secondary" type="button" disabled={!canEditAtAll} className="gap-2" onClick={saveDraftNow}>
                    <Save className="h-4 w-4" />
                    Save draft now
                  </Button>
                  <Button variant="primary" type="button" disabled={!canEditAtAll || !juryStatus} className="gap-2" onClick={submitSingleFinal}>
                    <Send className="h-4 w-4" />
                    Submit final
                  </Button>
                </div>
                {canEditAtAll && !juryStatus ? (
                  <p className="mt-2 text-xs text-amber-600">Set the team status above (Qualified / Waitlist / Not Qualified) to enable submission.</p>
                ) : null}
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
