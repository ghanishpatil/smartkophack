import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Swords, Plus, Trash2, Upload, Download, Clock, Zap, CheckCircle2, AlertCircle, Pencil, X,
} from 'lucide-react'
import { usePageSeo } from '@/hooks/usePageSeo.js'
import { useApi } from '@/hooks/useApi.js'
import { useResolvedEventId } from '@/hooks/useResolvedEventId.js'
import { Card } from '@/components/ui/Card.jsx'
import { Button } from '@/components/ui/Button.jsx'
import { Input, Textarea } from '@/components/ui/Input.jsx'
import { Badge } from '@/components/ui/Badge.jsx'
import { Skeleton } from '@/components/ui/Skeleton.jsx'
import { parseCSV, downloadCSV } from '@/utils/csvParser.js'

// The 5 official Smart Kopargaon "Universal Scenario Challenges" — domain-agnostic,
// identical for every team and both hardware/software tracks. Each has three parts:
// the scenario (description), "Why it's universal", and "What the website/demo must
// show". Used to pre-fill the downloadable CSV template.
const SKH_UNIVERSAL_CHALLENGES = [
  {
    order: 1,
    title: 'The Blackout',
    description:
      "It's 9 PM in Kopargaon. The power goes out across half the taluka, and mobile data drops to nothing for the next two hours. Your solution is in active use — a farmer mid-advisory, a health worker mid-screening, a municipal officer mid-report. Show us what the user sees on your website/app right now.",
    whyUniversal:
      "Every track's problem statement assumes some form of connectivity or power — a sensor sending data, a dashboard loading, a citizen submitting a report — and Kopargaon's rural infrastructure regularly fails at exactly that assumption. Hardware teams can demonstrate by killing power/network to their device; software teams by toggling offline mode in the browser.",
    whatToShow:
      "The interface doesn't go blank or error out — it degrades gracefully: cached last-known data, a clear 'offline, last updated at X' state, and locally queued actions that sync once connectivity returns. A team that can only demo with a live internet connection fails this challenge outright.",
  },
  {
    order: 2,
    title: 'The Bad Reading',
    description:
      "One of your system's core inputs just went wrong — a sensor stuck reporting the same value, an API returning garbage, or a form filled with impossible data (negative rainfall, a temperature of 90°C in cold storage, a phone number as an address). Your system is about to act on it. Show us what happens.",
    whyUniversal:
      "Every track has at least one problem statement that depends on an external data source being trustworthy — weather feeds, GPS, sensor readings, uploaded documents, citizen-submitted forms. In the real world that data is dirty far more often than hackathon demo data ever is.",
    whatToShow:
      "The system notices the input is implausible — a sanity check, a range check, a confidence flag — rather than confidently acting on garbage. It's fine if the response is 'flag this and ask a human'; that's a better answer than silently producing a wrong result with full confidence.",
  },
  {
    order: 3,
    title: 'The Surge',
    description:
      "Word got out. Your solution just got featured on local news, or a heavy-rain warning hit every farmer's phone at once, or a festival brought ten times Kopargaon's usual foot traffic through your system in the same hour. Built and tested for a handful of users, it now has far more load than it was designed for. Show us what happens when it's suddenly popular.",
    whyUniversal:
      "Every track's real deployment target is a population, not a demo audience — thousands of farmers, an entire taluka's citizens, every MSME in a cluster. A system that only works at hackathon-demo scale isn't actually solving the problem for Kopargaon.",
    whatToShow:
      "Some evidence of how the system behaves under load it wasn't fully built for — an actual load test, a simulated queue/throttling mechanism, a 'high demand, here's your position' state, or an honest explanation of what would break first and how you'd fix it. Production-grade scaling in 24 hours isn't expected — evidence of having thought about it is.",
  },
  {
    order: 4,
    title: 'The Intruder',
    description:
      "Someone just tried to break your system. A stranger is typing suspicious input into your login form. A fake sensor is feeding spoofed readings into your pipeline to trigger a false alert. Someone found your API and is hammering it, or a device on your network is trying to intercept the data between your sensor and your dashboard. Nothing has broken yet — but someone is actively trying. Show us what stops them.",
    whyUniversal:
      "Every track eventually touches something worth protecting — a farmer's personal data, a citizen's grievance record, a health screening result, an MSME's credit application, a municipal system of record, or a sensor feed a bad actor could spoof to trigger false alerts or hide a real one. A system that works for a well-behaved user but has no answer for a bad-faith one isn't ready for Kopargaon, however polished.",
    whatToShow:
      "At least one concrete security decision the team actually made and can demonstrate — not a claim that 'it's secure'. For example: input validation/sanitisation that rejects malicious input live on screen, authentication or role-based access control a stranger can't bypass, rate-limiting on an API/form, encrypted or signed data between a sensor and its dashboard so a spoofed reading is detectable, or tamper-evidence on a physical device. Hardware teams point to a safeguard on the device or its link; software teams attempt the attack live and show it rejected or logged.",
  },
  {
    order: 5,
    title: 'The Skeptic',
    description:
      "A stakeholder doesn't believe your system. A farmer disagrees with the irrigation advisory, a municipal officer questions why one civic issue was prioritised over another, a doctor wants to know why the screening tool flagged this child. They're in front of your website, arms crossed, asking 'why should I trust this?' Show us how your system answers them.",
    whyUniversal:
      "Every track's Super PS asks for a real decision, recommendation, or intervention — not just a display of numbers. A decision nobody can question or verify isn't trustworthy enough to actually deploy, regardless of the domain.",
    whatToShow:
      "The system can surface why it produced a given output — the key factors behind a recommendation, a confidence level, a comparison to the baseline it used, or a clear path to override/escalate to a human. 'Because the AI said so' is not an acceptable answer to the skeptic.",
  },
]

function toCsvCell(v) {
  return `"${String(v ?? '').replace(/"/g, '""')}"`
}

const CHALLENGE_TEMPLATE_CSV = [
  'title,description,why_universal,what_to_show,order',
  ...SKH_UNIVERSAL_CHALLENGES.map(
    (c) => `${toCsvCell(c.title)},${toCsvCell(c.description)},${toCsvCell(c.whyUniversal)},${toCsvCell(c.whatToShow)},${c.order}`,
  ),
].join('\n')

/** ISO string -> value for <input type="datetime-local"> (local time). */
function toLocalInputValue(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Human "in 1h 23m 45s" until an ISO instant, relative to a live clock. */
function formatCountdown(targetMs, nowMs) {
  const diff = Math.max(0, Math.floor((targetMs - nowMs) / 1000))
  const h = Math.floor(diff / 3600)
  const m = Math.floor((diff % 3600) / 60)
  const s = diff % 60
  const pad = (n) => String(n).padStart(2, '0')
  return h > 0 ? `${h}h ${pad(m)}m ${pad(s)}s` : `${m}m ${pad(s)}s`
}

export function AdminChallengesPage() {
  usePageSeo({ title: 'Challenges', description: 'Schedule and manage challenge drops.' })
  const api = useApi()
  const { eventId } = useResolvedEventId()

  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const [challenges, setChallenges] = useState([])
  const [status, setStatus] = useState(null)

  // Schedule form
  const [enabled, setEnabled] = useState(false)
  const [startLocal, setStartLocal] = useState('')
  const [intervalMinutes, setIntervalMinutes] = useState(120)
  const [savingSchedule, setSavingSchedule] = useState(false)

  // Add challenge
  const [newTitle, setNewTitle] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newWhyUniversal, setNewWhyUniversal] = useState('')
  const [newWhatToShow, setNewWhatToShow] = useState('')
  const [newOrder, setNewOrder] = useState('')
  const [creating, setCreating] = useState(false)

  // Inline edit
  const [edits, setEdits] = useState({})

  // Bulk import
  const [bulkRows, setBulkRows] = useState([])
  const [bulkFileName, setBulkFileName] = useState('')
  const [bulkErr, setBulkErr] = useState('')
  const [bulkSubmitting, setBulkSubmitting] = useState(false)
  const [bulkResult, setBulkResult] = useState(null)
  const fileRef = useRef(null)

  // Live clock for the status countdown, corrected for client/server skew.
  const [now, setNow] = useState(() => Date.now())
  const [serverOffset, setServerOffset] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const load = useCallback(async (spin = false) => {
    if (spin) setLoading(true)
    try {
      const data = await api.listAdminChallenges(eventId || undefined)
      const list = Array.isArray(data?.challenges) ? data.challenges : []
      setChallenges(list)
      setStatus(data?.status || null)
      if (data?.status?.serverTime) {
        const st = new Date(data.status.serverTime).getTime()
        if (!Number.isNaN(st)) setServerOffset(st - Date.now())
      }
      const sched = data?.schedule || {}
      setEnabled(Boolean(sched.enabled))
      setIntervalMinutes(typeof sched.intervalMinutes === 'number' && sched.intervalMinutes > 0 ? sched.intervalMinutes : 120)
      setStartLocal(toLocalInputValue(sched.startAt))
    } catch (e) {
      setErr(e.message || 'Could not load challenges')
    } finally {
      setLoading(false)
    }
  }, [api, eventId])

  useEffect(() => { void load(true) }, [load])

  async function saveSchedule(overrides = {}) {
    if (!eventId) { setErr('Event scope not resolved yet.'); return }
    setSavingSchedule(true)
    setErr('')
    setMsg('')
    try {
      const body = {
        challengesEnabled: overrides.enabled ?? enabled,
        challengesIntervalMinutes: Number(overrides.intervalMinutes ?? intervalMinutes) || 120,
      }
      const localVal = overrides.startLocal ?? startLocal
      if (localVal) {
        const d = new Date(localVal)
        if (!Number.isNaN(d.getTime())) body.challengesStartAt = d.toISOString()
      } else {
        body.challengesStartAt = null
      }
      await api.patchAdminEvent(eventId, body)
      setMsg('Schedule saved.')
      await load()
    } catch (e) {
      setErr(e.message || 'Could not save schedule')
    } finally {
      setSavingSchedule(false)
    }
  }

  function setStartToNow() {
    const iso = new Date().toISOString()
    setStartLocal(toLocalInputValue(iso))
    void saveSchedule({ startLocal: toLocalInputValue(iso), enabled: true })
    setEnabled(true)
  }

  // Reveal one more challenge immediately WITHOUT shifting future drop times:
  // move the start anchor back by exactly one interval.
  async function revealNextNow() {
    const total = status?.total ?? challenges.length
    const released = status?.releasedCount ?? 0
    if (released >= total) return
    const intervalMs = (Number(intervalMinutes) || 120) * 60000
    let baseMs
    if (!enabled || !startLocal) {
      // Not started yet — start now (reveals the first challenge).
      baseMs = Date.now()
    } else {
      const cur = new Date(startLocal)
      baseMs = (Number.isNaN(cur.getTime()) ? Date.now() : cur.getTime()) - intervalMs
    }
    const iso = new Date(baseMs).toISOString()
    setStartLocal(toLocalInputValue(iso))
    setEnabled(true)
    await saveSchedule({ startLocal: toLocalInputValue(iso), enabled: true })
  }

  async function createChallenge() {
    const title = newTitle.trim()
    if (!title) { setErr('Title is required.'); return }
    setCreating(true)
    setErr('')
    setMsg('')
    try {
      const body = {
        title,
        description: newDescription.trim(),
        whyUniversal: newWhyUniversal.trim(),
        whatToShow: newWhatToShow.trim(),
      }
      if (newOrder.trim() !== '') {
        const n = Number(newOrder)
        if (!Number.isNaN(n)) body.order = n
      }
      await api.createAdminChallenge(body)
      setMsg(`Added "${title}".`)
      setNewTitle('')
      setNewDescription('')
      setNewWhyUniversal('')
      setNewWhatToShow('')
      setNewOrder('')
      await load()
    } catch (e) {
      setErr(e.message || 'Could not add challenge')
    } finally {
      setCreating(false)
    }
  }

  async function saveEdit(c) {
    const e = edits[c.id]
    if (!e) return
    setErr('')
    try {
      const patch = {}
      if (e.title !== undefined) patch.title = e.title
      if (e.description !== undefined) patch.description = e.description
      if (e.whyUniversal !== undefined) patch.whyUniversal = e.whyUniversal
      if (e.whatToShow !== undefined) patch.whatToShow = e.whatToShow
      if (e.order !== undefined && e.order !== '') {
        const n = Number(e.order)
        if (!Number.isNaN(n)) patch.order = n
      }
      await api.patchAdminChallenge(c.id, patch)
      setEdits((prev) => { const next = { ...prev }; delete next[c.id]; return next })
      setMsg(`Saved "${patch.title ?? c.title}".`)
      await load()
    } catch (er) {
      setErr(er.message || 'Save failed')
    }
  }

  async function deleteChallenge(c) {
    if (!window.confirm(`Delete challenge "${c.title}"?`)) return
    setErr('')
    try {
      await api.deleteAdminChallenge(c.id)
      setMsg(`Deleted "${c.title}".`)
      await load()
    } catch (e) {
      setErr(e.message || 'Delete failed')
    }
  }

  async function handleBulkFile(ev) {
    const file = ev.target.files?.[0]
    ev.target.value = ''
    if (!file) return
    setBulkFileName(file.name)
    setBulkResult(null)
    setBulkErr('')
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setBulkErr('Only .csv files are supported.')
      setBulkRows([])
      return
    }
    try {
      const text = await file.text()
      const { headers, rows, error } = parseCSV(text)
      if (error) { setBulkErr(error); setBulkRows([]); return }
      if (!headers.includes('title')) {
        setBulkErr('CSV is missing the required "title" column. Download the template to see the format.')
        setBulkRows([])
        return
      }
      setBulkRows(rows.filter((r) => (r.title || '').trim()))
    } catch (e) {
      setBulkErr(e.message || 'Could not read file')
      setBulkRows([])
    }
  }

  async function submitBulk() {
    if (bulkRows.length === 0) return
    setBulkSubmitting(true)
    setBulkResult(null)
    try {
      const result = await api.bulkImportChallenges(bulkRows)
      setBulkResult(result)
      if (result.success > 0) {
        setMsg(`✓ Imported ${result.success} challenge(s).`)
        setBulkRows([])
        setBulkFileName('')
        await load()
      }
    } catch (e) {
      setBulkResult({ success: 0, failed: bulkRows.length, errors: [{ line: 0, error: e.message }] })
    } finally {
      setBulkSubmitting(false)
    }
  }

  const total = status?.total ?? challenges.length
  const released = status?.releasedCount ?? 0
  const nextDropMs = status?.nextDropAt ? new Date(status.nextDropAt).getTime() : null
  const effectiveNow = now + serverOffset

  if (loading) return <Skeleton className="h-96 w-full rounded-2xl" />

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-3xl font-bold text-ink-900">
            <Swords className="h-7 w-7 text-brand-600" />
            Challenges
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-600">
            Challenges drop to participants on a schedule you control. Only released challenges are visible to teams —
            upcoming ones stay hidden until their drop time.
          </p>
        </div>
      </div>

      {err ? <p className="text-sm text-red-600">{err}</p> : null}
      {msg ? <p className="text-sm text-brand-700">{msg}</p> : null}

      {/* ── Schedule control ── */}
      <Card className="space-y-4 border-brand-500/30 bg-brand-500/[0.03]">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-brand-600" />
          <h2 className="font-display text-lg font-semibold text-ink-900">Drop schedule</h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="flex items-center gap-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2.5 text-sm">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4 accent-brand-600"
            />
            <span className="font-medium text-ink-800">Challenges enabled</span>
          </label>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-500">First drop (start time)</label>
            <input
              type="datetime-local"
              value={startLocal}
              onChange={(e) => setStartLocal(e.target.value)}
              className="h-11 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-500">Interval (minutes)</label>
            <Input
              type="number"
              min={1}
              value={String(intervalMinutes)}
              onChange={(e) => setIntervalMinutes(e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="primary" disabled={savingSchedule} onClick={() => void saveSchedule()}>
            {savingSchedule ? 'Saving…' : 'Save schedule'}
          </Button>
          <Button type="button" variant="secondary" size="sm" disabled={savingSchedule} onClick={setStartToNow}>
            Start now
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={savingSchedule || released >= total || total === 0}
            onClick={() => void revealNextNow()}
            className="gap-1.5"
          >
            <Zap className="h-4 w-4" />
            Reveal next now
          </Button>
        </div>

        {/* Live status */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">Released</p>
            <p className="mt-1 font-display text-2xl font-bold text-ink-900">
              {released}<span className="text-base text-ink-400"> / {total}</span>
            </p>
          </div>
          <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">Status</p>
            <p className="mt-1">
              <Badge tone={enabled ? 'success' : 'neutral'}>{enabled ? 'Live' : 'Paused'}</Badge>
            </p>
          </div>
          <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">Next drop</p>
            <p className="mt-1 font-mono text-lg font-bold text-brand-700">
              {enabled && nextDropMs ? formatCountdown(nextDropMs, effectiveNow) : released >= total && total > 0 ? 'All dropped' : '—'}
            </p>
          </div>
        </div>
        <p className="text-xs text-ink-500">
          “Reveal next now” releases one more challenge immediately while keeping all later drop times unchanged.
        </p>
      </Card>

      {/* ── Add challenge ── */}
      <Card className="space-y-3">
        <h2 className="font-display text-lg font-semibold text-ink-900">Add a challenge</h2>
        <Input label="Title" value={newTitle} disabled={creating} onChange={(e) => setNewTitle(e.target.value)} />
        <Textarea
          label="Scenario (description)"
          rows={3}
          value={newDescription}
          disabled={creating}
          onChange={(e) => setNewDescription(e.target.value)}
        />
        <Textarea
          label="Why it's universal"
          rows={3}
          value={newWhyUniversal}
          disabled={creating}
          onChange={(e) => setNewWhyUniversal(e.target.value)}
        />
        <Textarea
          label="What the website/demo must show"
          rows={3}
          value={newWhatToShow}
          disabled={creating}
          onChange={(e) => setNewWhatToShow(e.target.value)}
        />
        <div className="grid gap-3 sm:grid-cols-3">
          <Input
            label="Drop order (optional)"
            type="number"
            placeholder="auto"
            value={newOrder}
            disabled={creating}
            onChange={(e) => setNewOrder(e.target.value)}
          />
        </div>
        <Button type="button" variant="primary" disabled={creating} onClick={() => void createChallenge()} className="gap-1.5">
          <Plus className="h-4 w-4" />
          {creating ? 'Adding…' : 'Add challenge'}
        </Button>
      </Card>

      {/* ── Bulk import ── */}
      <Card className="space-y-3">
        <h2 className="font-display text-lg font-semibold text-ink-900">Bulk import (CSV)</h2>
        <p className="text-sm text-ink-600">
          Columns: <code className="font-mono">title</code> (required), <code className="font-mono">description</code>,{' '}
          <code className="font-mono">why_universal</code>, <code className="font-mono">what_to_show</code>,{' '}
          <code className="font-mono">order</code> (optional). The downloadable template is pre-filled with the 5 official
          SKH universal challenges — edit or replace them, then upload. Drop order follows the{' '}
          <code className="font-mono">order</code> column, else the row order.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="gap-1.5"
            onClick={() => downloadCSV('challenges-template.csv', CHALLENGE_TEMPLATE_CSV)}
          >
            <Download className="h-4 w-4" />
            Download template
          </Button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleBulkFile} />
          <Button type="button" variant="secondary" size="sm" className="gap-1.5" onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4" />
            Choose CSV
          </Button>
          {bulkFileName ? <span className="self-center text-xs text-ink-500">{bulkFileName}</span> : null}
        </div>

        {bulkErr ? (
          <div className="flex gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-800">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{bulkErr}</span>
          </div>
        ) : null}

        {bulkRows.length > 0 && !bulkResult ? (
          <div className="rounded-xl border border-[rgb(var(--border))] p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wide text-ink-500">Preview</p>
              <Badge tone="success">{bulkRows.length} row(s)</Badge>
            </div>
            <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-sm text-ink-700">
              {bulkRows.slice(0, 12).map((r, i) => (
                <li key={i} className="truncate">• {r.title}</li>
              ))}
              {bulkRows.length > 12 ? <li className="text-ink-500">+ {bulkRows.length - 12} more…</li> : null}
            </ul>
            <Button type="button" variant="primary" size="sm" disabled={bulkSubmitting} onClick={() => void submitBulk()} className="mt-3 gap-1.5">
              <Upload className="h-4 w-4" />
              {bulkSubmitting ? 'Importing…' : `Import ${bulkRows.length} challenge(s)`}
            </Button>
          </div>
        ) : null}

        {bulkResult ? (
          <div className={`rounded-xl border p-3 text-sm ${bulkResult.success > 0 ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-800' : 'border-red-500/30 bg-red-500/5 text-red-800'}`}>
            <span className="inline-flex items-center gap-1.5">
              {bulkResult.success > 0 ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
              Imported {bulkResult.success || 0}, failed {bulkResult.failed || 0}.
            </span>
          </div>
        ) : null}
      </Card>

      {/* ── Challenge list ── */}
      <div className="space-y-3">
        <h2 className="font-display text-lg font-semibold text-ink-900">All challenges ({challenges.length})</h2>
        {challenges.length === 0 ? (
          <p className="text-sm text-ink-500">No challenges yet — add one above or bulk import.</p>
        ) : (
          challenges.map((c, idx) => {
            const isReleased = idx < released
            const e = edits[c.id]
            const editing = Boolean(e)
            return (
              <Card key={c.id} className="p-4">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-500/10 font-mono text-sm font-bold text-brand-700">
                    {typeof c.order === 'number' ? c.order : idx + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    {editing ? (
                      <div className="space-y-2">
                        <Input label="Title" value={e.title ?? c.title ?? ''} onChange={(ev) => setEdits((p) => ({ ...p, [c.id]: { ...p[c.id], title: ev.target.value } }))} />
                        <Textarea label="Scenario (description)" rows={3} value={e.description ?? c.description ?? ''} onChange={(ev) => setEdits((p) => ({ ...p, [c.id]: { ...p[c.id], description: ev.target.value } }))} />
                        <Textarea label="Why it's universal" rows={3} value={e.whyUniversal ?? c.whyUniversal ?? ''} onChange={(ev) => setEdits((p) => ({ ...p, [c.id]: { ...p[c.id], whyUniversal: ev.target.value } }))} />
                        <Textarea label="What the website/demo must show" rows={3} value={e.whatToShow ?? c.whatToShow ?? ''} onChange={(ev) => setEdits((p) => ({ ...p, [c.id]: { ...p[c.id], whatToShow: ev.target.value } }))} />
                        <Input type="number" label="Drop order" value={String(e.order ?? c.order ?? '')} onChange={(ev) => setEdits((p) => ({ ...p, [c.id]: { ...p[c.id], order: ev.target.value } }))} />
                        <div className="flex gap-2">
                          <Button type="button" size="sm" variant="primary" onClick={() => void saveEdit(c)}>Save</Button>
                          <Button type="button" size="sm" variant="ghost" onClick={() => setEdits((p) => { const n = { ...p }; delete n[c.id]; return n })} className="gap-1">
                            <X className="h-3.5 w-3.5" /> Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-ink-900">{c.title}</p>
                          <Badge tone={isReleased ? 'success' : 'neutral'} className="text-[10px]">
                            {isReleased ? 'Released' : 'Upcoming'}
                          </Badge>
                        </div>
                        {c.description ? (
                          <p className="mt-1 whitespace-pre-wrap text-sm text-ink-600">{c.description}</p>
                        ) : null}
                        {c.whyUniversal ? (
                          <div className="mt-2.5">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-600">Why it's universal</p>
                            <p className="mt-0.5 whitespace-pre-wrap text-sm text-ink-600">{c.whyUniversal}</p>
                          </div>
                        ) : null}
                        {c.whatToShow ? (
                          <div className="mt-2.5">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-600">What the website/demo must show</p>
                            <p className="mt-0.5 whitespace-pre-wrap text-sm text-ink-600">{c.whatToShow}</p>
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                  {!editing ? (
                    <div className="flex shrink-0 gap-1">
                      <Button type="button" size="sm" variant="ghost" onClick={() => setEdits((p) => ({ ...p, [c.id]: {} }))} className="gap-1">
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => void deleteChallenge(c)} className="gap-1 text-red-600 hover:bg-red-500/10">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : null}
                </div>
              </Card>
            )
          })
        )}
      </div>
    </div>
  )
}
