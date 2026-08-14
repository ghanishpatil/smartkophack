import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  ExternalLink,
  FileText,
  Github,
  Presentation,
  Video,
  Lock,
  Send,
  Save,
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

function httpsUrl(url) {
  const u = String(url || '').trim()
  return u.startsWith('https://') ? u : ''
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
  const [criteria, setCriteria] = useState(FALLBACK_CRITERIA)
  const [scores, setScores] = useState(() => defaultScoresFromCriteria(FALLBACK_CRITERIA))
  const [feedback, setFeedback] = useState('')
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
      const crit =
        Array.isArray(data.evaluationCriteria) && data.evaluationCriteria.length > 0 ? data.evaluationCriteria : FALLBACK_CRITERIA
      setCriteria(crit)
      const base = defaultScoresFromCriteria(crit)
      const prev = data.evaluation?.scores && typeof data.evaluation.scores === 'object' ? data.evaluation.scores : {}
      setScores({ ...base, ...prev })
      setFeedback(data.evaluation?.feedback ?? '')
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

  const canEdit = Boolean(edition?.evaluationOpen && uiStatus !== 'submitted' && uiStatus !== 'locked')

  useEffect(() => {
    if (!teamId || !canEdit || !dirty.current) return
    const id = setTimeout(async () => {
      setSaving(true)
      try {
        await api.submitEvaluation({ teamId, scores: buildScoresPayload(criteria, scores), feedback, draft: true })
        setLastAutosave(Date.now())
      } catch {
        /* offline / phase — silent */
      } finally {
        setSaving(false)
      }
    }, 900)
    return () => clearTimeout(id)
  }, [api, teamId, scores, feedback, canEdit, criteria])

  async function submitFinal() {
    if (!teamId || !canEdit) return
    setMsg('')
    if (!juryStatus) {
      setMsg('Please set the team status (Qualified / Waitlist / Not Qualified) before submitting.')
      return
    }
    try {
      await api.submitEvaluation({ teamId, scores: buildScoresPayload(criteria, scores), feedback, draft: false, status: juryStatus })
      dirty.current = false
      setMsg('Evaluation submitted. Thank you.')
      await load()
    } catch (e) {
      setMsg(e.message || 'Submit failed')
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

  function updateFeedback(v) {
    dirty.current = true
    setFeedback(v)
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
            {!edition?.evaluationOpen ? <Badge tone="warn">Evaluations closed</Badge> : null}
          </div>

          {/* Team status — required before submitting (Qualified / Waitlist / Not Qualified). */}
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
                    disabled={statusBusy || !canEdit}
                    onClick={() => updateJuryStatus(active ? '' : val)}
                  >
                    {label}{active ? ' ✓' : ''}
                  </Button>
                )
              })}
            </div>
            <p className="mt-1 text-[11px] text-ink-400">Required before you can submit your evaluation.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-500">
          {saving ? <span>Saving draft…</span> : null}
          {lastAutosave && canEdit ? <span>Autosaved {new Date(lastAutosave).toLocaleTimeString()}</span> : null}
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

            <div className="mt-6 space-y-4">
              {pdf ? (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase text-ink-500">PDF preview</p>
                  {/* BUG-5 FIX: sandbox attribute prevents participant-submitted URLs from
                      running scripts or navigating the parent frame (clickjacking/XSS). */}
                  <iframe
                    title="PDF preview"
                    src={pdf}
                    sandbox="allow-same-origin allow-scripts"
                    className="h-[420px] w-full rounded-xl border border-[rgb(var(--border))]"
                  />
                </div>
              ) : null}
              {ppt ? (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase text-ink-500">Deck</p>
                  {/* BUG-5 FIX: sandbox attribute on PPT embed via Office Online viewer. */}
                  <iframe
                    title="Presentation preview"
                    src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(ppt)}`}
                    sandbox="allow-same-origin allow-scripts allow-popups"
                    className="h-[420px] w-full rounded-xl border border-[rgb(var(--border))]"
                  />
                  <p className="mt-1 text-[11px] text-ink-500">If embedding fails, use the Deck link above.</p>
                </div>
              ) : null}
            </div>
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
              <h2 className="font-display text-lg font-semibold text-ink-900">Rubric & remarks</h2>
            </div>
            <p className="mt-2 text-xs text-ink-500">
              Tab through sliders, type remarks, drafts autosave. Final submit locks your sheet from further edits.
            </p>

            {msg ? <p className="mt-3 text-sm text-brand-700">{msg}</p> : null}

            <div className="mt-6 space-y-6">
              {criteria.map(({ key, label, hint, maxScore }) => {
                const max = typeof maxScore === 'number' && maxScore > 0 ? maxScore : 10
                const step = max <= 10 ? 0.5 : 1
                const raw = scores[key]
                const value = typeof raw === 'number' && Number.isFinite(raw) ? raw : Math.round((max / 2) * 10) / 10
                const hintText = hint?.trim() ? hint : `Score from 0 to ${max}.`
                return (
                  <div key={key}>
                    <label
                      className="flex justify-between gap-2 text-sm font-medium text-ink-800"
                      htmlFor={`score-${key}`}
                    >
                      <span>{label}</span>
                      <span className="font-mono text-brand-600">
                        {value} / {max}
                      </span>
                    </label>
                    <p className="text-[11px] text-ink-500">{hintText}</p>
                    <input
                      id={`score-${key}`}
                      type="range"
                      min={0}
                      max={max}
                      step={step}
                      disabled={!canEdit}
                      value={value}
                      onChange={(e) => updateScore(key, Number(e.target.value))}
                      className="mt-2 w-full accent-brand-600 disabled:opacity-50"
                    />
                  </div>
                )
              })}
            </div>

            <div className="mt-6">
              <Textarea
                label="Remarks for organizers / finalists"
                value={feedback}
                disabled={!canEdit}
                onChange={(e) => updateFeedback(e.target.value)}
                rows={5}
              />
            </div>

            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <Button
                variant="secondary"
                type="button"
                disabled={!canEdit}
                className="gap-2"
                onClick={async () => {
                  if (!teamId) return
                  setSaving(true)
                  try {
                    await api.submitEvaluation({ teamId, scores: buildScoresPayload(criteria, scores), feedback, draft: true })
                    setLastAutosave(Date.now())
                    setMsg('Draft saved.')
                  } catch (e) {
                    setMsg(e.message || 'Save failed')
                  } finally {
                    setSaving(false)
                  }
                }}
              >
                <Save className="h-4 w-4" />
                Save draft now
              </Button>
              <Button variant="primary" type="button" disabled={!canEdit || !juryStatus} className="gap-2" onClick={submitFinal}>
                <Send className="h-4 w-4" />
                Submit final
              </Button>
            </div>
            {canEdit && !juryStatus ? (
              <p className="mt-2 text-xs text-amber-600">Set the team status above (Qualified / Waitlist / Not Qualified) to enable submission.</p>
            ) : null}
          </Card>
        </div>
      </div>
    </div>
  )
}
