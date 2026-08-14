import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Download } from 'lucide-react'
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { usePageSeo } from '@/hooks/usePageSeo.js'
import { useApi } from '@/hooks/useApi.js'
import { Card } from '@/components/ui/Card.jsx'
import { Button } from '@/components/ui/Button.jsx'
import { Skeleton } from '@/components/ui/Skeleton.jsx'
import { Badge } from '@/components/ui/Badge.jsx'
import { downloadCsv } from '@/utils/csvExport.js'
import { cn } from '@/utils/cn.js'

const COLORS = {
  brand: '#3b82f6',
  success: '#10b981',
  warn: '#f59e0b',
  danger: '#ef4444',
  purple: '#8b5cf6',
  cyan: '#06b6d4',
  neutral: '#64748b',
}

const PIE_COLORS = [COLORS.success, COLORS.warn, COLORS.danger, COLORS.neutral, COLORS.purple]

function StageBar({ label, value, max, className }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div className="space-y-1">
      <div className="flex justify-between gap-2 text-xs text-ink-600">
        <span>{label}</span>
        <span className="font-mono text-ink-900">{value} <span className="text-ink-400">({pct}%)</span></span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-[rgb(var(--surface-muted))]">
        <motion.div
          className={cn('h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-400', className)}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
    </div>
  )
}

function StatMini({ label, value, tone = 'brand' }) {
  const toneColors = {
    brand: 'border-brand-500/20 bg-brand-500/5',
    success: 'border-emerald-500/20 bg-emerald-500/5',
    warn: 'border-amber-500/20 bg-amber-500/5',
    danger: 'border-red-500/20 bg-red-500/5',
    neutral: 'border-[rgb(var(--border))]',
  }
  return (
    <div className={cn('rounded-xl border px-4 py-3 text-center', toneColors[tone])}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">{label}</p>
      <p className="mt-1 font-display text-xl font-bold text-ink-900">{value}</p>
    </div>
  )
}

export function AdminReportsPage() {
  usePageSeo({ title: 'Reports & Analytics', description: 'Advanced analytics dashboard.' })
  const api = useApi()
  const [stats, setStats] = useState(null)
  const [teams, setTeams] = useState([])
  const [subs, setSubs] = useState([])
  const [evals, setEvals] = useState([])
  const [problems, setProblems] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [s, t, sub, evRows, ps] = await Promise.all([
        api.adminStats(),
        api.adminTeams(),
        api.adminSubmissions(),
        api.adminEvaluations().catch(() => []),
        api.listAdminProblemStatements().catch(() => []),
      ])
      setStats(s)
      setTeams(Array.isArray(t) ? t : [])
      setSubs(Array.isArray(sub) ? sub : [])
      setEvals(Array.isArray(evRows) ? evRows : [])
      setProblems(Array.isArray(ps) ? ps : [])
    } catch {
      setStats(null)
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => { void load() }, [load])

  // Derived chart data
  const registrationPieData = useMemo(() => {
    const rsc = stats?.registrationStatusCounts || {}
    return [
      { name: 'Registered', value: rsc.registered || 0 },
      { name: 'Pending', value: rsc.pending || 0 },
      { name: 'Blocked', value: rsc.blocked || 0 },
      { name: 'Rejected', value: rsc.rejected || 0 },
    ].filter((d) => d.value > 0)
  }, [stats])

  const paymentPieData = useMemo(() => {
    const pay = stats?.paymentBreakdown || {}
    return [
      { name: 'Paid', value: pay.paid || 0 },
      { name: 'Pending', value: pay.pending || 0 },
      { name: 'Waived', value: pay.waived || 0 },
      { name: 'Not Required', value: pay.not_required || 0 },
    ].filter((d) => d.value > 0)
  }, [stats])

  const problemBarData = useMemo(() => {
    const psTop = stats?.problemStatementsTop || []
    return psTop.slice(0, 8).map((p) => ({
      name: (p.title || '').length > 20 ? p.title.slice(0, 20) + '…' : p.title,
      teams: p.selectionCount || 0,
    }))
  }, [stats])

  const evaluationBarData = useMemo(() => {
    const submitted = evals.filter((e) => e.evaluationStatus === 'submitted').length
    const draft = evals.filter((e) => e.evaluationStatus === 'draft').length
    const pending = evals.filter((e) => !e.evaluationStatus || e.evaluationStatus === 'pending').length
    return [
      { name: 'Submitted', count: submitted },
      { name: 'Draft', count: draft },
      { name: 'Pending', count: pending },
    ]
  }, [evals])

  // Teams per domain: map each team's selected problem statement to its domain
  // (theme is the Domain field; domain is a legacy mirror). Counts how many
  // teams are participating in each domain.
  const domainDistribution = useMemo(() => {
    const psDomain = new Map()
    for (const ps of problems) {
      psDomain.set(ps.id, ps.theme || ps.domain || 'Unspecified')
    }
    const counts = new Map()
    let noPs = 0
    for (const t of teams) {
      const pid = t.problemStatementId
      if (!pid) { noPs++; continue }
      const domain = psDomain.get(pid) || 'Unknown'
      counts.set(domain, (counts.get(domain) || 0) + 1)
    }
    const rows = [...counts.entries()]
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count)
    return { rows, noPs, totalWithPs: teams.length - noPs }
  }, [problems, teams])

  // Teams per track: map each team's selected problem statement to its track
  // (category is the Track field — Software / Hardware).
  const trackDistribution = useMemo(() => {
    const psTrack = new Map()
    for (const ps of problems) {
      psTrack.set(ps.id, ps.category || 'Unspecified')
    }
    const counts = new Map()
    let noPs = 0
    for (const t of teams) {
      const pid = t.problemStatementId
      if (!pid) { noPs++; continue }
      const track = psTrack.get(pid) || 'Unknown'
      counts.set(track, (counts.get(track) || 0) + 1)
    }
    const rows = [...counts.entries()]
      .map(([track, count]) => ({ track, count }))
      .sort((a, b) => b.count - a.count)
    return { rows, noPs, totalWithPs: teams.length - noPs }
  }, [problems, teams])

  // Open Innovation teams broken down by the participant's own problem domain
  // (selfDomain — e.g. Waste Management, Health, Other). Open Innovation problem
  // statements are participant-submitted; their official theme is always
  // "Open Innovation", but each carries the author's chosen domain in selfDomain.
  const openInnovationByDomain = useMemo(() => {
    const isOpenInnovation = (ps) => {
      const domain = String(ps.theme || ps.domain || '').toLowerCase()
      return domain === 'open innovation' || ps.origin === 'open_innovation'
    }
    const oiDomain = new Map()
    for (const ps of problems) {
      if (isOpenInnovation(ps)) oiDomain.set(ps.id, ps.selfDomain || 'Unspecified')
    }
    const counts = new Map()
    let total = 0
    for (const t of teams) {
      const pid = t.problemStatementId
      if (!pid || !oiDomain.has(pid)) continue
      const domain = oiDomain.get(pid) || 'Unspecified'
      counts.set(domain, (counts.get(domain) || 0) + 1)
      total++
    }
    const rows = [...counts.entries()]
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count)
    return { rows, total }
  }, [problems, teams])

  const submissionStats = useMemo(() => {
    const finalized = subs.filter((s) => s.status === 'submitted' || s.finalizedAt).length
    const inProgress = subs.filter((s) => s.status !== 'submitted' && !s.finalizedAt && (s.pptUrl || s.githubUrl || s.pdfUrl || s.videoUrl)).length
    const notStarted = (stats?.submissionsEligibleTeams || 0) - finalized - inProgress
    return { finalized, inProgress, notStarted: Math.max(0, notStarted) }
  }, [subs, stats])

  function exportTeams() {
    downloadCsv(`teams-report-${Date.now()}.csv`, teams, [
      { header: 'ID', accessor: (r) => r.id },
      { header: 'Name', accessor: (r) => r.name },
      { header: 'Registration', accessor: (r) => r.registrationStatus },
      { header: 'Payment', accessor: (r) => r.paymentStatus },
      { header: 'Problem Statement', accessor: (r) => r.problemStatementId },
      { header: 'Submitted', accessor: (r) => r.submissionLocked ? 'Yes' : 'No' },
      { header: 'Shortlisted', accessor: (r) => r.shortlisted ? 'Yes' : 'No' },
      { header: 'Members', accessor: (r) => (r.memberIds || []).length },
    ])
  }

  function exportEvaluations() {
    downloadCsv(`evaluations-report-${Date.now()}.csv`, evals, [
      { header: 'ID', accessor: (r) => r.id },
      { header: 'Team', accessor: (r) => r.teamId },
      { header: 'Judge', accessor: (r) => r.judgeId },
      { header: 'Status', accessor: (r) => r.evaluationStatus },
      { header: 'Scores', accessor: (r) => JSON.stringify(r.scores || {}) },
      { header: 'Feedback', accessor: (r) => r.feedback || '' },
    ])
  }

  // Download a professional, page-aligned PDF of the report. Clones the report
  // (with the app stylesheets + already-rendered SVG charts) into a clean print
  // window, adds a branded header, keeps each card/chart from splitting across
  // pages, and appends an Overall Summary at the end.
  function downloadReportPdf() {
    const node = document.getElementById('report-root')
    if (!node) { window.print(); return }

    const head = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
      .map((el) => el.outerHTML)
      .join('\n')

    const origin = window.location.origin
    const generated = new Date().toLocaleString('en-IN')
    const num = (v) => (v == null ? '0' : String(v))
    const topDomain = domainDistribution.rows[0]
    const topTrack = trackDistribution.rows[0]
    const eligible = stats?.submissionsEligibleTeams || 0
    const completionPct = eligible > 0 ? Math.round((submissionStats.finalized / eligible) * 100) : 0

    const row = (label, value) => `<tr><td>${label}</td><td>${value}</td></tr>`
    const summaryHtml = `
      <section class="pdf-summary">
        <h2>Overall Summary</h2>
        <table>
          ${row('Total teams', num(stats?.teamsTotal))}
          ${row('Registered', num(stats?.teamsRegistered))}
          ${row('Payments pending', num(stats?.paymentsPending))}
          ${row('Shortlisted teams', num(stats?.shortlistedTeams))}
          ${row('Jury members', num(stats?.judgeCount))}
          ${row('Submissions — finalized', num(submissionStats.finalized))}
          ${row('Submissions — in progress', num(submissionStats.inProgress))}
          ${row('Submissions — not started', num(submissionStats.notStarted))}
          ${row('Submission completion rate', `${completionPct}%`)}
          ${row('Evaluation coverage', stats?.evaluationCompletionPct != null ? `${stats.evaluationCompletionPct}%` : '—')}
          ${row('Teams that selected a problem statement', num(domainDistribution.totalWithPs))}
          ${topDomain ? row('Most popular domain', `${topDomain.domain} (${topDomain.count})`) : ''}
          ${topTrack ? row('Most popular track', `${topTrack.track} (${topTrack.count})`) : ''}
        </table>
      </section>`

    const docHtml = `<!doctype html><html><head><meta charset="utf-8" />
      <title>SKH Analytics Report</title>
      ${head}
      <style>
        *{ -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; box-shadow:none !important; }
        html,body{ background:#fff !important; margin:0; padding:0; color:#0f172a; font-family:'Inter',Arial,sans-serif; }
        .pdf-wrap{ padding:24px; }
        .pdf-header{ display:flex; align-items:center; gap:14px; border-bottom:3px solid #185983; padding-bottom:14px; margin-bottom:22px; }
        .pdf-header img{ height:46px; width:46px; object-fit:contain; }
        .pdf-h1{ font-size:22px; font-weight:800; margin:0; }
        .pdf-sub{ font-size:12px; color:#64748b; margin:2px 0 0; }
        .no-print{ display:none !important; }
        /* Drop the in-app page header (title row + buttons) — replaced by pdf-header */
        #report-root > div:first-child{ display:none !important; }
        #report-root{ padding:0 !important; }
        /* Keep each card & chart on a single page */
        #report-root .rounded-2xl, #report-root .rounded-xl,
        .recharts-wrapper, .recharts-responsive-container{
          break-inside:avoid !important; page-break-inside:avoid !important;
        }
        .pdf-summary{ margin-top:26px; break-inside:avoid; page-break-inside:avoid; }
        .pdf-summary h2{ font-size:18px; font-weight:800; border-left:5px solid #185983; padding-left:10px; margin:0 0 12px; }
        .pdf-summary table{ width:100%; border-collapse:collapse; font-size:13px; }
        .pdf-summary td{ border:1px solid #e2e8f0; padding:8px 12px; }
        .pdf-summary td:first-child{ color:#475569; width:60%; }
        .pdf-summary td:last-child{ font-weight:700; text-align:right; }
        .pdf-foot{ margin-top:22px; text-align:center; font-size:11px; color:#94a3b8; }
        @page{ size:A4; margin:12mm; }
      </style>
    </head><body>
      <div class="pdf-wrap">
        <div class="pdf-header">
          <img src="${origin}/logo.png" alt="SKH" />
          <div>
            <p class="pdf-h1">Smart Kopargaon Hackathon — Analytics Report</p>
            <p class="pdf-sub">Generated ${generated}</p>
          </div>
        </div>
        ${node.outerHTML}
        ${summaryHtml}
        <p class="pdf-foot">Confidential — generated from the SKH admin dashboard.</p>
      </div>
    </body></html>`

    // Use a hidden iframe (NOT a popup — popups get blocked, which caused the
    // whole app page to print instead). The iframe prints only the report.
    const iframe = document.createElement('iframe')
    iframe.setAttribute('aria-hidden', 'true')
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;'
    document.body.appendChild(iframe)

    const cleanup = () => { try { iframe.remove() } catch { /* ignore */ } }
    const trigger = () => {
      try {
        const w = iframe.contentWindow
        w.focus()
        w.print()
      } catch { /* ignore */ }
      // Remove after the print dialog is handled.
      setTimeout(cleanup, 1500)
    }

    const idoc = iframe.contentWindow.document
    idoc.open()
    idoc.write(docHtml)
    idoc.close()

    // Wait for the cloned stylesheets/fonts/images to load, then print.
    if (iframe.contentWindow.document.readyState === 'complete') setTimeout(trigger, 800)
    else iframe.onload = () => setTimeout(trigger, 500)
  }

  if (loading) return <Skeleton className="h-96 w-full rounded-2xl" />

  const funnel = stats?.registrationFunnel
  const maxFunnel = funnel?.teamsTotal || stats?.teamsTotal || 1

  return (
    <div id="report-root" className="w-full space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink-900">Analytics Dashboard</h1>
          <p className="mt-2 text-sm text-ink-600">
            Real-time insights across registration, payments, submissions, and evaluations.
          </p>
        </div>
        <div className="no-print flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={load}>Refresh</Button>
          <Button size="sm" className="gap-1.5" onClick={downloadReportPdf}>
            <Download className="h-4 w-4" /> Download PDF
          </Button>
        </div>
      </div>

      {/* Key Metrics Row */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatMini label="Total Teams" value={stats.teamsTotal || 0} tone="brand" />
          <StatMini label="Registered" value={stats.teamsRegistered || 0} tone="success" />
          <StatMini label="Payments Pending" value={stats.paymentsPending || 0} tone="warn" />
          <StatMini label="Submissions" value={stats.submissionsFinalized || 0} tone="brand" />
          <StatMini label="Judges" value={stats.judgeCount || 0} tone="neutral" />
          <StatMini label="Shortlisted" value={stats.shortlistedTeams || 0} tone="success" />
        </div>
      )}

      {/* Charts Row 1: Registration + Payment Pie Charts */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <h2 className="font-display text-lg font-semibold text-ink-900">Registration Status</h2>
            <p className="mt-1 text-xs text-ink-500">Distribution of all team registration statuses</p>
            <div className="mt-4 flex items-center justify-center">
              {registrationPieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={registrationPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {registrationPieData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="py-12 text-sm text-ink-400">No data yet</p>
              )}
            </div>
          </Card>

          <Card>
            <h2 className="font-display text-lg font-semibold text-ink-900">Payment Status</h2>
            <p className="mt-1 text-xs text-ink-500">Payment breakdown for fee-eligible teams</p>
            <div className="mt-4 flex items-center justify-center">
              {paymentPieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={paymentPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {paymentPieData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="py-12 text-sm text-ink-400">No payment data</p>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Problem Statement Popularity Bar Chart */}
      {problemBarData.length > 0 && (
        <Card>
          <h2 className="font-display text-lg font-semibold text-ink-900">Problem Statement Popularity</h2>
          <p className="mt-1 text-xs text-ink-500">Teams selecting each problem statement</p>
          <div className="mt-4">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={problemBarData} margin={{ top: 10, right: 20, left: 0, bottom: 60 }}>
                <XAxis dataKey="name" angle={-35} textAnchor="end" tick={{ fontSize: 11 }} interval={0} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="teams" fill={COLORS.brand} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Teams per Domain */}
      <Card>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink-900">Teams per Domain</h2>
            <p className="mt-1 text-xs text-ink-500">
              How many teams are participating in each domain (based on their selected problem statement)
            </p>
          </div>
          <Badge tone="brand">{domainDistribution.totalWithPs} teams with a PS</Badge>
        </div>
        {domainDistribution.rows.length > 0 ? (
          <div className="mt-5 space-y-4">
            {domainDistribution.rows.map((d) => (
              <StageBar
                key={d.domain}
                label={d.domain}
                value={d.count}
                max={domainDistribution.rows[0].count}
                className="from-violet-500 to-purple-400"
              />
            ))}
          </div>
        ) : (
          <p className="py-10 text-center text-sm text-ink-400">No teams have selected a problem statement yet.</p>
        )}
        {domainDistribution.noPs > 0 && (
          <p className="mt-4 border-t border-[rgb(var(--border))] pt-3 text-xs text-ink-500">
            {domainDistribution.noPs} team{domainDistribution.noPs > 1 ? 's have' : ' has'} not selected a problem statement yet.
          </p>
        )}
      </Card>

      {/* Teams per Track */}
      <Card>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink-900">Teams per Track</h2>
            <p className="mt-1 text-xs text-ink-500">
              How many teams are participating in each track — Software / Hardware (based on their selected problem statement)
            </p>
          </div>
          <Badge tone="brand">{trackDistribution.totalWithPs} teams with a PS</Badge>
        </div>
        {trackDistribution.rows.length > 0 ? (
          <div className="mt-5 space-y-4">
            {trackDistribution.rows.map((t) => (
              <StageBar
                key={t.track}
                label={t.track}
                value={t.count}
                max={trackDistribution.rows[0].count}
                className="from-cyan-500 to-blue-400"
              />
            ))}
          </div>
        ) : (
          <p className="py-10 text-center text-sm text-ink-400">No teams have selected a problem statement yet.</p>
        )}
        {trackDistribution.noPs > 0 && (
          <p className="mt-4 border-t border-[rgb(var(--border))] pt-3 text-xs text-ink-500">
            {trackDistribution.noPs} team{trackDistribution.noPs > 1 ? 's have' : ' has'} not selected a problem statement yet.
          </p>
        )}
      </Card>

      {/* Open Innovation by Domain */}
      {openInnovationByDomain.total > 0 && (
        <Card>
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="font-display text-lg font-semibold text-ink-900">Open Innovation — by Domain</h2>
              <p className="mt-1 text-xs text-ink-500">
                Problem-domain split (e.g. Waste Management, Health) among teams in the Open Innovation domain
              </p>
            </div>
            <Badge tone="brand">{openInnovationByDomain.total} teams</Badge>
          </div>
          <div className="mt-5 space-y-4">
            {openInnovationByDomain.rows.map((d) => (
              <StageBar
                key={d.domain}
                label={d.domain}
                value={d.count}
                max={openInnovationByDomain.rows[0].count}
                className="from-amber-500 to-orange-400"
              />
            ))}
          </div>
        </Card>
      )}

      {/* Charts Row 2: Funnel + Evaluation */}
      {stats && (
        <div className="grid gap-4 lg:grid-cols-5">
          {/* Registration Funnel */}
          <Card className="lg:col-span-3">
            <h2 className="font-display text-lg font-semibold text-ink-900">Registration Funnel</h2>
            <p className="mt-1 text-xs text-ink-500">Sequential throughput — {maxFunnel} teams in scope</p>
            <div className="mt-5 space-y-4">
              {funnel && (
                <>
                  <StageBar label="Teams created" value={funnel.teamsTotal} max={maxFunnel} />
                  <StageBar label="Registered for event" value={funnel.registered} max={maxFunnel} className="from-emerald-500 to-emerald-400" />
                  <StageBar label="Payment settled" value={funnel.paymentSettledAmongFeeTeams} max={Math.max(1, funnel.teamsNeedingFee)} className="from-amber-500 to-orange-400" />
                  <StageBar label="Problem selected" value={funnel.problemSelected} max={maxFunnel} className="from-violet-500 to-purple-400" />
                  <StageBar label="Submission finalized" value={funnel.submissionsFinalized} max={Math.max(1, funnel.submissionsEligibleTeams)} className="from-cyan-500 to-blue-400" />
                </>
              )}
            </div>
          </Card>

          {/* Evaluation Progress */}
          <Card className="lg:col-span-2">
            <h2 className="font-display text-lg font-semibold text-ink-900">Evaluation Progress</h2>
            <p className="mt-1 text-xs text-ink-500">Judge evaluation status breakdown</p>
            <div className="mt-4">
              {evaluationBarData.some((d) => d.count > 0) ? (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={evaluationBarData} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={70} />
                    <Tooltip />
                    <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                      {evaluationBarData.map((entry, i) => (
                        <Cell key={i} fill={[COLORS.success, COLORS.warn, COLORS.neutral][i]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="py-8 text-center text-sm text-ink-400">No evaluations yet</p>
              )}
            </div>
            <div className="mt-3 border-t border-[rgb(var(--border))] pt-3">
              <div className="flex justify-between text-xs">
                <span className="text-ink-500">Coverage</span>
                <Badge tone="brand">{stats.evaluationCompletionPct != null ? `${stats.evaluationCompletionPct}%` : '—'}</Badge>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Submission Overview */}
      {stats && (
        <Card>
          <h2 className="font-display text-lg font-semibold text-ink-900">Submission Overview</h2>
          <div className="mt-4 grid grid-cols-3 gap-4">
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-4 text-center">
              <p className="text-xs font-semibold uppercase text-ink-500">Finalized</p>
              <p className="mt-1 font-display text-2xl font-bold text-emerald-600">{submissionStats.finalized}</p>
            </div>
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-4 text-center">
              <p className="text-xs font-semibold uppercase text-ink-500">In Progress</p>
              <p className="mt-1 font-display text-2xl font-bold text-amber-600">{submissionStats.inProgress}</p>
            </div>
            <div className="rounded-xl border border-[rgb(var(--border))] px-4 py-4 text-center">
              <p className="text-xs font-semibold uppercase text-ink-500">Not Started</p>
              <p className="mt-1 font-display text-2xl font-bold text-ink-600">{submissionStats.notStarted}</p>
            </div>
          </div>
          <div className="mt-4">
            <StageBar
              label="Submission completion rate"
              value={submissionStats.finalized}
              max={Math.max(1, stats.submissionsEligibleTeams || 1)}
              className="from-emerald-500 to-emerald-400"
            />
          </div>
        </Card>
      )}

      {/* Export Center */}
      <Card>
        <h2 className="font-display text-lg font-semibold text-ink-900">Export Center</h2>
        <p className="mt-2 text-sm text-ink-600">Download data snapshots as CSV for audits, finance, and reporting.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button variant="secondary" type="button" onClick={exportTeams}>Teams CSV</Button>
          <Button variant="secondary" type="button" onClick={() => downloadCsv(`submissions-${Date.now()}.csv`, subs, [
            { header: 'Team ID', accessor: (r) => r.teamId },
            { header: 'Status', accessor: (r) => r.status || 'draft' },
            { header: 'PPT', accessor: (r) => r.pptUrl ? 'Yes' : 'No' },
            { header: 'PDF', accessor: (r) => r.pdfUrl ? 'Yes' : 'No' },
            { header: 'Video', accessor: (r) => r.videoUrl ? 'Yes' : 'No' },
            { header: 'GitHub', accessor: (r) => r.githubUrl ? 'Yes' : 'No' },
          ])}>Submissions CSV</Button>
          <Button variant="secondary" type="button" disabled={!evals.length} onClick={exportEvaluations}>Evaluations CSV</Button>
        </div>
      </Card>
    </div>
  )
}
