import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Trophy, Search, Download, ChevronRight, ChevronDown, Gavel } from 'lucide-react'
import { usePageSeo } from '@/hooks/usePageSeo.js'
import { useApi } from '@/hooks/useApi.js'
import { Card } from '@/components/ui/Card.jsx'
import { Badge } from '@/components/ui/Badge.jsx'
import { Button } from '@/components/ui/Button.jsx'
import { Skeleton } from '@/components/ui/Skeleton.jsx'
import { downloadCsv } from '@/utils/csvExport.js'

const STATUS_TONE = { qualified: 'success', waitlist: 'warn', not_qualified: 'danger' }
const STATUS_LABEL = { qualified: 'Qualified', waitlist: 'Waitlist', not_qualified: 'Not qualified' }

/**
 * Per-criterion breakdown for one evaluation, using its stored criteria snapshot.
 * Returns items [{label, score, max}], total, maxTotal, and normalized pct (0–100).
 */
function evalBreakdown(ev) {
  const crit = Array.isArray(ev?.evaluationCriteria) && ev.evaluationCriteria.length > 0 ? ev.evaluationCriteria : null
  const scores = ev?.scores && typeof ev.scores === 'object' ? ev.scores : {}
  const items = []
  let total = 0
  let maxTotal = 0
  if (crit) {
    for (const c of crit) {
      const max = Number(c.maxScore) > 0 ? Number(c.maxScore) : 10
      const raw = Number(scores[c.key])
      const val = Number.isFinite(raw) ? raw : 0
      items.push({ key: c.key, label: c.label || c.key, score: val, max })
      total += val
      maxTotal += max
    }
  } else {
    for (const [k, v] of Object.entries(scores)) {
      const val = Number(v)
      if (!Number.isFinite(val)) continue
      items.push({ key: k, label: k, score: val, max: 10 })
      total += val
      maxTotal += 10
    }
  }
  const pct = maxTotal > 0 ? Math.round((total / maxTotal) * 1000) / 10 : 0
  return { items, total: Math.round(total * 10) / 10, maxTotal, pct }
}

export function AdminResultsPage() {
  usePageSeo({ title: 'Results', description: 'Aggregated team results across judges.' })
  const api = useApi()
  const [loading, setLoading] = useState(true)
  const [evals, setEvals] = useState([])
  const [teams, setTeams] = useState([])
  const [users, setUsers] = useState([])
  const [psMap, setPsMap] = useState(new Map())
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [expanded, setExpanded] = useState(null) // teamId whose breakdown is open

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [ev, tm, ps, us] = await Promise.all([
        api.adminEvaluations().catch(() => []),
        api.adminTeams().catch(() => []),
        api.listAdminProblemStatements().catch(() => []),
        api.listUsers().catch(() => []),
      ])
      setEvals(Array.isArray(ev) ? ev : [])
      setTeams(Array.isArray(tm) ? tm : [])
      setUsers(Array.isArray(us) ? us : [])
      const m = new Map()
      for (const p of (Array.isArray(ps) ? ps : [])) m.set(p.id, p)
      setPsMap(m)
    } catch {
      setEvals([])
      setTeams([])
      setUsers([])
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => { void load() }, [load])

  // uid → readable judge label (email preferred, then displayName, then uid).
  const judgeById = useMemo(() => {
    const m = new Map()
    for (const u of users) m.set(u.id, u.email || u.displayName || u.id)
    return m
  }, [users])

  // Aggregate: per team, each submitted judge evaluation with full breakdown.
  const rows = useMemo(() => {
    const byTeam = new Map()
    for (const e of evals) {
      if (e.evaluationStatus !== 'submitted') continue
      if (!e.teamId) continue
      if (!byTeam.has(e.teamId)) byTeam.set(e.teamId, [])
      byTeam.get(e.teamId).push(e)
    }
    const list = teams
      .filter((t) => t.problemStatementId) // teams that picked a PS
      .map((t) => {
        const teamEvals = byTeam.get(t.id) || []
        const evaluations = teamEvals.map((e) => ({
          judgeId: e.judgeId || '',
          judgeLabel: judgeById.get(e.judgeId) || e.judgeId || 'Judge',
          feedback: typeof e.feedback === 'string' ? e.feedback : '',
          ...evalBreakdown(e),
        }))
        const avg = evaluations.length
          ? evaluations.reduce((s, x) => s + x.pct, 0) / evaluations.length
          : 0
        const ps = psMap.get(t.problemStatementId)
        return {
          teamId: t.id,
          name: t.name || 'Unnamed',
          code: t.inviteCode || t.id.slice(0, 6),
          psTitle: ps?.title || t.problemStatementId,
          domain: ps?.theme || ps?.domain || '',
          track: ps?.category || '',
          judges: evaluations.length,
          judgeNames: evaluations.map((x) => x.judgeLabel).join(', '),
          evaluations,
          avg: Math.round(avg * 10) / 10,
          juryStatus: t.juryStatus || '',
        }
      })
    list.sort((a, b) => b.avg - a.avg || a.name.localeCompare(b.name))
    list.forEach((r, i) => { r.rank = i + 1 })
    return list
  }, [evals, teams, psMap, judgeById])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (statusFilter === 'unset' && r.juryStatus) return false
      if (statusFilter !== 'all' && statusFilter !== 'unset' && r.juryStatus !== statusFilter) return false
      if (!q) return true
      return `${r.name} ${r.code} ${r.psTitle} ${r.judgeNames}`.toLowerCase().includes(q)
    })
  }, [rows, search, statusFilter])

  const counts = useMemo(() => ({
    qualified: rows.filter((r) => r.juryStatus === 'qualified').length,
    waitlist: rows.filter((r) => r.juryStatus === 'waitlist').length,
    not_qualified: rows.filter((r) => r.juryStatus === 'not_qualified').length,
    evaluated: rows.filter((r) => r.judges > 0).length,
  }), [rows])

  function exportCsv() {
    downloadCsv(`results-${Date.now()}.csv`, filtered, [
      { header: 'Rank', accessor: (r) => r.rank },
      { header: 'Team', accessor: (r) => r.name },
      { header: 'Code', accessor: (r) => r.code },
      { header: 'Problem Statement', accessor: (r) => r.psTitle },
      { header: 'Domain', accessor: (r) => r.domain },
      { header: 'Track', accessor: (r) => r.track },
      { header: 'Avg %', accessor: (r) => r.avg },
      { header: 'Judges', accessor: (r) => r.judges },
      { header: 'Judge(s)', accessor: (r) => r.judgeNames },
      { header: 'Status', accessor: (r) => STATUS_LABEL[r.juryStatus] || '' },
    ])
  }

  function toggle(teamId) {
    setExpanded((cur) => (cur === teamId ? null : teamId))
  }

  if (loading) return <Skeleton className="h-96 w-full rounded-2xl" />

  return (
    <div className="w-full max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 font-display text-3xl font-bold text-ink-900">
            <Trophy className="h-7 w-7 text-amber-500" /> Results
          </h1>
          <p className="mt-2 text-sm text-ink-600">
            Team rankings by average judge score (normalized across rubrics), with the jury status set by judges.
            Click a row to see which judge evaluated it and the full marks breakdown.
          </p>
        </div>
        <Button variant="secondary" size="sm" className="gap-1.5" onClick={exportCsv}>
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>

      {/* Counts */}
      <div className="flex flex-wrap gap-2">
        <Badge tone="brand">{counts.evaluated} evaluated</Badge>
        <Badge tone="success">{counts.qualified} qualified</Badge>
        <Badge tone="warn">{counts.waitlist} waitlist</Badge>
        <Badge tone="danger">{counts.not_qualified} not qualified</Badge>
      </div>

      <Card className="space-y-4">
        {/* Filters */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search team, problem, or judge…"
              className="w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-2.5 pl-9 pr-3 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'all', label: 'All' },
              { id: 'qualified', label: 'Qualified' },
              { id: 'waitlist', label: 'Waitlist' },
              { id: 'not_qualified', label: 'Not Qualified' },
              { id: 'unset', label: 'Unset' },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setStatusFilter(f.id)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  statusFilter === f.id ? 'bg-brand-500 text-white' : 'bg-[rgb(var(--surface-muted))] text-ink-600 hover:bg-[rgb(var(--border))]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-[rgb(var(--border))]">
          <table className="w-full text-left text-sm">
            <thead className="bg-[rgb(var(--surface-muted))] text-xs uppercase tracking-wide text-ink-500">
              <tr>
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">Team</th>
                <th className="px-3 py-2 font-medium">Problem</th>
                <th className="px-3 py-2 font-medium text-right">Avg %</th>
                <th className="px-3 py-2 font-medium">Evaluated by</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(var(--border))]">
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-ink-500">No results to show.</td></tr>
              ) : (
                filtered.map((r) => {
                  const isOpen = expanded === r.teamId
                  const canExpand = r.judges > 0
                  return (
                    <Fragment key={r.teamId}>
                      <tr
                        className={`hover:bg-[rgb(var(--surface-muted))]/40 ${canExpand ? 'cursor-pointer' : ''}`}
                        onClick={canExpand ? () => toggle(r.teamId) : undefined}
                      >
                        <td className="px-3 py-2 font-mono text-ink-500">{r.rank}</td>
                        <td className="px-3 py-2">
                          <div className="font-medium text-ink-900">{r.name}</div>
                          <div className="font-mono text-[10px] text-ink-400">{r.code}</div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="text-ink-800">{r.psTitle}</div>
                          <div className="flex flex-wrap gap-1 pt-0.5">
                            {r.domain ? <Badge tone="neutral" className="text-[10px]">{r.domain}</Badge> : null}
                            {r.track ? <Badge tone="brand" className="text-[10px]">{r.track}</Badge> : null}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-semibold text-ink-900">
                          {r.judges > 0 ? `${r.avg}%` : <span className="text-ink-400">—</span>}
                        </td>
                        <td className="px-3 py-2">
                          {r.judges > 0 ? (
                            <div className="flex items-center gap-1.5">
                              {isOpen
                                ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-brand-600" />
                                : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ink-400" />}
                              <span className="max-w-[11rem] truncate text-xs text-ink-700" title={r.judgeNames}>
                                {r.judgeNames}
                              </span>
                              <Badge tone="neutral" className="text-[10px]">{r.judges}</Badge>
                            </div>
                          ) : (
                            <span className="text-xs text-ink-400">Not evaluated</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {r.juryStatus ? (
                            <Badge tone={STATUS_TONE[r.juryStatus] || 'neutral'}>{STATUS_LABEL[r.juryStatus] || r.juryStatus}</Badge>
                          ) : (
                            <Badge tone="neutral">Unset</Badge>
                          )}
                        </td>
                      </tr>

                      {isOpen && canExpand ? (
                        <tr className="bg-[rgb(var(--surface-muted))]/30">
                          <td colSpan={6} className="px-3 py-3">
                            <div className="space-y-3">
                              {r.evaluations.map((ev, idx) => (
                                <div
                                  key={ev.judgeId || idx}
                                  className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3"
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                      <Gavel className="h-3.5 w-3.5 text-brand-600" />
                                      <span className="text-sm font-medium text-ink-900">{ev.judgeLabel}</span>
                                    </div>
                                    <span className="font-mono text-xs font-semibold text-ink-900">
                                      {ev.total} / {ev.maxTotal} <span className="text-brand-600">({ev.pct}%)</span>
                                    </span>
                                  </div>

                                  <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                                    {ev.items.map((it) => (
                                      <div
                                        key={it.key}
                                        className="flex items-center justify-between gap-2 rounded-lg bg-[rgb(var(--surface-muted))]/50 px-2.5 py-1.5"
                                      >
                                        <span className="text-xs text-ink-600">{it.label}</span>
                                        <span className="font-mono text-xs font-semibold text-ink-900">{it.score} / {it.max}</span>
                                      </div>
                                    ))}
                                  </div>

                                  <div className="mt-2">
                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">Remarks</p>
                                    <p className="mt-0.5 whitespace-pre-wrap text-xs text-ink-700">
                                      {ev.feedback?.trim() ? ev.feedback : '—'}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-ink-400">
          Avg % is the mean of each judge&apos;s normalized score (their total ÷ rubric max), so it stays fair even if
          rubrics differ. Only submitted evaluations are counted. Click any evaluated row to expand the per-judge marks.
        </p>
      </Card>
    </div>
  )
}
