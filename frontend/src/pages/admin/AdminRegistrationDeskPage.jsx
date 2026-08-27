import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import {
  ClipboardCheck, Mail, RefreshCw, Check, UserCheck, Users, Download, Trash2,
  Activity, Layers, CircleUser, TrendingUp,
} from 'lucide-react'
import { useApi } from '@/hooks/useApi.js'
import { usePageSeo } from '@/hooks/usePageSeo.js'

const DOMAINS = [
  'Health', 'Education', 'Transportation', 'Food Safety & Security',
  'Waste Management', 'Agriculture', 'Industry & MSME Innovation', 'Open Innovation',
]
const PIE = ['#10b981', '#e2e8f0']

function statusOf(a) {
  if (a.loggedIn) return { label: 'Active', tone: 'bg-emerald-500/10 text-emerald-700' }
  if (a.passwordSet) return { label: 'Password set', tone: 'bg-brand-500/10 text-brand-700' }
  return { label: 'Invited', tone: 'bg-amber-500/10 text-amber-700' }
}

export function AdminRegistrationDeskPage() {
  usePageSeo({ title: 'Registration Desk', description: 'Invite desk staff, assign domains, and track live attendance analytics.' })
  const api = useApi()
  const [data, setData] = useState(null) // { desks, byDomain, overall }
  const [drafts, setDrafts] = useState({})
  const [emails, setEmails] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (initial = false) => {
    try {
      if (initial) setLoading(true)
      const a = await api.regDeskAnalytics()
      setData(a)
      setDrafts(Object.fromEntries((a.desks || []).map((d) => [d.uid, d.assignedDomains || []])))
    } catch (e) { setMsg(e.message || 'Failed to load') }
    finally { if (initial) setLoading(false) }
  }, [api])

  useEffect(() => { load(true) }, [load])
  useEffect(() => { const id = setInterval(() => api.regDeskAnalytics().then(setData).catch(() => {}), 20000); return () => clearInterval(id) }, [api])

  async function invite() {
    const list = emails.split(/[\s,;]+/).filter(Boolean)
    if (!list.length) return
    setBusy('invite'); setMsg('')
    try {
      const r = await api.bulkInviteRegDesk(list)
      setMsg(`Invited: ${r.summary.created} created, ${r.summary.skipped} skipped, ${r.summary.failed} failed.`)
      setEmails(''); load()
    } catch (e) { setMsg(e.message) } finally { setBusy('') }
  }

  function toggleDomain(uid, d) {
    setDrafts((prev) => {
      const cur = prev[uid] || []
      return { ...prev, [uid]: cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d] }
    })
  }

  async function saveDomains(uid) {
    setBusy(uid); setMsg('')
    try { await api.assignRegDeskDomains(uid, drafts[uid] || []); setMsg('Domains updated.'); load() }
    catch (e) { setMsg(e.message) } finally { setBusy('') }
  }

  async function downloadCsv(deskUid, label) {
    setBusy(deskUid ? `export-${deskUid}` : 'export'); setMsg('')
    try {
      const blob = await api.regDeskExportAttendance(deskUid)
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `attendance-${label}-${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(a); a.click(); window.URL.revokeObjectURL(url); document.body.removeChild(a)
      setMsg('Attendance exported.')
    } catch (e) { setMsg(e.message) } finally { setBusy('') }
  }

  async function clearAttendance() {
    if (!window.confirm('Clear ALL attendance records? This resets every check-in to absent and cannot be undone.')) return
    setBusy('clear'); setMsg('')
    try {
      const r = await api.regDeskClearAttendance()
      setMsg(`Cleared ${r.cleared} attendance records.`)
      load()
    } catch (e) { setMsg(e.message) } finally { setBusy('') }
  }

  const overall = data?.overall || { present: 0, absent: 0, total: 0, teams: 0, pct: 0 }
  const desks = data?.desks || []
  const byDomain = useMemo(() => (data?.byDomain || []).slice().sort((a, b) => a.domain.localeCompare(b.domain)), [data])
  const pieData = useMemo(() => ([{ name: 'Present', value: overall.present }, { name: 'Absent', value: overall.absent }]), [overall.present, overall.absent])
  const barData = useMemo(() => byDomain.map((d) => ({ domain: d.domain, Present: d.present, Absent: Math.max(0, d.total - d.present) })), [byDomain])
  const activeDesks = desks.filter((d) => d.loggedIn).length

  if (loading) return <div className="flex min-h-[50vh] items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" /></div>

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-600"><ClipboardCheck className="h-5 w-5" /></div>
        <div>
          <h1 className="font-display text-2xl font-bold text-ink-900">Registration Desk</h1>
          <p className="text-sm text-ink-500">Invite desk staff, assign domains, and track live check-in analytics.</p>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <button type="button" disabled={busy === 'clear'} onClick={clearAttendance} className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"><Trash2 className="h-4 w-4" /> Clear All</button>
          <button type="button" disabled={busy === 'export'} onClick={() => downloadCsv(null, 'all-domains')} className="inline-flex items-center gap-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-2 text-sm font-semibold text-ink-700 hover:bg-[rgb(var(--surface-muted))] disabled:opacity-50"><Download className="h-4 w-4" /> Export all</button>
          <button type="button" onClick={() => load(true)} className="inline-flex items-center gap-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-2 text-sm font-semibold text-ink-700 hover:bg-[rgb(var(--surface-muted))]"><RefreshCw className="h-4 w-4" /> Refresh</button>
        </div>
      </div>

      {msg && <p className="mt-4 rounded-lg bg-brand-500/10 px-4 py-2 text-sm text-brand-700">{msg}</p>}

      {/* KPI cards */}
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { icon: UserCheck, label: 'Members present', value: `${overall.present}/${overall.total}`, tone: 'text-emerald-600 bg-emerald-500/10' },
          { icon: TrendingUp, label: 'Attendance', value: `${overall.pct}%`, tone: 'text-brand-600 bg-brand-500/10' },
          { icon: Users, label: 'Qualified teams', value: overall.teams, tone: 'text-cyan-600 bg-cyan-500/10' },
          { icon: CircleUser, label: 'Active desks', value: `${activeDesks}/${desks.length}`, tone: 'text-amber-600 bg-amber-500/10' },
        ].map((c) => (
          <div key={c.label} className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 shadow-card">
            <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${c.tone}`}><c.icon className="h-5 w-5" /></div>
            <p className="mt-3 font-display text-2xl font-extrabold text-ink-900">{c.value}</p>
            <p className="text-xs text-ink-500">{c.label}</p>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 shadow-card">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-bold text-ink-900">Overall attendance</h2>
            <span className="rounded-full bg-brand-500/10 px-2.5 py-1 text-xs font-semibold text-brand-700">Grand Finale</span>
          </div>
          <div className="relative mt-2 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={80} paddingAngle={2}>
                  {pieData.map((e, i) => <Cell key={i} fill={PIE[i]} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pb-8">
              <span className="font-display text-3xl font-extrabold text-ink-900">{overall.pct}%</span>
              <span className="text-xs text-ink-500">{overall.present}/{overall.total}</span>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 shadow-card">
          <h2 className="font-display text-sm font-bold text-ink-900">Attendance by domain</h2>
          {barData.length === 0 ? (
            <p className="mt-4 text-sm text-ink-500">No qualified teams yet.</p>
          ) : (
            <div className="mt-2 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }} barCategoryGap="22%">
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="rgb(148 163 184 / 0.2)" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis type="category" dataKey="domain" width={150} tick={{ fontSize: 11, fill: '#475569' }} />
                  <Tooltip cursor={{ fill: 'rgb(148 163 184 / 0.08)' }} />
                  <Legend />
                  <Bar dataKey="Present" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Absent" stackId="a" fill="#e2e8f0" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Desks — per-desk progress + management */}
      <div className="mt-6 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 shadow-card">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-brand-600" />
          <h2 className="font-display text-sm font-bold text-ink-900">Desks & progress ({desks.length})</h2>
        </div>
        <div className="mt-4 space-y-4">
          {desks.length === 0 && <p className="text-sm text-ink-500">No desk accounts yet. Invite someone below.</p>}
          {desks.map((a) => {
            const draft = drafts[a.uid] || []
            const dirty = JSON.stringify([...draft].sort()) !== JSON.stringify([...(a.assignedDomains || [])].sort())
            const st = statusOf(a)
            return (
              <div key={a.uid} className="rounded-xl border border-[rgb(var(--border))] p-4">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-ink-900">{a.email}</p>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${st.tone}`}>{st.label}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-ink-500">
                      {a.teams} teams · {a.marksMade} members checked in by this desk
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" disabled={busy === `export-${a.uid}` || (a.assignedDomains || []).length === 0} onClick={() => downloadCsv(a.uid, (a.email || 'desk').split('@')[0])}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-1.5 text-xs font-semibold text-ink-700 hover:bg-[rgb(var(--surface-muted))] disabled:opacity-40">
                      <Download className="h-3.5 w-3.5" /> Export
                    </button>
                    <button type="button" disabled={!dirty || busy === a.uid} onClick={() => saveDomains(a.uid)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">
                      <Check className="h-3.5 w-3.5" /> Save
                    </button>
                  </div>
                </div>

                {/* progress bar */}
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-ink-600">Check-in progress</span>
                    <span className="text-ink-500">{a.present}/{a.total} · {a.pct}%</span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-[rgb(var(--surface-muted))]">
                    <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-brand-500 transition-all" style={{ width: `${a.pct}%` }} />
                  </div>
                </div>

                {/* domain chips */}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {DOMAINS.map((d) => {
                    const on = draft.includes(d)
                    return (
                      <button key={d} type="button" onClick={() => toggleDomain(a.uid, d)}
                        className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${on ? 'bg-brand-500 text-white' : 'bg-[rgb(var(--surface-muted))] text-ink-600 hover:bg-brand-500/10 hover:text-brand-700'}`}>
                        {on && <Layers className="h-3 w-3" />} {d}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Invite */}
      <div className="mt-6 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 shadow-card">
        <h2 className="font-display text-sm font-bold text-ink-900">Invite desk staff</h2>
        <p className="mt-1 text-xs text-ink-500">Comma, space, or newline separated emails. Each gets login credentials by email. Add as many desks as you need.</p>
        <textarea value={emails} onChange={(e) => setEmails(e.target.value)} rows={2} placeholder="desk1@example.com, desk2@example.com"
          className="mt-3 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20" />
        <button type="button" disabled={busy === 'invite'} onClick={invite}
          className="mt-3 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-500/20 disabled:opacity-50">
          <Mail className="h-4 w-4" /> Send invites
        </button>
      </div>
    </div>
  )
}
