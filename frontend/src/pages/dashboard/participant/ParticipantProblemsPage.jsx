import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Flame, Search, ArrowRight, Filter, ChevronDown } from 'lucide-react'
import { usePageSeo } from '@/hooks/usePageSeo.js'
import { useParticipantWorkspace } from '@/hooks/useParticipantWorkspace.js'
import {
  displayCategory,
  displayDepartment,
  displayOrganization,
  displayTheme,
} from '@/utils/problemStatementDisplay.js'
import { Card } from '@/components/ui/Card.jsx'
import { Button } from '@/components/ui/Button.jsx'
import { Input } from '@/components/ui/Input.jsx'
import { Badge } from '@/components/ui/Badge.jsx'
import { Skeleton } from '@/components/ui/Skeleton.jsx'

export function ParticipantProblemsPage() {
  usePageSeo({ title: 'Problem Statements', description: 'Browse and select your track.' })
  const { problems, team, api, loading, refreshTeam, eventCfg } = useParticipantWorkspace()
  const navigate = useNavigate()
  const [globalSearch, setGlobalSearch] = useState('')
  const [filters, setFilters] = useState({ track: 'all', domain: 'all', participation: 'all', status: 'all' })
  const [showFilters, setShowFilters] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const tracks = useMemo(() => {
    const set = new Set()
    for (const p of problems) {
      const t = String(p.category || '').trim()
      if (t) set.add(t)
    }
    return Array.from(set).sort()
  }, [problems])

  const domains = useMemo(() => {
    const set = new Set()
    for (const p of problems) {
      const d = String(p.theme || p.domain || '').trim()
      if (d) set.add(d)
    }
    return Array.from(set).sort()
  }, [problems])

  const isFull = (p) => {
    const c = typeof p.selectionCount === 'number' ? p.selectionCount : 0
    const max = typeof p.maxTeams === 'number' ? p.maxTeams : null
    return max != null && c >= max
  }

  const publishedCount = useMemo(
    () => problems.filter((p) => p.published !== false).length,
    [problems],
  )

  const filtered = useMemo(() => {
    const s = globalSearch.trim().toLowerCase()
    let list = problems.filter((p) => p.published !== false)
    if (filters.track !== 'all') list = list.filter((p) => String(p.category || '') === filters.track)
    if (filters.domain !== 'all') list = list.filter((p) => String(p.theme || p.domain || '') === filters.domain)
    if (filters.participation !== 'all') {
      list = list.filter((p) => {
        const c = p.selectionCount || 0
        if (filters.participation === 'low') return c < 5
        if (filters.participation === 'medium') return c >= 5 && c < 15
        if (filters.participation === 'high') return c >= 15
        return true
      })
    }
    if (filters.status === 'open') list = list.filter((p) => !isFull(p))
    if (filters.status === 'full') list = list.filter((p) => isFull(p))
    if (s) {
      list = list.filter((p) =>
        String(p.title || '').toLowerCase().includes(s) ||
        String(p.description || '').toLowerCase().includes(s) ||
        displayCategory(p).toLowerCase().includes(s) ||
        displayTheme(p).toLowerCase().includes(s) ||
        displayOrganization(p).toLowerCase().includes(s) ||
        displayDepartment(p).toLowerCase().includes(s) ||
        String(p.id || '').toLowerCase().includes(s),
      )
    }
    return list
  }, [problems, globalSearch, filters])

  const activeFilterCount = Object.values(filters).filter((v) => v !== 'all').length
  function clearFilters() {
    setGlobalSearch('')
    setFilters({ track: 'all', domain: 'all', participation: 'all', status: 'all' })
  }

  const payOk =
    !eventCfg?.entryFeeEnabled ||
    (eventCfg?.entryFeeAmount ?? 0) <= 0 ||
    ['paid', 'waived', 'not_required'].includes(team?.paymentStatus || '')
  const canSelect = Boolean(team?.eventRegistered && payOk)

  async function select(pid) {
    if (!team) return
    setBusy(true)
    setMsg('')
    try {
      await api.selectProblem(pid)
      await refreshTeam()
      setMsg('Problem statement updated.')
    } catch (e) {
      setMsg(e.message || 'Could not select problem')
    } finally {
      setBusy(false)
    }
  }

  const selectionLocked =
    eventCfg?.lifecyclePhase &&
    !['REGISTRATION_OPEN', 'SUBMISSION_OPEN'].includes(eventCfg.lifecyclePhase)

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="font-display text-3xl font-bold text-ink-900"
        >
          Problem statements
        </motion.h1>
        <p className="mt-2 text-sm text-ink-600">
          Popularity reflects live selection counts. Changing tracks follows server phase rules and payment gates.
        </p>
      </div>

      {!team?.eventRegistered ? (
        <Card className="border-amber-500/30 bg-amber-500/10">
          <p className="text-sm text-amber-950">
            Register your team (and complete payment if required) before selecting a problem.
          </p>
        </Card>
      ) : null}

      {team?.eventRegistered &&
      eventCfg?.entryFeeEnabled &&
      (eventCfg?.entryFeeAmount ?? 0) > 0 &&
      team?.paymentStatus === 'pending' ? (
        <Card className="border-amber-500/30 bg-amber-500/10">
          <p className="text-sm text-amber-950">
            Entry fee still pending — complete payment on the registration page to unlock selection.
          </p>
        </Card>
      ) : null}

      {selectionLocked ? (
        <Card className="border-red-500/20 bg-red-500/10">
          <p className="text-sm text-red-900">
            Problem selection is closed for the current phase ({eventCfg?.lifecyclePhase || '—'}).
          </p>
        </Card>
      ) : null}

      {msg ? (
        <p className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))] px-4 py-3 text-sm">{msg}</p>
      ) : null}

      {/* Toolbar: search + filters toggle */}
      <div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <Input
              className="pl-10"
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              placeholder="Search by title, ID, domain, keyword…"
            />
          </div>
          <Button
            type="button"
            variant={showFilters || activeFilterCount > 0 ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setShowFilters((v) => !v)}
            className="gap-1.5"
          >
            <Filter className="h-4 w-4" />
            Filters
            {activeFilterCount > 0 ? (
              <span className="ml-0.5 rounded-full bg-white/20 px-1.5 text-[10px] font-bold">{activeFilterCount}</span>
            ) : null}
          </Button>
        </div>

        <AnimatePresence>
          {showFilters ? (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mt-4 overflow-hidden rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]"
            >
              <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
                <FilterSelect label="Track" value={filters.track} options={tracks} onChange={(v) => setFilters((f) => ({ ...f, track: v }))} />
                <FilterSelect label="Domain" value={filters.domain} options={domains} onChange={(v) => setFilters((f) => ({ ...f, domain: v }))} />
                <FilterSelect
                  label="Participation"
                  value={filters.participation}
                  options={[
                    { value: 'low', label: 'Low (< 5 teams)' },
                    { value: 'medium', label: 'Medium (5–14 teams)' },
                    { value: 'high', label: 'High (15+ teams)' },
                  ]}
                  onChange={(v) => setFilters((f) => ({ ...f, participation: v }))}
                />
                <FilterSelect
                  label="Status"
                  value={filters.status}
                  options={[
                    { value: 'open', label: 'Open for selection' },
                    { value: 'full', label: 'Full' },
                  ]}
                  onChange={(v) => setFilters((f) => ({ ...f, status: v }))}
                />
              </div>
              {(activeFilterCount > 0 || globalSearch) ? (
                <div className="flex items-center justify-between border-t border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))]/40 px-4 py-2.5">
                  <p className="text-xs text-ink-500">
                    {activeFilterCount + (globalSearch ? 1 : 0)} active filter{activeFilterCount + (globalSearch ? 1 : 0) > 1 ? 's' : ''}
                  </p>
                  <button type="button" onClick={clearFilters} className="text-xs font-semibold text-brand-600 hover:text-brand-700">
                    Clear all
                  </button>
                </div>
              ) : null}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {/* Result count */}
      {!loading ? (
        <p className="text-sm text-ink-600">
          Showing <strong className="text-ink-900">{filtered.length}</strong> of {publishedCount} problem statements
        </p>
      ) : null}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-36 w-full rounded-xl" />
          <Skeleton className="h-36 w-full rounded-xl" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6">
          <p className="text-sm text-ink-500">No published problems match your filters.</p>
          {(activeFilterCount > 0 || globalSearch) ? (
            <Button variant="secondary" size="sm" onClick={clearFilters}>Clear filters</Button>
          ) : null}
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {filtered.map((p) => {
            const count = typeof p.selectionCount === 'number' ? p.selectionCount : 0
            const maxTeams = typeof p.maxTeams === 'number' ? p.maxTeams : null
            const full = maxTeams != null && count >= maxTeams
            const popular = count >= 8
            const selected = team?.problemStatementId === p.id
            return (
              <li key={p.id}>
                <Card className={`h-full transition ${selected ? 'border-brand-500/60 ring-2 ring-brand-500/20' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono text-[10px] text-ink-500">{p.id}</p>
                      <p className="font-display font-semibold text-ink-900">{p.title}</p>
                      <p className="mt-1 text-xs text-ink-500">{displayCategory(p) || '—'}</p>
                      {displayTheme(p) ? <p className="mt-0.5 text-xs text-ink-500">{displayTheme(p)}</p> : null}
                      {displayOrganization(p) ? (
                        <p className="mt-0.5 text-xs text-ink-400">{displayOrganization(p)}</p>
                      ) : null}
                      {displayDepartment(p) ? (
                        <p className="mt-0.5 text-[11px] text-ink-400">{displayDepartment(p)}</p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {popular ? (
                        <Badge tone="warn" className="gap-1 text-[10px]">
                          <Flame className="h-3 w-3" /> Popular
                        </Badge>
                      ) : null}
                      {full ? <Badge tone="neutral">Full</Badge> : <Badge tone="brand">{count} teams</Badge>}
                    </div>
                  </div>
                  <p className="mt-3 line-clamp-3 text-sm text-ink-600">{p.description}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      type="button"
                      className="gap-1"
                      onClick={() => navigate(`/dashboard/problems/${encodeURIComponent(p.id)}`)}
                    >
                      View details <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      disabled={busy || (full && !selected) || selectionLocked || !canSelect}
                      onClick={() => select(p.id)}
                    >
                      {selected ? 'Selected' : 'Select'}
                    </Button>
                  </div>
                </Card>
              </li>
            )
          })}
        </ul>
      )}

    </div>
  )
}

/* ── Filter select component (matches public Problem Statements page) ── */
function FilterSelect({ label, value, options, onChange }) {
  const isObj = options.length > 0 && typeof options[0] === 'object'
  return (
    <div>
      <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-ink-500">{label}</label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-full appearance-none rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--page-bg))] pl-3 pr-8 text-sm text-ink-700 transition-colors hover:border-brand-500/50 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
        >
          <option value="all">All</option>
          {options.map((opt) => {
            const v = isObj ? opt.value : opt
            const l = isObj ? opt.label : opt
            return <option key={v} value={v}>{l}</option>
          })}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
      </div>
    </div>
  )
}
