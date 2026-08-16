import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Gavel, Users, CheckCircle2, Clock, Trash2 } from 'lucide-react'
import { usePageSeo } from '@/hooks/usePageSeo.js'
import { useApi } from '@/hooks/useApi.js'
import { Card } from '@/components/ui/Card.jsx'
import { Badge } from '@/components/ui/Badge.jsx'
import { Skeleton } from '@/components/ui/Skeleton.jsx'

// Team qualification status (set by judges) — shown per team card.
const JURY_STATUS_TONE = { qualified: 'success', waitlist: 'warn', not_qualified: 'danger' }
const JURY_STATUS_LABEL = { qualified: 'Qualified', waitlist: 'Waitlist', not_qualified: 'Not Qualified' }

/** Total + max + per-criterion breakdown for one evaluation, from its snapshot. */
function marksOf(ev) {
  if (!ev?.scores || typeof ev.scores !== 'object') return null
  const entries = Object.entries(ev.scores).filter(([, v]) => Number.isFinite(Number(v)))
  if (entries.length === 0) return null
  const total = entries.reduce((a, [, v]) => a + Number(v), 0)
  const crit = Array.isArray(ev.evaluationCriteria) ? ev.evaluationCriteria : []
  const critByKey = new Map(crit.map((c) => [c.key, c]))
  const max = crit.length
    ? crit.reduce((s, c) => s + (Number(c.maxScore) > 0 ? Number(c.maxScore) : 10), 0)
    : entries.length * 10
  const breakdown = entries.map(([k, v]) => ({
    key: k,
    label: critByKey.get(k)?.label || k,
    value: Number(v),
    max: Number(critByKey.get(k)?.maxScore) > 0 ? Number(critByKey.get(k).maxScore) : 10,
  }))
  return { total: Math.round(total * 10) / 10, max, breakdown, pct: max > 0 ? Math.round((total / max) * 1000) / 10 : 0 }
}

function fmtDate(v) {
  if (!v) return null
  try {
    if (typeof v === 'string') return new Date(v).toLocaleString('en-IN')
    if (typeof v?.toDate === 'function') return v.toDate().toLocaleString('en-IN')
    if (typeof v?._seconds === 'number') return new Date(v._seconds * 1000).toLocaleString('en-IN')
    if (typeof v?.seconds === 'number') return new Date(v.seconds * 1000).toLocaleString('en-IN')
  } catch { /* ignore */ }
  return null
}

export function AdminJudgeEvaluationsPage() {
  const { judgeId } = useParams()
  const api = useApi()
  usePageSeo({ title: 'Judge Evaluations', description: 'Teams and marks given by a judge.' })

  const [loading, setLoading] = useState(true)
  const [judge, setJudge] = useState(null)
  const [evals, setEvals] = useState([])
  const [teamsMap, setTeamsMap] = useState(new Map())
  const [psMap, setPsMap] = useState(new Map())

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [allEvals, users, teams, ps] = await Promise.all([
        api.adminEvaluations().catch(() => []),
        api.listUsers().catch(() => []),
        api.adminTeams().catch(() => []),
        api.listAdminProblemStatements().catch(() => []),
      ])
      const u = (Array.isArray(users) ? users : []).find((x) => x.id === judgeId)
      setJudge(u ? { id: u.id, name: u.displayName || u.email || u.id, email: u.email || '' } : { id: judgeId, name: 'Unknown judge', email: '' })
      setEvals((Array.isArray(allEvals) ? allEvals : []).filter((e) => e.judgeId === judgeId))
      const tMap = new Map()
      for (const t of (Array.isArray(teams) ? teams : [])) tMap.set(t.id, t)
      setTeamsMap(tMap)
      const pMap = new Map()
      for (const p of (Array.isArray(ps) ? ps : [])) pMap.set(p.id, p.title || p.id)
      setPsMap(pMap)
    } catch {
      setEvals([])
    } finally {
      setLoading(false)
    }
  }, [api, judgeId])

  useEffect(() => { void load() }, [load])

  async function deleteEvaluation(ev) {
    const teamName = ev?.teamId || ''
    if (!window.confirm('Delete this judge\u2019s evaluation for this team? The judge can then re-evaluate. This cannot be undone.')) return
    try {
      await api.deleteAdminEvaluation(ev.id)
      setEvals((prev) => prev.filter((e) => e.id !== ev.id))
    } catch (e) {
      window.alert(e?.message || 'Delete failed')
    }
    void teamName
  }

  const sorted = useMemo(() => {
    return evals.slice().sort((a, b) => {
      const an = teamsMap.get(a.teamId)?.name || a.teamId
      const bn = teamsMap.get(b.teamId)?.name || b.teamId
      return String(an).localeCompare(String(bn))
    })
  }, [evals, teamsMap])

  const submitted = evals.filter((e) => e.evaluationStatus === 'submitted').length
  const drafts = evals.filter((e) => e.evaluationStatus === 'draft').length

  if (loading) return <Skeleton className="h-96 w-full rounded-2xl" />

  return (
    <div className="w-full max-w-5xl space-y-6">
      <Link to="/admin/evaluations" className="inline-flex items-center gap-2 text-sm font-medium text-brand-600 hover:underline">
        <ArrowLeft className="h-4 w-4" /> Back to Evaluations
      </Link>

      {/* Judge header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600">
            <Gavel className="h-6 w-6" />
          </span>
          <div>
            <h1 className="font-display text-2xl font-bold text-ink-900">{judge?.name}</h1>
            {judge?.email ? <p className="text-sm text-ink-500">{judge.email}</p> : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone="neutral"><Users className="mr-1 h-3 w-3" />{evals.length} team{evals.length === 1 ? '' : 's'}</Badge>
          <Badge tone="success">{submitted} submitted</Badge>
          {drafts > 0 ? <Badge tone="warn">{drafts} draft</Badge> : null}
        </div>
      </div>

      {sorted.length === 0 ? (
        <Card className="py-12 text-center">
          <Gavel className="mx-auto h-10 w-10 text-ink-300" />
          <p className="mt-3 font-display text-lg font-semibold text-ink-900">No evaluations yet</p>
          <p className="mt-1 text-sm text-ink-600">This judge hasn&apos;t evaluated any team yet.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {sorted.map((ev) => {
            const team = teamsMap.get(ev.teamId)
            const marks = marksOf(ev)
            const status = String(ev.evaluationStatus || 'pending')
            const psId = ev.problemStatementId || team?.problemStatementId || ''
            const psTitle = psId ? (psMap.get(psId) || psId) : '—'
            return (
              <Card key={ev.id || `${ev.judgeId}_${ev.teamId}`} className="space-y-4">
                {/* Team + status + total marks */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-display text-lg font-bold text-ink-900">{team?.name || ev.teamId}</h2>
                      <Badge tone={status === 'submitted' ? 'success' : status === 'draft' ? 'warn' : 'neutral'} className="gap-1">
                        {status === 'submitted' ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}{status}
                      </Badge>
                      {team?.juryStatus ? (
                        <Badge tone={JURY_STATUS_TONE[team.juryStatus] || 'neutral'}>
                          {JURY_STATUS_LABEL[team.juryStatus] || team.juryStatus}
                        </Badge>
                      ) : (
                        <Badge tone="neutral">Status: Unset</Badge>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-ink-600">
                      <span className="font-medium text-ink-700">Problem:</span> {psTitle}
                      {psId ? <span className="ml-1 font-mono text-[11px] text-ink-400">({psId})</span> : null}
                    </p>
                    {team?.inviteCode ? <p className="text-xs text-ink-400">Team code: <span className="font-mono">{team.inviteCode}</span></p> : null}
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="text-right">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">Total marks</p>
                      {marks ? (
                        <p className="font-display text-2xl font-bold text-ink-900">
                          {marks.total}<span className="text-base font-medium text-ink-400"> / {marks.max}</span>
                        </p>
                      ) : (
                        <p className="font-display text-xl font-bold text-ink-400">—</p>
                      )}
                      {marks ? <p className="text-xs text-brand-600">{marks.pct}%</p> : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteEvaluation(ev)}
                      title="Delete this evaluation"
                      className="mt-1 rounded-lg p-2 text-red-600 transition-colors hover:bg-red-500/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Per-criterion breakdown */}
                {marks?.breakdown?.length ? (
                  <div className="overflow-x-auto rounded-xl border border-[rgb(var(--border))]">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-[rgb(var(--surface-muted))] text-xs uppercase tracking-wide text-ink-500">
                        <tr>
                          <th className="px-3 py-2 font-medium">Criterion</th>
                          <th className="px-3 py-2 font-medium text-right">Score</th>
                          <th className="px-3 py-2 font-medium">Bar</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[rgb(var(--border))]">
                        {marks.breakdown.map((b) => (
                          <tr key={b.key}>
                            <td className="px-3 py-2 text-ink-800">{b.label}</td>
                            <td className="px-3 py-2 text-right font-mono text-ink-900">{b.value} / {b.max}</td>
                            <td className="px-3 py-2">
                              <div className="h-2 w-full max-w-[200px] overflow-hidden rounded-full bg-[rgb(var(--surface-muted))]">
                                <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-400" style={{ width: `${b.max > 0 ? Math.min(100, (b.value / b.max) * 100) : 0}%` }} />
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-ink-400">No scores recorded.</p>
                )}

                {/* Feedback + meta */}
                {ev.feedback ? (
                  <div className="rounded-xl bg-[rgb(var(--surface-muted))]/40 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">Judge remarks</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-ink-700">{ev.feedback}</p>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-4 text-xs text-ink-400">
                  {fmtDate(ev.submittedAt) ? <span>Submitted: {fmtDate(ev.submittedAt)}</span> : null}
                  {fmtDate(ev.updatedAt) ? <span>Updated: {fmtDate(ev.updatedAt)}</span> : null}
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
