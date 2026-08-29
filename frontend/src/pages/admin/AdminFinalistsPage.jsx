import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Medal, Search, Save, CheckCircle2, AlertCircle, ShieldCheck, ShieldOff, Download, RefreshCw,
} from 'lucide-react'
import { usePageSeo } from '@/hooks/usePageSeo.js'
import { useApi } from '@/hooks/useApi.js'
import { useIsReadOnly } from '@/hooks/useIsReadOnly.js'
import { useResolvedEventId } from '@/hooks/useResolvedEventId.js'
import { Card } from '@/components/ui/Card.jsx'
import { Badge } from '@/components/ui/Badge.jsx'
import { Button } from '@/components/ui/Button.jsx'
import { Input } from '@/components/ui/Input.jsx'
import { Skeleton } from '@/components/ui/Skeleton.jsx'
import { downloadCsv } from '@/utils/csvExport.js'

/**
 * Per-criterion total → percentage for one rubric part. Mirrors AdminResultsPage
 * so the reference score shown here matches the Results page exactly.
 */
function partPct(criteria, scores) {
  const crit = Array.isArray(criteria) && criteria.length > 0 ? criteria : null
  const s = scores && typeof scores === 'object' ? scores : {}
  let total = 0
  let maxTotal = 0
  if (crit) {
    for (const c of crit) {
      const max = Number(c.maxScore) > 0 ? Number(c.maxScore) : 10
      const raw = Number(s[c.key])
      total += Number.isFinite(raw) ? raw : 0
      maxTotal += max
    }
  } else {
    for (const v of Object.values(s)) {
      const val = Number(v)
      if (!Number.isFinite(val)) continue
      total += val
      maxTotal += 10
    }
  }
  return maxTotal > 0 ? Math.round((total / maxTotal) * 1000) / 10 : 0
}

/** Reference % for one evaluation (two-part uses the server's weighted final %). */
function evalPct(ev) {
  if (ev?.scoringMode === 'twoPart') {
    if (typeof ev.finalScorePct === 'number') return ev.finalScorePct
    const a = partPct(ev.evaluationCriteriaA, ev.scoresA)
    const b = partPct(ev.evaluationCriteriaB, ev.scoresB)
    return Math.round(((a + b) / 2) * 10) / 10
  }
  return partPct(ev?.evaluationCriteria, ev?.scores)
}

export function AdminFinalistsPage() {
  usePageSeo({ title: 'Finalists', description: 'Hand-pick finalists per domain for the finals round.' })
  const api = useApi()
  const readOnly = useIsReadOnly()
  const { eventId } = useResolvedEventId()

  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const [teams, setTeams] = useState([])
  const [evals, setEvals] = useState([])
  const [psMap, setPsMap] = useState(new Map())
  const [collegeByTeam, setCollegeByTeam] = useState(new Map())

  const [finalistsOnly, setFinalistsOnly] = useState(false)
  const [targets, setTargets] = useState({}) // { domain: number|string }
  const [savingTargets, setSavingTargets] = useState(false)
  const [savingGate, setSavingGate] = useState(false)
  const [busyTeam, setBusyTeam] = useState('') // teamId currently toggling
  const [search, setSearch] = useState('')
  // This tab shows ONLY finalist teams by default. Toggle on to reveal the full
  // roster when you need to pick/add finalists.
  const [showAllTeams, setShowAllTeams] = useState(false)

  const load = useCallback(async (spin = false) => {
    if (spin) setLoading(true)
    try {
      const [ev, tm, ps, tc, cfg] = await Promise.all([
        api.adminEvaluations().catch(() => []),
        api.adminTeams().catch(() => []),
        api.listAdminProblemStatements().catch(() => []),
        api.adminTeamColleges().catch(() => ({ teams: [] })),
        api.getEventConfig(eventId || undefined).catch(() => null),
      ])
      setEvals(Array.isArray(ev) ? ev : [])
      setTeams(Array.isArray(tm) ? tm : [])
      const m = new Map()
      for (const p of Array.isArray(ps) ? ps : []) m.set(p.id, p)
      setPsMap(m)
      const cm = new Map()
      for (const t of Array.isArray(tc?.teams) ? tc.teams : []) {
        cm.set(t.teamId, { college: t.college || '', collegeLocation: t.collegeLocation || '' })
      }
      setCollegeByTeam(cm)
      setFinalistsOnly(cfg?.finalistsOnly === true)
      const fpd = cfg?.finalistsPerDomain && typeof cfg.finalistsPerDomain === 'object' ? cfg.finalistsPerDomain : {}
      setTargets({ ...fpd })
    } catch (e) {
      setErr(e?.message || 'Could not load finalists data')
    } finally {
      setLoading(false)
    }
  }, [api, eventId])

  useEffect(() => { void load(true) }, [load])

  // Per-team reference score from the CURRENT live evaluations (Round-2 while
  // picking; finals once scored). Averaged across the team's submitted judges.
  const rows = useMemo(() => {
    const byTeam = new Map()
    for (const e of evals) {
      const submitted = e.evaluationStatus === 'submitted' || e.statusB === 'submitted' || e.statusA === 'submitted'
      if (!submitted || !e.teamId) continue
      if (!byTeam.has(e.teamId)) byTeam.set(e.teamId, [])
      byTeam.get(e.teamId).push(e)
    }
    return teams
      .filter((t) => t.problemStatementId)
      .map((t) => {
        const teamEvals = byTeam.get(t.id) || []
        const pcts = teamEvals.map(evalPct).filter((n) => Number.isFinite(n))
        const avg = pcts.length ? pcts.reduce((s, x) => s + x, 0) / pcts.length : null
        const ps = psMap.get(t.problemStatementId)
        const cl = collegeByTeam.get(t.id) || {}
        return {
          teamId: t.id,
          name: t.name || 'Unnamed',
          code: t.inviteCode || t.id.slice(0, 6),
          domain: ps?.theme || ps?.domain || 'Unassigned',
          track: ps?.category || '',
          college: cl.college || '',
          judges: teamEvals.length,
          avg: avg == null ? null : Math.round(avg * 10) / 10,
          finalist: t.finalist === true,
        }
      })
  }, [teams, evals, psMap, collegeByTeam])

  // Group rows by domain, sorted by reference score desc within each domain.
  const groups = useMemo(() => {
    const q = search.trim().toLowerCase()
    const byDomain = new Map()
    for (const r of rows) {
      // Default view: only teams already flagged as finalist. "Show all teams"
      // reveals the full roster so the admin can pick/add finalists.
      if (!showAllTeams && !r.finalist) continue
      if (q && !`${r.name} ${r.code} ${r.college} ${r.track}`.toLowerCase().includes(q)) continue
      if (!byDomain.has(r.domain)) byDomain.set(r.domain, [])
      byDomain.get(r.domain).push(r)
    }
    const list = []
    for (const [domain, teamRows] of byDomain) {
      teamRows.sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1) || a.name.localeCompare(b.name))
      const selectedCount = teamRows.filter((r) => r.finalist).length
      const rawTarget = targets[domain]
      const target = rawTarget === '' || rawTarget == null ? null : Number(rawTarget)
      list.push({ domain, teams: teamRows, selectedCount, target: Number.isFinite(target) ? target : null })
    }
    list.sort((a, b) => a.domain.localeCompare(b.domain))
    return list
  }, [rows, targets, search, showAllTeams])

  const totalSelected = useMemo(() => rows.filter((r) => r.finalist).length, [rows])

  async function toggleFinalist(teamId, next) {
    if (readOnly) return
    setErr('')
    setMsg('')
    setBusyTeam(teamId)
    // Optimistic update of the team's finalist flag.
    setTeams((prev) => prev.map((t) => (t.id === teamId ? { ...t, finalist: next } : t)))
    try {
      await api.setFinalists([teamId], next)
    } catch (e) {
      setTeams((prev) => prev.map((t) => (t.id === teamId ? { ...t, finalist: !next } : t)))
      setErr(e?.message || 'Could not update finalist')
    } finally {
      setBusyTeam('')
    }
  }

  async function saveTargets() {
    if (readOnly) return
    if (!eventId) { setErr('Event scope not resolved yet.'); return }
    setSavingTargets(true)
    setErr('')
    setMsg('')
    try {
      const clean = {}
      for (const [k, v] of Object.entries(targets)) {
        const n = Number(v)
        if (k && Number.isFinite(n) && n >= 0) clean[k] = Math.floor(n)
      }
      await api.patchAdminEvent(eventId, { finalistsPerDomain: clean })
      setMsg('Per-domain target counts saved.')
    } catch (e) {
      setErr(e?.message || 'Could not save target counts')
    } finally {
      setSavingTargets(false)
    }
  }

  async function toggleGate() {
    if (readOnly) return
    if (!eventId) { setErr('Event scope not resolved yet.'); return }
    const next = !finalistsOnly
    setSavingGate(true)
    setErr('')
    setMsg('')
    setFinalistsOnly(next) // optimistic
    try {
      await api.patchAdminEvent(eventId, { finalistsOnly: next })
      setMsg(next ? 'Finals judging is now restricted to finalists only.' : 'Finals judging is open to all assigned teams.')
    } catch (e) {
      setFinalistsOnly(!next)
      setErr(e?.message || 'Could not update the finals gate')
    } finally {
      setSavingGate(false)
    }
  }

  function exportCsv() {
    const flat = rows
      .filter((r) => r.finalist)
      .sort((a, b) => a.domain.localeCompare(b.domain) || (b.avg ?? -1) - (a.avg ?? -1))
    downloadCsv(`finalists-${Date.now()}.csv`, flat, [
      { header: 'Domain', accessor: (r) => r.domain },
      { header: 'Team', accessor: (r) => r.name },
      { header: 'Code', accessor: (r) => r.code },
      { header: 'Track', accessor: (r) => r.track },
      { header: 'College', accessor: (r) => r.college },
      { header: 'Score %', accessor: (r) => (r.avg == null ? '' : r.avg) },
      { header: 'Judges', accessor: (r) => r.judges },
    ])
  }

  const numInputCls =
    'h-9 w-20 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-2 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:opacity-50'

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-3xl font-bold text-ink-900">
            <Medal className="h-7 w-7 text-amber-500" /> Finalists
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-600">
            Hand-pick the finalists for each domain. Set a target count per domain, then tick the teams that
            advance to the finals. This is fully separate from the Shortlisting page.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => load(true)} disabled={loading}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
          <Button variant="secondary" size="sm" onClick={exportCsv} disabled={totalSelected === 0}>
            <Download className="h-4 w-4" /> Export finalists
          </Button>
        </div>
      </div>

      {msg ? (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4" /> {msg}
        </div>
      ) : null}
      {err ? (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700">
          <AlertCircle className="h-4 w-4" /> {err}
        </div>
      ) : null}

      {/* Finals gate + summary */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            {finalistsOnly ? (
              <ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-600" />
            ) : (
              <ShieldOff className="mt-0.5 h-5 w-5 text-ink-400" />
            )}
            <div>
              <p className="text-sm font-semibold text-ink-900">Restrict finals judging to finalists only</p>
              <p className="mt-0.5 max-w-xl text-xs text-ink-500">
                When on, judges can only open and score teams marked as finalists. Turn this on once you have picked
                all finalists and are ready to start finals judging.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge tone={finalistsOnly ? 'success' : 'neutral'}>{finalistsOnly ? 'ON' : 'OFF'}</Badge>
            <Button
              variant={finalistsOnly ? 'secondary' : 'primary'}
              size="sm"
              onClick={toggleGate}
              disabled={readOnly || savingGate}
            >
              {finalistsOnly ? 'Turn off' : 'Turn on'}
            </Button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-4 border-t border-[rgb(var(--border))] pt-3 text-sm text-ink-600">
          <span><strong className="text-ink-900">{totalSelected}</strong> finalists selected</span>
          <span><strong className="text-ink-900">{groups.length}</strong> domains</span>
        </div>
      </Card>

      {/* Search + save targets */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="w-full max-w-xs">
          <Input
            icon={Search}
            placeholder="Search team, code, college…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setShowAllTeams((v) => !v)}>
            {showAllTeams ? 'Show finalists only' : 'Show all teams'}
          </Button>
          <Button variant="primary" size="sm" onClick={saveTargets} disabled={readOnly || savingTargets}>
            <Save className="h-4 w-4" /> Save target counts
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-40 w-full" />)}
        </div>
      ) : groups.length === 0 ? (
        <Card className="text-center text-ink-500">
          {showAllTeams
            ? 'No teams with a selected problem statement yet.'
            : 'No finalists selected yet. Click “Show all teams” to pick finalists.'}
        </Card>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => {
            const over = g.target != null && g.selectedCount > g.target
            const met = g.target != null && g.selectedCount === g.target && g.target > 0
            return (
              <Card key={g.domain} className="overflow-hidden p-0">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))] px-4 py-3">
                  <div className="flex items-center gap-3">
                    <h2 className="font-display text-base font-semibold text-ink-900">{g.domain}</h2>
                    <Badge tone={over ? 'danger' : met ? 'success' : 'neutral'}>
                      {g.selectedCount}{g.target != null ? ` / ${g.target}` : ''} selected
                    </Badge>
                    <span className="text-xs text-ink-400">{g.teams.length} teams</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-medium text-ink-500">Target</label>
                    <input
                      type="number"
                      min="0"
                      className={numInputCls}
                      value={targets[g.domain] ?? ''}
                      onChange={(e) => setTargets((prev) => ({ ...prev, [g.domain]: e.target.value }))}
                      disabled={readOnly}
                    />
                  </div>
                </div>
                <div className="divide-y divide-[rgb(var(--border))]">
                  {g.teams.map((r) => (
                    <label
                      key={r.teamId}
                      className={`flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[rgb(var(--surface-muted))] ${
                        r.finalist ? 'bg-amber-500/5' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-amber-500"
                        checked={r.finalist}
                        disabled={readOnly || busyTeam === r.teamId}
                        onChange={(e) => toggleFinalist(r.teamId, e.target.checked)}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium text-ink-900">{r.name}</span>
                          <span className="shrink-0 text-xs text-ink-400">#{r.code}</span>
                          {r.finalist ? <Medal className="h-3.5 w-3.5 shrink-0 text-amber-500" /> : null}
                        </div>
                        <div className="truncate text-xs text-ink-500">
                          {r.track ? `${r.track} • ` : ''}{r.college || 'College not set'}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-sm font-semibold text-ink-900">{r.avg == null ? '—' : `${r.avg}%`}</div>
                        <div className="text-[11px] text-ink-400">{r.judges} {r.judges === 1 ? 'judge' : 'judges'}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default AdminFinalistsPage
