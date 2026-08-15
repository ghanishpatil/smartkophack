import { useCallback, useEffect, useMemo, useState } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { Star, ArrowRight, Layers } from 'lucide-react'
import { usePageSeo } from '@/hooks/usePageSeo.js'
import { useApi } from '@/hooks/useApi.js'
import { useIsReadOnly } from '@/hooks/useIsReadOnly.js'
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh.js'
import { DataTable } from '@/components/admin/DataTable.jsx'
import { Card } from '@/components/ui/Card.jsx'
import { Badge } from '@/components/ui/Badge.jsx'
import { Button } from '@/components/ui/Button.jsx'
import { Skeleton } from '@/components/ui/Skeleton.jsx'
import { downloadCsv } from '@/utils/csvExport.js'

const col = createColumnHelper()

export function AdminShortlistingPage() {
  usePageSeo({ title: 'Shortlisting', description: 'Phase-based team shortlisting.' })
  const api = useApi()
  const readOnly = useIsReadOnly()
  const [teams, setTeams] = useState([])
  const [phases, setPhases] = useState([])
  const [selectedPhaseId, setSelectedPhaseId] = useState('')
  const [rowSelection, setRowSelection] = useState({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [globalFilter, setGlobalFilter] = useState('')
  const [msg, setMsg] = useState('')

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const [teamRows, phaseData] = await Promise.all([
        api.adminTeams(),
        api.getPhases().catch(() => ({ phases: [] })),
      ])
      setTeams(Array.isArray(teamRows) ? teamRows.filter((t) => t.eventRegistered) : [])
      const phaseList = Array.isArray(phaseData?.phases) ? phaseData.phases : []
      setPhases(phaseList)
      // Default to the first non-Phase 1 phase (since Phase 1 is auto-open to all)
      if (phaseList.length > 0 && !selectedPhaseId) {
        const candidate = phaseList.find((p) => p.order > 1) || phaseList[0]
        setSelectedPhaseId(candidate.id)
      }
    } catch {
      if (!silent) {
        setTeams([])
        setPhases([])
      }
    } finally {
      if (!silent) setLoading(false)
    }
  }, [api, selectedPhaseId])

  useEffect(() => { void load() }, [load])

  // Real-time: re-fetch enriched data when teams or events (phases) change.
  // Silent so the table updates in place without flashing the skeleton.
  useRealtimeRefresh(['teams', 'events'], () => load(true))

  const selectedIds = useMemo(() => Object.keys(rowSelection).filter((id) => rowSelection[id]), [rowSelection])
  const selectedPhase = phases.find((p) => p.id === selectedPhaseId)

  const shortlist = useCallback(async () => {
    if (!selectedPhaseId || selectedIds.length === 0) return
    setBusy(true)
    setMsg('')
    try {
      const res = await api.shortlistForPhase(selectedPhaseId, selectedIds)
      const skippedNote = res.skipped?.length ? ` (${res.skipped.length} skipped — team not found)` : ''
      setMsg(`✓ ${res.shortlisted} team(s) shortlisted for ${selectedPhase?.name || 'phase'}${skippedNote}`)
      setRowSelection({})
      await load()
    } catch (e) {
      setMsg(e.message || 'Shortlist failed')
    } finally {
      setBusy(false)
    }
  }, [api, selectedPhaseId, selectedIds, selectedPhase, load])

  const unshortlist = useCallback(async () => {
    if (!selectedPhaseId || selectedIds.length === 0) return
    setBusy(true)
    setMsg('')
    try {
      const res = await api.unshortlistFromPhase(selectedPhaseId, selectedIds)
      setMsg(`✓ ${res.removed} team(s) removed from ${selectedPhase?.name || 'phase'}`)
      setRowSelection({})
      await load()
    } catch (e) {
      setMsg(e.message || 'Unshortlist failed')
    } finally {
      setBusy(false)
    }
  }, [api, selectedPhaseId, selectedIds, selectedPhase, load])

  const columns = useMemo(
    () => [
      col.accessor('name', {
        header: 'Team',
        cell: (i) => <span className="text-sm font-medium text-ink-900">{i.getValue() || '—'}</span>,
      }),
      col.accessor('problemStatementId', {
        header: 'Problem',
        cell: (i) => <span className="text-xs text-ink-500">{String(i.getValue() || '—').slice(0, 24)}</span>,
      }),
      col.display({
        id: 'phaseShortlist',
        header: 'Shortlisted Phases',
        cell: ({ row }) => {
          const list = row.original.shortlistedPhases || []
          if (list.length === 0) return <span className="text-xs text-ink-400">None</span>
          return (
            <div className="flex flex-wrap gap-1">
              {list.map((pid) => {
                const p = phases.find((x) => x.id === pid)
                return <Badge key={pid} tone="brand" className="text-[10px]">{p?.name || pid}</Badge>
              })}
            </div>
          )
        },
      }),
      col.display({
        id: 'currentPhase',
        header: 'In Selected Phase',
        cell: ({ row }) => {
          const list = row.original.shortlistedPhases || []
          return list.includes(selectedPhaseId) ? <Badge tone="success">Yes</Badge> : <Badge tone="neutral">No</Badge>
        },
      }),
    ],
    [phases, selectedPhaseId],
  )

  function exportShortlist() {
    if (!selectedPhaseId) return
    const shortlisted = teams.filter((t) => (t.shortlistedPhases || []).includes(selectedPhaseId))
    downloadCsv(`shortlist-${selectedPhase?.name?.replace(/\s+/g, '-') || 'phase'}-${Date.now()}.csv`, shortlisted, [
      { header: 'Team Name', accessor: (r) => r.name },
      { header: 'Invite Code', accessor: (r) => r.inviteCode },
      { header: 'Problem', accessor: (r) => r.problemStatementId },
      { header: 'Members', accessor: (r) => (typeof r.teamSize === 'number' && r.teamSize > 0) ? r.teamSize : (r.memberIds || []).length },
    ])
  }

  if (loading) return <Skeleton className="h-96 w-full rounded-2xl" />

  const inSelectedPhase = teams.filter((t) => (t.shortlistedPhases || []).includes(selectedPhaseId)).length

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink-900">Phase Shortlisting</h1>
          <p className="mt-2 text-sm text-ink-600">
            Promote teams from one phase to the next. Only shortlisted teams can submit to subsequent phases.
          </p>
        </div>
        <Button variant="secondary" type="button" onClick={exportShortlist} disabled={!selectedPhaseId}>
          Export Phase CSV
        </Button>
      </div>

      {/* Phase Selector */}
      {phases.length === 0 ? (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <p className="text-sm text-amber-800">
            No competition phases configured yet. Go to <strong>Admin → Phases</strong> to set up Phase 1, Phase 2, and Finals.
          </p>
        </Card>
      ) : (
        <Card>
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-brand-600" />
            <h2 className="font-display text-base font-semibold text-ink-900">Select Phase to Shortlist Into</h2>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {phases.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedPhaseId(p.id)}
                className={`rounded-lg border px-4 py-2 text-sm font-medium transition-all ${
                  selectedPhaseId === p.id
                    ? 'border-brand-500 bg-brand-500 text-white shadow-md'
                    : 'border-[rgb(var(--border))] text-ink-700 hover:border-brand-500/40'
                }`}
              >
                <span className="mr-2 text-[11px] opacity-70">#{p.order}</span>
                {p.name}
                {p.active && <Badge tone="success" className="ml-2 text-[9px]">ACTIVE</Badge>}
              </button>
            ))}
          </div>
          {selectedPhase && (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg bg-[rgb(var(--surface-muted))]/50 px-4 py-3">
              <Star className="h-4 w-4 text-amber-500" />
              <div className="flex-1">
                <p className="text-sm font-medium text-ink-900">{selectedPhase.name}</p>
                <p className="text-xs text-ink-500">{inSelectedPhase} team(s) currently shortlisted</p>
              </div>
            </div>
          )}
        </Card>
      )}

      {msg && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700">
          {msg}
        </div>
      )}

      {/* Bulk Actions */}
      {selectedIds.length > 0 && selectedPhaseId && !readOnly && (
        <div className="sticky top-14 z-[5] flex flex-wrap items-center gap-2 rounded-xl border border-brand-500/25 bg-brand-500/10 px-4 py-3">
          <span className="text-sm font-medium text-ink-800">{selectedIds.length} selected</span>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => setRowSelection({})}>Clear</Button>
          <Button size="sm" disabled={busy} onClick={shortlist}>
            <Star className="mr-1.5 h-3.5 w-3.5" /> Shortlist for {selectedPhase?.name}
          </Button>
          <Button size="sm" variant="secondary" className="border-red-500/40 text-red-700" disabled={busy} onClick={unshortlist}>
            Remove from {selectedPhase?.name}
          </Button>
        </div>
      )}

      <DataTable
        columns={columns}
        data={teams}
        globalFilter={globalFilter}
        onGlobalFilterChange={setGlobalFilter}
        enableRowSelection={!readOnly}
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        getRowId={(row) => row.id}
      />
    </div>
  )
}
