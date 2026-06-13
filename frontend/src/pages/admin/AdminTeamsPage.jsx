import { useCallback, useEffect, useMemo, useState } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { usePageSeo } from '@/hooks/usePageSeo.js'
import { useApi } from '@/hooks/useApi.js'
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh.js'
import { DataTable } from '@/components/admin/DataTable.jsx'
import { AdminDrawer } from '@/components/admin/AdminDrawer.jsx'
import { ConfirmModal } from '@/components/admin/ConfirmModal.jsx'
import { Badge } from '@/components/ui/Badge.jsx'
import { Button } from '@/components/ui/Button.jsx'
import { Skeleton } from '@/components/ui/Skeleton.jsx'
import { useAdminFiltersStore } from '@/stores/adminFiltersStore.js'
import { formatDate } from '@/utils/format.js'
import { downloadCsv } from '@/utils/csvExport.js'
import { deriveRegistrationStatus, teamHasRegistrationRecord } from '@/utils/teamRegistrationDisplay.js'

const col = createColumnHelper()

function toneForRegStatus(s) {
  switch (s) {
    case 'registered':
      return 'success'
    case 'pending':
      return 'neutral'
    case 'blocked':
      return 'warn'
    case 'rejected':
      return 'warn'
    default:
      return 'neutral'
  }
}

export function AdminTeamsPage() {
  usePageSeo({ title: 'Teams', description: 'Team explorer.' })
  const api = useApi()
  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [rowSelection, setRowSelection] = useState({})
  const [drawerTeam, setDrawerTeam] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [usersMap, setUsersMap] = useState(new Map())
  const globalFilter = useAdminFiltersStore((s) => s.teamsGlobalFilter)
  const setGlobalFilter = useAdminFiltersStore((s) => s.setTeamsGlobalFilter)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const [rows, users] = await Promise.all([
        api.adminTeams(),
        api.listUsers().catch(() => []),
      ])
      setTeams(Array.isArray(rows) ? rows : [])
      // Build a uid → name/email map for resolving display names
      const map = new Map()
      for (const u of (Array.isArray(users) ? users : [])) {
        map.set(u.id, { name: u.displayName || u.email || u.id, email: u.email || '' })
      }
      setUsersMap(map)
    } catch {
      if (!silent) setTeams([])
    } finally {
      if (!silent) setLoading(false)
    }
  }, [api])

  /** Resolve UID to display name */
  const resolveName = useCallback((uid) => {
    if (!uid) return '—'
    const u = usersMap.get(uid)
    return u?.name || uid.slice(0, 10) + '…'
  }, [usersMap])

  useEffect(() => {
    void load()
  }, [load])

  // Real-time: refresh the team table in place when any team doc changes.
  useRealtimeRefresh('teams', () => load(true))

  const drawerId = drawerTeam?.id
  useEffect(() => {
    if (!drawerId) return
    const fresh = teams.find((t) => t.id === drawerId)
    if (fresh) setDrawerTeam(fresh)
  }, [teams, drawerId])

  const selectedIds = useMemo(() => Object.keys(rowSelection).filter((id) => rowSelection[id]), [rowSelection])

  // Newest first: most recently created/registered teams show at the top.
  const sortedTeams = useMemo(() => {
    const ms = (t) => {
      const v = t?.createdAt ?? t?.eventRegisteredAt
      if (!v) return 0
      if (typeof v === 'object' && typeof v._seconds === 'number') return v._seconds * 1000
      if (typeof v === 'object' && typeof v.seconds === 'number') return v.seconds * 1000
      const n = new Date(v).getTime()
      return Number.isNaN(n) ? 0 : n
    }
    return [...teams].sort((a, b) => ms(b) - ms(a))
  }, [teams])

  const selectedTeams = useMemo(() => teams.filter((t) => selectedIds.includes(t.id)), [teams, selectedIds])

  const patchTeam = useCallback(
    async (teamId, body) => {
      await api.patchAdminTeam(teamId, body)
      await load()
    },
    [api, load],
  )

  const deleteRegistration = useCallback(
    async (teamId) => {
      await api.deleteAdminTeamRegistration(teamId)
      await load()
      setDrawerTeam((prev) => (prev?.id === teamId ? null : prev))
    },
    [api, load],
  )

  const deleteTeam = useCallback(
    async (teamId) => {
      await api.deleteAdminTeam(teamId)
      // Optimistically drop the row so it disappears immediately; the realtime
      // listener + reload keep everything consistent.
      setTeams((prev) => prev.filter((t) => t.id !== teamId))
      setDrawerTeam((prev) => (prev?.id === teamId ? null : prev))
      await load(true)
    },
    [api, load],
  )

  const unlockSubmission = useCallback(
    async (teamId) => {
      if (!globalThis.confirm(`Unlock submission editing for team ${teamId}?`)) return
      await patchTeam(teamId, { submissionLocked: false })
    },
    [patchTeam],
  )

  const runBulk = useCallback(
    async (label, ids, patchBuild) => {
      setConfirm(null)
      setBulkBusy(true)
      try {
        for (const id of ids) {
          const patch = patchBuild(id)
          if (patch && Object.keys(patch).length) await api.patchAdminTeam(id, patch)
        }
        setRowSelection({})
        await load()
      } catch (e) {
        globalThis.alert(e.message || `${label} failed`)
      } finally {
        setBulkBusy(false)
      }
    },
    [api, load],
  )

  const runBulkOp = useCallback(
    async (operation, params = {}) => {
      setConfirm(null)
      setBulkBusy(true)
      try {
        const result = await api.bulkOperation({ teamIds: selectedIds, operation, params })
        if (result.failed > 0) {
          globalThis.alert(`${result.success} succeeded, ${result.failed} failed.\n${result.errors.map((e) => `${e.teamId}: ${e.error}`).join('\n')}`)
        }
        setRowSelection({})
        await load()
      } catch (e) {
        globalThis.alert(e.message || 'Bulk operation failed')
      } finally {
        setBulkBusy(false)
      }
    },
    [api, load, selectedIds],
  )

  const [emailModal, setEmailModal] = useState(null)

  const exportTeamsCsv = useCallback(() => {
    downloadCsv(
      `teams-export-${Date.now()}.csv`,
      teams,
      [
        { header: 'Team ID', accessor: (r) => r.id },
        { header: 'Team Name', accessor: (r) => r.name },
        { header: 'Invite Code', accessor: (r) => r.inviteCode },
        { header: 'Event ID', accessor: (r) => r.eventId },
        { header: 'Leader ID', accessor: (r) => r.leaderId },
        { header: 'Members', accessor: (r) => (r.memberIds || []).length },
        { header: 'Registration', accessor: (r) => deriveRegistrationStatus(r) },
        { header: 'Event Registered', accessor: (r) => r.eventRegistered ? 'Yes' : 'No' },
        { header: 'Payment Status', accessor: (r) => r.paymentStatus || '' },
        { header: 'Problem Statement', accessor: (r) => r.problemStatementId || '' },
        { header: 'Submission Locked', accessor: (r) => r.submissionLocked ? 'Yes' : 'No' },
        { header: 'Shortlisted', accessor: (r) => r.shortlisted ? 'Yes' : 'No' },
      ],
    )
  }, [teams])

  const columns = useMemo(
    () => [
      col.accessor('name', { header: 'Team', cell: (i) => i.getValue() || '—' }),
      col.accessor('eventId', { header: 'Edition', cell: (i) => i.getValue() || '—' }),
      col.accessor('inviteCode', { header: 'Code', cell: (i) => <span className="font-mono text-xs">{i.getValue()}</span> }),
      col.display({
        id: 'reg',
        header: 'Registration',
        cell: ({ row }) => {
          const s = deriveRegistrationStatus(row.original)
          return <Badge tone={toneForRegStatus(s)}>{s}</Badge>
        },
      }),
      col.accessor('eventRegistered', {
        header: 'Flag',
        cell: (i) => (i.getValue() ? <Badge tone="success">yes</Badge> : <Badge tone="neutral">no</Badge>),
      }),
      col.accessor('submissionLocked', {
        header: 'Submission',
        cell: (i) => (i.getValue() ? <Badge tone="warn">locked</Badge> : <Badge tone="neutral">open</Badge>),
      }),
      col.accessor('shortlisted', {
        header: 'Shortlist',
        cell: (i) => (i.getValue() ? <Badge tone="brand">yes</Badge> : <Badge tone="neutral">no</Badge>),
      }),
      col.display({
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => (
          <Button variant="ghost" size="sm" type="button" disabled={!row.original.submissionLocked} onClick={() => unlockSubmission(row.original.id)}>
            Unlock
          </Button>
        ),
      }),
    ],
    [unlockSubmission],
  )

  if (loading) return <Skeleton className="h-96 w-full rounded-2xl" />

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink-900">Teams</h1>
          <p className="mt-2 text-sm text-ink-600">
            Row click opens details. Multi-select for bulk operations — payment, registration, submissions, shortlist, and email.
          </p>
        </div>
        <Button variant="secondary" type="button" onClick={exportTeamsCsv}>
          Export CSV
        </Button>
      </div>

      {selectedIds.length > 0 ? (
        <div className="sticky top-14 z-[5] flex flex-wrap items-center gap-2 rounded-xl border border-brand-500/25 bg-brand-500/10 px-4 py-3">
          <span className="text-sm font-medium text-ink-800">{selectedIds.length} selected</span>
          <Button size="sm" variant="secondary" type="button" disabled={bulkBusy} onClick={() => setRowSelection({})}>
            Clear
          </Button>
          
          {/* Submission operations */}
          <Button
            size="sm"
            variant="secondary"
            type="button"
            disabled={bulkBusy || !selectedTeams.some((t) => t.submissionLocked)}
            onClick={() =>
              setConfirm({
                title: 'Bulk unlock submissions',
                body: `Unlock editing for ${selectedTeams.filter((t) => t.submissionLocked).length} locked team(s)?`,
                variant: 'primary',
                action: () =>
                  runBulk(
                    'Unlock',
                    selectedTeams.filter((t) => t.submissionLocked).map((t) => t.id),
                    () => ({ submissionLocked: false }),
                  ),
              })
            }
          >
            Unlock submissions
          </Button>
          <Button
            size="sm"
            variant="secondary"
            type="button"
            disabled={bulkBusy || !selectedTeams.some((t) => !t.submissionLocked)}
            onClick={() =>
              setConfirm({
                title: 'Bulk lock submissions',
                body: `Lock submissions for ${selectedTeams.filter((t) => !t.submissionLocked).length} team(s)? Participants cannot edit until an admin unlocks.`,
                variant: 'danger',
                action: () =>
                  runBulk(
                    'Lock',
                    selectedTeams.filter((t) => !t.submissionLocked).map((t) => t.id),
                    () => ({ submissionLocked: true }),
                  ),
              })
            }
          >
            Lock submissions
          </Button>

          {/* Shortlist operations */}
          <Button
            size="sm"
            variant="secondary"
            type="button"
            disabled={bulkBusy || !selectedTeams.some((t) => t.shortlisted)}
            onClick={() =>
              setConfirm({
                title: 'Remove from shortlist',
                body: `Clear shortlist flag on ${selectedTeams.filter((t) => t.shortlisted).length} team(s)?`,
                variant: 'primary',
                action: () =>
                  runBulk(
                    'Shortlist off',
                    selectedTeams.filter((t) => t.shortlisted).map((t) => t.id),
                    () => ({ shortlisted: false }),
                  ),
              })
            }
          >
            Shortlist off
          </Button>
          <Button
            size="sm"
            variant="secondary"
            type="button"
            disabled={bulkBusy || !selectedTeams.some((t) => !t.shortlisted)}
            onClick={() =>
              setConfirm({
                title: 'Add to shortlist',
                body: `Mark ${selectedTeams.filter((t) => !t.shortlisted).length} team(s) as shortlisted?`,
                variant: 'primary',
                action: () =>
                  runBulk(
                    'Shortlist on',
                    selectedTeams.filter((t) => !t.shortlisted).map((t) => t.id),
                    () => ({ shortlisted: true }),
                  ),
              })
            }
          >
            Shortlist on
          </Button>

          {/* Payment operations */}
          <Button
            size="sm"
            variant="secondary"
            type="button"
            disabled={bulkBusy || !selectedTeams.some((t) => t.paymentStatus === 'pending')}
            onClick={() =>
              setConfirm({
                title: 'Bulk mark as paid',
                body: `Mark ${selectedTeams.filter((t) => t.paymentStatus === 'pending').length} team(s) as paid? This will also set registration to complete.`,
                variant: 'primary',
                action: () => runBulkOp('record_payment', { status: 'paid' }),
              })
            }
          >
            Mark paid
          </Button>
          <Button
            size="sm"
            variant="secondary"
            type="button"
            disabled={bulkBusy || !selectedTeams.some((t) => t.paymentStatus === 'pending')}
            onClick={() =>
              setConfirm({
                title: 'Bulk waive payment',
                body: `Waive payment for ${selectedTeams.filter((t) => t.paymentStatus === 'pending').length} team(s)? This grants them free entry.`,
                variant: 'primary',
                action: () => runBulkOp('record_payment', { status: 'waived' }),
              })
            }
          >
            Waive fee
          </Button>

          {/* Registration operations */}
          <Button
            size="sm"
            variant="secondary"
            type="button"
            disabled={bulkBusy}
            onClick={() =>
              setConfirm({
                title: 'Bulk approve registration',
                body: `Approve registration for ${selectedIds.length} team(s)?`,
                variant: 'primary',
                action: () => runBulkOp('update_registration', { registrationStatus: 'registered' }),
              })
            }
          >
            Approve
          </Button>
          <Button
            size="sm"
            variant="secondary"
            type="button"
            disabled={bulkBusy}
            className="border-red-500/40 text-red-700 hover:bg-red-500/10"
            onClick={() =>
              setConfirm({
                title: 'Bulk reject registration',
                body: `Reject registration for ${selectedIds.length} team(s)? They will need admin approval to re-register.`,
                variant: 'danger',
                action: () => runBulkOp('update_registration', { registrationStatus: 'rejected' }),
              })
            }
          >
            Reject
          </Button>

          {/* Email operation */}
          <Button
            size="sm"
            variant="secondary"
            type="button"
            disabled={bulkBusy}
            onClick={() => setEmailModal({ teamIds: selectedIds })}
          >
            📧 Send email
          </Button>
        </div>
      ) : null}

      <DataTable
        columns={columns}
        data={sortedTeams}
        globalFilter={globalFilter}
        onGlobalFilterChange={setGlobalFilter}
        enableRowSelection
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        getRowId={(row) => row.id}
        onRowClick={(row) => setDrawerTeam(row)}
      />

      <AdminDrawer
        open={Boolean(drawerTeam)}
        title={drawerTeam?.name || 'Team'}
        onClose={() => setDrawerTeam(null)}
        footer={
          drawerTeam ? (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                type="button"
                disabled={!drawerTeam.submissionLocked}
                onClick={() => unlockSubmission(drawerTeam.id)}
              >
                Unlock submission
              </Button>
              <Button
                size="sm"
                variant="secondary"
                type="button"
                disabled={drawerTeam.submissionLocked}
                onClick={() => void patchTeam(drawerTeam.id, { submissionLocked: true })}
              >
                Lock submission
              </Button>
              <Button
                size="sm"
                variant="secondary"
                type="button"
                onClick={() => void patchTeam(drawerTeam.id, { shortlisted: !drawerTeam.shortlisted })}
              >
                Toggle shortlist
              </Button>
              {teamHasRegistrationRecord(drawerTeam) || drawerTeam.problemStatementId ? (
                <Button
                  size="sm"
                  variant="secondary"
                  type="button"
                  className="border-red-500/40 text-red-700 hover:bg-red-500/10"
                  onClick={() =>
                    setConfirm({
                      title: 'Delete registration',
                      body: `Remove registration and payment fields for “${drawerTeam.name}” from Firestore? Problem selection is cleared. The team document and members remain.`,
                      variant: 'danger',
                      confirmLabel: 'Delete from database',
                      action: async () => {
                        setConfirm(null)
                        setBulkBusy(true)
                        try {
                          await deleteRegistration(drawerTeam.id)
                        } catch (e) {
                          globalThis.alert(e.message || 'Delete failed')
                        } finally {
                          setBulkBusy(false)
                        }
                      },
                    })
                  }
                >
                  Delete registration
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="secondary"
                type="button"
                className="border-red-500/40 text-red-700 hover:bg-red-500/10"
                onClick={() =>
                  setConfirm({
                    title: 'Delete team',
                    body: `Permanently delete “${drawerTeam.name}” and everything tied to it — submission, evaluations, member registrations, and problem selection? Members are detached from the team. This cannot be undone.`,
                    variant: 'danger',
                    confirmLabel: 'Delete team permanently',
                    action: async () => {
                      setConfirm(null)
                      setBulkBusy(true)
                      try {
                        await deleteTeam(drawerTeam.id)
                      } catch (e) {
                        globalThis.alert(e.message || 'Delete failed')
                      } finally {
                        setBulkBusy(false)
                      }
                    },
                  })
                }
              >
                Delete team
              </Button>
            </div>
          ) : null
        }
      >
        {drawerTeam ? (
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs uppercase text-ink-500">Invite Code</dt>
              <dd className="font-mono text-lg font-bold text-ink-900">{drawerTeam.inviteCode}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-ink-500">Edition</dt>
              <dd className="text-sm text-ink-800">{drawerTeam.eventId || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-ink-500">Registration</dt>
              <dd className="flex flex-wrap gap-2">
                <Badge tone={toneForRegStatus(deriveRegistrationStatus(drawerTeam))}>{deriveRegistrationStatus(drawerTeam)}</Badge>
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-ink-500">Leader</dt>
              <dd className="text-sm font-medium text-ink-900">{resolveName(drawerTeam.leaderId)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-ink-500">Members ({Array.isArray(drawerTeam.memberIds) ? drawerTeam.memberIds.length : 0})</dt>
              <dd className="mt-1 max-h-32 space-y-1 overflow-y-auto">
                {(drawerTeam.memberIds || []).length === 0 ? <span className="text-xs text-ink-400">—</span> : null}
                {(drawerTeam.memberIds || []).map((uid) => (
                  <div key={uid} className="flex items-center gap-2 text-sm">
                    <span className="font-medium text-ink-800">{resolveName(uid)}</span>
                    {uid === drawerTeam.leaderId && <span className="rounded bg-brand-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700">Leader</span>}
                  </div>
                ))}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-ink-500">Problem statement</dt>
              <dd className="font-mono text-[11px]">{drawerTeam.problemStatementId || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-ink-500">Payment</dt>
              <dd>
                <Badge tone="neutral">{String(drawerTeam.paymentStatus || '—')}</Badge>
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-ink-500">Mentors</dt>
              <dd className="text-xs text-ink-600">
                {(drawerTeam.mentorIds || []).length} assigned
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-ink-500">Timestamps</dt>
              <dd className="text-xs text-ink-600">
                Created: {formatDate(drawerTeam.createdAt) || '—'}
                <br />
                Updated: {formatDate(drawerTeam.updatedAt) || '—'}
                <br />
                Registered at: {formatDate(drawerTeam.eventRegisteredAt) || '—'}
              </dd>
            </div>
          </dl>
        ) : null}
      </AdminDrawer>

      <ConfirmModal
        open={Boolean(confirm)}
        title={confirm?.title || ''}
        variant={confirm?.variant || 'primary'}
        onCancel={() => !bulkBusy && setConfirm(null)}
        onConfirm={() => confirm?.action?.()}
        busy={bulkBusy}
        confirmLabel={confirm?.confirmLabel || 'Apply'}
      >
        {confirm?.body}
      </ConfirmModal>

      {/* Bulk Email Modal */}
      {emailModal && (
        <BulkEmailModal
          teamCount={emailModal.teamIds.length}
          onClose={() => setEmailModal(null)}
          onSend={async (title, message, link) => {
            setBulkBusy(true)
            try {
              const result = await api.bulkOperation({
                teamIds: selectedIds,
                operation: 'send_email',
                params: { emailTitle: title, emailMessage: message, emailLink: link },
              })
              if (result.failed > 0) {
                globalThis.alert(`Sent to ${result.success} teams. ${result.failed} failed.`)
              } else {
                globalThis.alert(`Email sent to ${result.success} team(s) successfully!`)
              }
              setEmailModal(null)
              setRowSelection({})
            } catch (e) {
              globalThis.alert(e.message || 'Failed to send emails')
            } finally {
              setBulkBusy(false)
            }
          }}
          busy={bulkBusy}
        />
      )}
    </div>
  )
}

/** Bulk Email Modal Component */
function BulkEmailModal({ teamCount, onClose, onSend, busy }) {
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [link, setLink] = useState('')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-bold text-ink-900">Send Email to {teamCount} Team(s)</h2>
        <p className="mt-1 text-sm text-ink-500">Email will be sent to the team leader of each selected team.</p>

        <div className="mt-4 space-y-3">
          <div>
            <label className="block text-sm font-medium text-ink-700">Subject / Title *</label>
            <input
              type="text"
              className="mt-1 w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm"
              placeholder="e.g., Important Update About Submissions"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-700">Message *</label>
            <textarea
              className="mt-1 w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm"
              rows={4}
              placeholder="Enter your announcement message..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-700">Link (optional)</label>
            <input
              type="url"
              className="mt-1 w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm"
              placeholder="https://..."
              value={link}
              onChange={(e) => setLink(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" type="button" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={busy || !title.trim() || !message.trim()}
            onClick={() => onSend(title.trim(), message.trim(), link.trim())}
          >
            {busy ? 'Sending...' : `Send to ${teamCount} team(s)`}
          </Button>
        </div>
      </div>
    </div>
  )
}
