import { useCallback, useEffect, useState } from 'react'
import {
  Plus, Trash2, Save, ChevronUp, ChevronDown, Layers, Settings, ArrowRight,
  Clock, Lock, Eye, EyeOff, Award, FileText, Archive, Play
} from 'lucide-react'
import { motion } from 'framer-motion'
import { usePageSeo } from '@/hooks/usePageSeo.js'
import { useApi } from '@/hooks/useApi.js'
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh.js'
import { Card } from '@/components/ui/Card.jsx'
import { Button } from '@/components/ui/Button.jsx'
import { Input } from '@/components/ui/Input.jsx'
import { Badge } from '@/components/ui/Badge.jsx'
import { Skeleton } from '@/components/ui/Skeleton.jsx'
import { ConfirmModal } from '@/components/admin/ConfirmModal.jsx'

/**
 * Convert a stored UTC ISO string into the local wall-clock `YYYY-MM-DDTHH:mm`
 * value a <input type="datetime-local"> expects. Slicing the raw ISO string
 * would show UTC time in a local-time field, shifting the displayed time by the
 * browser's timezone offset and (on re-save) drifting the real deadline. This
 * keeps the round-trip stable: UTC -> local for display, local -> UTC on change.
 */
function toLocalInputValue(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

const PHASE_STATES = {
  DRAFT: 'DRAFT',
  UPCOMING: 'UPCOMING',
  ACTIVE: 'ACTIVE',
  SUBMISSION_LOCKED: 'SUBMISSION_LOCKED',
  EVALUATION: 'EVALUATION',
  SHORTLISTING: 'SHORTLISTING',
  COMPLETED: 'COMPLETED',
  ARCHIVED: 'ARCHIVED',
}

const STATE_INFO = {
  DRAFT: { label: 'Draft', color: 'neutral', icon: FileText, desc: 'Hidden from participants' },
  UPCOMING: { label: 'Upcoming', color: 'brand', icon: Clock, desc: 'Visible, not started' },
  ACTIVE: { label: 'Active', color: 'success', icon: Play, desc: 'Submissions open' },
  SUBMISSION_LOCKED: { label: 'Locked', color: 'warn', icon: Lock, desc: 'Deadline passed' },
  EVALUATION: { label: 'Evaluation', color: 'warn', icon: Settings, desc: 'Judges scoring' },
  SHORTLISTING: { label: 'Shortlisting', color: 'warn', icon: Award, desc: 'Selecting winners' },
  COMPLETED: { label: 'Completed', color: 'success', icon: Award, desc: 'Phase finished' },
  ARCHIVED: { label: 'Archived', color: 'neutral', icon: Archive, desc: 'Hidden from view' },
}

const TRANSITIONS = {
  DRAFT: ['UPCOMING', 'ARCHIVED'],
  UPCOMING: ['ACTIVE', 'DRAFT', 'ARCHIVED'],
  ACTIVE: ['SUBMISSION_LOCKED', 'UPCOMING'],
  SUBMISSION_LOCKED: ['EVALUATION', 'ACTIVE'],
  EVALUATION: ['SHORTLISTING', 'SUBMISSION_LOCKED'],
  SHORTLISTING: ['COMPLETED', 'EVALUATION'],
  COMPLETED: ['ARCHIVED', 'SHORTLISTING'],
  ARCHIVED: ['DRAFT'],
}

const REQUIREMENT_KEYS = [
  { key: 'pptRequired', label: 'PPT Slides' },
  { key: 'pdfRequired', label: 'PDF Document' },
  { key: 'videoRequired', label: 'Demo Video (YouTube / Drive link)' },
  { key: 'githubRequired', label: 'GitHub Repository' },
  { key: 'deployedUrlRequired', label: 'Deployed URL' },
]

function newPhase(order) {
  return {
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `phase-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    name: `Phase ${order}`,
    description: '',
    order,
    status: 'DRAFT',
    startDate: null,
    deadline: null,
    requirements: { pptRequired: false, pdfRequired: false, videoRequired: false, githubRequired: false, deployedUrlRequired: false },
    evaluationCriteria: [],
  }
}

export function AdminPhasesPage() {
  usePageSeo({ title: 'Phase Orchestration', description: 'Multi-phase competition management.' })
  const api = useApi()
  const [phases, setPhases] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [transitioning, setTransitioning] = useState(null)
  const [msg, setMsg] = useState('')
  const [confirm, setConfirm] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [timelinePhases, setTimelinePhases] = useState([])
  // Real-time: signals that the event's phases changed elsewhere (another admin
  // or a date-driven transition) while this editor is open. We don't auto-reload
  // because that would clobber unsaved edits — we surface a banner instead.
  const [staleFromRemote, setStaleFromRemote] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [data, tlData] = await Promise.all([
        api.getPhases(),
        api.getTimeline().catch(() => ({ phases: [] })),
      ])
      setPhases(Array.isArray(data?.phases) ? data.phases : [])
      const tl = Array.isArray(tlData?.phases) ? tlData.phases : Array.isArray(tlData) ? tlData : []
      setTimelinePhases(tl)
      setStaleFromRemote(false)
    } catch (e) {
      setMsg(e.message || 'Could not load phases')
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => { void load() }, [load])

  // Real-time: flag (don't auto-apply) when the event doc changes elsewhere so
  // the admin can choose to reload without losing unsaved edits in this editor.
  useRealtimeRefresh('events', () => setStaleFromRemote(true))

  /** Copy everything from Timeline — names, dates, descriptions. Just keep status/requirements here. */
  function copyFromTimeline() {
    if (timelinePhases.length === 0) {
      setMsg('No timeline data to copy from. Set up your Timeline first (Admin → Timeline).')
      return
    }
    // Replace phases with timeline items, preserving any existing status/requirements/criteria
    const newPhases = timelinePhases.map((tl, i) => {
      const existing = phases[i] || {}
      
      // BUG FIX: Handle date conversion properly
      // Timeline dates are YYYY-MM-DD (date only), need to convert to ISO datetime
      let startDate = existing.startDate || null
      let deadline = existing.deadline || null
      
      if (tl.startDate) {
        // Parse as local date at 00:00, then convert to ISO
        const d = new Date(tl.startDate + 'T00:00:00')
        startDate = isNaN(d.getTime()) ? null : d.toISOString()
      }
      
      if (tl.endDate) {
        // End date should be end of day (23:59:59) for submissions
        const d = new Date(tl.endDate + 'T23:59:59')
        deadline = isNaN(d.getTime()) ? null : d.toISOString()
      }
      
      return {
        // BUG FIX: Use crypto.randomUUID for unique IDs instead of Date.now()
        id: existing.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `phase-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`),
        name: tl.phase || existing.name || `Phase ${i + 1}`,
        description: tl.description || existing.description || '',
        order: i + 1,
        status: existing.status || 'DRAFT',
        startDate,
        deadline,
        requirements: existing.requirements || { pptRequired: false, pdfRequired: false, videoRequired: false, githubRequired: false, deployedUrlRequired: false },
        evaluationCriteria: existing.evaluationCriteria || [],
      }
    })
    setPhases(newPhases)
    setMsg(`✓ Copied ${newPhases.length} phase(s) from Timeline. Configure requirements & criteria, then save.`)
  }

  function updatePhase(idx, patch) {
    setPhases((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)))
  }

  function updateRequirement(idx, key, value) {
    setPhases((prev) => prev.map((p, i) => (
      i === idx ? { ...p, requirements: { ...p.requirements, [key]: value } } : p
    )))
  }

  function updateCriterion(idx, cIdx, patch) {
    setPhases((prev) => prev.map((p, i) => {
      if (i !== idx) return p
      const criteria = [...(p.evaluationCriteria || [])]
      criteria[cIdx] = { ...criteria[cIdx], ...patch }
      return { ...p, evaluationCriteria: criteria }
    }))
  }

  function addCriterion(idx) {
    setPhases((prev) => prev.map((p, i) => {
      if (i !== idx) return p
      const criteria = [...(p.evaluationCriteria || []), { key: '', label: '', maxScore: 10, hint: '', weight: 1 }]
      return { ...p, evaluationCriteria: criteria }
    }))
  }

  function removeCriterion(idx, cIdx) {
    setPhases((prev) => prev.map((p, i) => {
      if (i !== idx) return p
      return { ...p, evaluationCriteria: p.evaluationCriteria.filter((_, ci) => ci !== cIdx) }
    }))
  }

  function addPhase() {
    setPhases((prev) => [...prev, newPhase(prev.length + 1)])
  }

  function removePhase(idx) {
    setConfirm({
      title: 'Remove phase?',
      body: `Remove "${phases[idx].name}"? Save changes to apply.`,
      variant: 'danger',
      action: () => {
        setConfirm(null)
        setPhases((prev) => prev.filter((_, i) => i !== idx).map((p, i) => ({ ...p, order: i + 1 })))
      },
    })
  }

  function movePhase(idx, dir) {
    setPhases((prev) => {
      const next = [...prev]
      const target = idx + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return next.map((p, i) => ({ ...p, order: i + 1 }))
    })
  }

  async function transition(phaseId, toStatus) {
    setTransitioning(phaseId)
    setMsg('')
    try {
      // Auto-save first to ensure DB is in sync
      await api.updatePhases(phases)
      await api.transitionPhase(phaseId, toStatus)
      setMsg(`✓ Phase transitioned to ${toStatus}.`)
      await load()
    } catch (e) {
      setMsg(e.message || 'Transition failed. Make sure you save phases first.')
    } finally {
      setTransitioning(null)
    }
  }

  async function save() {
    setSaving(true)
    setMsg('')
    try {
      await api.updatePhases(phases)
      setMsg('Phases saved successfully.')
      await load()
    } catch (e) {
      setMsg(e.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Skeleton className="h-96 w-full rounded-2xl" />

  const activePhase = phases.find((p) => p.status === PHASE_STATES.ACTIVE)
  const evaluationPhase = phases.find((p) => [PHASE_STATES.EVALUATION, PHASE_STATES.SHORTLISTING].includes(p.status))

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600">
            <Layers className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-3xl font-bold text-ink-900">Phase Orchestration</h1>
            <p className="mt-1 text-sm text-ink-600">
              Multi-phase competition management with state machine workflow
            </p>
          </div>
        </div>
      </div>

      {/* Status Banner */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Card className={activePhase ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'}>
          <p className="text-xs font-bold uppercase text-ink-500">Active Phase (Submissions)</p>
          <p className="mt-1 font-display text-base font-bold text-ink-900">
            {activePhase?.name || 'None'}
          </p>
        </Card>
        <Card className={evaluationPhase ? 'border-amber-500/30 bg-amber-500/5' : 'border-[rgb(var(--border))]'}>
          <p className="text-xs font-bold uppercase text-ink-500">In Evaluation</p>
          <p className="mt-1 font-display text-base font-bold text-ink-900">
            {evaluationPhase?.name || 'None'}
          </p>
        </Card>
      </div>

      {staleFromRemote && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-800">
          <span>
            Phases changed elsewhere (another admin or a date-driven transition). Reload to see the
            latest — note this discards any unsaved edits on this screen.
          </span>
          <Button size="sm" variant="secondary" type="button" onClick={() => load()}>
            Reload
          </Button>
        </div>
      )}

      {msg && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${
          msg.startsWith('✓') || msg.includes('success') || msg.includes('saved') || msg.includes('transitioned') || msg.includes('Copied')
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700'
            : 'border-red-500/30 bg-red-500/10 text-red-700'
        }`}>
          {msg}
        </div>
      )}

      {/* Phases */}
      <div className="space-y-4">
        {phases.length === 0 && (
          <Card><p className="py-6 text-center text-sm text-ink-500">No phases. Add one to start.</p></Card>
        )}
        {phases.map((phase, idx) => {
          const stateInfo = STATE_INFO[phase.status] || STATE_INFO.DRAFT
          const StateIcon = stateInfo.icon
          const allowedTransitions = TRANSITIONS[phase.status] || []
          const isExpanded = expandedId === phase.id

          return (
            <motion.div
              key={phase.id}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`rounded-2xl border-2 bg-[rgb(var(--surface))] ${
                phase.status === 'ACTIVE' ? 'border-emerald-500/40' :
                phase.status === 'EVALUATION' || phase.status === 'SHORTLISTING' ? 'border-amber-500/40' :
                'border-[rgb(var(--border))]'
              }`}
            >
              {/* Header */}
              <div className="flex flex-wrap items-start gap-3 p-5">
                <span className="rounded-full bg-brand-500/15 px-2.5 py-1 text-xs font-bold text-brand-700">
                  #{phase.order}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      className="text-base font-bold"
                      value={phase.name}
                      onChange={(e) => updatePhase(idx, { name: e.target.value })}
                    />
                  </div>
                  <Badge tone={stateInfo.color} className="mt-2 gap-1">
                    <StateIcon className="h-3 w-3" /> {stateInfo.label}
                  </Badge>
                  <span className="ml-2 text-xs text-ink-500">{stateInfo.desc}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <Button variant="ghost" size="sm" onClick={() => movePhase(idx, -1)} disabled={idx === 0}>
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => movePhase(idx, 1)} disabled={idx === phases.length - 1}>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* State Transitions */}
              <div className="border-t border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))]/30 px-5 py-3">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-ink-500">Transition To</p>
                <div className="flex flex-wrap gap-2">
                  {allowedTransitions.length === 0 ? (
                    <span className="text-xs text-ink-400">No transitions available</span>
                  ) : (
                    allowedTransitions.map((to) => {
                      const toInfo = STATE_INFO[to]
                      const ToIcon = toInfo.icon
                      return (
                        <Button
                          key={to}
                          variant="secondary"
                          size="sm"
                          disabled={transitioning === phase.id}
                          onClick={() => transition(phase.id, to)}
                          className="gap-1.5 text-xs"
                        >
                          <ArrowRight className="h-3 w-3" />
                          <ToIcon className="h-3 w-3" />
                          {toInfo.label}
                        </Button>
                      )
                    })
                  )}
                </div>
              </div>

              {/* Expand/Collapse Settings */}
              <button
                type="button"
                onClick={() => setExpandedId(isExpanded ? null : phase.id)}
                className="flex w-full items-center justify-between border-t border-[rgb(var(--border))] px-5 py-3 text-sm font-medium text-ink-700 hover:bg-[rgb(var(--surface-muted))]/50"
              >
                <span className="flex items-center gap-2">
                  <Settings className="h-4 w-4" /> Configure phase settings
                </span>
                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>

              {/* Settings (expandable) */}
              {isExpanded && (
                <div className="space-y-5 border-t border-[rgb(var(--border))] px-5 py-5">
                  {/* Description */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wide text-ink-500">Description</label>
                    <textarea
                      className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--page-bg))] px-3 py-2 text-sm"
                      rows={2}
                      placeholder="What happens in this phase?"
                      value={phase.description}
                      onChange={(e) => updatePhase(idx, { description: e.target.value })}
                      maxLength={500}
                    />
                  </div>

                  {/* Dates */}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wide text-ink-500">Start Date</label>
                      <input
                        type="datetime-local"
                        className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--page-bg))] px-3 py-2 text-sm"
                        value={toLocalInputValue(phase.startDate)}
                        onChange={(e) => updatePhase(idx, { startDate: e.target.value ? new Date(e.target.value).toISOString() : null })}
                      />
                      <p className="mt-1 text-[10px] text-ink-400">Phase auto-activates on this date (local time)</p>
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wide text-ink-500">Deadline</label>
                      <input
                        type="datetime-local"
                        className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--page-bg))] px-3 py-2 text-sm"
                        value={toLocalInputValue(phase.deadline)}
                        onChange={(e) => updatePhase(idx, { deadline: e.target.value ? new Date(e.target.value).toISOString() : null })}
                      />
                      <p className="mt-1 text-[10px] text-ink-400">Submissions blocked after this time (local time)</p>
                    </div>
                  </div>

                  {/* Required submissions */}
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-ink-500">Required Submissions</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {REQUIREMENT_KEYS.map((req) => (
                        <label
                          key={req.key}
                          className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 transition-colors ${
                            phase.requirements?.[req.key]
                              ? 'border-brand-500/40 bg-brand-500/5'
                              : 'border-[rgb(var(--border))]'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={Boolean(phase.requirements?.[req.key])}
                            onChange={(e) => updateRequirement(idx, req.key, e.target.checked)}
                          />
                          <span className="text-sm font-medium text-ink-900">{req.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Evaluation Criteria */}
                  <div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold uppercase tracking-wide text-ink-500">Evaluation Criteria</p>
                      <Button size="xs" variant="secondary" onClick={() => addCriterion(idx)}>
                        <Plus className="mr-1 h-3 w-3" /> Add Criterion
                      </Button>
                    </div>
                    <div className="mt-2 space-y-2">
                      {(phase.evaluationCriteria || []).length === 0 ? (
                        <p className="text-xs text-ink-400">No criteria defined. Default rubric will be used.</p>
                      ) : (
                        phase.evaluationCriteria.map((c, ci) => (
                          <div key={ci} className="grid grid-cols-12 gap-2 rounded-lg border border-[rgb(var(--border))] p-3">
                            <input
                              className="col-span-5 h-9 rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--page-bg))] px-2 text-sm"
                              placeholder="Label (e.g. Innovation)"
                              value={c.label || ''}
                              onChange={(e) => updateCriterion(idx, ci, { label: e.target.value })}
                            />
                            <input
                              type="number"
                              min="1"
                              max="100"
                              className="col-span-2 h-9 rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--page-bg))] px-2 text-sm"
                              placeholder="Max"
                              value={c.maxScore || 10}
                              onChange={(e) => updateCriterion(idx, ci, { maxScore: Number(e.target.value) })}
                            />
                            <input
                              className="col-span-4 h-9 rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--page-bg))] px-2 text-sm"
                              placeholder="Hint (optional)"
                              value={c.hint || ''}
                              onChange={(e) => updateCriterion(idx, ci, { hint: e.target.value })}
                            />
                            <button
                              type="button"
                              onClick={() => removeCriterion(idx, ci)}
                              className="col-span-1 flex items-center justify-center rounded-md text-red-500 hover:bg-red-500/10"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Remove phase */}
                  <div className="flex justify-between border-t border-[rgb(var(--border))] pt-4">
                    <p className="text-xs text-ink-400">ID: <code>{phase.id}</code></p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:bg-red-500/10"
                      onClick={() => removePhase(idx)}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" /> Remove Phase
                    </Button>
                  </div>
                </div>
              )}
            </motion.div>
          )
        })}
      </div>

      {/* Footer Actions */}
      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" onClick={addPhase}>
          <Plus className="mr-1.5 h-4 w-4" /> Add Phase
        </Button>
        <Button variant="secondary" onClick={copyFromTimeline} disabled={timelinePhases.length === 0}>
          <Clock className="mr-1.5 h-4 w-4" /> Copy from Timeline
        </Button>
        <Button onClick={save} loading={saving} disabled={phases.length === 0}>
          <Save className="mr-1.5 h-4 w-4" /> Save All Phases
        </Button>
      </div>

      <ConfirmModal
        open={Boolean(confirm)}
        title={confirm?.title || ''}
        variant={confirm?.variant || 'danger'}
        onCancel={() => setConfirm(null)}
        onConfirm={() => confirm?.action?.()}
        confirmLabel="Remove"
      >
        {confirm?.body}
      </ConfirmModal>
    </div>
  )
}
