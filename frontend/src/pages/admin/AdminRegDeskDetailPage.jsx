import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft, Download, RefreshCw, Users, UserCheck, Building2, MapPin, Phone,
  GraduationCap, Crown, Layers, Search, ChevronDown, ClipboardCheck, Clock,
} from 'lucide-react'
import { useApi } from '@/hooks/useApi.js'
import { usePageSeo } from '@/hooks/usePageSeo.js'

const fmtTime = (ms) => (ms ? new Date(ms).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '')

export function AdminRegDeskDetailPage({ basePath = '/admin/registration-desk' }) {
  const { uid } = useParams()
  const api = useApi()
  const [desk, setDesk] = useState(null)
  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(() => new Set())

  usePageSeo({ title: 'Desk Details', description: 'Registration desk teams and attendance details.' })

  const load = useCallback(async (initial = false) => {
    try {
      if (initial) setLoading(true)
      const res = await api.regDeskTeams(uid)
      setDesk(res.desk || null)
      setTeams(res.teams || [])
      setError('')
    } catch (e) { setError(e.message || 'Failed to load') }
    finally { if (initial) setLoading(false) }
  }, [api, uid])

  useEffect(() => { load(true) }, [load])
  useEffect(() => { const id = setInterval(() => load(false), 20000); return () => clearInterval(id) }, [load])

  async function exportCsv() {
    setBusy('export')
    try {
      const blob = await api.regDeskExportAttendance(uid)
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `attendance-${(desk?.email || 'desk').split('@')[0]}-${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(a); a.click(); window.URL.revokeObjectURL(url); document.body.removeChild(a)
    } catch (e) { setError(e.message) } finally { setBusy('') }
  }

  const totals = useMemo(() => {
    let present = 0, total = 0
    teams.forEach((t) => { present += t.presentCount; total += t.totalMembers })
    return { present, total, teams: teams.length, pct: total ? Math.round((present / total) * 100) : 0 }
  }, [teams])

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

  if (loading) return <div className="flex min-h-[50vh] items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" /></div>

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      {/* Back + header */}
      <Link to={basePath} className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-500 hover:text-brand-600">
        <ArrowLeft className="h-4 w-4" /> Registration Desk
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-600"><ClipboardCheck className="h-5 w-5" /></div>
          <div>
            <h1 className="font-display text-2xl font-bold text-ink-900">{desk?.displayName || desk?.email || 'Desk'}</h1>
            {desk?.email && <p className="text-sm text-ink-500">{desk.email}</p>}
          </div>
        </div>
        <div className="flex gap-2">
          <button type="button" disabled={busy === 'export'} onClick={exportCsv} className="inline-flex items-center gap-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-2 text-sm font-semibold text-ink-700 hover:bg-[rgb(var(--surface-muted))] disabled:opacity-50"><Download className="h-4 w-4" /> Export</button>
          <button type="button" onClick={() => load(true)} className="inline-flex items-center gap-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-2 text-sm font-semibold text-ink-700 hover:bg-[rgb(var(--surface-muted))]"><RefreshCw className="h-4 w-4" /> Refresh</button>
        </div>
      </div>

      {/* Assigned domains */}
      <div className="mt-4 flex flex-wrap gap-1.5">
        {(desk?.assignedDomains || []).length === 0 ? (
          <span className="rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-700">No domains assigned to this desk.</span>
        ) : (desk.assignedDomains).map((d) => (
          <span key={d} className="inline-flex items-center gap-1.5 rounded-full bg-brand-500/10 px-3 py-1 text-xs font-semibold text-brand-700"><Layers className="h-3 w-3" /> {d}</span>
        ))}
      </div>

      {error && <p className="mt-4 rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-600">{error}</p>}

      {/* KPIs */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { icon: UserCheck, label: 'Members present', value: `${totals.present}/${totals.total}`, tone: 'text-emerald-600 bg-emerald-500/10' },
          { icon: ClipboardCheck, label: 'Attendance', value: `${totals.pct}%`, tone: 'text-brand-600 bg-brand-500/10' },
          { icon: Users, label: 'Teams', value: totals.teams, tone: 'text-cyan-600 bg-cyan-500/10' },
          { icon: Crown, label: 'Fully checked-in', value: teams.filter((t) => t.totalMembers > 0 && t.presentCount === t.totalMembers).length, tone: 'text-amber-600 bg-amber-500/10' },
        ].map((c) => (
          <div key={c.label} className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 shadow-card">
            <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${c.tone}`}><c.icon className="h-5 w-5" /></div>
            <p className="mt-3 font-display text-2xl font-extrabold text-ink-900">{c.value}</p>
            <p className="text-xs text-ink-500">{c.label}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-[rgb(var(--surface-muted))]">
        <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-brand-500 transition-all" style={{ width: `${totals.pct}%` }} />
      </div>

      {/* Search */}
      <div className="relative mt-6">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search team, college, problem, or member…"
          className="h-11 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] pl-10 pr-4 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20" />
      </div>

      {/* Teams grouped by domain */}
      {groups.length === 0 && <p className="mt-10 text-center text-sm text-ink-500">No qualified teams in this desk&apos;s domains.</p>}
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
                  <button type="button" onClick={() => toggle(team.id)} className="flex w-full items-center gap-3 p-4 text-left">
                    <ChevronDown className={`h-4 w-4 shrink-0 text-ink-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display font-semibold text-ink-900">{team.name}</p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-500">
                        {team.college && <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" /> {team.college}</span>}
                        {team.collegeLocation && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {team.collegeLocation}</span>}
                      </div>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${full ? 'bg-emerald-500/15 text-emerald-700' : 'bg-[rgb(var(--surface-muted))] text-ink-600'}`}>
                      {team.presentCount}/{team.totalMembers}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="border-t border-[rgb(var(--border))]">
                      {team.psTitle && (
                        <p className="border-b border-[rgb(var(--border))]/60 bg-[rgb(var(--surface-muted))]/30 px-4 py-2 text-xs text-ink-500">
                          <span className="font-semibold text-ink-600">Problem:</span> {team.psTitle}{team.track ? ` · ${team.track}` : ''}
                        </p>
                      )}
                      <ul>
                        {team.members.map((m) => (
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
                                {m.college && <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" /> {m.college}</span>}
                                {m.collegeLocation && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {m.collegeLocation}</span>}
                              </div>
                              {m.present && m.attendanceAtMs && (
                                <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-ink-400"><Clock className="h-3 w-3" /> {fmtTime(m.attendanceAtMs)}</span>
                              )}
                            </div>
                            <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${m.present ? 'bg-emerald-500/15 text-emerald-700' : 'bg-red-500/10 text-red-600'}`}>
                              {m.present ? 'Present' : 'Absent'}
                            </span>
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
