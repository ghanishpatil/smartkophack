import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ClipboardCheck, Users, CheckCircle2, RefreshCw, Search, ChevronDown, UserCheck, UserX, Crown,
} from 'lucide-react'
import { useApi } from '@/hooks/useApi.js'
import { usePageSeo } from '@/hooks/usePageSeo.js'

export function RegDeskHomePage() {
  usePageSeo({ title: 'Check-in Desk', description: 'Mark team attendance for your assigned domains.' })
  const api = useApi()
  const [me, setMe] = useState(null)
  const [teams, setTeams] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(() => new Set())
  const [busy, setBusy] = useState('')

  const load = useCallback(async (initial = false) => {
    try {
      if (initial) setLoading(true)
      const [meRes, tRes, sRes] = await Promise.all([api.regDeskMe(), api.regDeskTeams(), api.regDeskStats()])
      setMe(meRes)
      setTeams(tRes.teams || [])
      setStats(sRes)
      setError('')
    } catch (e) {
      setError(e.message || 'Failed to load')
    } finally {
      if (initial) setLoading(false)
    }
  }, [api])

  useEffect(() => { load(true) }, [load])
  // Light polling so the desk stays roughly live without manual refresh.
  useEffect(() => {
    const id = setInterval(() => load(false), 25000)
    return () => clearInterval(id)
  }, [load])

  const refreshStats = useCallback(async () => {
    try { setStats(await api.regDeskStats()) } catch { /* non-fatal */ }
  }, [api])

  async function markMember(teamId, memberId, present) {
    setBusy(memberId)
    // optimistic
    setTeams((prev) => prev.map((t) => t.id !== teamId ? t : {
      ...t,
      members: t.members.map((m) => m.id === memberId ? { ...m, present } : m),
      presentCount: t.members.reduce((n, m) => n + ((m.id === memberId ? present : m.present) ? 1 : 0), 0),
    }))
    try { await api.regDeskMarkMember(memberId, present); refreshStats() }
    catch (e) { setError(e.message); load(false) }
    finally { setBusy('') }
  }

  async function markTeam(teamId, present) {
    setBusy(teamId)
    setTeams((prev) => prev.map((t) => t.id !== teamId ? t : {
      ...t, members: t.members.map((m) => ({ ...m, present })), presentCount: present ? t.members.length : 0,
    }))
    try { await api.regDeskMarkTeam(teamId, present); refreshStats() }
    catch (e) { setError(e.message); load(false) }
    finally { setBusy('') }
  }

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return teams
    return teams.filter((t) => t.name.toLowerCase().includes(s) || (t.psTitle || '').toLowerCase().includes(s)
      || t.members.some((m) => m.name.toLowerCase().includes(s)))
  }, [teams, q])

  const groups = useMemo(() => {
    const by = {}
    for (const t of filtered) { (by[t.domain || 'Unassigned'] ||= []).push(t) }
    return Object.entries(by).sort((a, b) => a[0].localeCompare(b[0]))
  }, [filtered])

  const toggle = (id) => setOpen((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  if (loading) {
    return <div className="flex min-h-[50vh] items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" /></div>
  }

  const t = stats?.totals || { present: 0, absent: 0, total: 0, teams: 0, teamsFullyIn: 0 }
  const pct = t.total ? Math.round((t.present / t.total) * 100) : 0

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-600"><ClipboardCheck className="h-5 w-5" /></div>
            <div>
              <h1 className="font-display text-2xl font-bold text-ink-900">Check-in Desk</h1>
              <p className="text-sm text-ink-500">{me?.displayName || me?.email}</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {(me?.assignedDomains || []).length === 0 ? (
              <span className="rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-700">No domains assigned yet — contact admin.</span>
            ) : (me.assignedDomains).map((d) => (
              <span key={d} className="rounded-full bg-brand-500/10 px-3 py-1 text-xs font-semibold text-brand-700">{d}</span>
            ))}
          </div>
        </div>
        <button type="button" onClick={() => load(true)} className="inline-flex items-center gap-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-2 text-sm font-semibold text-ink-700 hover:bg-[rgb(var(--surface-muted))]">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {error && <p className="mt-4 rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-600">{error}</p>}

      {/* Live summary */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { icon: UserCheck, label: 'Members present', value: `${t.present}/${t.total}`, tone: 'text-emerald-600 bg-emerald-500/10' },
          { icon: CheckCircle2, label: 'Attendance', value: `${pct}%`, tone: 'text-brand-600 bg-brand-500/10' },
          { icon: Users, label: 'Teams', value: t.teams, tone: 'text-cyan-600 bg-cyan-500/10' },
          { icon: Crown, label: 'Fully checked-in', value: t.teamsFullyIn, tone: 'text-amber-600 bg-amber-500/10' },
        ].map((c) => (
          <div key={c.label} className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 shadow-card">
            <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${c.tone}`}><c.icon className="h-5 w-5" /></div>
            <p className="mt-3 font-display text-2xl font-extrabold text-ink-900">{c.value}</p>
            <p className="text-xs text-ink-500">{c.label}</p>
          </div>
        ))}
      </div>
      {/* progress bar */}
      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-[rgb(var(--surface-muted))]">
        <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-brand-500 transition-all" style={{ width: `${pct}%` }} />
      </div>

      {/* Search */}
      <div className="relative mt-6">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search team, problem, or member…"
          className="h-11 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] pl-10 pr-4 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20" />
      </div>

      {/* Teams grouped by domain */}
      {groups.length === 0 && <p className="mt-10 text-center text-sm text-ink-500">No teams to show.</p>}
      {groups.map(([domain, list]) => (
        <div key={domain} className="mt-8">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="font-display text-sm font-bold uppercase tracking-wide text-ink-700">{domain}</h2>
            <span className="rounded-full bg-[rgb(var(--surface-muted))] px-2 py-0.5 text-xs font-semibold text-ink-500">{list.length}</span>
          </div>
          <div className="space-y-3">
            {list.map((team) => {
              const isOpen = open.has(team.id)
              const full = team.totalMembers > 0 && team.presentCount === team.totalMembers
              return (
                <div key={team.id} className="overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] shadow-card">
                  <div className="flex items-center gap-3 p-4">
                    <button type="button" onClick={() => toggle(team.id)} className="flex flex-1 items-center gap-3 text-left">
                      <ChevronDown className={`h-4 w-4 shrink-0 text-ink-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                      <div className="min-w-0">
                        <p className="truncate font-display font-semibold text-ink-900">{team.name}</p>
                        {team.psTitle && <p className="truncate text-xs text-ink-500">{team.psTitle}</p>}
                      </div>
                    </button>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${full ? 'bg-emerald-500/15 text-emerald-700' : 'bg-[rgb(var(--surface-muted))] text-ink-600'}`}>
                      {team.presentCount}/{team.totalMembers}
                    </span>
                  </div>
                  {isOpen && (
                    <div className="border-t border-[rgb(var(--border))]">
                      <div className="flex gap-2 border-b border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))]/40 px-4 py-2">
                        <button type="button" disabled={busy === team.id} onClick={() => markTeam(team.id, true)}
                          className="rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-500/20 disabled:opacity-50">All present</button>
                        <button type="button" disabled={busy === team.id} onClick={() => markTeam(team.id, false)}
                          className="rounded-lg bg-[rgb(var(--surface))] px-3 py-1.5 text-xs font-semibold text-ink-600 hover:bg-red-500/10 hover:text-red-600 disabled:opacity-50">All absent</button>
                      </div>
                      <ul>
                        {team.members.map((m) => (
                          <li key={m.id} className="flex items-center gap-3 border-b border-[rgb(var(--border))]/60 px-4 py-3 last:border-0">
                            <div className="min-w-0 flex-1">
                              <p className="flex items-center gap-1.5 truncate text-sm font-medium text-ink-900">
                                {m.isLeader && <Crown className="h-3.5 w-3.5 shrink-0 text-amber-500" />}{m.name}
                              </p>
                              {m.email && <p className="truncate text-xs text-ink-500">{m.email}</p>}
                            </div>
                            <div className="flex shrink-0 gap-1.5">
                              <button type="button" disabled={busy === m.id} onClick={() => markMember(team.id, m.id, true)}
                                className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${m.present ? 'bg-emerald-500 text-white' : 'bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20'}`}>
                                <UserCheck className="h-3.5 w-3.5" /> Present
                              </button>
                              <button type="button" disabled={busy === m.id} onClick={() => markMember(team.id, m.id, false)}
                                className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${!m.present ? 'bg-red-500 text-white' : 'bg-red-500/10 text-red-600 hover:bg-red-500/20'}`}>
                                <UserX className="h-3.5 w-3.5" /> Absent
                              </button>
                            </div>
                          </li>
                        ))}
                        {team.members.length === 0 && <li className="px-4 py-3 text-xs text-ink-500">No member details on record.</li>}
                      </ul>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
