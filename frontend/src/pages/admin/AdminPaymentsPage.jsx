import { useCallback, useEffect, useMemo, useState } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { usePageSeo } from '@/hooks/usePageSeo.js'
import { useApi } from '@/hooks/useApi.js'
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh.js'
import { DataTable } from '@/components/admin/DataTable.jsx'
import { Badge } from '@/components/ui/Badge.jsx'
import { Button } from '@/components/ui/Button.jsx'
import { Skeleton } from '@/components/ui/Skeleton.jsx'
import { downloadCsv } from '@/utils/csvExport.js'
import { useAdminFiltersStore } from '@/stores/adminFiltersStore.js'

const col = createColumnHelper()

export function AdminPaymentsPage() {
  usePageSeo({ title: 'Payments', description: 'Payment reconciliation.' })
  const api = useApi()
  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const globalFilter = useAdminFiltersStore((s) => s.paymentsGlobalFilter)
  const setGlobalFilter = useAdminFiltersStore((s) => s.setPaymentsGlobalFilter)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const rows = await api.adminTeams()
      setTeams(
        Array.isArray(rows)
          ? rows.filter(
              (t) =>
                t.eventRegistered ||
                t.registrationStatus === 'pending' ||
                t.registrationRequestedAt ||
                (t.paymentStatus && t.paymentStatus !== 'not_required'),
            )
          : [],
      )
    } catch {
      if (!silent) setTeams([])
    } finally {
      if (!silent) setLoading(false)
    }
  }, [api])

  useEffect(() => {
    void load()
  }, [load])

  // Real-time: payments are written to the team doc, so watch teams and refresh
  // silently (in place) whenever a payment/registration status changes.
  useRealtimeRefresh('teams', () => load(true))

  function exportCsv() {
    downloadCsv(
      `payments-${Date.now()}.csv`,
      teams,
      [
        { header: 'teamId', accessor: (r) => r.id },
        { header: 'name', accessor: (r) => r.name },
        { header: 'paymentStatus', accessor: (r) => r.paymentStatus },
        { header: 'razorpayPaymentId', accessor: (r) => r.razorpayPaymentId },
      ],
    )
  }

  const columns = useMemo(
    () => [
      col.accessor('name', { header: 'Team', cell: (i) => i.getValue() }),
      col.accessor('paymentStatus', {
        header: 'Status',
        cell: (i) => {
          const s = String(i.getValue() || '')
          const tone = s === 'paid' || s === 'waived' ? 'success' : s === 'pending' ? 'warn' : 'neutral'
          return <Badge tone={tone}>{s || '—'}</Badge>
        },
      }),
      col.accessor('razorpayPaymentId', {
        header: 'Razorpay PI',
        cell: (i) => <span className="font-mono text-[11px]">{String(i.getValue() || '—')}</span>,
      }),
      col.accessor('paymentRecordedBy', { header: 'Recorded by', cell: (i) => String(i.getValue() || '—').slice(0, 8) }),
    ],
    [],
  )

  if (loading) return <Skeleton className="h-96 w-full rounded-2xl" />

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink-900">Payments</h1>
          <p className="mt-2 text-sm text-ink-600">
            Browser-verified payments still appear here from webhook/API reconciliation. Manual overrides append audit entries.
          </p>
        </div>
        <Button variant="secondary" type="button" onClick={exportCsv}>
          Export CSV
        </Button>
      </div>
      <DataTable columns={columns} data={teams} globalFilter={globalFilter} onGlobalFilterChange={setGlobalFilter} />
    </div>
  )
}
