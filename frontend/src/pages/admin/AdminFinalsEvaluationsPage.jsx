import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Award, Search, Download, ChevronRight, ChevronDown, RefreshCw, Medal, Swords, Gavel,
} from 'lucide-react'
import { usePageSeo } from '@/hooks/usePageSeo.js'
import { useApi } from '@/hooks/useApi.js'
import { Card } from '@/components/ui/Card.jsx'
import { Badge } from '@/components/ui/Badge.jsx'
import { Button } from '@/components/ui/Button.jsx'
import { Input } from '@/components/ui/Input.jsx'
import { Skeleton } from '@/components/ui/Skeleton.jsx'
import { downloadCsv } from '@/utils/csvExport.js'

const round1 = (n) => Math.round(n * 10) / 10

/**
 * Identify which rubric rows are the shared "Universal Challenge" criteria so
 * we can split each part into Project vs Challenge. Resolution order:
 *   1) the stored `challengeCriteria` snapshot (challenges in the dedicated slot),
 *   2) rows whose label/key say "Universal Challenge …" — handles rubrics where
 *      the challenges were added inline into Part A/B instead of the slot,
 *   3) legacy fallback: rows shared by both parts.
 */
function challengeKeySet(ev) {
  if (Array.isArray(ev.challengeCriteria) && ev.challengeCriteria.length) {
    return new Set(ev.challengeCriteria.map((c) => c.key))
  }
  const isChallenge = (c) => /universal.?challenge/i.test(`${c?.label || ''} ${c?.key || ''}`)
  const detected = new Set()
  for (const c of ev.evaluationCriteriaA || []) if (isChallenge(c)) detected.add(c.key)
  for (const c of ev.evaluationCriteriaB || []) if (isChallenge(c)) detected.add(c.key)
  if (detected.size > 0) return detected
  const aKeys = new Set((ev.evaluationCriteriaA || []).map((c) => c.key))
  return new Set((ev.evaluationCriteriaB || []).map((c) => c.key).filter((k) => aKeys.has(k)))
}

/** Split one part's combined rubric+scores into project and challenge buckets. */
function splitPart(combinedCriteria, scores, chKeys) {
  const crit = Array.isArray(combinedCriteria) ? combinedCriteria : []
  const s = scores && typeof scores === 'object' ? scores : {}
  const project = { items: [], total: 0, maxTotal: 0 }
  const challenge = { items: [], total: 0, maxTotal: 0 }
  for (const c of crit) {
    const max = Number(c.maxScore) > 0 ? Number(c.maxScore) : 10
    const raw = Number(s[c.key])
    const val = Number.isFinite(raw) ? raw : 0
    const bucket = chKeys.has(c.key) ? challenge : project
    bucket.items.push({ key: c.key, label: c.label || c.key, score: val, max })
    bucket.total += val
    bucket.maxTotal += max
  }
  const pct = (b) => (b.maxTotal > 0 ? round1((b.total / b.maxTotal) * 100) : 0)
  const combinedTotal = project.total + challenge.total
  const combinedMax = project.maxTotal + challenge.maxTotal
  return {
    project: { ...project, total: round1(project.total), pct: pct(project) },
    challenge: { ...challenge, total: round1(challenge.total), pct: pct(challenge) },
    combined: {
      total: round1(combinedTotal),
      maxTotal: combinedMax,
      pct: combinedMax > 0 ? round1((combinedTotal / combinedMax) * 100) : 0,
    },
  }
}

/** Full breakdown for one two-part finals evaluation. */
function finalsBreakdown(ev) {
  const chKeys = challengeKeySet(ev)
  const partA = splitPart(ev.evaluationCriteriaA, ev.scoresA, chKeys)
  const partB = splitPart(ev.evaluationCriteriaB, ev.scoresB, chKeys)
  const weightA = typeof ev.partAWeight === 'number' ? ev.partAWeight : 50
  const weightB = typeof ev.partBWeight === 'number' ? ev.partBWeight : 50
  const wSum = weightA + weightB
  const computedFinal = wSum > 0 ? round1((partA.combined.pct * weightA + partB.combined.pct * weightB) / wSum) : 0
  const finalPct = typeof ev.finalScorePct === 'number' ? ev.finalScorePct : computedFinal
  return {
    labelA: ev.partALabel || 'Part A',
    labelB: ev.partBLabel || 'Part B',
    weightA,
    weightB,
    partA,
    partB,
    finalPct,
    statusA: ev.statusA || 'pending',
    statusB: ev.statusB || 'pending',
    feedbackA: typeof ev.feedbackA === 'string' ? ev.feedbackA : '',
    feedbackB: typeof ev.feedbackB === 'string' ? ev.feedbackB : '',
  }
}

/** Compact criterion table for a project/challenge bucket. */
function CriteriaTable({ bucket }) {
  if (!bucket.items.length) return <p className="text-xs text-ink-400">No criteria.</p>
  return (
    <table className="w-full text-xs">
      <tbody>
        {bucket.items.map((it) => (
          <tr key={it.key} className="border-b border-[rgb(var(--border))] last:border-0">
            <td className="py-1 pr-2 text-ink-600">{it.label}</td>
            <td className="w-16 py-1 text-right font-medium text-ink-900">{it.score}<span className="text-ink-400"> / {it.max}</span></td>
          </tr>
        ))}
        <tr>
          <td className="pt-1.5 pr-2 text-right text-[11px] font-semibold uppercase tracking-wide text-ink-500">Subtotal</td>
          <td className="w-16 pt-1.5 text-right font-semibold text-ink-900">{bucket.total}<span className="text-ink-400"> / {bucket.maxTotal}</span></td>
        </tr>
      </tbody>
    </table>
  )
}

function PartColumn({ label, weight, part, statusIcon }) {
  return (
    <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))] p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-ink-900">
          {statusIcon}{label}
          <span className="text-xs font-normal text-ink-400">({weight}%)</span>
        </div>
        <Badge tone="brand">{part.combined.pct}%</Badge>
      </div>
      <div className="space-y-2.5">
        <div>
          <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-brand-600">Project · {part.project.pct}%</p>
          <CriteriaTable bucket={part.project} />
        </div>
        {part.challenge.items.length ? (
          <div>
            <p className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-600">
              <Swords className="h-3 w-3" /> Challenge · {part.challenge.pct}%
            </p>
            <CriteriaTable bucket={part.challenge} />
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function AdminFinalsEvaluationsPage() {
  usePageSeo({ title: 'Finals Evaluations', description: 'Full two-part finals scoring per team and judge.' })
  const api = useApi()

  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [evals, setEvals] = useState([])
  const [teams, setTeams] = useState([])
  const [users, setUsers] = useState([])
  const [psMap, setPsMap] = useState(new Map())
  const [collegeByTeam, setCollegeByTeam] = useState(new Map())
  const [search, setSearch] = useState('')
  const [domainFilter, setDomainFilter] = useState('all')
  const [expanded, setExpanded] = useState(null)

  const load = useCallback(async (spin = false) => {
    if (spin) setLoading(true)
    try {
      const [ev, tm, ps, us, tc] = await Promise.all([
        api.adminEvaluations().catch(() => []),
        api.adminTeams().catch(() => []),
        api.listAdminProblemStatements().catch(() => []),
        api.listUsers().catch(() => []),
        api.adminTeamColleges().catch(() => ({ teams: [] })),
      ])
      setEvals(Array.isArray(ev) ? ev : [])
      setTeams(Array.isArray(tm) ? tm : [])
      setUsers(Array.isArray(us) ? us : [])
      const m = new Map()
      for (const p of Array.isArray(ps) ? ps : []) m.set(p.id, p)
      setPsMap(m)
      const cm = new Map()
      for (const t of Array.isArray(tc?.teams) ? tc.teams : []) {
        cm.set(t.teamId, { college: t.college || '', collegeLocation: t.collegeLocation || '' })
      }
      setCollegeByTeam(cm)
    } catch (e) {
      setErr(e?.message || 'Could not load finals evaluations')
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => { void load(true) }, [load])

  const judgeById = useMemo(() => {
    const m = new Map()
    for (const u of users) m.set(u.id, u.email || u.displayName || u.id)
    return m
  }, [users])

  // Per team: all two-part finals evaluations, each fully broken down.
  const rows = useMemo(() => {
    const byTeam = new Map()
    for (const e of evals) {
      if (e.scoringMode !== 'twoPart' || !e.teamId) continue
      if (!byTeam.has(e.teamId)) byTeam.set(e.teamId, [])
      byTeam.get(e.teamId).push(e)
    }
    const list = teams
      .filter((t) => t.finalist === true || byTeam.has(t.id))
      .map((t) => {
        const teamEvals = byTeam.get(t.id) || []
        const judges = teamEvals.map((e) => ({
          judgeId: e.judgeId || '',
          judgeLabel: judgeById.get(e.judgeId) || e.judgeId || 'Judge',
          ...finalsBreakdown(e),
        }))
        const done = judges.filter((j) => j.statusA === 'submitted' && j.statusB === 'submitted')
        const avgFinal = done.length ? round1(done.reduce((s, j) => s + j.finalPct, 0) / done.length) : null
        const ps = psMap.get(t.problemStatementId)
        const cl = collegeByTeam.get(t.id) || {}
        return {
          teamId: t.id,
          name: t.name || 'Unnamed',
          code: t.inviteCode || t.id.slice(0, 6),
          domain: ps?.theme || ps?.domain || 'Unassigned',
          track: ps?.category || '',
          college: cl.college || '',
          finalist: t.finalist === true,
          judges,
          judgeCount: judges.length,
          completeCount: done.length,
          avgFinal,
        }
      })
    list.sort((a, b) => (b.avgFinal ?? -1) - (a.avgFinal ?? -1) || a.name.localeCompare(b.name))
    return list
  }, [evals, teams, judgeById, psMap, collegeByTeam])

  const domainOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.domain).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [rows],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (domainFilter !== 'all' && r.domain !== domainFilter) return false
      if (!q) return true
      return `${r.name} ${r.code} ${r.college} ${r.track}`.toLowerCase().includes(q)
    })
  }, [rows, search, domainFilter])

  function exportCsv() {
    // One row per (team, judge) with every part/challenge percentage.
    const flat = []
    for (const r of filtered) {
      if (!r.judges.length) {
        flat.push({ team: r.name, code: r.code, domain: r.domain, judge: '', a: '', aProj: '', aChal: '', b: '', bProj: '', bChal: '', final: '' })
        continue
      }
      for (const j of r.judges) {
        flat.push({
          team: r.name, code: r.code, domain: r.domain, judge: j.judgeLabel,
          a: j.partA.combined.pct, aProj: j.partA.project.pct, aChal: j.partA.challenge.pct,
          b: j.partB.combined.pct, bProj: j.partB.project.pct, bChal: j.partB.challenge.pct,
          final: j.finalPct,
        })
      }
    }
    downloadCsv(`finals-evaluations-${Date.now()}.csv`, flat, [
      { header: 'Team', accessor: (r) => r.team },
      { header: 'Code', accessor: (r) => r.code },
      { header: 'Domain', accessor: (r) => r.domain },
      { header: 'Judge', accessor: (r) => r.judge },
      { header: 'Part A %', accessor: (r) => r.a },
      { header: 'Part A Project %', accessor: (r) => r.aProj },
      { header: 'Part A Challenge %', accessor: (r) => r.aChal },
      { header: 'Part B %', accessor: (r) => r.b },
      { header: 'Part B Project %', accessor: (r) => r.bProj },
      { header: 'Part B Challenge %', accessor: (r) => r.bChal },
      { header: 'Final %', accessor: (r) => r.final },
    ])
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-3xl font-bold text-ink-900">
            <Award className="h-7 w-7 text-brand-600" /> Finals Evaluations
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-600">
            Complete two-part finals scoring for every finalist — per judge: Part A and Part B marks and
            percentages, the Universal Challenge breakdown inside each part, and the weighted final score.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => load(true)} disabled={loading}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
          <Button variant="secondary" size="sm" onClick={exportCsv} disabled={filtered.length === 0}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        </div>
      </div>

      {err ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700">{err}</div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <div className="w-full max-w-xs">
          <Input icon={Search} placeholder="Search team, code, college…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select
          value={domainFilter}
          onChange={(e) => setDomainFilter(e.target.value)}
          className="h-11 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
        >
          <option value="all">All domains</option>
          {domainOptions.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <span className="text-sm text-ink-500">{filtered.length} finalist team(s)</span>
      </div>

      {loading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : filtered.length === 0 ? (
        <Card className="text-center text-ink-500">
          No finals evaluations yet. Pick finalists on the Finalists tab and run the two-part finals scoring.
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => {
            const open = expanded === r.teamId
            return (
              <Card key={r.teamId} className="overflow-hidden p-0">
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : r.teamId)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[rgb(var(--surface-muted))]"
                >
                  {open ? <ChevronDown className="h-4 w-4 shrink-0 text-ink-400" /> : <ChevronRight className="h-4 w-4 shrink-0 text-ink-400" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-semibold text-ink-900">{r.name}</span>
                      <span className="text-xs text-ink-400">#{r.code}</span>
                      {r.finalist ? (
                        <Badge tone="warn"><Medal className="h-3 w-3" /> Finalist</Badge>
                      ) : null}
                    </div>
                    <div className="truncate text-xs text-ink-500">
                      {r.domain}{r.track ? ` • ${r.track}` : ''}{r.college ? ` • ${r.college}` : ''}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-display text-lg font-bold text-ink-900">{r.avgFinal == null ? '—' : `${r.avgFinal}%`}</div>
                    <div className="text-[11px] text-ink-400">
                      {r.completeCount}/{r.judgeCount || 0} judge(s) done
                    </div>
                  </div>
                </button>

                {open ? (
                  <div className="border-t border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))]/40 p-4">
                    {r.judges.length === 0 ? (
                      <p className="text-sm text-ink-500">Awaiting finals evaluation — no judge has scored this finalist yet.</p>
                    ) : (
                      <div className="space-y-4">
                        {r.judges.map((j, idx) => (
                          <div key={j.judgeId || idx} className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3">
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 text-sm font-medium text-ink-800">
                                <Gavel className="h-4 w-4 text-ink-400" /> {j.judgeLabel}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-ink-500">Weighted final</span>
                                <Badge tone="success">{j.finalPct}%</Badge>
                              </div>
                            </div>
                            <div className="grid gap-3 md:grid-cols-2">
                              <PartColumn
                                label={j.labelA}
                                weight={j.weightA}
                                part={j.partA}
                                statusIcon={<span className={`mr-0.5 inline-block h-2 w-2 rounded-full ${j.statusA === 'submitted' ? 'bg-emerald-500' : 'bg-amber-400'}`} />}
                              />
                              <PartColumn
                                label={j.labelB}
                                weight={j.weightB}
                                part={j.partB}
                                statusIcon={<span className={`mr-0.5 inline-block h-2 w-2 rounded-full ${j.statusB === 'submitted' ? 'bg-emerald-500' : 'bg-amber-400'}`} />}
                              />
                            </div>
                            {(j.feedbackA || j.feedbackB) ? (
                              <div className="mt-3 space-y-1.5 border-t border-[rgb(var(--border))] pt-2 text-xs text-ink-600">
                                {j.feedbackA ? <p><span className="font-semibold text-ink-700">{j.labelA} notes:</span> {j.feedbackA}</p> : null}
                                {j.feedbackB ? <p><span className="font-semibold text-ink-700">{j.labelB} notes:</span> {j.feedbackB}</p> : null}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default AdminFinalsEvaluationsPage
