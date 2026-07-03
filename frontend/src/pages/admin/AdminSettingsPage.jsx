import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Settings, Info, Eye, Trophy, Mail, CheckCircle, AlertTriangle, XCircle, RefreshCw, Loader2, Check, UserPlus, Send, Upload, Download } from 'lucide-react'
import { usePageSeo } from '@/hooks/usePageSeo.js'
import { useApi } from '@/hooks/useApi.js'
import { useEvent } from '@/context/EventContext.jsx'
import { parseCSV, downloadCSV } from '@/utils/csvParser.js'
import { Card } from '@/components/ui/Card.jsx'
import { Button } from '@/components/ui/Button.jsx'
import { Input, Textarea } from '@/components/ui/Input.jsx'
import { Badge } from '@/components/ui/Badge.jsx'

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g

/** Extract emails from a CSV — prefers an `email` column, else scans all cells. */
function extractEmailsFromCsv(text) {
  const found = new Set()
  const { headers, rows } = parseCSV(text)
  const emailCol = headers.find((h) => h === 'email' || h === 'emails' || h === 'leader email')
  if (rows.length && emailCol) {
    for (const row of rows) {
      const v = String(row[emailCol] || '').trim().toLowerCase()
      if (v && v.includes('@')) found.add(v)
    }
  }
  const matches = text.match(EMAIL_RE) || []
  for (const m of matches) found.add(m.trim().toLowerCase())
  return [...found]
}

/** Admin: bulk-invite team leaders by email — creates accounts + emails credentials. */
function InviteLeaders({ api }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const fileRef = useRef(null)

  const emails = text.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean)

  async function invite() {
    setError('')
    setResult(null)
    if (emails.length === 0) { setError('Enter at least one email.'); return }
    setBusy(true)
    try {
      const res = await api.bulkInviteParticipants(emails)
      setResult(res)
    } catch (e) {
      setError(e?.message || 'Invite failed.')
    } finally {
      setBusy(false)
    }
  }

  function onCsvSelected(e) {
    setError('')
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const emailsFromCsv = extractEmailsFromCsv(String(reader.result || ''))
        if (emailsFromCsv.length === 0) {
          setError('No emails found in that CSV. Use a column named "email".')
          return
        }
        const existing = new Set(text.split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean))
        for (const em of emailsFromCsv) existing.add(em)
        setText([...existing].join('\n'))
      } catch {
        setError('Could not read that CSV file.')
      }
    }
    reader.readAsText(file)
    if (fileRef.current) fileRef.current.value = ''
  }

  function downloadTemplate() {
    const csv = ['email', 'leader1@college.edu', 'leader2@college.edu', 'leader3@college.edu'].join('\n')
    downloadCSV('leader-emails-template.csv', csv)
  }

  return (
    <Card>
      <h2 className="flex items-center gap-2 font-display text-base font-semibold text-ink-900">
        <UserPlus className="h-4 w-4 text-brand-600" /> Invite Team Leaders
      </h2>
      <p className="mt-1 text-xs text-ink-500">
        Paste or import leader emails. Each gets an account with a temporary password emailed to them.
        They set a new password (OTP-verified) on first login.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onCsvSelected} className="hidden" />
        <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
          <Upload className="mr-1.5 h-3.5 w-3.5" /> Import CSV
        </Button>
        <Button variant="ghost" size="sm" onClick={downloadTemplate}>
          <Download className="mr-1.5 h-3.5 w-3.5" /> Download template
        </Button>
      </div>

      <div className="mt-3 space-y-3">
        <Textarea
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'leader1@college.edu\nleader2@college.edu\nleader3@college.edu'}
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-ink-500">{emails.length} email{emails.length === 1 ? '' : 's'} detected</span>
          <Button onClick={invite} disabled={busy || emails.length === 0} loading={busy}>
            <Send className="mr-1.5 h-4 w-4" /> Create & Email Credentials
          </Button>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        {result && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm">
            <div className="flex flex-wrap gap-3 font-medium">
              <span className="text-emerald-700">Created: {result.summary.created}</span>
              <span className="text-amber-700">Skipped: {result.summary.skipped}</span>
              <span className="text-red-700">Failed: {result.summary.failed}</span>
              <span className="text-ink-500">Total: {result.summary.total}</span>
            </div>
            {Array.isArray(result.results) && result.results.some((r) => r.status !== 'created') && (
              <ul className="mt-2 max-h-40 space-y-1 overflow-auto text-xs text-ink-600">
                {result.results
                  .filter((r) => r.status !== 'created')
                  .map((r, i) => (
                    <li key={i}>
                      <span className="font-mono">{r.email || '—'}</span>: {r.status}
                      {r.reason ? ` (${r.reason})` : ''}{r.error ? ` — ${r.error}` : ''}
                    </li>
                  ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}

/** Reusable toggle row — accessible checkbox with a custom switch look. */
function ToggleRow({ checked, onChange, title, description, tone = 'default' }) {
  const toneBorder = {
    default: 'border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))]/30',
    brand: 'border-brand-500/30 bg-brand-500/5',
    amber: 'border-amber-500/30 bg-amber-500/5',
  }
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-all hover:border-brand-500/40 ${toneBorder[tone]}`}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink-900">{title}</p>
        {description && <p className="mt-0.5 text-xs text-ink-500">{description}</p>}
      </div>
      <span className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${checked ? 'bg-emerald-500' : 'bg-ink-300'}`}>
        <motion.span
          layout
          className="inline-block h-5 w-5 rounded-full bg-white shadow"
          animate={{ x: checked ? 22 : 2 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        />
      </span>
    </button>
  )
}

export function AdminSettingsPage() {
  usePageSeo({ title: 'Settings', description: 'Event configuration.' })
  const api = useApi()
  const { eventId, eventCfg } = useEvent()
  const [eventForm, setEventForm] = useState({
    registrationOpen: true,
    submissionsOpen: false,
    evaluationsOpen: false,
    resultsPublished: false,
    matchmakingEnabled: false,
    entryFeeEnabled: false,
    entryFeeAmount: 0,
    currency: 'INR',
    minTeamSize: 2,
    maxTeamSize: 4,
  })
  const [msg, setMsg] = useState('')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null) // { type: 'success' | 'error', text }

  function showToast(type, text) {
    setToast({ type, text })
    setTimeout(() => setToast(null), 3500)
  }

  // Sync form state with eventCfg from context (includes real-time updates)
  useEffect(() => {
    if (!eventCfg) return
    setEventForm({
      registrationOpen: Boolean(eventCfg.registrationOpen),
      submissionsOpen: Boolean(eventCfg.submissionsOpen),
      evaluationsOpen: Boolean(eventCfg.evaluationsOpen),
      resultsPublished: Boolean(eventCfg.resultsPublished),
      matchmakingEnabled: Boolean(eventCfg.matchmakingEnabled),
      entryFeeEnabled: Boolean(eventCfg.entryFeeEnabled),
      entryFeeAmount: Number(eventCfg.entryFeeAmount) || 0,
      currency: eventCfg.currency || 'INR',
      minTeamSize: Number(eventCfg.minTeamSize) || 2,
      maxTeamSize: Number(eventCfg.maxTeamSize) || 4,
    })
  }, [eventCfg])

  async function save() {
    if (!eventId) { showToast('error', 'No active event.'); return }
    setSaving(true)
    try {
      await api.patchAdminEvent(eventId, {
        registrationOpen: eventForm.registrationOpen,
        submissionsOpen: eventForm.submissionsOpen,
        evaluationsOpen: eventForm.evaluationsOpen,
        resultsPublished: eventForm.resultsPublished,
        matchmakingEnabled: eventForm.matchmakingEnabled,
        entryFeeEnabled: eventForm.entryFeeEnabled,
        entryFeeAmount: Number(eventForm.entryFeeAmount) || 0,
        currency: eventForm.currency || 'INR',
        minTeamSize: Number(eventForm.minTeamSize) || 2,
        maxTeamSize: Number(eventForm.maxTeamSize) || 4,
      })
      showToast('success', 'Settings saved successfully')
    } catch (e) {
      showToast('error', e.message || 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Top-right toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -16, x: 16 }}
            animate={{ opacity: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className={`fixed right-6 top-6 z-50 flex items-center gap-2.5 rounded-xl border px-4 py-3 text-sm font-medium shadow-card-hover ${
              toast.type === 'success'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700'
                : 'border-red-500/30 bg-red-500/10 text-red-700'
            }`}
          >
            {toast.type === 'success'
              ? <CheckCircle className="h-4 w-4 shrink-0" />
              : <XCircle className="h-4 w-4 shrink-0" />}
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>

      <div>
        <h1 className="font-display text-3xl font-bold text-ink-900">Event Settings</h1>
        <p className="mt-2 text-sm text-ink-600">
          Core event configuration. Dates and phases are managed in <strong>Timeline</strong> and <strong>Competition Phases</strong>.
        </p>
        {eventId && (
          <Badge tone="brand" className="mt-2">Event: {eventId}</Badge>
        )}
      </div>

      {/* Registration */}
      <Card>
        <h2 className="font-display text-base font-semibold text-ink-900">Registration</h2>
        <div className="mt-4 space-y-3">
          <ToggleRow
            checked={eventForm.registrationOpen}
            onChange={(v) => setEventForm((f) => ({ ...f, registrationOpen: v }))}
            title="Registration Open"
            description="Teams can create accounts and register"
          />
        </div>
      </Card>

      {/* Lifecycle Controls */}
      <Card>
        <h2 className="font-display text-base font-semibold text-ink-900">Hackathon Lifecycle</h2>
        <p className="mt-1 text-xs text-ink-500">
          These flags control what participants and judges can do. Enable them in order as the event progresses.
        </p>
        <div className="mt-4 space-y-3">
          <ToggleRow
            checked={eventForm.submissionsOpen}
            onChange={(v) => setEventForm((f) => ({ ...f, submissionsOpen: v }))}
            title="Submissions Open"
            description="Teams can upload and edit their submissions"
          />
          <ToggleRow
            checked={eventForm.evaluationsOpen}
            onChange={(v) => setEventForm((f) => ({ ...f, evaluationsOpen: v }))}
            title="Evaluations Open"
            description="Judges can score and submit evaluations"
          />
          <ToggleRow
            checked={eventForm.resultsPublished}
            onChange={(v) => setEventForm((f) => ({ ...f, resultsPublished: v }))}
            title="Publish Results"
            description="Makes the leaderboard visible to everyone at /results. Only enable after all evaluations are finalized."
            tone="amber"
          />
        </div>
      </Card>

      {/* Participant Features */}
      <Card>
        <h2 className="font-display text-base font-semibold text-ink-900">Participant Features</h2>
        <p className="mt-1 text-xs text-ink-500">
          Optional tools participants can use. Toggle them on when you want them available.
        </p>
        <div className="mt-4 space-y-3">
          <ToggleRow
            checked={eventForm.matchmakingEnabled}
            onChange={(v) => setEventForm((f) => ({ ...f, matchmakingEnabled: v }))}
            title="Team Matchmaking"
            description="Shows the Find Teammates page so solo participants can discover each other and request to join open teams. When off, the page is hidden from all participants."
            tone="brand"
          />
        </div>
      </Card>

      {/* Invite Team Leaders */}
      <InviteLeaders api={api} />

      {/* Results Preview — shown when admin is about to publish */}
      {eventForm.resultsPublished || eventForm.evaluationsOpen ? (
        <ResultsPreview api={api} eventId={eventId} isPublished={eventForm.resultsPublished} />
      ) : null}

      {/* Fees */}
      <Card>
        <h2 className="font-display text-base font-semibold text-ink-900">Entry Fee</h2>
        <div className="mt-4 space-y-4">
          <ToggleRow
            checked={eventForm.entryFeeEnabled}
            onChange={(v) => setEventForm((f) => ({ ...f, entryFeeEnabled: v }))}
            title="Require Payment"
            description="Teams must pay via Razorpay to complete registration"
          />
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

      <Button className="w-full" onClick={save} disabled={!eventId || saving} loading={saving}>
        {saving ? 'Saving…' : 'Save Settings'}
      </Button>

      {/* Email Diagnostics */}
      <EmailDiagnostics api={api} />
    </div>
  )
}

// ─── Email Diagnostics Panel ──────────────────────────────────────────────────

function EmailDiagnostics({ api }) {
  const [health, setHealth] = useState(null)
  const [healthLoading, setHealthLoading] = useState(false)

  async function checkHealth() {
    setHealthLoading(true)
    setHealth(null)
    try {
      const data = await api.adminEmailHealth()
      setHealth(data)
    } catch (e) {
      setHealth({ error: `Could not reach backend: ${e.message}` })
    } finally {
      setHealthLoading(false)
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
            <h2 className="font-display text-base font-semibold text-ink-900">Email System Health</h2>
            <p className="text-xs text-ink-500">SMTP status + delivery stats (last 24h)</p>
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
          Refresh
        </Button>
      </div>

      {health?.error && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700">
          <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {health.error}
        </div>
      )}

      {health && !health.error && (
        <div className="mt-4 space-y-4">
          {/* Active Transport Badge */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-ink-600">Active Transport:</span>
            <Badge
              tone={
                health.activeTransport === 'smtp'
                  ? 'success'
                  : health.activeTransport === 'brevo'
                    ? 'amber'
                    : 'neutral'
              }
            >
              {health.activeTransport === 'smtp'
                ? '✓ SMTP (Hostinger)'
                : health.activeTransport === 'brevo'
                  ? '⚠ Brevo Fallback'
                  : '✗ None'}
            </Badge>
          </div>

          {/* SMTP Status */}
          <div className={`rounded-xl border p-4 ${
            health.smtp.healthy
              ? 'border-emerald-500/30 bg-emerald-500/5'
              : health.smtp.configured && health.smtp.healthy === false
                ? 'border-red-500/30 bg-red-500/5'
                : 'border-ink-200 bg-ink-50'
          }`}>
            <div className="flex items-start gap-3">
              <StatusIcon
                ok={health.smtp.healthy === true}
                warn={health.smtp.configured && health.smtp.healthy === null}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-ink-900">Hostinger SMTP</p>
                  {health.smtp.healthy === true && (
                    <Badge tone="success" className="text-xs">Working</Badge>
                  )}
                  {health.smtp.healthy === false && (
                    <Badge tone="danger" className="text-xs">Failed</Badge>
                  )}
                  {!health.smtp.configured && (
                    <Badge tone="neutral" className="text-xs">Not Configured</Badge>
                  )}
                </div>
                {health.smtp.configured && (
                  <div className="mt-1 space-y-0.5 text-xs text-ink-600 font-mono">
                    <p>Host: {health.smtp.host}</p>
                    <p>User: {health.smtp.user}</p>
                  </div>
                )}
                {health.smtp.healthy === false && (
                  <p className="mt-2 text-xs text-red-700">
                    ⚠ Authentication failed. Verify the mailbox password for{' '}
                    <span className="font-mono">{health.smtp.user}</span> in the Hostinger email panel (hPanel →
                    Emails). Update <code>SMTP_PASS</code> (no spaces/dashes), <code>SMTP_HOST</code>=smtp.hostinger.com,
                    and <code>SMTP_PORT</code>=465 in your production env.
                  </p>
                )}
                {!health.smtp.configured && (
                  <p className="mt-1 text-xs text-ink-500">
                    Set <code>SMTP_HOST</code>, <code>SMTP_USER</code>, and <code>SMTP_PASS</code> in production env.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Brevo Fallback Status */}
          <div className={`rounded-xl border p-4 ${
            health.brevo.configured
              ? 'border-amber-500/30 bg-amber-500/5'
              : 'border-ink-200 bg-ink-50'
          }`}>
            <div className="flex items-start gap-3">
              <StatusIcon ok={health.brevo.configured} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-ink-900">Brevo Fallback</p>
                  {health.brevo.configured && (
                    <Badge tone="amber" className="text-xs">Standby</Badge>
                  )}
                </div>
                {health.brevo.configured && (
                  <p className="mt-1 text-xs text-ink-600 font-mono">From: {health.brevo.fromAddress}</p>
                )}
                {!health.brevo.configured && (
                  <p className="mt-1 text-xs text-ink-500">Not configured (BREVO_API_KEY missing)</p>
                )}
              </div>
            </div>
          </div>

          {/* Last 24h Stats */}
          {health.stats && (
            <div className="rounded-xl border border-brand-500/20 bg-brand-500/5 p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-1.5 w-1.5 rounded-full bg-brand-500 animate-pulse" />
                <p className="text-xs font-semibold text-brand-700">Last 24 Hours</p>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-2xl font-bold text-emerald-600">{health.stats.smtp.sent}</p>
                  <p className="text-xs text-ink-500">via SMTP</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-amber-600">{health.stats.brevo.sent}</p>
                  <p className="text-xs text-ink-500">via Brevo</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-ink-700">{health.stats.total}</p>
                  <p className="text-xs text-ink-500">Total Sent</p>
                </div>
              </div>
              {(health.stats.smtp.failed > 0 || health.stats.brevo.failed > 0) && (
                <div className="mt-3 pt-3 border-t border-brand-500/20 flex justify-center gap-4 text-xs text-red-600">
                  {health.stats.smtp.failed > 0 && <span>SMTP failed: {health.stats.smtp.failed}</span>}
                  {health.stats.brevo.failed > 0 && <span>Brevo failed: {health.stats.brevo.failed}</span>}
                </div>
              )}
            </div>
          )}
        </div>
      )}
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
