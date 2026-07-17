import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Users, FileText, Check, X, Clock, Loader2, Download } from 'lucide-react'
import { Button } from '@/components/ui/Button.jsx'
import { Card } from '@/components/ui/Card.jsx'
import { useAuth } from '@/context/AuthContext.jsx'

const API_BASE = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || 'http://localhost:4000'

const STATUS_CONFIG = {
  pending: { label: 'Pending', color: 'text-amber-600', bg: 'bg-amber-500/10', icon: Clock },
  approved: { label: 'Approved', color: 'text-green-600', bg: 'bg-green-500/10', icon: Check },
  rejected: { label: 'Rejected', color: 'text-red-600', bg: 'bg-red-500/10', icon: X },
}

export function AdminRegistrationsPage() {
  const [registrations, setRegistrations] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const { user } = useAuth()

  useEffect(() => {
    fetchRegistrations()
  }, [])

  async function fetchRegistrations() {
    try {
      const token = await user.getIdToken()
      const res = await fetch(`${API_BASE}/api/registrations`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      setRegistrations(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('Failed to fetch registrations:', error)
    } finally {
      setLoading(false)
    }
  }

  async function updateStatus(id, status) {
    try {
      const token = await user.getIdToken()
      const res = await fetch(`${API_BASE}/api/registrations/${id}/status`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      })

      if (res.ok) {
        setRegistrations(prev =>
          prev.map(r => r.id === id ? { ...r, status } : r)
        )
      } else {
        const error = await res.json()
        alert(error.error || 'Failed to update status')
      }
    } catch (error) {
      console.error('Failed to update status:', error)
      alert('Failed to update status')
    }
  }

  const filtered = registrations.filter(r =>
    filter === 'all' ? true : r.status === filter
  )

  const stats = {
    total: registrations.length,
    pending: registrations.filter(r => r.status === 'pending').length,
    approved: registrations.filter(r => r.status === 'approved').length,
    rejected: registrations.filter(r => r.status === 'rejected').length,
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink-900">Registrations</h1>
          <p className="mt-1 text-sm text-ink-600">Manage hackathon registrations</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard title="Total" value={stats.total} icon={Users} color="blue" />
        <StatsCard title="Pending" value={stats.pending} icon={Clock} color="amber" />
        <StatsCard title="Approved" value={stats.approved} icon={Check} color="green" />
        <StatsCard title="Rejected" value={stats.rejected} icon={X} color="red" />
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {['all', 'pending', 'approved', 'rejected'].map(status => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              filter === status
                ? 'bg-brand-500 text-white'
                : 'bg-[rgb(var(--surface-muted))] text-ink-600 hover:bg-[rgb(var(--border))]'
            }`}
          >
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </button>
        ))}
      </div>

      {/* Registrations Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-ink-600">Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-ink-600">Institute</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-ink-600">Email</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-ink-600">Phone</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-ink-600">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-ink-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(var(--border))]">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-ink-500">
                    No registrations found
                  </td>
                </tr>
              ) : (
                filtered.map(reg => (
                  <RegistrationRow
                    key={reg.id}
                    registration={reg}
                    onUpdateStatus={updateStatus}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

function StatsCard({ title, value, icon: Icon, color }) {
  const colors = {
    blue: 'text-blue-600 bg-blue-500/10',
    amber: 'text-amber-600 bg-amber-500/10',
    green: 'text-green-600 bg-green-500/10',
    red: 'text-red-600 bg-red-500/10',
  }

  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div className={`rounded-lg p-2 ${colors[color]}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-medium text-ink-600">{title}</p>
          <p className="text-2xl font-bold text-ink-900">{value}</p>
        </div>
      </div>
    </Card>
  )
}

function RegistrationRow({ registration, onUpdateStatus }) {
  const { status, name, institute, email, phone, createdAt } = registration
  const config = STATUS_CONFIG[status]
  const StatusIcon = config.icon

  return (
    <tr className="hover:bg-[rgb(var(--surface-muted))]">
      <td className="px-4 py-3">
        <p className="text-sm font-medium text-ink-900">{name}</p>
        <p className="text-xs text-ink-500">{new Date(createdAt).toLocaleDateString()}</p>
      </td>
      <td className="px-4 py-3 text-sm text-ink-600">{institute}</td>
      <td className="px-4 py-3 text-sm text-ink-600">{email}</td>
      <td className="px-4 py-3 text-sm text-ink-600">{phone}</td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${config.bg} ${config.color}`}>
          <StatusIcon className="h-3 w-3" />
          {config.label}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex gap-2">
          {status !== 'approved' && (
            <button
              onClick={() => onUpdateStatus(registration.id, 'approved')}
              className="rounded p-1 text-green-600 hover:bg-green-500/10"
              title="Approve"
            >
              <Check className="h-4 w-4" />
            </button>
          )}
          {status !== 'rejected' && (
            <button
              onClick={() => onUpdateStatus(registration.id, 'rejected')}
              className="rounded p-1 text-red-600 hover:bg-red-500/10"
              title="Reject"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}
