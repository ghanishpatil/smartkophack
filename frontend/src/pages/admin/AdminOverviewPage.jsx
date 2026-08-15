import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowRight,
  ClipboardCheck,
  CreditCard,
  FileUp,
  ShieldAlert,
  TrendingUp,
  Users,
} from 'lucide-react'
import { formatDate } from '@/utils/format.js'
import { usePageSeo } from '@/hooks/usePageSeo.js'
import { useApi } from '@/hooks/useApi.js'
import { useIsReadOnly } from '@/hooks/useIsReadOnly.js'
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh.js'
import { Card } from '@/components/ui/Card.jsx'
import { Button } from '@/components/ui/Button.jsx'
import { Skeleton } from '@/components/ui/Skeleton.jsx'
import { Badge } from '@/components/ui/Badge.jsx'

function StatCard({ title, value, hint, icon: Icon, tone = 'brand' }) {
  const ring =
    tone === 'warn'
      ? 'border-amber-500/30 bg-amber-500/5'
      : tone === 'danger'
        ? 'border-red-500/25 bg-red-500/5'
        : 'border-brand-500/20 bg-brand-500/5'
  return (
    <Card className={ring}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{title}</p>
          <p className="mt-2 font-display text-2xl font-bold text-ink-900">{value}</p>
          {hint ? <p className="mt-1 text-xs text-ink-500">{hint}</p> : null}
        </div>
        {Icon ? <Icon className="h-8 w-8 shrink-0 text-brand-600 opacity-90" /> : null}
      </div>
    </Card>
  )
}

export function AdminOverviewPage() {
  usePageSeo({ title: 'Admin Overview', description: 'Operational control center.' })
  const api = useApi()
  const readOnly = useIsReadOnly()
  const [stats, setStats] = useState(null)
  const [audit, setAudit] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setErr('')
    try {
      const [s, logs] = await Promise.all([api.adminStats(), api.listAuditLogs(15)])
      setStats(s)
      setAudit(Array.isArray(logs) ? logs : [])
    } catch (e) {
      setErr(e.message || 'Could not load overview.')
      if (!silent) setStats(null)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [api])

  useEffect(() => {
    void load()
  }, [load])

  // Real-time: re-compute metrics in place whenever any underlying collection
  // changes (registrations, payments, submissions, evaluations, phase changes,
  // or new audit rows). Silent so cards/tables update without flashing skeletons.
  useRealtimeRefresh(
    ['teams', 'submissions', 'evaluations', 'problemStatements', 'events', 'auditLogs'],
    () => void load(true),
  )

  const maxSel = Math.max(1, ...(stats?.problemStatementsTop || []).map((p) => p.selectionCount || 0))

  const quick = [
    { to: '/admin/problems', label: 'Problem statements' },
    { to: '/admin/registrations', label: 'Registrations' },
    { to: '/admin/payments', label: 'Payments' },
    { to: '/admin/submissions', label: 'Submissions' },
    { to: '/admin/evaluations', label: 'Evaluations' },
    { to: '/admin/audit', label: 'Audit trail' },
  ]

  return (
    <div className="w-full space-y-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <motion.h1
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="font-display text-3xl font-bold text-ink-900"
          >
            Operations overview
          </motion.h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-600">
            Metrics are computed server-side for the scoped edition. Use quick actions to drill into modules — every sensitive change is logged.
          </p>
        </div>
        <Button variant="secondary" type="button" onClick={() => void load()}>
          Refresh metrics
        </Button>
      </div>

      {err ? (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-900">{err}</p>
      ) : null}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : stats ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard title="Registrations today" value={stats.registrationsToday ?? 0} hint="Teams that finished intake today" icon={TrendingUp} />
            <StatCard title="Teams" value={stats.teamsTotal ?? 0} hint={`${stats.teamsRegistered ?? 0} registered for event`} icon={Users} />
            <StatCard
              title="Payment completion"
              value={stats.paymentCompletionPct != null ? `${stats.paymentCompletionPct}%` : '—'}
              hint={`${stats.paymentsPending ?? 0} pending`}
              icon={CreditCard}
              tone={stats.paymentsPending > 0 ? 'warn' : 'brand'}
            />
            <StatCard
              title="Submission completion"
              value={stats.submissionCompletionPct != null ? `${stats.submissionCompletionPct}%` : '—'}
              hint={`${stats.submissionsFinalized ?? 0} finalized · ${stats.submissionsIncomplete ?? 0} open`}
              icon={FileUp}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-lg font-semibold text-ink-900">Problem popularity</h2>
                <Badge tone="neutral">Top tracks</Badge>
              </div>
              <ul className="mt-4 space-y-3">
                {(stats.problemStatementsTop || []).length === 0 ? (
                  <p className="text-sm text-ink-500">No problem statements for this scope.</p>
                ) : (
                  stats.problemStatementsTop.map((p) => (
                    <li key={p.id}>
                      <div className="flex items-center justify-between gap-2 text-xs text-ink-500">
                        <span className="font-medium text-ink-900">{p.title}</span>
                        <span>{p.selectionCount} teams</span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-[rgb(var(--surface-muted))]">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-400"
                          style={{ width: `${Math.min(100, Math.round(((p.selectionCount || 0) / maxSel) * 100))}%` }}
                        />
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </Card>

            <Card>
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-lg font-semibold text-ink-900">Evaluation pulse</h2>
                <Badge tone="brand">{stats.evaluationsSubmittedOnEligibleTeams ?? 0} teams scored</Badge>
              </div>
              <p className="mt-3 text-sm text-ink-600">
                Count reflects{' '}
                <code className="rounded bg-[rgb(var(--surface-muted))] px-1 font-mono text-[11px]">evaluationStatus: submitted</code>{' '}
                evaluations for teams that picked a problem during this edition. Judges on roster:{' '}
                <strong>{stats.judgeCount ?? 0}</strong>.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Badge tone={stats.lifecyclePhase === 'EVALUATION' ? 'success' : 'neutral'}>
                  Phase: {stats.lifecyclePhase || '—'}
                </Badge>
                {!stats.razorpayConfigured ? (
                  <Badge tone="warn">
                    <ShieldAlert className="mr-1 inline h-3 w-3" />
                    Razorpay keys missing
                  </Badge>
                ) : null}
              </div>
              <p className="mt-3 text-xs text-ink-500">
                Submission deadline:{' '}
                {stats.submissionDeadline ? new Date(stats.submissionDeadline).toLocaleString() : '—'}
              </p>
            </Card>
          </div>

          {!readOnly ? (
            <Card>
              <h2 className="font-display text-lg font-semibold text-ink-900">Quick actions</h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {quick.map((q) => (
                  <Link key={q.to} to={q.to}>
                    <Button variant="secondary" size="sm" className="gap-2">
                      {q.label}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                ))}
              </div>
            </Card>
          ) : null}

          <Card>
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-brand-600" />
              <h2 className="font-display text-lg font-semibold text-ink-900">Recent audit activity</h2>
            </div>
            <ul className="mt-4 divide-y divide-[rgb(var(--border))] text-sm">
              {audit.length === 0 ? (
                <li className="py-4 text-ink-500">No audit rows yet — actions append via Admin SDK.</li>
              ) : (
                audit.map((row) => (
                  <li key={row.id} className="flex flex-wrap gap-2 py-3">
                    <span className="font-mono text-xs text-brand-700">{row.action}</span>
                    <span className="text-ink-500">{formatDate(row.createdAt)}</span>
                    <span className="text-ink-600">
                      {row.targetType}:{row.targetId}
                    </span>
                  </li>
                ))
              )}
            </ul>
            <Link to="/admin/audit" className="mt-3 inline-block text-sm font-medium text-brand-600 hover:underline">
              View full log →
            </Link>
          </Card>
        </>
      ) : null}
    </div>
  )
}
