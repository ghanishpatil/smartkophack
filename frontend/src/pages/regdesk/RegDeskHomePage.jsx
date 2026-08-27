import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ClipboardCheck, Users, CheckCircle2, RefreshCw, Search, ChevronDown, UserCheck, UserX,
  Crown, Lock, MapPin, Phone, GraduationCap, Building2, Layers, Clock,
} from 'lucide-react'
import { useApi } from '@/hooks/useApi.js'
import { usePageSeo } from '@/hooks/usePageSeo.js'

const DEFAULT_LOCK_MS = 5 * 60 * 1000

function fmtRemaining(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

export function RegDeskHomePage() {
  usePageSeo({ title: 'Check-in Desk', description: 'Mark attendance for your assigned Grand Finale domains.' })
  const api = useApi()
  const [me, setMe] = useState(null)
  const [teams, setTeams] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(() => new Set())
  const [busy, setBusy] = useState('')
  const [now, setNow] = useState(() => Date.now())

  const lockMs = me?.lockWindowMs || DEFAULT_LOCK_MS

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
  // Resync from server periodically so attendance anchors stay accurate.
  useEffect(() => {
    const id = setInterval(() => load(false), 25000)
    return () => clearInterval(id)
  }, [load])
  // 1s tick drives the live lock countdown.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const refreshStats = useCallback(async () => {
    try { setStats(await api.regDeskStats()) } catch { /* non-fatal */ }
  }, [api])

  const memberLocked = useCallback((m) => Boolean(m.attendanceAtMs) && now - m.attendanceAtMs > lockMs, [now, lockMs])

  async function markMember(teamId, member, present) {
    if (memberLocked(member)) return
    setBusy(member.id)
    const stamp = member.attendanceAtMs || Date.now() // anchor optimistically on first mark
    setTeams((prev) => prev.map((t) => t.id !== teamId ? t : {
      ...t,
      members: t.members.map((m) => m.id === member.id ? { ...m, present, attendanceAtMs: stamp } : m),
      presentCount: t.members.reduce((n, m) => n + ((m.id === member.id ? present : m.present) ? 1 : 0), 0),
    }))
    try { await api.regDeskMarkMember(member.id, present); refreshStats() }
    catch (e) { setError(e.message); load(false) }
    finally { setBusy('') }
  }

  async function markTeam(team, present) {
    setBusy(team.id)
    const stamp = Date.now()
    setTeams((prev) => prev.map((t) => t.id !== team.id ? t : {
      ...t,
      members: t.members.map((m) => memberLocked(m) ? m : { ...m, present, attendanceAtMs: m.attendanceAtMs || stamp }),
      presentCount: t.members.reduce((n, m) => n + ((memberLocked(m) ? m.present : present) ? 1 : 0), 0),
    }))
    try { await api.regDeskMarkTeam(team.id, present); load(false) }
    catch (e) { setError(e.message); load(false) }
    finally { setBusy('') }
  }

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return teams
    return teams.filter((t) =>
      t.name.toLowerCase().includes(s) ||
      (t.psTitle || '').toLowerCase().includes(s) ||
      (t.college || '').toLowerCase().includes(s) ||
      t.members.some((m) => m.name.toLowerCase().includes(s) || (m.email || '').toLowerCase().includes(s)))
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
  const byDomain = (stats?.byDomain || []).slice().sort((a, b) => a.domain.localeCompare(b.domain))

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-600"><ClipboardCheck className="h-5 w-5" /></div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display text-2xl font-bold text-ink-900">Check-in Desk</h1>
                <span className="rounded-full bg-brand-500/10 px-2.5 py-1 text-xs font-semibold text-brand-700">Grand Finale</span>
              </div>
              <p className="text-sm text-ink-500">{me?.displayName || me?.email}</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {(me?.assignedDomains || []).length === 0 ? (
              <span className="rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-700">No domains assigned yet — contact admin.</span>
            ) : (me.assignedDomains).map((d) => (
              <span key={d} className="inline-flex items-center gap-1.5 rounded-full bg-brand-500/10 px-3 py-1 text-xs font-semibold text-brand-700">
                <Layers className="h-3 w-3" /> {d}
              </span>
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
      {/* Overall progress bar */}
      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-[rgb(var(--surface-muted))]">
        <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-brand-500 transition-all" style={{ width: `${pct}%` }} />
      </div>

      {/* Per-domain analytics (shown when the desk covers more than one domain) */}
      {byDomain.length > 1 && (
        <div className="mt-5 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 shadow-card">
          <h2 className="font-display text-sm font-bold text-ink-900">Attendance by domain</h2>
          <div className="mt-4 space-y-3">
            {byDomain.map((d) => {
              const p = d.total ? Math.round((d.present / d.total) * 100) : 0
              return (
                <div key={d.domain}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-ink-800">{d.domain}</span>
                    <span className="text-ink-500">{d.present}/{d.total} · {d.teams} teams · {p}%</span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-[rgb(var(--surface-muted))]">
                    <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-brand-500 transition-all" style={{ width: `${p}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative mt-6">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search team, college, problem, or member…"
          className="h-11 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] pl-10 pr-4 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20" />
      </div>

      {/* Teams grouped by domain */}
      {groups.length === 0 && <p className="mt-10 text-center text-sm text-ink-500">No qualified teams to show.</p>}
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
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-500">
                          {team.college && <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" /> {team.college}</span>}
                          {team.collegeLocation && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {team.collegeLocation}</span>}
                        </div>
                      </div>
                    </button>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${full ? 'bg-emerald-500/15 text-emerald-700' : 'bg-[rgb(var(--surface-muted))] text-ink-600'}`}>
                      {team.presentCount}/{team.totalMembers}
                    </span>
                  </div>
                  {isOpen && (
                    <div className="border-t border-[rgb(var(--border))]">
                      {team.psTitle && (
                        <p className="border-b border-[rgb(var(--border))]/60 bg-[rgb(var(--surface-muted))]/30 px-4 py-2 text-xs text-ink-500">
                          <span className="font-semibold text-ink-600">Problem:</span> {team.psTitle}
                        </p>
                      )}
                      <div className="flex gap-2 border-b border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))]/40 px-4 py-2">
                        <button type="button" disabled={busy === team.id} onClick={() => markTeam(team, true)}
                          className="rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-500/20 disabled:opacity-50">All present</button>
                        <button type="button" disabled={busy === team.id} onClick={() => markTeam(team, false)}
                          className="rounded-lg bg-[rgb(var(--surface))] px-3 py-1.5 text-xs font-semibold text-ink-600 hover:bg-red-500/10 hover:text-red-600 disabled:opacity-50">All absent</button>
                        <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-ink-400"><Clock className="h-3 w-3" /> editable 5 min after marking</span>
                      </div>
                      <ul>
                        {team.members.map((m) => {
                          const locked = memberLocked(m)
                          const remaining = m.attendanceAtMs ? lockMs - (now - m.attendanceAtMs) : 0
                          return (
                            <li key={m.id} className="flex items-start gap-3 border-b border-[rgb(var(--border))]/60 px-4 py-3 last:border-0">
                              <div className="min-w-0 flex-1">
                                <p className="flex items-center gap-1.5 text-sm font-medium text-ink-900">
                                  {m.isLeader && <Crown className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
                                  <span className="truncate">{m.name}</span>
                                  {m.isLeader && <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-700">Leader</span>}
                                </p>
                                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-500">
                                  {m.email && <span className="truncate">{m.email}</span>}
                                  {m.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {m.phone}</span>}
                                  {(m.yearOfStudy || m.department) && (
                                    <span className="inline-flex items-center gap-1"><GraduationCap className="h-3 w-3" /> {[m.yearOfStudy, m.department].filter(Boolean).join(' · ')}</span>
                                  )}
                                </div>
                                {/* lock / editable indicator */}
                                {locked ? (
                                  <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-ink-400"><Lock className="h-3 w-3" /> Locked</span>
                                ) : m.attendanceAtMs ? (
                                  <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-amber-600"><Clock className="h-3 w-3" /> Editable for {fmtRemaining(remaining)}</span>
                                ) : null}
                              </div>
                              <div className="flex shrink-0 gap-1.5">
                                <button type="button" disabled={busy === m.id || locked} onClick={() => markMember(team.id, m, true)}
                                  className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${m.present ? 'bg-emerald-500 text-white' : 'bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20'}`}>
                                  <UserCheck className="h-3.5 w-3.5" /> Present
                                </button>
                                <button type="button" disabled={busy === m.id || locked} onClick={() => markMember(team.id, m, false)}
                                  className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${!m.present && m.attendanceAtMs ? 'bg-red-500 text-white' : 'bg-red-500/10 text-red-600 hover:bg-red-500/20'}`}>
                                  <UserX className="h-3.5 w-3.5" /> Absent
                                </button>
                              </div>
                            </li>
                          )
                        })}
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
