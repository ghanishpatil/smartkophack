import { useEffect, useState } from 'react'
import { Settings, Info, Eye, Trophy, Mail, CheckCircle, AlertTriangle, XCircle, RefreshCw } from 'lucide-react'
import { usePageSeo } from '@/hooks/usePageSeo.js'
import { useApi } from '@/hooks/useApi.js'
import { useEvent } from '@/context/EventContext.jsx'
import { Card } from '@/components/ui/Card.jsx'
import { Button } from '@/components/ui/Button.jsx'
import { Input } from '@/components/ui/Input.jsx'
import { Badge } from '@/components/ui/Badge.jsx'

export function AdminSettingsPage() {
  usePageSeo({ title: 'Settings', description: 'Event configuration.' })
  const api = useApi()
  const { eventId, eventCfg } = useEvent()
  const [eventForm, setEventForm] = useState({
    registrationOpen: true,
    submissionsOpen: false,
    evaluationsOpen: false,
    resultsPublished: false,
    entryFeeEnabled: false,
    entryFeeAmount: 0,
    currency: 'INR',
    minTeamSize: 2,
    maxTeamSize: 4,
  })
  const [msg, setMsg] = useState('')

  // Sync form state with eventCfg from context (includes real-time updates)
  useEffect(() => {
    if (!eventCfg) return
    setEventForm({
      registrationOpen: Boolean(eventCfg.registrationOpen),
      submissionsOpen: Boolean(eventCfg.submissionsOpen),
      evaluationsOpen: Boolean(eventCfg.evaluationsOpen),
      resultsPublished: Boolean(eventCfg.resultsPublished),
      entryFeeEnabled: Boolean(eventCfg.entryFeeEnabled),
      entryFeeAmount: Number(eventCfg.entryFeeAmount) || 0,
      currency: eventCfg.currency || 'INR',
      minTeamSize: Number(eventCfg.minTeamSize) || 2,
      maxTeamSize: Number(eventCfg.maxTeamSize) || 4,
    })
  }, [eventCfg])

  async function save() {
    setMsg('')
    try {
      if (!eventId) { setMsg('No active event.'); return }
      await api.patchAdminEvent(eventId, {
        registrationOpen: eventForm.registrationOpen,
        submissionsOpen: eventForm.submissionsOpen,
        evaluationsOpen: eventForm.evaluationsOpen,
        resultsPublished: eventForm.resultsPublished,
        entryFeeEnabled: eventForm.entryFeeEnabled,
        entryFeeAmount: Number(eventForm.entryFeeAmount) || 0,
        currency: eventForm.currency || 'INR',
        minTeamSize: Number(eventForm.minTeamSize) || 2,
        maxTeamSize: Number(eventForm.maxTeamSize) || 4,
      })
      setMsg('Settings saved.')
    } catch (e) {
      setMsg(e.message || 'Save failed.')
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-ink-900">Event Settings</h1>
        <p className="mt-2 text-sm text-ink-600">
          Core event configuration. Dates and phases are managed in <strong>Timeline</strong> and <strong>Competition Phases</strong>.
        </p>
        {eventId && (
          <Badge tone="brand" className="mt-2">Event: {eventId}</Badge>
        )}
      </div>

      {msg && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${
          msg.includes('saved') || msg.includes('Saved')
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700'
            : 'border-red-500/30 bg-red-500/10 text-red-700'
        }`}>{msg}</div>
      )}

      {/* Registration */}
      <Card>
        <h2 className="font-display text-base font-semibold text-ink-900">Registration</h2>
        <div className="mt-4 space-y-4">
          <label className="flex items-center gap-3 cursor-pointer rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))]/30 px-4 py-3">
            <input
              type="checkbox"
              checked={eventForm.registrationOpen}
              onChange={(e) => setEventForm((f) => ({ ...f, registrationOpen: e.target.checked }))}
            />
            <div>
              <p className="text-sm font-medium text-ink-900">Registration Open</p>
              <p className="text-xs text-ink-500">Teams can create accounts and register</p>
            </div>
          </label>
        </div>
      </Card>

      {/* Lifecycle Controls */}
      <Card>
        <h2 className="font-display text-base font-semibold text-ink-900">Hackathon Lifecycle</h2>
        <p className="mt-1 text-xs text-ink-500">
          These flags control what participants and judges can do. Enable them in order as the event progresses.
        </p>
        <div className="mt-4 space-y-3">
          <label className="flex items-center gap-3 cursor-pointer rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))]/30 px-4 py-3">
            <input
              type="checkbox"
              checked={eventForm.submissionsOpen}
              onChange={(e) => setEventForm((f) => ({ ...f, submissionsOpen: e.target.checked }))}
            />
            <div>
              <p className="text-sm font-medium text-ink-900">Submissions Open</p>
              <p className="text-xs text-ink-500">Teams can upload and edit their submissions</p>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))]/30 px-4 py-3">
            <input
              type="checkbox"
              checked={eventForm.evaluationsOpen}
              onChange={(e) => setEventForm((f) => ({ ...f, evaluationsOpen: e.target.checked }))}
            />
            <div>
              <p className="text-sm font-medium text-ink-900">Evaluations Open</p>
              <p className="text-xs text-ink-500">Judges can score and submit evaluations</p>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
            <input
              type="checkbox"
              checked={eventForm.resultsPublished}
              onChange={(e) => setEventForm((f) => ({ ...f, resultsPublished: e.target.checked }))}
            />
            <div>
              <p className="text-sm font-medium text-ink-900">Publish Results</p>
              <p className="text-xs text-ink-500">
                Makes the leaderboard visible to everyone at <code className="rounded bg-ink-100 px-1">/results</code>. 
                Only enable after all evaluations are finalized.
              </p>
            </div>
          </label>
        </div>
      </Card>

      {/* Results Preview — shown when admin is about to publish */}
      {eventForm.resultsPublished || eventForm.evaluationsOpen ? (
        <ResultsPreview api={api} eventId={eventId} isPublished={eventForm.resultsPublished} />
      ) : null}

      {/* Fees */}
      <Card>
        <h2 className="font-display text-base font-semibold text-ink-900">Entry Fee</h2>
        <div className="mt-4 space-y-4">
          <label className="flex items-center gap-3 cursor-pointer rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))]/30 px-4 py-3">
            <input
              type="checkbox"
              checked={eventForm.entryFeeEnabled}
              onChange={(e) => setEventForm((f) => ({ ...f, entryFeeEnabled: e.target.checked }))}
            />
            <div>
              <p className="text-sm font-medium text-ink-900">Require Payment</p>
              <p className="text-xs text-ink-500">Teams must pay via Razorpay to complete registration</p>
            </div>
          </label>
          {eventForm.entryFeeEnabled && (
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Amount (per team)"
                type="number"
                min={0}
                value={String(eventForm.entryFeeAmount)}
                onChange={(e) => setEventForm((f) => ({ ...f, entryFeeAmount: e.target.value }))}
                placeholder="400"
              />
              <Input
                label="Currency"
                value={eventForm.currency}
                onChange={(e) => setEventForm((f) => ({ ...f, currency: e.target.value }))}
                placeholder="INR"
              />
            </div>
          )}
        </div>
      </Card>

      {/* Team Size */}
      <Card>
        <h2 className="font-display text-base font-semibold text-ink-900">Team Size</h2>
        <p className="mt-1 text-xs text-ink-500">Min-max members required to register</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Input
            label="Minimum"
            type="number"
            min={1}
            max={10}
            value={String(eventForm.minTeamSize)}
            onChange={(e) => setEventForm((f) => ({ ...f, minTeamSize: e.target.value }))}
          />
          <Input
            label="Maximum"
            type="number"
            min={1}
            max={10}
            value={String(eventForm.maxTeamSize)}
            onChange={(e) => setEventForm((f) => ({ ...f, maxTeamSize: e.target.value }))}
          />
        </div>
      </Card>

      {/* Info */}
      <div className="flex items-start gap-3 rounded-xl border border-brand-500/20 bg-brand-500/5 px-4 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
        <div className="text-xs text-ink-600">
          <p><strong>Dates & Deadlines</strong> → Managed in <strong>Admin → Timeline</strong></p>
          <p className="mt-1"><strong>Submission requirements & phase activation</strong> → Managed in <strong>Admin → Competition Phases</strong></p>
          <p className="mt-1"><strong>Evaluation criteria</strong> → Configured per-phase in Competition Phases</p>
        </div>
      </div>

      <Button className="w-full" onClick={save} disabled={!eventId}>
        Save Settings
      </Button>

      {/* Email Diagnostics */}
      <EmailDiagnostics api={api} />
    </div>
  )
}

// ─── Email Diagnostics Panel ──────────────────────────────────────────────────

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000'

function EmailDiagnostics({ api }) {
  const [health, setHealth] = useState(null)
  const [healthLoading, setHealthLoading] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [testLoading, setTestLoading] = useState(false)

  async function checkHealth() {
    setHealthLoading(true)
    setHealth(null)
    try {
      const res = await fetch(`${API_BASE}/api/health/email`)
      const data = await res.json()
      setHealth(data)
    } catch (e) {
      setHealth({ ok: false, warnings: [`Could not reach backend: ${e.message}`], checks: {} })
    } finally {
      setHealthLoading(false)
    }
  }

  async function sendTestEmail() {
    setTestLoading(true)
    setTestResult(null)
    try {
      const result = await api.adminTestEmail()
      setTestResult({ ok: true, message: result.message || 'Test email sent! Check your inbox.' })
    } catch (e) {
      const msg = e.message || 'Failed to send test email'
      const hint = msg.includes('not_configured') || msg.includes('BREVO')
        ? 'Set BREVO_API_KEY in your production environment variables.'
        : msg.includes('sender')
          ? 'Sender email not verified in Brevo. Go to Brevo → Senders & Domains.'
          : null
      setTestResult({ ok: false, message: msg, hint })
    } finally {
      setTestLoading(false)
    }
  }

  function StatusIcon({ ok, warn }) {
    if (ok) return <CheckCircle className="h-4 w-4 text-emerald-500" />
    if (warn) return <AlertTriangle className="h-4 w-4 text-amber-500" />
    return <XCircle className="h-4 w-4 text-red-500" />
  }

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-brand-600" />
          <div>
            <h2 className="font-display text-base font-semibold text-ink-900">Email System</h2>
            <p className="text-xs text-ink-500">Diagnose and test email delivery</p>
          </div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          className="gap-1.5"
          onClick={checkHealth}
          disabled={healthLoading}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${healthLoading ? 'animate-spin' : ''}`} />
          Check Config
        </Button>
      </div>

      {health && (
        <div className="mt-4 space-y-3">
          {/* Overall status */}
          <div className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium ${
            health.ok
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700'
              : 'border-amber-500/30 bg-amber-500/10 text-amber-700'
          }`}>
            <StatusIcon ok={health.ok} warn={!health.ok} />
            {health.ok ? 'Email configuration looks good' : `${health.warnings?.length || 0} issue(s) found`}
          </div>

          {/* Warnings */}
          {health.warnings?.length > 0 && (
            <div className="space-y-2">
              {health.warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-800">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                  {w}
                </div>
              ))}
            </div>
          )}

          {/* Checks detail */}
          {health.checks && (
            <div className="rounded-xl border border-[rgb(var(--border))] divide-y divide-[rgb(var(--border))]">
              {[
                {
                  label: 'Brevo API Key',
                  ok: health.checks.brevo?.configured,
                  detail: health.checks.brevo?.configured
                    ? `Key: ${health.checks.brevo.keyPrefix}`
                    : 'NOT SET — set BREVO_API_KEY in production env',
                },
                {
                  label: 'Sender Address',
                  ok: health.checks.brevo?.configured,
                  warn: !!health.checks.brevo?.fromAddressWarning,
                  detail: health.checks.brevo?.fromAddress || 'NOT SET',
                  sub: health.checks.brevo?.fromAddressWarning,
                },
                {
                  label: 'Frontend URL',
                  ok: health.checks.frontendUrl?.value !== 'NOT SET' && !health.checks.frontendUrl?.isLocalhost,
                  warn: health.checks.frontendUrl?.isLocalhost,
                  detail: health.checks.frontendUrl?.value || 'NOT SET',
                  sub: health.checks.frontendUrl?.warning,
                },
                {
                  label: 'Razorpay Webhook Secret',
                  ok: health.checks.razorpay?.webhookSecretSet && !health.checks.razorpay?.webhookSecretIsUrl,
                  warn: health.checks.razorpay?.webhookSecretIsUrl,
                  detail: health.checks.razorpay?.webhookSecretSet
                    ? health.checks.razorpay?.webhookSecretIsUrl ? 'Set but looks like a URL (wrong!)' : 'Set ✓'
                    : 'NOT SET',
                  sub: health.checks.razorpay?.warning,
                },
                {
                  label: 'Environment',
                  ok: health.checks.nodeEnv === 'production',
                  warn: health.checks.nodeEnv !== 'production',
                  detail: `NODE_ENV=${health.checks.nodeEnv || 'not set'}`,
                  sub: health.checks.nodeEnv !== 'production' ? 'Set NODE_ENV=production in your hosting dashboard' : null,
                },
              ].map(({ label, ok, warn, detail, sub }) => (
                <div key={label} className="flex items-start gap-3 px-4 py-3">
                  <StatusIcon ok={ok} warn={warn && !ok} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-ink-800">{label}</p>
                    <p className="text-xs text-ink-500 font-mono">{detail}</p>
                    {sub && <p className="mt-0.5 text-xs text-amber-700">{sub}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Test email button */}
      <div className="mt-4 border-t border-[rgb(var(--border))] pt-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-ink-800">Send Test Email</p>
            <p className="text-xs text-ink-500">Sends a test email to your admin account to verify delivery</p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="gap-1.5 shrink-0"
            onClick={sendTestEmail}
            disabled={testLoading}
          >
            <Mail className={`h-3.5 w-3.5 ${testLoading ? 'animate-pulse' : ''}`} />
            {testLoading ? 'Sending…' : 'Send Test'}
          </Button>
        </div>

        {testResult && (
          <div className={`mt-3 flex items-start gap-2 rounded-xl border px-3 py-2 text-xs ${
            testResult.ok
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700'
              : 'border-red-500/30 bg-red-500/10 text-red-700'
          }`}>
            <StatusIcon ok={testResult.ok} />
            <div>
              <p>{testResult.message}</p>
              {testResult.hint && <p className="mt-1 font-medium">{testResult.hint}</p>}
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}

// ─── Results Preview Panel (Admin-only, shows full detail before publishing) ──

const RESULTS_API = import.meta.env.VITE_API_URL || 'http://localhost:4000'

function ResultsPreview({ api, eventId, isPublished }) {
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)

  async function loadPreview() {
    setLoading(true)
    try {
      // Use the same public results endpoint — admin can see it even before publishing
      // because this component only renders when evaluationsOpen or resultsPublished is true
      const [evalData, teamsData] = await Promise.all([
        api.adminEvaluations(),
        api.adminTeams(),
      ])

      const evals = Array.isArray(evalData) ? evalData : []
      const teams = Array.isArray(teamsData) ? teamsData : []

      // Compute detailed results with full score breakdowns
      const submitted = evals.filter((e) => e.evaluationStatus === 'submitted')
      const teamResults = []

      for (const team of teams) {
        if (!team.problemStatementId) continue
        const teamEvals = submitted.filter((e) => e.teamId === team.id)
        if (teamEvals.length === 0) continue

        let totalScore = 0
        const judgeBreakdowns = []
        for (const ev of teamEvals) {
          if (!ev.scores || typeof ev.scores !== 'object') continue
          const scoreValues = Object.values(ev.scores).filter((v) => typeof v === 'number')
          const sum = scoreValues.reduce((a, b) => a + b, 0)
          totalScore += sum
          judgeBreakdowns.push({
            judgeId: ev.judgeId || 'Unknown',
            scores: ev.scores,
            total: sum,
            feedback: ev.feedback || '',
          })
        }

        const avgScore = teamEvals.length > 0 ? Math.round((totalScore / teamEvals.length) * 100) / 100 : 0
        teamResults.push({
          teamId: team.id,
          teamName: team.name || 'Unnamed',
          problemStatementId: team.problemStatementId,
          avgScore,
          evalCount: teamEvals.length,
          judgeBreakdowns,
          shortlisted: Boolean(team.shortlisted),
        })
      }

      teamResults.sort((a, b) => b.avgScore - a.avgScore)
      teamResults.forEach((t, i) => { t.rank = i + 1 })

      setResults(teamResults)
    } catch {
      setResults(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (expanded && !results) void loadPreview()
  }, [expanded])

  return (
    <Card className="border-2 border-amber-500/30 bg-amber-500/5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-amber-600" />
          <div>
            <h2 className="font-display text-base font-semibold text-ink-900">Results Preview</h2>
            <p className="text-xs text-ink-500">
              {isPublished
                ? 'Results are live at /results. This is what participants see.'
                : 'Preview what will be published. Verify before enabling "Publish Results" above.'
              }
            </p>
          </div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          className="gap-1.5"
          onClick={() => setExpanded(!expanded)}
        >
          <Eye className="h-3.5 w-3.5" />
          {expanded ? 'Hide' : 'Preview'}
        </Button>
      </div>

      {expanded && (
        <div className="mt-4">
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-ink-500">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
              Loading evaluations...
            </div>
          ) : !results || results.length === 0 ? (
            <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6 text-center">
              <p className="text-sm text-ink-500">No submitted evaluations found. Judges haven't scored any teams yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Summary stats */}
              <div className="flex flex-wrap gap-2">
                <Badge tone="brand">{results.length} teams scored</Badge>
                <Badge tone="success">{results.reduce((s, r) => s + r.evalCount, 0)} total evaluations</Badge>
                <Badge tone="neutral">Top score: {results[0]?.avgScore || 0}</Badge>
              </div>

              {/* Detailed table */}
              <div className="max-h-[500px] overflow-auto thin-scrollbar rounded-xl border border-[rgb(var(--border))]">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-[rgb(var(--surface-muted))]">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-ink-600">#</th>
                      <th className="px-3 py-2 text-left font-semibold text-ink-600">Team</th>
                      <th className="px-3 py-2 text-left font-semibold text-ink-600">Problem</th>
                      <th className="px-3 py-2 text-right font-semibold text-ink-600">Avg Score</th>
                      <th className="px-3 py-2 text-right font-semibold text-ink-600">Evals</th>
                      <th className="px-3 py-2 text-left font-semibold text-ink-600">Judge Breakdown</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((t) => (
                      <tr key={t.teamId} className="border-t border-[rgb(var(--border))]/50 align-top">
                        <td className="px-3 py-2 font-mono font-bold text-ink-500">{t.rank}</td>
                        <td className="px-3 py-2">
                          <p className="font-medium text-ink-900">{t.teamName}</p>
                          <p className="font-mono text-[10px] text-ink-400">{t.teamId}</p>
                        </td>
                        <td className="px-3 py-2 max-w-[120px] truncate text-ink-600">{t.problemStatementId}</td>
                        <td className="px-3 py-2 text-right font-display text-sm font-bold text-ink-900">{t.avgScore}</td>
                        <td className="px-3 py-2 text-right text-ink-500">{t.evalCount}</td>
                        <td className="px-3 py-2">
                          <div className="space-y-1">
                            {t.judgeBreakdowns.map((jb, i) => (
                              <div key={i} className="rounded-md bg-[rgb(var(--surface-muted))]/50 px-2 py-1">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-mono text-[10px] text-ink-400">{jb.judgeId.slice(0, 8)}…</span>
                                  <span className="font-semibold text-ink-800">{jb.total}</span>
                                </div>
                                <div className="mt-0.5 flex flex-wrap gap-1">
                                  {Object.entries(jb.scores).map(([k, v]) => (
                                    <span key={k} className="rounded bg-brand-500/10 px-1 py-0.5 text-[9px] text-brand-700">
                                      {k}: {v}
                                    </span>
                                  ))}
                                </div>
                                {jb.feedback && (
                                  <p className="mt-0.5 text-[10px] italic text-ink-500 line-clamp-1">{jb.feedback}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <Button
                variant="secondary"
                size="sm"
                onClick={loadPreview}
              >
                Refresh preview
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
