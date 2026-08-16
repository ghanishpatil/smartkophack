import { useCallback, useEffect, useMemo, useState } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { FileText, Github, Video, Presentation, ExternalLink, CheckCircle2, Clock, AlertTriangle } from 'lucide-react'
import { usePageSeo } from '@/hooks/usePageSeo.js'
import { useApi } from '@/hooks/useApi.js'
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh.js'
import { DataTable } from '@/components/admin/DataTable.jsx'
import { AdminDrawer } from '@/components/admin/AdminDrawer.jsx'
import { Badge } from '@/components/ui/Badge.jsx'
import { Button } from '@/components/ui/Button.jsx'
import { Skeleton } from '@/components/ui/Skeleton.jsx'
import { downloadCsv } from '@/utils/csvExport.js'
import { useAdminFiltersStore } from '@/stores/adminFiltersStore.js'

const col = createColumnHelper()

// Jury qualification status (set by judges) — for the filter + display.
const JURY_STATUS_TONE = { qualified: 'success', waitlist: 'warn', not_qualified: 'danger' }
const JURY_STATUS_LABEL = { qualified: 'Qualified', waitlist: 'Waitlist', not_qualified: 'Not Qualified' }

function completeness(sub) {
  const fields = [sub.pptUrl, sub.pdfUrl, sub.githubUrl, sub.videoUrl].filter(Boolean).length
  return { fields, ok: fields >= 3 }
}

function FileLink({ url, icon: Icon, label }) {
  if (!url) return <span className="text-xs text-ink-400">—</span>
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] px-2.5 py-1.5 text-xs font-medium text-brand-600 transition-colors hover:border-brand-500/40 hover:bg-brand-500/5"
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
      <ExternalLink className="h-3 w-3 opacity-50" />
    </a>
  )
}

export function AdminSubmissionsPage() {
  usePageSeo({ title: 'Submissions', description: 'Submission explorer with file preview.' })
  const api = useApi()
  const [subs, setSubs] = useState([])
  const [teams, setTeams] = useState([])
  const [problems, setProblems] = useState([])
  const [collegeByTeam, setCollegeByTeam] = useState(new Map())
  const [collegeFilter, setCollegeFilter] = useState('all')
  const [locationFilter, setLocationFilter] = useState('all')
  const [domainFilter, setDomainFilter] = useState('all')
  const [juryFilter, setJuryFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [drawerSub, setDrawerSub] = useState(null)
  const globalFilter = useAdminFiltersStore((s) => s.submissionsGlobalFilter)
  const setGlobalFilter = useAdminFiltersStore((s) => s.setSubmissionsGlobalFilter)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const [subRows, teamRows, tc, psRows] = await Promise.all([
        api.adminSubmissions(),
        api.adminTeams(),
        api.adminTeamColleges().catch(() => ({ teams: [] })),
        api.listAdminProblemStatements().catch(() => []),
      ])
      setSubs(Array.isArray(subRows) ? subRows : [])
      setTeams(Array.isArray(teamRows) ? teamRows : [])
      setProblems(Array.isArray(psRows) ? psRows : [])
      const cm = new Map()
      for (const row of (Array.isArray(tc?.teams) ? tc.teams : [])) {
        cm.set(row.teamId, { college: row.college || '', collegeLocation: row.collegeLocation || '' })
      }
      setCollegeByTeam(cm)
    } catch {
      if (!silent) {
        setSubs([])
        setTeams([])
      }
    } finally {
      if (!silent) setLoading(false)
    }
  }, [api])

  useEffect(() => { void load() }, [load])

  // Real-time: refresh in place when submissions or teams change.
  useRealtimeRefresh(['submissions', 'teams'], () => load(true))

  // Merge team names into submissions
  const enrichedSubs = useMemo(() => {
    const teamMap = new Map(teams.map((t) => [t.id, t]))
    // Problem statement → domain (theme is the Domain field; domain is a legacy mirror).
    const psDomain = new Map(problems.map((p) => [p.id, p.theme || p.domain || '']))
    return subs.map((s) => {
      const team = teamMap.get(s.teamId)
      // Current lock state is the source of truth: an admin unlock (e.g. for
      // the next round) reopens editing even though status/finalizedAt persist.
      const submissionLocked = Boolean(team?.submissionLocked)
      // Effective status: locked => submitted; unlocked => draft (reopened),
      // even if the stored status is still 'submitted' from a prior finalize.
      const effectiveStatus = submissionLocked
        ? 'submitted'
        : (s.status === 'submitted' ? 'draft' : (s.status || 'draft'))
      const cl = collegeByTeam.get(s.teamId) || {}
      const pid = team?.problemStatementId || s.problemStatementId || ''
      return {
        ...s,
        teamName: team?.name || '',
        problemStatementId: pid,
        domain: (pid && psDomain.get(pid)) || '',
        college: cl.college || '',
        collegeLocation: cl.collegeLocation || '',
        juryStatus: team?.juryStatus || '',
        submissionLocked,
        effectiveStatus,
      }
    })
  }, [subs, teams, problems, collegeByTeam])

  // Distinct college/location values + filtered rows for the dropdown filters.
  const collegeOptions = useMemo(
    () => Array.from(new Set(enrichedSubs.map((s) => s.college).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [enrichedSubs],
  )
  const locationOptions = useMemo(
    () => Array.from(new Set(enrichedSubs.map((s) => s.collegeLocation).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [enrichedSubs],
  )
  const domainOptions = useMemo(
    () => Array.from(new Set(enrichedSubs.map((s) => s.domain).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [enrichedSubs],
  )
  const filteredSubs = useMemo(() => {
    const q = String(globalFilter || '').trim().toLowerCase()
    return enrichedSubs.filter((s) => {
      if (collegeFilter !== 'all' && s.college !== collegeFilter) return false
      if (locationFilter !== 'all' && s.collegeLocation !== locationFilter) return false
      if (domainFilter !== 'all' && s.domain !== domainFilter) return false
      if (juryFilter === 'unset' && s.juryStatus) return false
      if (juryFilter !== 'all' && juryFilter !== 'unset' && s.juryStatus !== juryFilter) return false
      if (q && !`${s.teamName} ${s.teamId} ${s.effectiveStatus}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [enrichedSubs, collegeFilter, locationFilter, domainFilter, juryFilter, globalFilter])

  const columns = useMemo(
    () => [
      col.accessor('teamName', {
        header: 'Team',
        cell: (i) => <span className="text-sm font-medium text-ink-900">{i.getValue() || '—'}</span>,
      }),
      col.accessor('teamId', {
        header: 'ID',
        cell: (i) => <span className="font-mono text-[11px] text-ink-500">{String(i.getValue()).slice(0, 8)}…</span>,
      }),
      col.display({
        id: 'college',
        header: 'College / Location / Domain',
        cell: ({ row }) => {
          const r = row.original
          if (!r.college && !r.collegeLocation && !r.domain) return <span className="text-xs text-ink-400">—</span>
          return (
            <div className="text-xs text-ink-600">
              <div className="text-ink-800">{r.college || '—'}</div>
              {r.collegeLocation ? <div className="text-ink-400">{r.collegeLocation}</div> : null}
              {r.domain ? <Badge tone="neutral" className="mt-0.5 text-[9px]">{r.domain}</Badge> : null}
            </div>
          )
        },
      }),
      col.accessor('effectiveStatus', {
        header: 'Status',
        cell: (i) => {
          const s = String(i.getValue() || 'draft')
          const tone = s === 'submitted' ? 'success' : s === 'draft' ? 'warn' : 'neutral'
          const icon = s === 'submitted' ? CheckCircle2 : s === 'draft' ? Clock : AlertTriangle
          const Icon = icon
          return (
            <Badge tone={tone} className="gap-1">
              <Icon className="h-3 w-3" /> {s}
            </Badge>
          )
        },
      }),
      col.display({
        id: 'files',
        header: 'Files',
        cell: ({ row }) => {
          const r = row.original
          const count = [r.pptUrl, r.pdfUrl, r.githubUrl, r.videoUrl].filter(Boolean).length
          return (
            <div className="flex items-center gap-1">
              {r.pptUrl && <Presentation className="h-4 w-4 text-orange-500" title="PPT" />}
              {r.pdfUrl && <FileText className="h-4 w-4 text-red-500" title="PDF" />}
              {r.githubUrl && <Github className="h-4 w-4 text-ink-700" title="GitHub" />}
              {r.videoUrl && <Video className="h-4 w-4 text-blue-500" title="Video" />}
              <span className="ml-1.5 text-xs text-ink-400">{count}/4</span>
            </div>
          )
        },
      }),
      col.display({
        id: 'finalized',
        header: 'Finalized',
        cell: ({ row }) => (row.original.submissionLocked
          ? <Badge tone="success">Yes</Badge>
          : <Badge tone="neutral">No</Badge>),
      }),
      col.display({
        id: 'jury',
        header: 'Jury Status',
        cell: ({ row }) => {
          const js = row.original.juryStatus
          return js
            ? <Badge tone={JURY_STATUS_TONE[js] || 'neutral'}>{JURY_STATUS_LABEL[js] || js}</Badge>
            : <Badge tone="neutral">Unset</Badge>
        },
      }),
      col.display({
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <Button variant="ghost" size="sm" onClick={() => setDrawerSub(row.original)}>
            View
          </Button>
        ),
      }),
    ],
    [],
  )

  // Stats — reflect the active college/location filter.
  const totalSubs = filteredSubs.length
  const finalized = filteredSubs.filter((s) => s.submissionLocked).length
  const drafts = totalSubs - finalized

  if (loading) return <Skeleton className="h-96 w-full rounded-2xl" />

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink-900">Submissions</h1>
          <p className="mt-2 text-sm text-ink-600">
            View and download all team submission files. Click a row to see full details.
          </p>
        </div>
        <Button variant="secondary" type="button" onClick={() => downloadCsv(
          `submissions-${Date.now()}.csv`, filteredSubs, [
            { header: 'Team Name', accessor: (r) => r.teamName },
            { header: 'Team ID', accessor: (r) => r.teamId },
            { header: 'College', accessor: (r) => r.college || '' },
            { header: 'Location', accessor: (r) => r.collegeLocation || '' },
            { header: 'Domain', accessor: (r) => r.domain || '' },
            { header: 'Status', accessor: (r) => r.effectiveStatus || r.status || 'draft' },
            { header: 'PPT', accessor: (r) => r.pptUrl || '' },
            { header: 'PDF', accessor: (r) => r.pdfUrl || '' },
            { header: 'Video', accessor: (r) => r.videoUrl || '' },
            { header: 'GitHub', accessor: (r) => r.githubUrl || '' },
            { header: 'Finalized', accessor: (r) => r.submissionLocked ? 'Yes' : 'No' },
            { header: 'Jury Status', accessor: (r) => JURY_STATUS_LABEL[r.juryStatus] || '' },
            { header: 'Version', accessor: (r) => r.currentVersion || 1 },
          ]
        )}>
          Export CSV
        </Button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3 text-center">
          <p className="text-[10px] font-bold uppercase text-ink-500">Total</p>
          <p className="font-display text-xl font-bold text-ink-900">{totalSubs}</p>
        </div>
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-center">
          <p className="text-[10px] font-bold uppercase text-ink-500">Finalized</p>
          <p className="font-display text-xl font-bold text-emerald-600">{finalized}</p>
        </div>
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-center">
          <p className="text-[10px] font-bold uppercase text-ink-500">Drafts</p>
          <p className="font-display text-xl font-bold text-amber-600">{drafts}</p>
        </div>
      </div>

      {/* College + Location filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="flex-1 text-xs font-medium text-ink-500">
          College
          <select
            value={collegeFilter}
            onChange={(e) => setCollegeFilter(e.target.value)}
            className="mt-1 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          >
            <option value="all">All colleges ({collegeOptions.length})</option>
            {collegeOptions.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="flex-1 text-xs font-medium text-ink-500">
          Location
          <select
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
            className="mt-1 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          >
            <option value="all">All locations ({locationOptions.length})</option>
            {locationOptions.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </label>
        <label className="flex-1 text-xs font-medium text-ink-500">
          Domain
          <select
            value={domainFilter}
            onChange={(e) => setDomainFilter(e.target.value)}
            className="mt-1 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          >
            <option value="all">All domains ({domainOptions.length})</option>
            {domainOptions.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        {(collegeFilter !== 'all' || locationFilter !== 'all' || domainFilter !== 'all' || juryFilter !== 'all') ? (
          <button
            type="button"
            onClick={() => { setCollegeFilter('all'); setLocationFilter('all'); setDomainFilter('all'); setJuryFilter('all') }}
            className="self-end rounded-lg bg-[rgb(var(--surface-muted))] px-3 py-2 text-sm font-medium text-ink-600 hover:bg-[rgb(var(--border))]"
          >
            Clear
          </button>
        ) : null}
      </div>

      {/* Jury status filter */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-ink-500">Jury status:</span>
        {[
          { id: 'all', label: 'All' },
          { id: 'qualified', label: 'Qualified' },
          { id: 'waitlist', label: 'Waitlist' },
          { id: 'not_qualified', label: 'Not Qualified' },
          { id: 'unset', label: 'Unset' },
        ].map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setJuryFilter(f.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              juryFilter === f.id ? 'bg-brand-500 text-white' : 'bg-[rgb(var(--surface-muted))] text-ink-600 hover:bg-[rgb(var(--border))]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={filteredSubs}
        globalFilter={globalFilter}
        onGlobalFilterChange={setGlobalFilter}
        onRowClick={(row) => setDrawerSub(row)}
      />

      {/* Detail Drawer */}
      <AdminDrawer
        open={Boolean(drawerSub)}
        title={drawerSub?.teamName || 'Submission Details'}
        onClose={() => setDrawerSub(null)}
      >
        {drawerSub && <SubmissionDetail sub={drawerSub} />}
      </AdminDrawer>
    </div>
  )
}

/** Submission detail view inside the drawer */
function SubmissionDetail({ sub }) {
  return (
    <div className="space-y-5">
      {/* Status */}
      <div className="flex items-center gap-3">
        <Badge tone={(sub.effectiveStatus || sub.status) === 'submitted' ? 'success' : 'warn'} className="gap-1">
          {(sub.effectiveStatus || sub.status) === 'submitted' ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
          {sub.effectiveStatus || sub.status || 'draft'}
        </Badge>
        {sub.submissionLocked
          ? <span className="text-xs font-medium text-emerald-600">Finalized &amp; locked</span>
          : sub.finalizedAt
            ? <span className="text-xs text-amber-600">Reopened (unlocked)</span>
            : null}
        {sub.currentVersion && <Badge tone="neutral">v{sub.currentVersion}</Badge>}
      </div>

      {/* Team Info */}
      <div>
        <p className="text-xs font-semibold uppercase text-ink-500">Team</p>
        <p className="mt-1 text-sm font-medium text-ink-900">{sub.teamName || sub.teamId}</p>
        <p className="font-mono text-[11px] text-ink-400">{sub.teamId}</p>
      </div>

      {/* Files Section */}
      <div>
        <p className="mb-3 text-xs font-semibold uppercase text-ink-500">Submitted Files</p>
        <div className="space-y-2.5">
          <FileRow icon={Presentation} label="Presentation (PPT)" url={sub.pptUrl} color="text-orange-500" />
          <FileRow icon={FileText} label="Document (PDF)" url={sub.pdfUrl} color="text-red-500" />
          <FileRow icon={Video} label="Video Demo" url={sub.videoUrl} color="text-blue-500" />
          <FileRow icon={Github} label="GitHub Repository" url={sub.githubUrl} color="text-ink-700" />
        </div>
      </div>

      {/* Version Info */}
      {sub.currentVersion > 1 && (
        <div>
          <p className="text-xs font-semibold uppercase text-ink-500">Version History</p>
          <p className="mt-1 text-sm text-ink-600">
            Current: v{sub.currentVersion} · {Array.isArray(sub.versions) ? sub.versions.length : 0} version(s) saved
          </p>
        </div>
      )}

      {/* Metadata */}
      <div className="border-t border-[rgb(var(--border))] pt-4">
        <p className="text-xs font-semibold uppercase text-ink-500">Metadata</p>
        <dl className="mt-2 space-y-1.5 text-xs">
          {sub.eventId && (
            <div className="flex justify-between">
              <dt className="text-ink-500">Event</dt>
              <dd className="font-mono text-ink-700">{sub.eventId}</dd>
            </div>
          )}
          {sub.updatedBy && (
            <div className="flex justify-between">
              <dt className="text-ink-500">Last updated by</dt>
              <dd className="font-mono text-ink-700">{sub.updatedBy?.slice(0, 12)}…</dd>
            </div>
          )}
          {sub.finalizedBy && (
            <div className="flex justify-between">
              <dt className="text-ink-500">Finalized by</dt>
              <dd className="font-mono text-ink-700">{sub.finalizedBy?.slice(0, 12)}…</dd>
            </div>
          )}
        </dl>
      </div>
    </div>
  )
}

/** Individual file row — opens in browser preview (not download) */
function FileRow({ icon: Icon, label, url, color }) {
  // Use Google Docs Viewer for PPT/PDF to view in browser
  const isPptOrPdf = label.includes('PPT') || label.includes('PDF') || label.includes('Presentation') || label.includes('Document')
  const viewUrl = url && isPptOrPdf
    ? `https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`
    : url

  return (
    <div className="flex items-center justify-between rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))]/30 px-4 py-3">
      <div className="flex items-center gap-3">
        <Icon className={`h-5 w-5 ${color}`} />
        <div>
          <p className="text-sm font-medium text-ink-900">{label}</p>
          {url ? (
            <p className="max-w-[200px] truncate text-[11px] text-ink-400 sm:max-w-[300px]">{url}</p>
          ) : (
            <p className="text-[11px] italic text-ink-400">Not uploaded</p>
          )}
        </div>
      </div>
      {url ? (
        <a
          href={viewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 rounded-lg bg-brand-500/10 px-3 py-1.5 text-xs font-medium text-brand-600 transition-colors hover:bg-brand-500/20"
        >
          View <ExternalLink className="h-3 w-3" />
        </a>
      ) : (
        <Badge tone="neutral">Missing</Badge>
      )}
    </div>
  )
}
