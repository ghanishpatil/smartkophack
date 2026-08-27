import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import { BarChart3, RefreshCw, UserCheck, TrendingUp, Users, Crown, Layers } from 'lucide-react'
import { useApi } from '@/hooks/useApi.js'
import { usePageSeo } from '@/hooks/usePageSeo.js'

const PIE = ['#10b981', '#e2e8f0']

export function RegDeskAnalyticsPage() {
  usePageSeo({ title: 'Desk Analytics', description: 'Live attendance analytics for your assigned domains.' })
  const api = useApi()
  const [me, setMe] = useState(null)
  const [stats, setStats] = useState(null)
  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async (initial = false) => {
    try {
      if (initial) setLoading(true)
      const [meRes, sRes, tRes] = await Promise.all([api.regDeskMe(), api.regDeskStats(), api.regDeskTeams()])
      setMe(meRes); setStats(sRes); setTeams(tRes.teams || [])
      setError('')
    } catch (e) { setError(e.message || 'Failed to load') }
    finally { if (initial) setLoading(false) }
  }, [api])

  useEffect(() => { load(true) }, [load])
  useEffect(() => { const id = setInterval(() => load(false), 20000); return () => clearInterval(id) }, [load])

  const t = stats?.totals || { present: 0, absent: 0, total: 0, teams: 0, teamsFullyIn: 0 }
  const pct = t.total ? Math.round((t.present / t.total) * 100) : 0
  const byDomain = useMemo(() => (stats?.byDomain || []).slice().sort((a, b) => a.domain.localeCompare(b.domain)), [stats])
  const pieData = useMemo(() => ([{ name: 'Present', value: t.present }, { name: 'Absent', value: t.absent }]), [t.present, t.absent])
  const barData = useMemo(() => byDomain.map((d) => ({ domain: d.domain, Present: d.present, Absent: Math.max(0, d.total - d.present) })), [byDomain])
  const teamRows = useMemo(
    () => teams.slice().sort((a, b) => {
      const pa = a.totalMembers ? a.presentCount / a.totalMembers : 0
      const pb = b.totalMembers ? b.presentCount / b.totalMembers : 0
      return pb - pa || a.name.localeCompare(b.name)
    }),
    [teams],
  )

  if (loading) return <div className="flex min-h-[50vh] items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" /></div>

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600"><BarChart3 className="h-5 w-5" /></div>
          <div>
            <h1 className="font-display text-2xl font-bold text-ink-900">Analytics</h1>
            <p className="text-sm text-ink-500">Live attendance for your assigned domains</p>
          </div>
        </div>
        <button type="button" onClick={() => load(true)} className="inline-flex items-center gap-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-2 text-sm font-semibold text-ink-700 hover:bg-[rgb(var(--surface-muted))]"><RefreshCw className="h-4 w-4" /> Refresh</button>
      </div>

      {/* Assigned domains */}
      <div className="mt-4 flex flex-wrap gap-1.5">
        {(me?.assignedDomains || []).length === 0 ? (
          <span className="rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-700">No domains assigned yet — contact admin.</span>
        ) : (me.assignedDomains).map((d) => (
          <span key={d} className="inline-flex items-center gap-1.5 rounded-full bg-brand-500/10 px-3 py-1 text-xs font-semibold text-brand-700"><Layers className="h-3 w-3" /> {d}</span>
        ))}
      </div>

      {error && <p className="mt-4 rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-600">{error}</p>}

      {/* KPIs */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { icon: UserCheck, label: 'Members present', value: `${t.present}/${t.total}`, tone: 'text-emerald-600 bg-emerald-500/10' },
          { icon: TrendingUp, label: 'Attendance', value: `${pct}%`, tone: 'text-brand-600 bg-brand-500/10' },
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

      {/* Charts */}
      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 shadow-card">
          <h2 className="font-display text-sm font-bold text-ink-900">Overall attendance</h2>
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
              <span className="font-display text-3xl font-extrabold text-ink-900">{pct}%</span>
              <span className="text-xs text-ink-500">{t.present}/{t.total}</span>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 shadow-card">
          <h2 className="font-display text-sm font-bold text-ink-900">Attendance by domain</h2>
          {barData.length === 0 ? (
            <p className="mt-4 text-sm text-ink-500">No qualified teams in your domains yet.</p>
          ) : (
            <div className="mt-2 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }} barCategoryGap="22%">
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="rgb(148 163 184 / 0.2)" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis type="category" dataKey="domain" width={150} tick={{ fontSize: 11, fill: '#475569' }} />
                  <Tooltip cursor={{ fill: 'rgb(148 163 184 / 0.08)' }} />
                  <Legend />
                  <Bar dataKey="Present" stackId="a" fill="#10b981" />
                  <Bar dataKey="Absent" stackId="a" fill="#e2e8f0" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Per-team progress */}
      <div className="mt-5 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 shadow-card">
        <h2 className="font-display text-sm font-bold text-ink-900">Per-team check-in</h2>
        {teamRows.length === 0 ? (
          <p className="mt-4 text-sm text-ink-500">No qualified teams to show.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {teamRows.map((team) => {
              const p = team.totalMembers ? Math.round((team.presentCount / team.totalMembers) * 100) : 0
              const full = team.totalMembers > 0 && team.presentCount === team.totalMembers
              return (
                <div key={team.id}>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate font-medium text-ink-800">
                      {team.name} <span className="text-ink-400">· {team.domain}</span>
                    </span>
                    <span className={`shrink-0 text-xs font-semibold ${full ? 'text-emerald-600' : 'text-ink-500'}`}>{team.presentCount}/{team.totalMembers}</span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-[rgb(var(--surface-muted))]">
                    <div className={`h-full rounded-full transition-all ${full ? 'bg-emerald-500' : 'bg-gradient-to-r from-emerald-500 to-brand-500'}`} style={{ width: `${p}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
