import { useCallback, useEffect, useMemo, useState } from 'react'
import { Trophy, Search, Download } from 'lucide-react'
import { usePageSeo } from '@/hooks/usePageSeo.js'
import { useApi } from '@/hooks/useApi.js'
import { Card } from '@/components/ui/Card.jsx'
import { Badge } from '@/components/ui/Badge.jsx'
import { Button } from '@/components/ui/Button.jsx'
import { Skeleton } from '@/components/ui/Skeleton.jsx'
import { downloadCsv } from '@/utils/csvExport.js'

const STATUS_TONE = { qualified: 'success', waitlist: 'warn', not_qualified: 'danger' }
const STATUS_LABEL = { qualified: 'Qualified', waitlist: 'Waitlist', not_qualified: 'Not qualified' }

/** Normalized 0–100% score for one evaluation, using its stored criteria snapshot. */
function normalizedPct(ev) {
  if (!ev?.scores || typeof ev.scores !== 'object') return null
  const vals = Object.values(ev.scores).map(Number).filter(Number.isFinite)
  if (vals.length === 0) return null
  const rawTotal = vals.reduce((a, b) => a + b, 0)
  const crit = Array.isArray(ev.evaluationCriteria) && ev.evaluationCriteria.length > 0 ? ev.evaluationCriteria : null
  const maxPossible = crit
    ? crit.reduce((s, c) => s + (Number(c.maxScore) > 0 ? Number(c.maxScore) : 10), 0)
    : vals.length * 10
  return maxPossible > 0 ? (rawTotal / maxPossible) * 100 : 0
}

export function AdminResultsPage() {
  usePageSeo({ title: 'Results', description: 'Aggregated team results across judges.' })
  const api = useApi()
  const [loading, setLoading] = useState(true)
  const [evals, setEvals] = useState([])
  const [teams, setTeams] = useState([])
  const [psMap, setPsMap] = useState(new Map())
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [ev, tm, ps] = await Promise.all([
        api.adminEvaluations().catch(() => []),
        api.adminTeams().catch(() => []),
        api.listAdminProblemStatements().catch(() => []),
      ])
      setEvals(Array.isArray(ev) ? ev : [])
      setTeams(Array.isArray(tm) ? tm : [])
      const m = new Map()
      for (const p of (Array.isArray(ps) ? ps : [])) m.set(p.id, p)
      setPsMap(m)
    } catch {
      setEvals([])
      setTeams([])
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => { void load() }, [load])

  // Aggregate: per team, average of each judge's normalized % (submitted only).
  const rows = useMemo(() => {
    const byTeam = new Map()
    for (const e of evals) {
      if (e.evaluationStatus !== 'submitted') continue
      const pct = normalizedPct(e)
      if (pct == null) continue
      if (!byTeam.has(e.teamId)) byTeam.set(e.teamId, [])
      byTeam.get(e.teamId).push(pct)
    }
    const list = teams
      .filter((t) => t.problemStatementId) // teams that picked a PS
      .map((t) => {
        const pcts = byTeam.get(t.id) || []
        const avg = pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : 0
        const ps = psMap.get(t.problemStatementId)
        return {
          teamId: t.id,
          name: t.name || 'Unnamed',
          code: t.inviteCode || t.id.slice(0, 6),
          psTitle: ps?.title || t.problemStatementId,
          domain: ps?.theme || ps?.domain || '',
          track: ps?.category || '',
          judges: pcts.length,
          avg: Math.round(avg * 10) / 10,
          juryStatus: t.juryStatus || '',
        }
      })
    list.sort((a, b) => b.avg - a.avg || a.name.localeCompare(b.name))
    list.forEach((r, i) => { r.rank = i + 1 })
    return list
  }, [evals, teams, psMap])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (statusFilter === 'unset' && r.juryStatus) return false
      if (statusFilter !== 'all' && statusFilter !== 'unset' && r.juryStatus !== statusFilter) return false
      if (!q) return true
      return `${r.name} ${r.code} ${r.psTitle}`.toLowerCase().includes(q)
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
      { header: 'Status', accessor: (r) => STATUS_LABEL[r.juryStatus] || '' },
    ])
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
              placeholder="Search team or problem…"
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
                <th className="px-3 py-2 font-medium text-center">Judges</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(var(--border))]">
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-ink-500">No results to show.</td></tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.teamId} className="hover:bg-[rgb(var(--surface-muted))]/40">
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
                    <td className="px-3 py-2 text-center text-ink-700">{r.judges}</td>
                    <td className="px-3 py-2">
                      {r.juryStatus ? (
                        <Badge tone={STATUS_TONE[r.juryStatus] || 'neutral'}>{STATUS_LABEL[r.juryStatus] || r.juryStatus}</Badge>
                      ) : (
                        <Badge tone="neutral">Unset</Badge>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-ink-400">
          Avg % is the mean of each judge&apos;s normalized score (their total ÷ rubric max), so it stays fair even if
          rubrics differ. Only submitted evaluations are counted.
        </p>
      </Card>
    </div>
  )
}
