import { useCallback, useEffect, useMemo, useState } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { Users as UsersIcon, Crown } from 'lucide-react'
import { usePageSeo } from '@/hooks/usePageSeo.js'
import { useApi } from '@/hooks/useApi.js'
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh.js'
import { DataTable } from '@/components/admin/DataTable.jsx'
import { AdminDrawer } from '@/components/admin/AdminDrawer.jsx'
import { Skeleton } from '@/components/ui/Skeleton.jsx'
import { Badge } from '@/components/ui/Badge.jsx'
import { Button } from '@/components/ui/Button.jsx'
import { useAdminFiltersStore } from '@/stores/adminFiltersStore.js'
import { formatDate } from '@/utils/format.js'
import { downloadCsv } from '@/utils/csvExport.js'

const col = createColumnHelper()

const SUPER_ADMINS = (import.meta.env.VITE_SUPER_ADMIN_EMAILS || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean)

const roleTones = {
  admin: 'danger',
  judge: 'warn',
  mentor: 'success',
  participant: 'neutral',
  banned: 'danger',
}

/** Normalise a Firestore timestamp (admin SDK serialised) or ISO string to ms. */
function toMs(v) {
  if (!v) return 0
  if (typeof v === 'object' && typeof v._seconds === 'number') return v._seconds * 1000
  if (typeof v === 'object' && typeof v.seconds === 'number') return v.seconds * 1000
  const n = new Date(v).getTime()
  return Number.isNaN(n) ? 0 : n
}

/** Render any value (scalar, array, object, timestamp) as readable text. */
function renderValue(value) {
  if (value == null || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—'
  if (typeof value === 'object') {
    if (typeof value._seconds === 'number' || typeof value.seconds === 'number') {
      return formatDate(value) || '—'
    }
    return JSON.stringify(value)
  }
  return String(value)
}

const PRIMARY_FIELDS = ['displayName', 'email', 'role', 'teamId', 'institute', 'trackChoice', 'phone']

export function AdminUsersPage() {
  usePageSeo({ title: 'Users', description: 'Every registered user with full details.' })
  const api = useApi()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [drawerUser, setDrawerUser] = useState(null)
  const globalFilter = useAdminFiltersStore((s) => s.usersGlobalFilter)
  const setGlobalFilter = useAdminFiltersStore((s) => s.setUsersGlobalFilter)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const rows = await api.listUsers()
      setUsers(Array.isArray(rows) ? rows : [])
    } catch {
      if (!silent) setUsers([])
    } finally {
      if (!silent) setLoading(false)
    }
  }, [api])

  useEffect(() => { void load() }, [load])

  // Real-time: refresh the list in place whenever any user doc changes.
  useRealtimeRefresh('users', () => load(true))

  const isSuperAdmin = useCallback((email) => SUPER_ADMINS.includes((email || '').toLowerCase()), [])

  // Newest first.
  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt))
  }, [users])

  // Keep the open drawer in sync with fresh data.
  const drawerId = drawerUser?.id
  useEffect(() => {
    if (!drawerId) return
    const fresh = users.find((u) => u.id === drawerId)
    if (fresh) setDrawerUser(fresh)
  }, [users, drawerId])

  const stats = useMemo(() => ({
    total: users.length,
    admins: users.filter((u) => u.role === 'admin').length,
    judges: users.filter((u) => u.role === 'judge').length,
    mentors: users.filter((u) => u.role === 'mentor').length,
    participants: users.filter((u) => !u.role || u.role === 'participant').length,
    banned: users.filter((u) => u.role === 'banned').length,
  }), [users])

  const columns = useMemo(
    () => [
      col.accessor('displayName', {
        header: 'Name',
        cell: (i) => (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-ink-900">{i.getValue() || '—'}</span>
            {isSuperAdmin(i.row.original.email) && <Crown className="h-3.5 w-3.5 text-amber-500" title="Super Admin" />}
          </div>
        ),
      }),
      col.accessor('email', { header: 'Email', cell: (i) => <span className="text-sm text-ink-600">{i.getValue() || '—'}</span> }),
      col.accessor('role', {
        header: 'Role',
        cell: ({ row }) => {
          const role = row.original.role || 'participant'
          return <Badge tone={roleTones[role] || 'neutral'}>{role}</Badge>
        },
      }),
      col.accessor('teamId', { header: 'Team', cell: (i) => <span className="font-mono text-xs">{i.getValue() || '—'}</span> }),
      col.accessor('institute', { header: 'Institute', cell: (i) => <span className="text-xs text-ink-600">{i.getValue() || '—'}</span> }),
      col.accessor('createdAt', { header: 'Joined', cell: (i) => <span className="text-xs text-ink-500">{formatDate(i.getValue()) || '—'}</span> }),
    ],
    [isSuperAdmin],
  )

  const exportCsv = useCallback(() => {
    downloadCsv(
      `users-export-${Date.now()}.csv`,
      sortedUsers,
      [
        { header: 'UID', accessor: (r) => r.id },
        { header: 'Name', accessor: (r) => r.displayName || '' },
        { header: 'Email', accessor: (r) => r.email || '' },
        { header: 'Role', accessor: (r) => r.role || 'participant' },
        { header: 'Team ID', accessor: (r) => r.teamId || '' },
        { header: 'Institute', accessor: (r) => r.institute || '' },
        { header: 'Track', accessor: (r) => r.trackChoice || '' },
        { header: 'Phone', accessor: (r) => r.phone || '' },
        { header: 'Active Event', accessor: (r) => r.activeEventId || '' },
        { header: 'Joined', accessor: (r) => formatDate(r.createdAt) || '' },
        { header: 'Updated', accessor: (r) => formatDate(r.updatedAt) || '' },
      ],
    )
  }, [sortedUsers])

  if (loading) return <Skeleton className="h-96 w-full rounded-2xl" />

  // Build the full field list for the drawer (every key on the doc).
  const drawerEntries = drawerUser
    ? Object.entries(drawerUser).filter(([k]) => k !== 'id')
    : []

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <UsersIcon className="h-6 w-6 text-brand-600" />
            <h1 className="font-display text-3xl font-bold text-ink-900">Users</h1>
          </div>
          <p className="mt-2 text-sm text-ink-600">
            Every registered user across roles. Newest first. Row click opens the full profile with all stored fields. Updates in real time.
          </p>
        </div>
        <Button variant="secondary" type="button" onClick={exportCsv}>
          Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
        {[
          { label: 'Total', value: stats.total, cls: 'text-ink-900' },
          { label: 'Participants', value: stats.participants, cls: 'text-ink-900' },
          { label: 'Admins', value: stats.admins, cls: 'text-red-600' },
          { label: 'Judges', value: stats.judges, cls: 'text-amber-600' },
          { label: 'Mentors', value: stats.mentors, cls: 'text-emerald-600' },
          { label: 'Banned', value: stats.banned, cls: 'text-ink-600' },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2.5 text-center">
            <p className="text-[10px] font-bold uppercase text-ink-500">{s.label}</p>
            <p className={`font-display text-lg font-bold ${s.cls}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <DataTable
        columns={columns}
        data={sortedUsers}
        globalFilter={globalFilter}
        onGlobalFilterChange={setGlobalFilter}
        filterPlaceholder="Search by name, email, role, team…"
        onRowClick={(row) => setDrawerUser(row)}
      />

      <AdminDrawer
        open={Boolean(drawerUser)}
        title={drawerUser?.displayName || drawerUser?.email || 'User'}
        onClose={() => setDrawerUser(null)}
      >
        {drawerUser && (
          <div className="space-y-5 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={roleTones[drawerUser.role] || 'neutral'}>{drawerUser.role || 'participant'}</Badge>
              {isSuperAdmin(drawerUser.email) && <Badge tone="warn">Super Admin</Badge>}
            </div>

            <div>
              <dt className="text-xs font-semibold uppercase text-ink-500">UID</dt>
              <dd className="mt-1 break-all font-mono text-xs text-ink-800">{drawerUser.id}</dd>
            </div>

            {/* Highlighted primary fields */}
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {PRIMARY_FIELDS.map((key) => (
                <div key={key}>
                  <dt className="text-xs font-semibold uppercase text-ink-500">{key}</dt>
                  <dd className="mt-1 break-words text-ink-900">{renderValue(drawerUser[key])}</dd>
                </div>
              ))}
            </dl>

            {/* All remaining fields — every minute detail stored on the doc */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase text-ink-500">All stored fields</p>
              <dl className="divide-y divide-[rgb(var(--border))] rounded-xl border border-[rgb(var(--border))]">
                {drawerEntries.map(([key, value]) => (
                  <div key={key} className="flex flex-wrap items-start justify-between gap-3 px-3 py-2">
                    <dt className="font-mono text-[11px] text-ink-500">{key}</dt>
                    <dd className="max-w-[60%] break-words text-right text-xs text-ink-800">{renderValue(value)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        )}
      </AdminDrawer>
    </div>
  )
}
