import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { usePageSeo } from '@/hooks/usePageSeo.js'
import { useApi } from '@/hooks/useApi.js'
import { useResolvedEventId } from '@/hooks/useResolvedEventId.js'
import { DataTable } from '@/components/admin/DataTable.jsx'
import { Badge } from '@/components/ui/Badge.jsx'
import { Button } from '@/components/ui/Button.jsx'
import { Card } from '@/components/ui/Card.jsx'
import { Skeleton } from '@/components/ui/Skeleton.jsx'
import { Textarea } from '@/components/ui/Input.jsx'
import { useAdminFiltersStore } from '@/stores/adminFiltersStore.js'
import {
  EVALUATION_CRITERIA_TEMPLATE_CSV,
  parseCriterionLines,
  splitPasteGrid,
} from '@/utils/evaluationCriteriaCsv.js'

const col = createColumnHelper()

export function AdminEvaluationsPage() {
  usePageSeo({ title: 'Evaluations', description: 'Evaluation queue analytics.' })
  const api = useApi()
  const { eventId } = useResolvedEventId()
  const fileRef = useRef(null)

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const globalFilter = useAdminFiltersStore((s) => s.evaluationsGlobalFilter)
  const setGlobalFilter = useAdminFiltersStore((s) => s.setEvaluationsGlobalFilter)

  const [criteriaDraft, setCriteriaDraft] = useState([])
  const [criteriaPaste, setCriteriaPaste] = useState('')
  const [criteriaLoading, setCriteriaLoading] = useState(false)
  const [criteriaSaving, setCriteriaSaving] = useState(false)
  const [criteriaMsg, setCriteriaMsg] = useState('')
  const [criteriaErr, setCriteriaErr] = useState('')
  const [criteriaScopedEventId, setCriteriaScopedEventId] = useState('')

  const rubricEventId = criteriaScopedEventId || eventId

  const [usersMap, setUsersMap] = useState(new Map())
  const [teamsMap, setTeamsMap] = useState(new Map())

  const loadEvaluations = useCallback(async () => {
    setLoading(true)
    try {
      const [data, users, teams] = await Promise.all([
        api.adminEvaluations(),
        api.listUsers().catch(() => []),
        api.adminTeams().catch(() => []),
      ])
      setRows(Array.isArray(data) ? data : [])
      const uMap = new Map()
      for (const u of (Array.isArray(users) ? users : [])) {
        uMap.set(u.id, u.displayName || u.email || u.id)
      }
      setUsersMap(uMap)
      const tMap = new Map()
      for (const t of (Array.isArray(teams) ? teams : [])) {
        tMap.set(t.id, t.name || t.id)
      }
      setTeamsMap(tMap)
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [api])

  const loadCriteria = useCallback(async () => {
    setCriteriaLoading(true)
    setCriteriaErr('')
    try {
      const data = await api.getAdminEvaluationCriteria()
      const id = typeof data?.eventId === 'string' ? data.eventId.trim() : ''
      if (id) setCriteriaScopedEventId(id)
      const list = Array.isArray(data?.criteria) ? data.criteria : []
      setCriteriaDraft(list)
    } catch (e) {
      setCriteriaErr(e.message || 'Could not load criteria')
      setCriteriaDraft([])
    } finally {
      setCriteriaLoading(false)
    }
  }, [api])

  useEffect(() => {
    void loadEvaluations()
  }, [loadEvaluations])

  useEffect(() => {
    void loadCriteria()
  }, [loadCriteria])

  const columns = useMemo(
    () => [
      col.accessor('judgeId', {
        header: 'Judge',
        cell: (i) => <span className="text-sm font-medium text-ink-900">{usersMap.get(i.getValue()) || 'Unknown'}</span>,
      }),
      col.accessor('teamId', {
        header: 'Team',
        cell: (i) => <span className="text-sm text-ink-800">{teamsMap.get(i.getValue()) || i.getValue()}</span>,
      }),
      col.accessor('evaluationStatus', {
        header: 'Status',
        cell: (i) => {
          const s = String(i.getValue() || '')
          return <Badge tone={s === 'submitted' ? 'success' : s === 'draft' ? 'warn' : 'neutral'}>{s || 'pending'}</Badge>
        },
      }),
      col.accessor('problemStatementId', {
        header: 'Problem',
        cell: (i) => <span className="text-xs text-ink-500">{String(i.getValue() || '—').slice(0, 20)}</span>,
      }),
    ],
    // BUG-4 FIX: usersMap and teamsMap are used inside cell renderers — they must be
    // in the dependency array. Without this, cells always show stale data after maps load.
    [usersMap, teamsMap],
  )

  const submitted = rows.filter((r) => r.evaluationStatus === 'submitted').length
  const draft = rows.filter((r) => r.evaluationStatus === 'draft').length

  function applyParsedToDraft(parsed) {
    setCriteriaDraft(parsed)
    setCriteriaMsg(`Loaded ${parsed.length} criterion row(s). Save to apply for this hackathon.`)
    setCriteriaErr('')
  }

  function onPasteApply() {
    const grid = splitPasteGrid(criteriaPaste)
    const parsed = parseCriterionLines(grid)
    if (parsed.length === 0) {
      setCriteriaErr('No criteria rows found. Use columns key, label, maxScore, hint — or a single column of labels.')
      return
    }
    applyParsedToDraft(parsed)
  }

  async function onCsvFileChange(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    try {
      const text = await f.text()
      const parsed = parseCriterionLines(splitPasteGrid(text))
      if (parsed.length === 0) {
        setCriteriaErr('No criteria rows found in file.')
        return
      }
      applyParsedToDraft(parsed)
    } catch (err) {
      setCriteriaErr(err.message || 'Could not read file')
    }
  }

  function downloadTemplate() {
    const blob = new Blob([EVALUATION_CRITERIA_TEMPLATE_CSV], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'evaluation-criteria-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function saveCriteria() {
    if (!rubricEventId) return
    setCriteriaSaving(true)
    setCriteriaErr('')
    setCriteriaMsg('')
    try {
      await api.patchAdminEvent(rubricEventId, { evaluationCriteria: criteriaDraft })
      setCriteriaMsg('Evaluation criteria saved. Judges will see this rubric on the next review load.')
      await loadCriteria()
    } catch (e) {
      setCriteriaErr(e.message || 'Save failed')
    } finally {
      setCriteriaSaving(false)
    }
  }

  async function clearCustomCriteria() {
    if (!rubricEventId) return
    if (!window.confirm('Remove custom criteria for this hackathon? Judges fall back to the built-in default rubric.'))
      return
    setCriteriaSaving(true)
    setCriteriaErr('')
    setCriteriaMsg('')
    try {
      await api.patchAdminEvent(rubricEventId, { evaluationCriteria: null })
      setCriteriaMsg('Custom criteria cleared.')
      await loadCriteria()
    } catch (e) {
      setCriteriaErr(e.message || 'Could not clear criteria')
    } finally {
      setCriteriaSaving(false)
    }
  }

  if (loading) return <Skeleton className="h-96 w-full rounded-2xl" />

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink-900">Evaluations</h1>
          <p className="mt-2 text-sm text-ink-600">
            Aggregated Firestore evaluation docs. Reopening flows require judges to POST updated payloads during `EVALUATION`
            phase.
          </p>
        </div>
        <Badge tone="success">{submitted} submitted</Badge>
        <Badge tone="warn">{draft} drafts</Badge>
      </div>

      <Card className="space-y-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink-900">Evaluation rubric (CSV)</h2>
          <p className="mt-1 text-sm text-ink-600">
            Upload a CSV (Excel: Save As → CSV UTF-8), paste rows from a spreadsheet, or download the template. The same
            criteria apply to all jury scoring for this hackathon (rounds, deck, and remarks).
          </p>
          <p className="mt-2 text-xs text-ink-500">
            Columns: <span className="font-mono">key</span> (optional), <span className="font-mono">label</span>,{' '}
            <span className="font-mono">maxScore</span> (optional, default 10), <span className="font-mono">hint</span>{' '}
            (optional). Label-only rows get stable keys generated on save.
          </p>
        </div>

        {criteriaErr ? <p className="text-sm text-red-600">{criteriaErr}</p> : null}
        {criteriaMsg ? <p className="text-sm text-brand-700">{criteriaMsg}</p> : null}

        <div className="flex flex-wrap gap-2">
          <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={onCsvFileChange} />
          <Button type="button" variant="secondary" disabled={criteriaLoading} onClick={() => fileRef.current?.click()}>
            Upload CSV
          </Button>
          <Button type="button" variant="secondary" disabled={criteriaLoading} onClick={downloadTemplate}>
            Download template
          </Button>
          <Button type="button" variant="secondary" disabled={criteriaLoading || criteriaSaving} onClick={() => void loadCriteria()}>
            Reload from server
          </Button>
          <Button type="button" variant="secondary" disabled={!rubricEventId || criteriaSaving} onClick={clearCustomCriteria}>
            Clear custom → default rubric
          </Button>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <Textarea
              label="Paste from Excel / Sheets (TSV or CSV)"
              rows={6}
              value={criteriaPaste}
              disabled={criteriaLoading}
              placeholder="Paste header + rows, or label-only lines…"
              onChange={(e) => setCriteriaPaste(e.target.value)}
            />
            <Button type="button" className="mt-2" variant="secondary" disabled={criteriaLoading} onClick={onPasteApply}>
              Apply paste to preview
            </Button>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase text-ink-500">Preview ({criteriaDraft.length})</p>
            {criteriaLoading ? (
              <Skeleton className="h-40 w-full rounded-xl" />
            ) : criteriaDraft.length === 0 ? (
              <p className="text-sm text-ink-500">No rows yet — upload, paste, or reload.</p>
            ) : (
              <div className="max-h-52 overflow-auto rounded-xl border border-[rgb(var(--border))]">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-[rgb(var(--surface-muted))]">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Key</th>
                      <th className="px-3 py-2 font-semibold">Label</th>
                      <th className="px-3 py-2 font-semibold">Max</th>
                      <th className="px-3 py-2 font-semibold">Hint</th>
                    </tr>
                  </thead>
                  <tbody>
                    {criteriaDraft.map((r, idx) => (
                      <tr key={`${r.key || 'k'}-${idx}`} className="border-t border-[rgb(var(--border))]">
                        <td className="px-3 py-2 font-mono text-[11px]">{r.key || '—'}</td>
                        <td className="px-3 py-2">{r.label}</td>
                        <td className="px-3 py-2">{r.maxScore ?? 10}</td>
                        <td className="px-3 py-2 text-ink-500">{r.hint || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="primary"
            disabled={!rubricEventId || criteriaSaving || criteriaDraft.length === 0}
            onClick={saveCriteria}
          >
            Save rubric
          </Button>
          <span className="self-center text-xs text-ink-500">
            Saves to the active hackathon event document. Clearing custom removes that field so the built-in default rubric applies again.
          </span>
        </div>
      </Card>

      <DataTable columns={columns} data={rows} globalFilter={globalFilter} onGlobalFilterChange={setGlobalFilter} />

      {/* Score Distribution & Insights */}
      {submitted > 0 && <EvaluationInsights evaluations={rows} usersMap={usersMap} teamsMap={teamsMap} />}
    </div>
  )
}

/** Score distribution visualization */
function EvaluationInsights({ evaluations, usersMap = new Map(), teamsMap = new Map() }) {
  const submitted = evaluations.filter((e) => e.evaluationStatus === 'submitted')
  if (submitted.length === 0) return null

  /**
   * Issue B fix: Normalize scores to 0–100% before aggregating.
   * Raw sums are not comparable when rubrics differ (e.g. 4 criteria × 10 = 40 max
   * vs 6 criteria × 10 = 60 max). We compute each evaluation's score as a percentage
   * of its own maximum possible score, making rankings fair across rubric versions.
   *
   * If an evaluation has no criteria metadata stored, we fall back to raw sum / 40
   * (the legacy 4-criterion default max) to avoid dividing by zero.
   */
  function normalizedPct(ev) {
    if (!ev.scores || typeof ev.scores !== 'object') return 0
    const vals = Object.values(ev.scores).map(Number).filter(Number.isFinite)
    if (vals.length === 0) return 0
    const rawTotal = vals.reduce((a, b) => a + b, 0)
    // Use stored criteria to compute the true maximum possible score for this eval
    const criteria = Array.isArray(ev.evaluationCriteria) && ev.evaluationCriteria.length > 0
      ? ev.evaluationCriteria
      : null
    const maxPossible = criteria
      ? criteria.reduce((sum, c) => sum + (typeof c.maxScore === 'number' && c.maxScore > 0 ? c.maxScore : 10), 0)
      : vals.length * 10 // fallback: assume 10 per criterion
    return maxPossible > 0 ? Math.round((rawTotal / maxPossible) * 1000) / 10 : 0 // 0–100.0
  }

  // Aggregate normalized scores per team
  const teamScores = {}
  for (const ev of submitted) {
    if (!ev.teamId || !ev.scores) continue
    if (!teamScores[ev.teamId]) teamScores[ev.teamId] = { total: 0, count: 0 }
    teamScores[ev.teamId].total += normalizedPct(ev)
    teamScores[ev.teamId].count += 1
  }

  // Rank teams by average normalized score (0–100%)
  const ranked = Object.entries(teamScores)
    .map(([teamId, data]) => ({
      teamId,
      avgScore: data.count > 0 ? Math.round((data.total / data.count) * 10) / 10 : 0,
      evaluationCount: data.count,
    }))
    .sort((a, b) => b.avgScore - a.avgScore)

  // Score distribution histogram (normalized 0–100% buckets of 10)
  const allNormalized = submitted
    .filter((e) => e.scores)
    .map((e) => normalizedPct(e))

  const bins = {}
  for (const s of allNormalized) {
    const bin = Math.floor(s / 10) * 10
    bins[bin] = (bins[bin] || 0) + 1
  }
  const histogramData = Object.entries(bins)
    .map(([bin, count]) => ({ bin: Number(bin), range: `${bin}–${Math.min(100, Number(bin) + 9)}%`, count }))
    .sort((a, b) => a.bin - b.bin)

  const avgNorm = allNormalized.length > 0
    ? Math.round(allNormalized.reduce((a, b) => a + b, 0) / allNormalized.length * 10) / 10
    : 0

  // Judge activity
  const judgeActivity = {}
  for (const ev of submitted) {
    if (!ev.judgeId) continue
    judgeActivity[ev.judgeId] = (judgeActivity[ev.judgeId] || 0) + 1
  }
  const judgeList = Object.entries(judgeActivity)
    .map(([judgeId, count]) => ({ judgeId, count }))
    .sort((a, b) => b.count - a.count)

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Team Rankings */}
        <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
          <h3 className="font-display text-base font-semibold text-ink-900">Team Rankings (by avg score)</h3>
          <p className="mt-1 text-xs text-ink-500">
            Scores normalized to 0–100% of each rubric's maximum — comparable even if criteria changed mid-event.
          </p>
          <div className="mt-4 max-h-64 space-y-2 overflow-y-auto">
            {ranked.slice(0, 15).map((t, i) => (
              <div key={t.teamId} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-[rgb(var(--surface-muted))]">
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  i < 3 ? 'bg-brand-500 text-white' : 'bg-[rgb(var(--surface-muted))] text-ink-600'
                }`}>
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-ink-700">{teamsMap.get(t.teamId) || t.teamId}</span>
                <span className="font-display text-sm font-bold text-ink-900">{t.avgScore}%</span>
                <span className="text-[10px] text-ink-400">({t.evaluationCount} eval{t.evaluationCount > 1 ? 's' : ''})</span>
              </div>
            ))}
          </div>
        </div>

        {/* Score Distribution */}
        <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
          <h3 className="font-display text-base font-semibold text-ink-900">Score Distribution</h3>
          <p className="mt-1 text-xs text-ink-500">Normalized score buckets (0–100%) across all submitted evaluations</p>
          <div className="mt-4 space-y-2">
            {histogramData.map((bin) => {
              const maxBin = Math.max(1, ...histogramData.map((b) => b.count))
              const pct = Math.round((bin.count / maxBin) * 100)
              return (
                <div key={bin.range} className="flex items-center gap-3">
                  <span className="w-20 text-right font-mono text-xs text-ink-500">{bin.range}</span>
                  <div className="h-5 flex-1 overflow-hidden rounded-md bg-[rgb(var(--surface-muted))]">
                    <div
                      className="h-full rounded-md bg-gradient-to-r from-brand-500 to-brand-400 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-6 text-xs font-medium text-ink-700">{bin.count}</span>
                </div>
              )
            })}
          </div>
          <p className="mt-3 text-xs text-ink-400">
            Total evaluations: {allNormalized.length} · Avg normalized score: {avgNorm}%
          </p>
        </div>
      </div>

      {/* Judge Activity */}
      <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
        <h3 className="font-display text-base font-semibold text-ink-900">Judge Activity</h3>
        <p className="mt-1 text-xs text-ink-500">Number of submitted evaluations per judge</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {judgeList.map((j) => (
            <div key={j.judgeId} className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))]/50 px-3 py-2">
              <span className="text-xs font-medium text-ink-700">{usersMap.get(j.judgeId) || 'Judge'}</span>
              <span className="ml-2 font-display text-sm font-bold text-ink-900">{j.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
