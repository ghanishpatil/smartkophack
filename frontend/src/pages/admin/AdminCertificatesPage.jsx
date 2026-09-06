import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Award, Download, Mail, RefreshCw, Search, Save, RotateCcw, Code2, Eye,
  CheckCircle2, Users, Ban, Undo2, Loader2, AlertTriangle, FileBadge,
} from 'lucide-react'
import { useApi } from '@/hooks/useApi.js'
import { usePageSeo } from '@/hooks/usePageSeo.js'
import { CertificateCanvas, printCertificate } from '@/components/certificates/CertificateCanvas.jsx'
import { renderTemplate, sampleValues } from '@/utils/certificate.js'

const FILTERS = [
  { id: 'all', label: 'All teams' },
  { id: 'finalist', label: 'Finalists' },
  { id: 'qualified', label: 'Qualified' },
]

export function AdminCertificatesPage() {
  usePageSeo({ title: 'Certificates', description: 'Issue and email certificates to teams.' })
  const api = useApi()

  const [tab, setTab] = useState('issue') // 'issue' | 'template'
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState(null) // { type: 'ok'|'err', text }
  const [busy, setBusy] = useState('')

  const [teams, setTeams] = useState([])
  const [awards, setAwards] = useState([])
  const [placeholders, setPlaceholders] = useState([])
  const [template, setTemplate] = useState('')
  const [defaultTemplate, setDefaultTemplate] = useState('')
  const [draft, setDraft] = useState('')

  const [selected, setSelected] = useState(() => new Set())
  const [awardId, setAwardId] = useState('')
  const [awardTitle, setAwardTitle] = useState('')
  const [citation, setCitation] = useState('')
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all')
  const [replace, setReplace] = useState(false)

  const [certs, setCerts] = useState([])
  const [summary, setSummary] = useState({ total: 0, emailed: 0, revoked: 0 })

  const load = useCallback(async (initial = false) => {
    try {
      if (initial) setLoading(true)
      const [tpl, tm, list] = await Promise.all([
        api.certTemplate(),
        api.certTeams(),
        api.listCertificates(),
      ])
      setTemplate(tpl.template || '')
      setDraft(tpl.template || '')
      setDefaultTemplate(tpl.defaultTemplate || '')
      setAwards(tpl.awards || [])
      setPlaceholders(tpl.placeholders || [])
      setTeams(tm.teams || [])
      setCerts(list.certificates || [])
      setSummary(list.summary || { total: 0, emailed: 0, revoked: 0 })
      setAwardId((cur) => cur || (tpl.awards?.[0]?.id ?? ''))
    } catch (e) {
      setMsg({ type: 'err', text: e.message || 'Failed to load' })
    } finally {
      if (initial) setLoading(false)
    }
  }, [api])

  useEffect(() => { load(true) }, [load])

  // Keep the editable award title/citation in step with the chosen award.
  useEffect(() => {
    const a = awards.find((x) => x.id === awardId)
    if (a) { setAwardTitle(a.title); setCitation(a.citation) }
  }, [awardId, awards])

  const activeTemplate = template || defaultTemplate

  const previewHtml = useMemo(
    () => renderTemplate(activeTemplate, sampleValues({
      awardTitle,
      citation,
      assetBase: window.location.origin,
      verifyUrl: `${window.location.origin}/verify-certificate`,
    })),
    [activeTemplate, awardTitle, citation],
  )

  const draftPreviewHtml = useMemo(
    () => renderTemplate(draft || defaultTemplate, sampleValues({
      awardTitle, citation,
      assetBase: window.location.origin,
      verifyUrl: `${window.location.origin}/verify-certificate`,
    })),
    [draft, defaultTemplate, awardTitle, citation],
  )

  const visibleTeams = useMemo(() => {
    const s = q.trim().toLowerCase()
    return teams.filter((t) => {
      if (filter === 'finalist' && !t.finalist) return false
      if (filter === 'qualified' && !t.qualified) return false
      if (!s) return true
      return t.teamName.toLowerCase().includes(s)
        || (t.college || '').toLowerCase().includes(s)
        || (t.domain || '').toLowerCase().includes(s)
        || t.members.some((m) => (m.name || '').toLowerCase().includes(s))
    })
  }, [teams, q, filter])

  const selectedTeams = useMemo(() => teams.filter((t) => selected.has(t.teamId)), [teams, selected])
  const recipientCount = selectedTeams.reduce((n, t) => n + t.memberCount, 0)

  const toggle = (id) => setSelected((prev) => {
    const n = new Set(prev)
    n.has(id) ? n.delete(id) : n.add(id)
    return n
  })
  const selectAllVisible = () => setSelected(new Set(visibleTeams.map((t) => t.teamId)))
  const clearSelection = () => setSelected(new Set())

  function downloadSample() {
    const ok = printCertificate(previewHtml, 'SKH-Certificate-Sample')
    if (!ok) setMsg({ type: 'err', text: 'Popup blocked — allow popups for this site to download the sample.' })
  }

  async function saveTemplate() {
    setBusy('save-template'); setMsg(null)
    try {
      await api.saveCertTemplate(draft)
      setTemplate(draft)
      setMsg({ type: 'ok', text: 'Template saved. New certificates will use it.' })
    } catch (e) { setMsg({ type: 'err', text: e.message }) } finally { setBusy('') }
  }

  async function resetTemplate() {
    if (!window.confirm('Reset the certificate template back to the default design?')) return
    setBusy('save-template'); setMsg(null)
    try {
      await api.saveCertTemplate('')
      setTemplate('')
      setDraft(defaultTemplate)
      setMsg({ type: 'ok', text: 'Template reset to the default design.' })
    } catch (e) { setMsg({ type: 'err', text: e.message }) } finally { setBusy('') }
  }

  async function issue() {
    if (!selected.size) return setMsg({ type: 'err', text: 'Select at least one team.' })
    setBusy('issue'); setMsg(null)
    try {
      const r = await api.issueCertificates({
        teamIds: [...selected], awardId, awardTitle, citation, replace,
      })
      setMsg({
        type: 'ok',
        text: `Issued ${r.issued} certificate(s)${r.skipped ? `, skipped ${r.skipped} already issued` : ''}.`,
      })
      const list = await api.listCertificates()
      setCerts(list.certificates || [])
      setSummary(list.summary || summary)
    } catch (e) { setMsg({ type: 'err', text: e.message }) } finally { setBusy('') }
  }

  async function send(onlyUnsent) {
    if (!selected.size) return setMsg({ type: 'err', text: 'Select at least one team.' })
    const label = onlyUnsent ? 'unsent certificates' : 'ALL certificates (including re-sends)'
    if (!window.confirm(`Email ${label} for ${selected.size} team(s)? Every member receives their own certificate at the email entered at registration.`)) return
    setBusy('send'); setMsg(null)
    try {
      const r = await api.sendCertificates({ teamIds: [...selected], awardId, onlyUnsent })
      setMsg({
        type: r.failed ? 'err' : 'ok',
        text: `Sent ${r.sent} email(s) to ${r.recipients} recipient(s) across ${r.teams} team(s)${r.failed ? ` — ${r.failed} failed` : ''}.`,
      })
      const list = await api.listCertificates()
      setCerts(list.certificates || [])
      setSummary(list.summary || summary)
    } catch (e) { setMsg({ type: 'err', text: e.message }) } finally { setBusy('') }
  }

  async function toggleRevoke(cert) {
    setBusy(cert.certId)
    try {
      await api.revokeCertificate(cert.certId, !cert.revoked)
      setCerts((prev) => prev.map((c) => c.certId === cert.certId ? { ...c, revoked: !c.revoked } : c))
    } catch (e) { setMsg({ type: 'err', text: e.message }) } finally { setBusy('') }
  }

  if (loading) {
    return <div className="flex min-h-[50vh] items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" /></div>
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600"><Award className="h-5 w-5" /></div>
        <div>
          <h1 className="font-display text-2xl font-bold text-ink-900">Certificates</h1>
          <p className="text-sm text-ink-500">Issue award certificates and email them to every team member.</p>
        </div>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={downloadSample}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-brand-500/20">
            <Download className="h-4 w-4" /> Download sample
          </button>
          <button type="button" onClick={() => load(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-2 text-sm font-semibold text-ink-700 hover:bg-[rgb(var(--surface-muted))]">
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        </div>
      </div>

      {msg && (
        <p className={`mt-4 flex items-start gap-2 rounded-lg px-4 py-2.5 text-sm ${msg.type === 'ok' ? 'bg-emerald-500/10 text-emerald-700' : 'bg-red-500/10 text-red-600'}`}>
          {msg.type === 'ok' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
          {msg.text}
        </p>
      )}

      {/* Stats */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { icon: FileBadge, label: 'Issued', value: summary.total, tone: 'text-brand-600 bg-brand-500/10' },
          { icon: Mail, label: 'Emailed', value: summary.emailed, tone: 'text-emerald-600 bg-emerald-500/10' },
          { icon: Ban, label: 'Revoked', value: summary.revoked, tone: 'text-red-600 bg-red-500/10' },
          { icon: Users, label: 'Selected recipients', value: recipientCount, tone: 'text-amber-600 bg-amber-500/10' },
        ].map((c) => (
          <div key={c.label} className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 shadow-card">
            <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${c.tone}`}><c.icon className="h-5 w-5" /></div>
            <p className="mt-3 font-display text-2xl font-extrabold text-ink-900">{c.value}</p>
            <p className="text-xs text-ink-500">{c.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="mt-6 flex gap-2 border-b border-[rgb(var(--border))]">
        {[
          { id: 'issue', label: 'Issue & Send', icon: Award },
          { id: 'template', label: 'Certificate Template', icon: Code2 },
        ].map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            className={`-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${tab === t.id ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-500 hover:text-ink-800'}`}>
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'issue' ? (
        <div className="mt-6 grid gap-5 lg:grid-cols-[1.15fr_minmax(0,1fr)]">
          {/* ── Left: award + teams ── */}
          <div className="min-w-0 space-y-5">
            {/* Award */}
            <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 shadow-card">
              <h2 className="font-display text-sm font-bold text-ink-900">1. Choose the award</h2>
              <select value={awardId} onChange={(e) => setAwardId(e.target.value)}
                className="mt-3 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20">
                {awards.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
              </select>

              <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-ink-500">Award title (printed)</label>
              <input value={awardTitle} onChange={(e) => setAwardTitle(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20" />

              <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-ink-500">Citation</label>
              <textarea value={citation} onChange={(e) => setCitation(e.target.value)} rows={3}
                className="mt-1.5 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3 text-sm leading-relaxed focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20" />
              <p className="mt-1.5 text-xs text-ink-400">Edits apply to the certificates you issue next — the preset text is restored when you switch awards.</p>
            </div>

            {/* Teams */}
            <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 shadow-card">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-sm font-bold text-ink-900">2. Select teams ({selected.size})</h2>
                <div className="flex gap-2 text-xs">
                  <button type="button" onClick={selectAllVisible} className="font-semibold text-brand-600 hover:underline">Select visible</button>
                  <span className="text-ink-300">·</span>
                  <button type="button" onClick={clearSelection} className="font-semibold text-ink-500 hover:underline">Clear</button>
                </div>
              </div>

              <div className="relative mt-3">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search team, college, domain, member…"
                  className="h-10 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20" />
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {FILTERS.map((f) => (
                  <button key={f.id} type="button" onClick={() => setFilter(f.id)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${filter === f.id ? 'bg-brand-500 text-white' : 'bg-[rgb(var(--surface-muted))] text-ink-600 hover:bg-brand-500/10 hover:text-brand-700'}`}>
                    {f.label}
                  </button>
                ))}
              </div>

              <div className="mt-3 max-h-[22rem] space-y-1.5 overflow-y-auto pr-1">
                {visibleTeams.length === 0 && <p className="py-6 text-center text-sm text-ink-500">No teams match.</p>}
                {visibleTeams.map((t) => {
                  const on = selected.has(t.teamId)
                  return (
                    <label key={t.teamId}
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${on ? 'border-brand-500/40 bg-brand-500/[0.04]' : 'border-[rgb(var(--border))] hover:bg-[rgb(var(--surface-muted))]/50'}`}>
                      <input type="checkbox" checked={on} onChange={() => toggle(t.teamId)}
                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-ink-300 text-brand-600 focus:ring-brand-500/30" />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate text-sm font-semibold text-ink-900">{t.teamName}</span>
                          {t.finalist && <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-700">Finalist</span>}
                          {t.qualified && <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-700">Qualified</span>}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-ink-500">
                          {t.memberCount} member{t.memberCount === 1 ? '' : 's'}
                          {t.domain ? ` · ${t.domain}` : ''}{t.college ? ` · ${t.college}` : ''}
                        </span>
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>

            {/* Actions */}
            <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 shadow-card">
              <h2 className="font-display text-sm font-bold text-ink-900">3. Issue, then email</h2>
              <p className="mt-1 text-xs text-ink-500">
                Issuing creates one certificate per member ({recipientCount} for the current selection). Emails go to the
                address each member gave at registration — no platform account needed.
              </p>

              <label className="mt-3 flex items-center gap-2 text-xs text-ink-600">
                <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)}
                  className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500/30" />
                Re-issue if a certificate for this award already exists
              </label>

              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" disabled={busy === 'issue' || !selected.size} onClick={issue}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-500/20 disabled:opacity-50">
                  {busy === 'issue' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Award className="h-4 w-4" />} Issue certificates
                </button>
                <button type="button" disabled={busy === 'send' || !selected.size} onClick={() => send(true)}
                  className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">
                  {busy === 'send' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} Email unsent
                </button>
                <button type="button" disabled={busy === 'send' || !selected.size} onClick={() => send(false)}
                  className="inline-flex items-center gap-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-2.5 text-sm font-semibold text-ink-700 hover:bg-[rgb(var(--surface-muted))] disabled:opacity-50">
                  <Mail className="h-4 w-4" /> Re-send all
                </button>
              </div>
            </div>
          </div>

          {/* ── Right: preview + issued list ── */}
          <div className="min-w-0 space-y-5">
            <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 shadow-card">
              <div className="flex items-center justify-between">
                <h2 className="inline-flex items-center gap-2 font-display text-sm font-bold text-ink-900"><Eye className="h-4 w-4" /> Sample preview</h2>
                <span className="rounded-full bg-[rgb(var(--surface-muted))] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-ink-500">A4 landscape</span>
              </div>
              <div className="mt-3 overflow-hidden rounded-lg border border-[rgb(var(--border))]">
                <CertificateCanvas html={previewHtml} />
              </div>
              <button type="button" onClick={downloadSample}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-2.5 text-sm font-semibold text-ink-700 hover:bg-[rgb(var(--surface-muted))]">
                <Download className="h-4 w-4" /> Download this sample (PDF)
              </button>
            </div>

            <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 shadow-card">
              <h2 className="font-display text-sm font-bold text-ink-900">Issued certificates ({certs.length})</h2>
              {certs.length === 0 ? (
                <p className="mt-3 text-sm text-ink-500">Nothing issued yet.</p>
              ) : (
                <div className="mt-3 max-h-[26rem] divide-y divide-[rgb(var(--border))]/60 overflow-y-auto">
                  {certs.map((c) => (
                    <div key={c.certId} className="flex items-start gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-ink-900">
                          <span className="truncate">{c.recipientName || '—'}</span>
                          {c.revoked && <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-red-600">Revoked</span>}
                          {c.emailedAt && !c.revoked && <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-700">Emailed</span>}
                        </p>
                        <p className="truncate text-xs text-ink-500">{c.teamName} · {c.awardTitle}</p>
                        <p className="font-mono text-[10px] text-ink-400">{c.certId}</p>
                      </div>
                      <button type="button" disabled={busy === c.certId} onClick={() => toggleRevoke(c)}
                        title={c.revoked ? 'Restore' : 'Revoke'}
                        className="shrink-0 rounded-lg border border-[rgb(var(--border))] p-1.5 text-ink-500 hover:bg-[rgb(var(--surface-muted))] disabled:opacity-40">
                        {c.revoked ? <Undo2 className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* ── Template editor ── */
        <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="min-w-0 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-sm font-bold text-ink-900">Raw template (HTML)</h2>
              <span className="text-xs text-ink-400">{draft.length.toLocaleString()} chars</span>
            </div>
            <p className="mt-1 text-xs text-ink-500">
              The artwork is the background image; this markup only positions the name, team, award, citation and
              verification line on the 297&times;210mm sheet. Use <code className="rounded bg-[rgb(var(--surface-muted))] px-1">mm</code> units so print stays exact.
            </p>

            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={false} rows={22}
              className="mt-3 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))]/40 p-3 font-mono text-[11px] leading-relaxed focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20" />

            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" disabled={busy === 'save-template' || draft === template} onClick={saveTemplate}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-500/20 disabled:opacity-50">
                {busy === 'save-template' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save template
              </button>
              <button type="button" onClick={() => setDraft(activeTemplate)} disabled={draft === activeTemplate}
                className="inline-flex items-center gap-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-2.5 text-sm font-semibold text-ink-700 hover:bg-[rgb(var(--surface-muted))] disabled:opacity-40">
                <Undo2 className="h-4 w-4" /> Discard changes
              </button>
              <button type="button" onClick={resetTemplate}
                className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-100">
                <RotateCcw className="h-4 w-4" /> Reset to default
              </button>
            </div>

            <div className="mt-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Placeholders</p>
              <div className="mt-2 space-y-1">
                {placeholders.map((p) => (
                  <div key={p.token} className="flex items-baseline gap-2 text-xs">
                    <button type="button"
                      onClick={() => { navigator.clipboard?.writeText(p.token); setMsg({ type: 'ok', text: `Copied ${p.token}` }) }}
                      className="shrink-0 rounded bg-brand-500/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-brand-700 hover:bg-brand-500/20">
                      {p.token}
                    </button>
                    <span className="text-ink-500">{p.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="min-w-0 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 shadow-card">
            <div className="flex items-center justify-between">
              <h2 className="inline-flex items-center gap-2 font-display text-sm font-bold text-ink-900"><Eye className="h-4 w-4" /> Live preview</h2>
              {draft !== template && <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-700">Unsaved</span>}
            </div>
            <div className="mt-3 overflow-hidden rounded-lg border border-[rgb(var(--border))]">
              <CertificateCanvas html={draftPreviewHtml} />
            </div>
            <button type="button"
              onClick={() => printCertificate(draftPreviewHtml, 'SKH-Certificate-Draft')}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-2.5 text-sm font-semibold text-ink-700 hover:bg-[rgb(var(--surface-muted))]">
              <Download className="h-4 w-4" /> Download draft sample (PDF)
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
