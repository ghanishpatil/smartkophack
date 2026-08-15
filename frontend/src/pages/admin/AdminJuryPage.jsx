import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckSquare, Square, Tag, BookOpen, Users, Search, ChevronDown, ChevronRight } from 'lucide-react'
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

// Team qualification statuses (set by judges, viewed by admin).
const JURY_STATUS_TONE = { qualified: 'success', waitlist: 'warn', not_qualified: 'danger' }
const JURY_STATUS_LABEL = { qualified: 'Qualified', waitlist: 'Waitlist', not_qualified: 'Not qualified' }

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
  const [teams, setTeams] = useState([])
  const [judgeId, setJudgeId] = useState('')
  const [selectedProblems, setSelectedProblems] = useState([])
  const [teamSearch, setTeamSearch] = useState('')
  const [statusSearch, setStatusSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all') // all | confirmed | qualified | waitlisted | unset
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('domain') // 'domain' | 'ps' | 'team'
  const [hideAssignedElsewhere, setHideAssignedElsewhere] = useState(true) // By Team tab: hide teams already taken by another judge
  // Expandable team-status rows: show full member details on click.
  const [expandedTeamId, setExpandedTeamId] = useState('')
  const [teamMembers, setTeamMembers] = useState({}) // teamId → { loading, members }

  const refreshData = useCallback(async () => {
    try {
      const [usersData, problemsData, teamsData] = await Promise.all([
        api.listUsers(),
        publicApi.listProblemStatements(eventId || undefined),
        api.adminTeams().catch(() => []),
      ])
      setUsers(Array.isArray(usersData) ? usersData : [])
      setProblems(Array.isArray(problemsData) ? problemsData : [])
      setTeams(Array.isArray(teamsData) ? teamsData : [])
    } catch {
      setUsers([])
      setProblems([])
      setTeams([])
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

  // Map judge uid → display label (for showing which judge a team is already assigned to)
  const judgeLabelById = useMemo(() => {
    const m = {}
    for (const u of users) m[u.id] = u.email || u.displayName || u.id
    return m
  }, [users])

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

  // ── Direct team assignment ─────────────────────────────────────────────────

  async function toggleTeamAssign(teamId) {
    if (!judgeId) return
    setMsg('')
    setSaving(true)
    const team = teams.find((t) => t.id === teamId)
    const assigned = Array.isArray(team?.judgeIds) && team.judgeIds.includes(judgeId)
    try {
      if (assigned) {
        await api.unassignJudgeTeam({ judgeId, teamId })
        setMsg('Removed team assignment.')
      } else {
        await api.assignJudgeTeam({ judgeId, teamId })
        setMsg('Assigned team.')
      }
      await refreshData()
    } catch (e) {
      setMsg(e.message || 'Failed')
    } finally {
      setSaving(false)
    }
  }

  const filteredTeams = useMemo(() => {
    const q = teamSearch.trim().toLowerCase()
    let list = q
      ? teams.filter((t) => `${t.name || ''} ${t.inviteCode || ''} ${t.id}`.toLowerCase().includes(q))
      : teams
    // Hide teams already assigned to a DIFFERENT judge (keep unassigned teams and this judge's own).
    if (hideAssignedElsewhere) {
      list = list.filter((t) => {
        const ids = Array.isArray(t.judgeIds) ? t.judgeIds : []
        const assignedToOther = ids.some((id) => id !== judgeId)
        const assignedToCurrent = ids.includes(judgeId)
        return assignedToCurrent || !assignedToOther
      })
    }
    return [...list].sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id)))
  }, [teams, teamSearch, hideAssignedElsewhere, judgeId])

  const assignedTeamsForJudge = useMemo(
    () => (judgeId ? teams.filter((t) => Array.isArray(t.judgeIds) && t.judgeIds.includes(judgeId)) : []),
    [teams, judgeId],
  )

  // ── Team status (confirmed / qualified / waitlisted) — read-only for admin;
  //    set by judges during evaluation. ────────────────────────────────────────

  const statusCounts = useMemo(() => {
    const c = { qualified: 0, waitlist: 0, not_qualified: 0, unset: 0 }
    for (const t of teams) {
      if (t.juryStatus === 'qualified') c.qualified++
      else if (t.juryStatus === 'waitlist') c.waitlist++
      else if (t.juryStatus === 'not_qualified') c.not_qualified++
      else c.unset++
    }
    return c
  }, [teams])

  const statusTeams = useMemo(() => {
    const q = statusSearch.trim().toLowerCase()
    let list = teams
    if (statusFilter === 'unset') list = list.filter((t) => !t.juryStatus)
    else if (statusFilter !== 'all') list = list.filter((t) => t.juryStatus === statusFilter)
    if (q) list = list.filter((t) => `${t.name || ''} ${t.inviteCode || ''} ${t.id}`.toLowerCase().includes(q))
    return [...list].sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id)))
  }, [teams, statusFilter, statusSearch])

  // Toggle a team row open and lazily load its member details (leader-entered,
  // stored separately from account UIDs) — same source used by the Teams page.
  const toggleTeamDetails = useCallback(async (teamId) => {
    if (expandedTeamId === teamId) { setExpandedTeamId(''); return }
    setExpandedTeamId(teamId)
    if (teamMembers[teamId]) return // already cached
    setTeamMembers((prev) => ({ ...prev, [teamId]: { loading: true, members: [] } }))
    try {
      const res = await api.teamMemberRegistrations(teamId)
      const members = Array.isArray(res?.registrations) ? res.registrations : []
      setTeamMembers((prev) => ({ ...prev, [teamId]: { loading: false, members } }))
    } catch {
      setTeamMembers((prev) => ({ ...prev, [teamId]: { loading: false, members: [] } }))
    }
  }, [api, expandedTeamId, teamMembers])

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

      {/* Team status management */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink-900">Team status</h2>
            <p className="mt-1 text-sm text-ink-600">
              Teams marked <strong>Confirmed</strong>, <strong>Qualified</strong>, or <strong>Waitlisted</strong> by the
              judges. This view is read-only — statuses are set by judges during evaluation.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="success">{statusCounts.qualified} qualified</Badge>
            <Badge tone="warn">{statusCounts.waitlist} waitlist</Badge>
            <Badge tone="danger">{statusCounts.not_qualified} not qualified</Badge>
            <Badge tone="neutral">{statusCounts.unset} unset</Badge>
          </div>
        </div>

        {/* Filter chips */}
        <div className="mt-4 flex flex-wrap gap-2">
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

        {/* Search */}
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            value={statusSearch}
            onChange={(e) => setStatusSearch(e.target.value)}
            placeholder="Search team by name or code…"
            className="w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-2.5 pl-9 pr-3 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />
        </div>

        {teams.length === 0 ? (
          <p className="mt-4 text-sm text-ink-500">No teams found yet.</p>
        ) : statusTeams.length === 0 ? (
          <p className="mt-4 text-sm text-ink-500">No teams match this filter.</p>
        ) : (
          <div className="mt-4 max-h-[34rem] space-y-2 overflow-y-auto rounded-xl border border-[rgb(var(--border))] p-3">
            {statusTeams.map((t) => {
              const isOpen = expandedTeamId === t.id
              const detail = teamMembers[t.id]
              return (
                <div key={t.id} className="rounded-xl border border-[rgb(var(--border))]">
                  <button
                    type="button"
                    onClick={() => toggleTeamDetails(t.id)}
                    className="flex w-full items-center gap-2 p-3 text-left transition-colors hover:bg-[rgb(var(--surface-muted))]/40"
                  >
                    {isOpen
                      ? <ChevronDown className="h-4 w-4 shrink-0 text-brand-600" />
                      : <ChevronRight className="h-4 w-4 shrink-0 text-ink-400" />}
                    <div className="min-w-0 flex-1">
                      <span className="truncate text-sm font-medium text-ink-900">{t.name || 'Unnamed team'}</span>
                      <p className="text-xs text-ink-500">
                        <span className="font-mono">{t.inviteCode || t.id.slice(0, 6)}</span>
                        {t.problemStatementId ? <span> · PS <span className="font-mono">{t.problemStatementId}</span></span> : ''}
                      </p>
                    </div>
                    {t.juryStatus ? (
                      <Badge tone={JURY_STATUS_TONE[t.juryStatus] || 'neutral'} className="shrink-0 text-xs">{JURY_STATUS_LABEL[t.juryStatus] || t.juryStatus}</Badge>
                    ) : (
                      <Badge tone="neutral" className="shrink-0 text-xs">Unset</Badge>
                    )}
                  </button>

                  {isOpen ? (
                    <div className="border-t border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))]/30 p-3">
                      {detail?.loading ? (
                        <p className="text-xs text-ink-400">Loading team members…</p>
                      ) : detail && detail.members.length > 0 ? (
                        <div className="space-y-2">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">
                            Team members ({detail.members.length})
                          </p>
                          {detail.members
                            .slice()
                            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                            .map((m) => (
                              <div key={m.id} className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-2.5">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-sm font-semibold text-ink-900">{m.name || '—'}</span>
                                  {m.isLeader ? <span className="rounded bg-brand-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700">Leader</span> : null}
                                </div>
                                <div className="mt-1 grid gap-x-3 gap-y-0.5 text-[11px] text-ink-600 sm:grid-cols-2">
                                  {m.email ? <span className="truncate">✉ {m.email}</span> : null}
                                  {m.phone ? <span>☎ {m.phone}</span> : null}
                                  {m.institute ? <span className="truncate">🏫 {m.institute}</span> : null}
                                  {m.collegeLocation ? <span className="truncate">📍 {m.collegeLocation}</span> : null}
                                  {m.yearOfStudy ? <span>🎓 {m.yearOfStudy}</span> : null}
                                  {m.department ? <span className="truncate">🏷 {m.department}</span> : null}
                                </div>
                              </div>
                            ))}
                        </div>
                      ) : (
                        <p className="text-xs text-ink-400">No member details recorded for this team.</p>
                      )}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </Card>

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
              {assignedTeamsForJudge.map((t) => (
                <Badge key={t.id} tone="success" className="text-[10px]">Team: {t.name || t.id}</Badge>
              ))}
              {!selectedJudge.judgeAssignments?.length && !selectedJudge.assignedProblemStatementIds?.length && assignedTeamsForJudge.length === 0 ? (
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
              { id: 'team', label: 'By Team', icon: Users },
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

          {/* ── Direct team assignment ── */}
          {activeTab === 'team' ? (
            <div className="mt-6 space-y-4">
              <p className="text-sm text-ink-600">
                Assign this judge directly to specific teams. The judge can then evaluate those teams
                regardless of problem statement or domain/track. Changes save immediately.
              </p>

              <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-ink-700">
                <input
                  type="checkbox"
                  checked={hideAssignedElsewhere}
                  onChange={(e) => setHideAssignedElsewhere(e.target.checked)}
                  className="rounded border-[rgb(var(--border))]"
                />
                Hide teams already assigned to other judges
              </label>

              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                <input
                  value={teamSearch}
                  onChange={(e) => setTeamSearch(e.target.value)}
                  placeholder="Search team by name or code…"
                  className="w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-2.5 pl-9 pr-3 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                />
              </div>

              {teams.length === 0 ? (
                <p className="text-sm text-ink-500">No teams found yet.</p>
              ) : (
                <div className="max-h-[32rem] space-y-2 overflow-y-auto rounded-xl border border-[rgb(var(--border))] p-3">
                  {filteredTeams.map((t) => {
                    const ids = Array.isArray(t.judgeIds) ? t.judgeIds : []
                    const assignedToCurrent = ids.includes(judgeId)
                    const otherJudges = ids.filter((id) => id !== judgeId).map((id) => judgeLabelById[id] || id)
                    const assignedToOther = otherJudges.length > 0
                    return (
                      <div key={t.id} className="flex items-center justify-between gap-3 rounded-xl border border-[rgb(var(--border))] p-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-ink-900">{t.name || 'Unnamed team'}</p>
                          <p className="text-xs text-ink-500">
                            <span className="font-mono">{t.inviteCode || t.id.slice(0, 6)}</span>
                            {t.problemStatementId ? <span> · PS <span className="font-mono">{t.problemStatementId}</span></span> : ' · no PS selected'}
                          </p>
                          {assignedToOther ? (
                            <p className="mt-1 truncate text-[11px] font-medium text-amber-700">
                              Assigned to {otherJudges.join(', ')}
                            </p>
                          ) : null}
                        </div>
                        {assignedToCurrent ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            disabled={saving}
                            className="shrink-0"
                            onClick={() => void toggleTeamAssign(t.id)}
                          >
                            Assigned ✓ — Remove
                          </Button>
                        ) : assignedToOther ? (
                          <Badge tone="warn" className="shrink-0 text-xs">Assigned</Badge>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="primary"
                            disabled={saving}
                            className="shrink-0"
                            onClick={() => void toggleTeamAssign(t.id)}
                          >
                            Assign
                          </Button>
                        )}
                      </div>
                    )
                  })}
                  {filteredTeams.length === 0 ? (
                    <p className="px-1 py-2 text-sm text-ink-500">
                      {teamSearch.trim()
                        ? 'No teams match your search.'
                        : hideAssignedElsewhere
                          ? 'No unassigned teams left. Uncheck the filter above to see teams assigned to other judges.'
                          : 'No teams found yet.'}
                    </p>
                  ) : null}
                </div>
              )}
              <p className="text-xs text-ink-400">{assignedTeamsForJudge.length} team(s) directly assigned to this judge.</p>
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
              const assignedTeams = teams.filter((t) => Array.isArray(t.judgeIds) && t.judgeIds.includes(judge.id))

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

                      {/* Directly assigned teams */}
                      {assignedTeams.length > 0 ? (
                        <div className="mt-3">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500 mb-1.5">Direct teams</p>
                          <div className="flex flex-wrap gap-1.5">
                            {assignedTeams.map((t) => (
                              <Badge key={t.id} tone="success" className="text-[10px]">{t.name || t.id}</Badge>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {dtAssignments.length === 0 && assignedPs.length === 0 && assignedTeams.length === 0 ? (
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
