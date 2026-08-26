import { useCallback, useEffect, useMemo, useState } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import { ClipboardCheck, Mail, RefreshCw, Check, UserCheck, Users, Download } from 'lucide-react'
import { useApi } from '@/hooks/useApi.js'
import { usePageSeo } from '@/hooks/usePageSeo.js'

const DOMAINS = [
  'Health', 'Education', 'Transportation', 'Food Safety & Security',
  'Waste Management', 'Agriculture', 'Industry & MSME Innovation', 'Open Innovation',
]
const PIE = ['#10b981', '#e2e8f0']

export function AdminRegistrationDeskPage() {
  usePageSeo({ title: 'Registration Desk', description: 'Invite desk staff, assign domains, and track live attendance.' })
  const api = useApi()
  const [accounts, setAccounts] = useState([])
  const [stats, setStats] = useState(null)
  const [drafts, setDrafts] = useState({})
  const [emails, setEmails] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (initial = false) => {
    try {
      if (initial) setLoading(true)
      const [st, stat] = await Promise.all([api.regDeskInviteStatus(), api.regDeskStats()])
      const list = st.participants || []
      setAccounts(list)
      setDrafts(Object.fromEntries(list.map((a) => [a.uid, a.assignedDomains || []])))
      setStats(stat)
    } catch (e) { setMsg(e.message || 'Failed to load') }
    finally { if (initial) setLoading(false) }
  }, [api])

  useEffect(() => { load(true) }, [load])
  useEffect(() => { const id = setInterval(() => api.regDeskStats().then(setStats).catch(() => {}), 20000); return () => clearInterval(id) }, [api])

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

  async function exportAttendance() {
    setBusy('export'); setMsg('')
    try {
      const blob = await api.regDeskExportAttendance()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `registration-desk-attendance-${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      setMsg('Attendance data exported successfully.')
    } catch (e) { setMsg(e.message) } finally { setBusy('') }
  }

  const t = stats?.totals || { present: 0, absent: 0, total: 0, teams: 0, teamsFullyIn: 0 }
  const pieData = useMemo(() => ([{ name: 'Present', value: t.present }, { name: 'Absent', value: t.absent }]), [t.present, t.absent])
  const pct = t.total ? Math.round((t.present / t.total) * 100) : 0

  if (loading) return <div className="flex min-h-[50vh] items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" /></div>

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <div className="flex items-center gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-600"><ClipboardCheck className="h-5 w-5" /></div>
        <div>
          <h1 className="font-display text-2xl font-bold text-ink-900">Registration Desk</h1>
          <p className="text-sm text-ink-500">Invite check-in staff, assign domains, and track live attendance.</p>
        </div>
        <div className="ml-auto flex gap-2">
          <button type="button" disabled={busy === 'export'} onClick={exportAttendance} className="inline-flex items-center gap-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-2 text-sm font-semibold text-ink-700 hover:bg-[rgb(var(--surface-muted))] disabled:opacity-50"><Download className="h-4 w-4" /> Export</button>
          <button type="button" onClick={() => load(true)} className="inline-flex items-center gap-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-2 text-sm font-semibold text-ink-700 hover:bg-[rgb(var(--surface-muted))]"><RefreshCw className="h-4 w-4" /> Refresh</button>
        </div>
      </div>

      {msg && <p className="mt-4 rounded-lg bg-brand-500/10 px-4 py-2 text-sm text-brand-700">{msg}</p>}

      {/* Live attendance dashboard */}
      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 shadow-card">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-bold text-ink-900">Overall attendance</h2>
            <span className="rounded-full bg-brand-500/10 px-2.5 py-1 text-xs font-semibold text-brand-700">Grand Finale Only</span>
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
              <span className="font-display text-3xl font-extrabold text-ink-900">{pct}%</span>
              <span className="text-xs text-ink-500">{t.present}/{t.total}</span>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 shadow-card">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-bold text-ink-900">By domain</h2>
            <div className="flex gap-4 text-xs text-ink-500">
              <span className="inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> {t.teams} teams</span>
              <span className="inline-flex items-center gap-1.5"><UserCheck className="h-3.5 w-3.5" /> {t.teamsFullyIn} fully in</span>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {(stats?.byDomain || []).length === 0 && <p className="text-sm text-ink-500">No teams yet.</p>}
            {(stats?.byDomain || []).slice().sort((a, b) => a.domain.localeCompare(b.domain)).map((d) => {
              const p = d.total ? Math.round((d.present / d.total) * 100) : 0
              return (
                <div key={d.domain}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-ink-800">{d.domain}</span>
                    <span className="text-ink-500">{d.present}/{d.total} · {d.teams} teams</span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-[rgb(var(--surface-muted))]">
                    <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-brand-500" style={{ width: `${p}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Invite */}
      <div className="mt-6 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 shadow-card">
        <h2 className="font-display text-sm font-bold text-ink-900">Invite desk staff</h2>
        <p className="mt-1 text-xs text-ink-500">Comma, space, or newline separated emails. Each gets login credentials by email.</p>
        <textarea value={emails} onChange={(e) => setEmails(e.target.value)} rows={2} placeholder="person1@example.com, person2@example.com"
          className="mt-3 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20" />
        <button type="button" disabled={busy === 'invite'} onClick={invite}
          className="mt-3 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-500/20 disabled:opacity-50">
          <Mail className="h-4 w-4" /> Send invites
        </button>
      </div>

      {/* Accounts + domain assignment */}
      <div className="mt-6 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 shadow-card">
        <h2 className="font-display text-sm font-bold text-ink-900">Desk accounts ({accounts.length})</h2>
        <div className="mt-4 space-y-4">
          {accounts.length === 0 && <p className="text-sm text-ink-500">No desk accounts yet. Invite someone above.</p>}
          {accounts.map((a) => {
            const draft = drafts[a.uid] || []
            const dirty = JSON.stringify([...draft].sort()) !== JSON.stringify([...(a.assignedDomains || [])].sort())
            return (
              <div key={a.uid} className="rounded-xl border border-[rgb(var(--border))] p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink-900">{a.email}</p>
                    <p className="text-xs text-ink-500">
                      {a.loggedIn ? 'Active' : a.passwordSet ? 'Password set' : 'Invited — not logged in'}
                    </p>
                  </div>
                  <button type="button" disabled={!dirty || busy === a.uid} onClick={() => saveDomains(a.uid)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">
                    <Check className="h-3.5 w-3.5" /> Save
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {DOMAINS.map((d) => {
                    const on = draft.includes(d)
                    return (
                      <button key={d} type="button" onClick={() => toggleDomain(a.uid, d)}
                        className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${on ? 'bg-brand-500 text-white' : 'bg-[rgb(var(--surface-muted))] text-ink-600 hover:bg-brand-500/10 hover:text-brand-700'}`}>
                        {d}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
