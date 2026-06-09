import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckSquare, Square, Tag, BookOpen } from 'lucide-react'
import { usePageSeo } from '@/hooks/usePageSeo.js'
import { useApi } from '@/hooks/useApi.js'
import { useEvent } from '@/context/EventContext.jsx'
import { publicApi } from '@/services/api.js'
import {
  displayCategory,
  displayDepartment,
  displayOrganization,
  displayTheme,
} from '@/utils/problemStatementDisplay.js'
import { ROLES } from '@/utils/roles.js'
import { Card } from '@/components/ui/Card.jsx'
import { Button } from '@/components/ui/Button.jsx'
import { Badge } from '@/components/ui/Badge.jsx'
import { Skeleton } from '@/components/ui/Skeleton.jsx'
import { Tabs } from '@/components/ui/Tabs.jsx'

// ─── Constants ───────────────────────────────────────────────────────────────

const DOMAINS = [
  'Health',
  'Education',
  'Transportation',
  'Food Safety & Security',
  'Waste Management',
  'Agriculture',
  'Industry & MSME Innovation',
  'Open Innovation',
]

const TRACKS = ['Software', 'Hardware']

// ─── Helpers ─────────────────────────────────────────────────────────────────

function MetaRow({ label, value }) {
  const v = String(value || '').trim()
  if (!v) return null
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-2 gap-y-0.5 text-xs sm:grid-cols-[9rem_minmax(0,1fr)]">
      <dt className="font-semibold uppercase tracking-wide text-ink-500">{label}</dt>
      <dd className="text-ink-800">{v}</dd>
    </div>
  )
}

/** Returns true if a judge's judgeAssignments array covers the given domain+track combo */
function judgeCoversCombo(judgeAssignments, domain, track) {
  if (!Array.isArray(judgeAssignments)) return false
  return judgeAssignments.some((a) => {
    const domainMatch = !a.domain || a.domain === domain
    const trackMatch = !a.track || a.track === track
    return domainMatch && trackMatch
  })
}

/**
 * Get the domain of a PS — stored as `theme` (primary) or `domain` (legacy).
 * This mirrors the backend mentor matching logic.
 */
function getPsDomain(ps) {
  return String(ps.theme || ps.domain || '').trim()
}

/**
 * Get the track of a PS — stored as `category`.
 * This mirrors the backend mentor matching logic.
 */
function getPsTrack(ps) {
  return String(ps.category || '').trim()
}

/** Count how many PS in the list match a domain+track combo */
function countMatchingPs(problems, domain, track) {
  return problems.filter((ps) => {
    const psDomain = getPsDomain(ps)
    const psTrack = getPsTrack(ps)
    const domainMatch = !domain || psDomain === domain
    const trackMatch = !track || psTrack === track
    return domainMatch && trackMatch
  }).length
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ProblemAssignmentCard({ ps, checked, onToggle }) {
  const desc = String(ps.description || '').trim()
  return (
    <label className="flex cursor-pointer gap-3 rounded-xl border border-[rgb(var(--border))] p-3 transition-colors hover:bg-[rgb(var(--surface-muted))]/40">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="mt-1 shrink-0 rounded border-[rgb(var(--border))]"
      />
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="font-medium text-ink-900 text-sm">{ps.title || ps.id}</p>
        <p className="font-mono text-[11px] text-ink-400">{ps.id}</p>
        {desc ? (
          <p className="line-clamp-2 text-xs text-ink-600">{desc}</p>
        ) : null}
        <div className="flex flex-wrap gap-2 pt-0.5">
          {displayOrganization(ps) ? <Badge tone="neutral" className="text-[10px]">{displayOrganization(ps)}</Badge> : null}
          {displayCategory(ps) ? <Badge tone="brand" className="text-[10px]">{displayCategory(ps)}</Badge> : null}
          {ps.track ? <Badge tone={ps.track === 'Software' ? 'success' : 'warn'} className="text-[10px]">{ps.track}</Badge> : null}
          <span className="text-[11px] text-ink-400">{ps.selectionCount ?? 0} team(s)</span>
        </div>
      </div>
    </label>
  )
}

/** Domain × Track grid cell */
function DomainTrackCell({ domain, track, covered, psCount, onToggle, busy }) {
  return (
    <button
      type="button"
      disabled={busy || psCount === 0}
      onClick={onToggle}
      className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-all
        ${covered
          ? 'border-brand-500/50 bg-brand-500/10 ring-1 ring-brand-500/30'
          : psCount === 0
            ? 'cursor-not-allowed border-[rgb(var(--border))] opacity-40'
            : 'border-[rgb(var(--border))] hover:border-brand-500/30 hover:bg-[rgb(var(--surface-muted))]/40'
        }
        ${busy ? 'opacity-60' : ''}
      `}
    >
      <div className="flex w-full items-center justify-between gap-2">
        {covered
          ? <CheckSquare className="h-4 w-4 shrink-0 text-brand-600" />
          : <Square className="h-4 w-4 shrink-0 text-ink-400" />
        }
        <span className={`text-[10px] font-semibold uppercase tracking-wide ${psCount === 0 ? 'text-ink-400' : 'text-ink-600'}`}>
          {psCount} PS
        </span>
      </div>
      <span className="text-xs font-medium text-ink-800 leading-tight">{domain}</span>
      <Badge tone={track === 'Software' ? 'success' : 'warn'} className="text-[10px]">{track}</Badge>
    </button>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function AdminJuryPage() {
  usePageSeo({ title: 'Jury Management', description: 'Assign judges to problem statements.' })
  const api = useApi()
  const { eventId } = useEvent()

  const [users, setUsers] = useState([])
  const [problems, setProblems] = useState([])
  const [judgeId, setJudgeId] = useState('')
  const [selectedProblems, setSelectedProblems] = useState([])
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('domain') // 'domain' | 'ps'

  const refreshData = useCallback(async () => {
    try {
      const [usersData, problemsData] = await Promise.all([
        api.listUsers(),
        publicApi.listProblemStatements(eventId || undefined),
      ])
      setUsers(Array.isArray(usersData) ? usersData : [])
      setProblems(Array.isArray(problemsData) ? problemsData : [])
    } catch {
      setUsers([])
      setProblems([])
    } finally {
      setLoading(false)
    }
  }, [api, eventId])

  useEffect(() => { void refreshData() }, [refreshData])

  // When judge changes, load their current PS assignments
  useEffect(() => {
    if (judgeId) {
      const judge = users.find((u) => u.id === judgeId)
      setSelectedProblems(Array.isArray(judge?.assignedProblemStatementIds) ? judge.assignedProblemStatementIds : [])
    } else {
      setSelectedProblems([])
    }
  }, [judgeId, users])

  const selectedJudge = useMemo(() => users.find((u) => u.id === judgeId), [judgeId, users])
  const judges = useMemo(() => users.filter((u) => u.role === ROLES.JUDGE), [users])

  // ── PS assignment ──────────────────────────────────────────────────────────

  async function savePsAssignment() {
    setMsg('')
    if (!judgeId) { setMsg('Please select a judge.'); return }
    setSaving(true)
    try {
      await api.assignJudgeProblems({ judgeId, problemStatementIds: selectedProblems, eventId })
      setMsg(selectedProblems.length === 0 ? 'PS assignments cleared.' : 'PS assignments saved.')
      await refreshData()
    } catch (e) {
      setMsg(e.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  function toggleProblem(psId) {
    setSelectedProblems((prev) => prev.includes(psId) ? prev.filter((id) => id !== psId) : [...prev, psId])
  }

  // ── Domain+Track assignment ────────────────────────────────────────────────

  async function toggleDomainTrack(domain, track) {
    if (!judgeId) return
    setMsg('')
    setSaving(true)
    const judgeAssignments = selectedJudge?.judgeAssignments || []
    const covered = judgeCoversCombo(judgeAssignments, domain, track)
    try {
      if (covered) {
        await api.unassignJudgeDomainTrack({ judgeId, domain, track })
        setMsg(`Removed: ${domain} / ${track}`)
      } else {
        await api.assignJudgeDomainTrack({ judgeId, domain, track })
        setMsg(`Assigned: ${domain} / ${track}`)
      }
      await refreshData()
    } catch (e) {
      setMsg(e.message || 'Failed')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Skeleton className="h-80 w-full rounded-2xl" />

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      {/* Header */}
      <div>
        <h1 className="font-display text-3xl font-bold text-ink-900">Jury Management</h1>
        <p className="mt-2 text-sm text-ink-600">
          Assign judges by <strong>Domain + Track</strong> (auto-covers all matching problem statements) or by
          specific <strong>Problem Statement</strong>. Both methods work together — a judge sees teams from either.
        </p>
        {eventId ? (
          <p className="mt-1 text-xs text-ink-500">
            Event: <span className="font-medium text-ink-700">{eventId}</span>
          </p>
        ) : null}
      </div>

      {/* Status message */}
      {msg ? (
        <div className={`rounded-xl border px-4 py-3 text-sm ${
          msg.includes('Assigned') || msg.includes('saved') || msg.includes('cleared')
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-900'
            : msg.includes('Removed')
              ? 'border-amber-500/30 bg-amber-500/10 text-amber-900'
              : 'border-red-500/30 bg-red-500/10 text-red-900'
        }`}>
          {msg}
        </div>
      ) : null}

      {/* Judge selector */}
      <Card>
        <h2 className="font-display text-lg font-semibold text-ink-900">Select judge</h2>
        <div className="mt-4">
          <select
            className="h-11 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 text-sm"
            value={judgeId}
            onChange={(e) => { setJudgeId(e.target.value); setMsg('') }}
          >
            <option value="">Choose a judge…</option>
            {judges.map((u) => {
              const psCount = u.assignedProblemStatementIds?.length || 0
              const dtCount = u.judgeAssignments?.length || 0
              const summary = [
                psCount > 0 ? `${psCount} PS` : '',
                dtCount > 0 ? `${dtCount} domain/track` : '',
              ].filter(Boolean).join(', ')
              return (
                <option key={u.id} value={u.id}>
                  {u.email || u.displayName || u.id}
                  {summary ? ` — ${summary}` : ''}
                </option>
              )
            })}
          </select>
          {judges.length === 0 ? (
            <p className="mt-2 text-xs text-amber-700">
              No judges found. Promote users to judge role in Access Control first.
            </p>
          ) : null}
        </div>

        {/* Current assignment summary for selected judge */}
        {selectedJudge ? (
          <div className="mt-4 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))]/40 p-4 space-y-2">
            <p className="text-sm font-semibold text-ink-900">{selectedJudge.email || selectedJudge.displayName}</p>
            <div className="flex flex-wrap gap-2">
              {(selectedJudge.judgeAssignments || []).map((ja, i) => (
                <Badge key={i} tone="brand" className="text-[10px]">
                  {[ja.domain, ja.track].filter(Boolean).join(' / ')}
                </Badge>
              ))}
              {(selectedJudge.assignedProblemStatementIds || []).map((psId) => (
                <Badge key={psId} tone="neutral" className="font-mono text-[10px]">{psId}</Badge>
              ))}
              {!selectedJudge.judgeAssignments?.length && !selectedJudge.assignedProblemStatementIds?.length ? (
                <span className="text-xs text-ink-500">No assignments yet</span>
              ) : null}
            </div>
          </div>
        ) : null}
      </Card>

      {/* Assignment tabs — only show when a judge is selected */}
      {judgeId ? (
        <Card>
          <Tabs
            tabs={[
              { id: 'domain', label: 'By Domain + Track', icon: Tag },
              { id: 'ps', label: 'By Problem Statement', icon: BookOpen },
            ]}
            activeTab={activeTab}
            onChange={setActiveTab}
            variant="pill"
          />

          {/* ── Domain + Track grid ── */}
          {activeTab === 'domain' ? (
            <div className="mt-6 space-y-4">
              <p className="text-sm text-ink-600">
                Click a cell to toggle. A covered cell means the judge evaluates <em>all</em> teams whose problem
                statement belongs to that domain and track — including new ones added later.
                Greyed cells have no problem statements yet.
              </p>

              {/* Grid: rows = domains, cols = tracks */}
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className="pb-3 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-ink-500 w-52">
                        Domain
                      </th>
                      {TRACKS.map((t) => (
                        <th key={t} className="pb-3 px-2 text-center text-xs font-semibold uppercase tracking-wide text-ink-500 w-40">
                          <Badge tone={t === 'Software' ? 'success' : 'warn'}>{t}</Badge>
                        </th>
                      ))}
                      <th className="pb-3 pl-4 text-left text-xs font-semibold uppercase tracking-wide text-ink-500">
                        Any track
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[rgb(var(--border))]">
                    {DOMAINS.map((domain) => {
                      const judgeAssignments = selectedJudge?.judgeAssignments || []
                      return (
                        <tr key={domain}>
                          <td className="py-2 pr-4 text-sm font-medium text-ink-800">{domain}</td>
                          {TRACKS.map((track) => {
                            const covered = judgeCoversCombo(judgeAssignments, domain, track)
                            const psCount = countMatchingPs(problems, domain, track)
                            return (
                              <td key={track} className="py-2 px-2">
                                <DomainTrackCell
                                  domain={domain}
                                  track={track}
                                  covered={covered}
                                  psCount={psCount}
                                  onToggle={() => toggleDomainTrack(domain, track)}
                                  busy={saving}
                                />
                              </td>
                            )
                          })}
                          {/* "Any track" column — domain only, no track filter */}
                          <td className="py-2 pl-4">
                            <DomainTrackCell
                              domain={domain}
                              track={null}
                              covered={judgeCoversCombo(judgeAssignments, domain, null)}
                              psCount={countMatchingPs(problems, domain, null)}
                              onToggle={() => toggleDomainTrack(domain, null)}
                              busy={saving}
                            />
                          </td>
                        </tr>
                      )
                    })}
                    {/* "Any domain" row — track only, no domain filter */}
                    <tr>
                      <td className="py-2 pr-4 text-sm font-medium text-ink-500 italic">Any domain</td>
                      {TRACKS.map((track) => {
                        const judgeAssignments = selectedJudge?.judgeAssignments || []
                        return (
                          <td key={track} className="py-2 px-2">
                            <DomainTrackCell
                              domain={null}
                              track={track}
                              covered={judgeCoversCombo(judgeAssignments, null, track)}
                              psCount={countMatchingPs(problems, null, track)}
                              onToggle={() => toggleDomainTrack(null, track)}
                              busy={saving}
                            />
                          </td>
                        )
                      })}
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>

              <p className="text-xs text-ink-400">
                Changes save immediately on click. No separate save button needed for domain/track assignments.
              </p>
            </div>
          ) : null}

          {/* ── Problem Statement list ── */}
          {activeTab === 'ps' ? (
            <div className="mt-6 space-y-4">
              <p className="text-sm text-ink-600">
                Tick specific problem statements. Use this for fine-grained control when domain/track coverage is too broad.
              </p>
              {problems.length === 0 ? (
                <p className="text-sm text-ink-500">
                  No problem statements found. Create them on the{' '}
                  <Link to="/admin/problems" className="font-medium text-brand-600 underline-offset-2 hover:underline">
                    Problem Statements
                  </Link>{' '}
                  page first.
                </p>
              ) : (
                <div className="max-h-[32rem] space-y-2 overflow-y-auto rounded-xl border border-[rgb(var(--border))] p-3">
                  {problems.map((ps) => (
                    <ProblemAssignmentCard
                      key={ps.id}
                      ps={ps}
                      checked={selectedProblems.includes(ps.id)}
                      onToggle={() => toggleProblem(ps.id)}
                    />
                  ))}
                </div>
              )}

              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  onClick={() => void savePsAssignment()}
                  disabled={saving}
                >
                  {saving ? 'Saving…' : 'Save PS assignments'}
                </Button>
                <span className="text-xs text-ink-500">
                  {selectedProblems.length} selected
                </span>
              </div>
            </div>
          ) : null}
        </Card>
      ) : null}

      {/* ── All judges overview ── */}
      {judges.length > 0 ? (
        <Card>
          <h2 className="font-display text-lg font-semibold text-ink-900 mb-4">All judge assignments</h2>
          <div className="space-y-3">
            {judges.map((judge) => {
              const dtAssignments = judge.judgeAssignments || []
              const psAssignments = judge.assignedProblemStatementIds || []
              const assignedPs = problems.filter((p) => psAssignments.includes(p.id))

              return (
                <div
                  key={judge.id}
                  className="rounded-xl border border-[rgb(var(--border))] p-4 transition-colors hover:bg-[rgb(var(--surface-muted))]/30"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-ink-900">{judge.email || judge.displayName || judge.id}</p>

                      {/* Domain+Track badges */}
                      {dtAssignments.length > 0 ? (
                        <div className="mt-2">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500 mb-1.5">Domain / Track</p>
                          <div className="flex flex-wrap gap-1.5">
                            {dtAssignments.map((ja, i) => (
                              <Badge key={i} tone="brand" className="text-[10px]">
                                {[ja.domain || 'Any domain', ja.track || 'Any track'].join(' / ')}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {/* Specific PS */}
                      {assignedPs.length > 0 ? (
                        <div className="mt-3">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500 mb-1.5">Specific PS</p>
                          <ul className="space-y-1.5">
                            {assignedPs.map((ps) => (
                              <li key={ps.id} className="flex items-center gap-2 text-xs text-ink-700">
                                <span className="font-mono text-[10px] text-ink-400">{ps.id}</span>
                                <span>{ps.title || ps.id}</span>
                                {ps.track ? <Badge tone={ps.track === 'Software' ? 'success' : 'warn'} className="text-[10px]">{ps.track}</Badge> : null}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {dtAssignments.length === 0 && assignedPs.length === 0 ? (
                        <p className="mt-1 text-xs text-ink-500">No assignments</p>
                      ) : null}
                    </div>
                    <Button variant="secondary" size="sm" className="shrink-0" onClick={() => { setJudgeId(judge.id); setMsg('') }}>
                      Edit
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      ) : null}
    </div>
  )
}
