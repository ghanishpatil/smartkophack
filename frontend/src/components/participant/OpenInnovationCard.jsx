import { useCallback, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Lightbulb, Loader2, Check, X, Pencil, Lock, Info, Tag, Layers } from 'lucide-react'
import { Card } from '@/components/ui/Card.jsx'
import { Button } from '@/components/ui/Button.jsx'
import { Input } from '@/components/ui/Input.jsx'
import { Badge } from '@/components/ui/Badge.jsx'

const TRACKS = ['Software', 'Hardware']
const DOMAINS = [
  'Health',
  'Education',
  'Transportation',
  'Food Safety & Security',
  'Waste Management',
  'Agriculture',
  'Industry & MSME Innovation',
  'Open Innovation',
  'Other',
]

const empty = { title: '', track: '', domain: '', description: '' }

/**
 * Lets a team submit their OWN problem statement under Open Innovation when
 * none of the curated problems fit. The idea stays private (visible only to
 * the team, admins and judges) and is editable until the submission locks.
 */
export function OpenInnovationCard({ api, team, canSelect, onSaved }) {
  const [idea, setIdea] = useState(null)
  const [locked, setLocked] = useState(false)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(empty)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.getOpenInnovation()
      const next = res?.idea || null
      setIdea(next)
      setLocked(Boolean(res?.locked))
      // The idea is deleted when the team switches to a curated problem
      // statement — clear any stale form/edit state so the card resets.
      if (!next) {
        setEditing(false)
        setForm(empty)
        setMsg('')
      }
    } catch {
      setIdea(null)
      setEditing(false)
      setForm(empty)
    } finally {
      setLoading(false)
    }
  }, [api])

  // Reload whenever the team's selected problem statement changes (e.g. they
  // picked an official problem, which discards their own idea).
  const selectedPid = team?.problemStatementId || ''
  useEffect(() => { void load() }, [load, selectedPid])

  function startEdit() {
    setForm(idea
      ? { title: idea.title, track: idea.track, domain: idea.domain, description: idea.description }
      : empty)
    setError('')
    setMsg('')
    setEditing(true)
  }

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  function validate() {
    if (form.title.trim().length < 5) return 'Please enter a descriptive idea title.'
    if (!TRACKS.includes(form.track)) return 'Please select a track (Software or Hardware).'
    if (!DOMAINS.includes(form.domain)) return 'Please select a domain.'
    if (form.description.trim().length < 50) return 'Please describe your idea in at least 50 characters.'
    return ''
  }

  async function save(e) {
    e.preventDefault()
    const v = validate()
    if (v) { setError(v); return }
    setSaving(true)
    setError('')
    try {
      const res = await api.saveOpenInnovation({
        title: form.title.trim(),
        track: form.track,
        domain: form.domain,
        description: form.description.trim(),
      })
      setIdea(res?.idea || null)
      setEditing(false)
      setMsg(res?.created
        ? 'Added. Your team is now continuing with this Open Innovation problem statement.'
        : 'Your Open Innovation problem statement has been updated.')
      await onSaved?.()
    } catch (err) {
      setError(err?.message || 'Could not save your idea.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <Card className="flex items-center gap-3 py-6">
        <Loader2 className="h-4 w-4 animate-spin text-brand-600" />
        <p className="text-sm text-ink-500">Checking your Open Innovation idea…</p>
      </Card>
    )
  }

  return (
    <Card className="relative overflow-hidden border-amber-500/25 bg-amber-500/[0.03]">
      <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-amber-400/10 blur-2xl" />
      <div className="relative">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600">
              <Lightbulb className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold text-ink-900">
                {idea ? 'Your Open Innovation Idea' : 'Your problem statement is not here?'}
              </h2>
              <p className="mt-1 max-w-xl text-sm text-ink-600">
                {idea
                  ? 'Your team is continuing with this Open Innovation problem statement. You can edit it until your submission is locked.'
                  : 'Add your own idea under Open Innovation. Once added, your team continues with this problem statement — it is reserved for your team only and stays private (visible to you, the organizers and the judges).'}
              </p>
            </div>
          </div>
          {idea ? <Badge tone="warn" className="gap-1"><Lightbulb className="h-3 w-3" /> Open Innovation</Badge> : null}
        </div>

        {msg ? (
          <p className="mt-4 rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-4 py-2.5 text-sm text-emerald-800">{msg}</p>
        ) : null}

        {/* ── Existing idea summary ── */}
        {idea && !editing ? (
          <div className="mt-4 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
            <div className="flex flex-wrap items-center gap-2">
              <code className="rounded-md bg-[rgb(var(--surface-muted))] px-2 py-0.5 font-mono text-xs font-bold text-ink-700">{idea.id}</code>
              {idea.track ? <Badge tone="neutral" className="gap-1"><Layers className="h-3 w-3" /> {idea.track}</Badge> : null}
              {idea.domain ? <Badge tone="brand" className="gap-1"><Tag className="h-3 w-3" /> {idea.domain}</Badge> : null}
              <Badge tone="success" className="gap-1"><Check className="h-3 w-3" /> Your team&apos;s PS</Badge>
            </div>
            <p className="mt-2 font-display text-base font-bold text-ink-900">{idea.title}</p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-ink-600">{idea.description}</p>
            <div className="mt-4">
              {locked ? (
                <p className="flex items-center gap-2 text-xs font-medium text-amber-700">
                  <Lock className="h-3.5 w-3.5" /> Submission locked — editing is disabled.
                </p>
              ) : (
                <Button size="sm" variant="secondary" className="gap-2" onClick={startEdit}>
                  <Pencil className="h-3.5 w-3.5" /> Edit my idea
                </Button>
              )}
            </div>
          </div>
        ) : null}

        {/* ── Call to action ── */}
        {!idea && !editing ? (
          <div className="mt-4">
            {!canSelect ? (
              <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-900">
                Complete your team registration (and payment, if applicable) to submit an Open Innovation idea.
              </p>
            ) : locked ? (
              <p className="flex items-center gap-2 text-sm text-amber-700">
                <Lock className="h-4 w-4" /> Submission is locked.
              </p>
            ) : (
              <Button className="gap-2" onClick={startEdit}>
                <Lightbulb className="h-4 w-4" /> Add my Open Innovation problem statement
              </Button>
            )}
          </div>
        ) : null}

        {/* ── Form ── */}
        <AnimatePresence>
          {editing ? (
            <motion.form
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              onSubmit={save}
              className="mt-4 overflow-hidden"
            >
              <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
                <div className="flex items-start gap-2 rounded-lg border border-brand-500/25 bg-brand-500/5 px-3 py-2 text-xs text-ink-600">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-600" />
                  <p>A problem statement ID is assigned automatically. Your team will continue with this Open Innovation problem statement, and it will not appear on the public website or to other teams.</p>
                </div>

                <Input
                  className="mt-4"
                  label="Idea / Problem Statement Title"
                  value={form.title}
                  onChange={(e) => update('title', e.target.value)}
                  placeholder="e.g. AI-based water leakage detection for civic pipelines"
                  maxLength={200}
                  required
                />

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-ink-700">Track</label>
                    <select
                      value={form.track}
                      onChange={(e) => update('track', e.target.value)}
                      required
                      className="h-11 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--page-bg))] px-3 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                    >
                      <option value="">— Select track —</option>
                      {TRACKS.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-ink-700">Domain</label>
                    <select
                      value={form.domain}
                      onChange={(e) => update('domain', e.target.value)}
                      required
                      className="h-11 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--page-bg))] px-3 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                    >
                      <option value="">— Select domain —</option>
                      {DOMAINS.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                </div>

                <div className="mt-4">
                  <label className="mb-1.5 block text-sm font-medium text-ink-700">Brief of your idea</label>
                  <textarea
                    rows={6}
                    value={form.description}
                    onChange={(e) => update('description', e.target.value)}
                    maxLength={20000}
                    required
                    placeholder="Describe the problem you are solving, who it affects, your proposed solution and the expected impact."
                    className="w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--page-bg))] px-3 py-2 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                  />
                  <p className="mt-1 text-xs text-ink-400">{form.description.trim().length}/50 characters minimum</p>
                </div>

                {error ? (
                  <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button type="submit" className="gap-2" disabled={saving}>
                    {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : <><Check className="h-4 w-4" /> {idea ? 'Save changes' : 'Add & continue with this PS'}</>}
                  </Button>
                  <Button type="button" variant="ghost" className="gap-2" disabled={saving} onClick={() => { setEditing(false); setError('') }}>
                    <X className="h-4 w-4" /> Cancel
                  </Button>
                </div>
              </div>
            </motion.form>
          ) : null}
        </AnimatePresence>
      </div>
    </Card>
  )
}
