import { useState, useEffect } from 'react'
import { Users, Check, X, Clock, Loader2, ChevronDown, ChevronRight, AlertCircle, Search, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/Button.jsx'
import { Card } from '@/components/ui/Card.jsx'
import { Input } from '@/components/ui/Input.jsx'
import { useAuth } from '@/context/AuthContext.jsx'

const API_BASE = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || 'http://localhost:4000'

const STATUS_CONFIG = {
  pending: { label: 'Pending', color: 'text-amber-600', bg: 'bg-amber-500/10', icon: Clock },
  approved: { label: 'Approved', color: 'text-green-600', bg: 'bg-green-500/10', icon: Check },
  rejected: { label: 'Rejected', color: 'text-red-600', bg: 'bg-red-500/10', icon: X },
}

export function AdminTeamRegistrationsPage() {
  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedTeam, setExpandedTeam] = useState(null)
  const [teamDetails, setTeamDetails] = useState({})
  const [error, setError] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const { user } = useAuth()

  useEffect(() => {
    fetchTeams()
  }, [])

  async function fetchTeams() {
    try {
      setError(null)
      const token = await user.getIdToken()
      const res = await fetch(`${API_BASE}/api/registrations/teams`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      
      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || `HTTP ${res.status}: Failed to fetch teams`)
      }
      
      const data = await res.json()
      setTeams(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('Failed to fetch teams:', error)
      setError(error.message || 'Failed to load teams. Please refresh the page.')
    } finally {
      setLoading(false)
    }
  }

  async function fetchTeamDetails(teamId) {
    if (teamDetails[teamId]) {
      setExpandedTeam(expandedTeam === teamId ? null : teamId)
      return
    }

    try {
      const token = await user.getIdToken()
      const res = await fetch(`${API_BASE}/api/registrations/team/${teamId}/members`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      
      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || `Failed to fetch team details`)
      }
      
      const data = await res.json()
      setTeamDetails(prev => ({ ...prev, [teamId]: data }))
      setExpandedTeam(teamId)
    } catch (error) {
      console.error('Failed to fetch team details:', error)
      alert(error.message || 'Failed to load team details')
    }
  }

  async function updateMemberStatus(memberId, status, teamId) {
    try {
      const token = await user.getIdToken()
      const res = await fetch(`${API_BASE}/api/registrations/member/${memberId}/status`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      })

      if (res.ok) {
        // Update local state
        setTeamDetails(prev => ({
          ...prev,
          [teamId]: {
            ...prev[teamId],
            registrations: prev[teamId].registrations.map(r =>
              r.id === memberId ? { ...r, status } : r
            )
          }
        }))
      } else {
        const error = await res.json()
        alert(error.error || 'Failed to update status')
      }
    } catch (error) {
      console.error('Failed to update status:', error)
      alert('Failed to update status')
    }
  }

  const stats = {
    totalTeams: teams.length,
    fullyRegistered: teams.filter(t => t.registeredMembers === t.totalMembers && t.totalMembers > 0).length,
    partialRegistered: teams.filter(t => t.registeredMembers > 0 && t.registeredMembers < t.totalMembers).length,
    notStarted: teams.filter(t => t.registeredMembers === 0).length,
  }

  // Search and filter teams
  const filteredTeams = teams.filter(team => {
    // Search filter
    const matchesSearch = !searchQuery || 
      team.name?.toLowerCase().includes(searchQuery.toLowerCase())
    
    // Status filter
    const totalMembers = team.totalMembers || 0
    const registeredMembers = team.registeredMembers || 0
    
    let matchesStatus = true
    if (statusFilter === 'complete') {
      matchesStatus = totalMembers > 0 && registeredMembers === totalMembers && team.eventRegistered
    } else if (statusFilter === 'pendingApproval') {
      matchesStatus = totalMembers > 0 && registeredMembers === totalMembers && !team.eventRegistered
    } else if (statusFilter === 'partial') {
      matchesStatus = registeredMembers > 0 && registeredMembers < totalMembers
    } else if (statusFilter === 'notStarted') {
      matchesStatus = registeredMembers === 0 && totalMembers > 0
    }
    
    return matchesSearch && matchesStatus
  })

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink-900">Team Registrations</h1>
          <p className="mt-1 text-sm text-ink-600">View team-wise member registration details</p>
        </div>
        <Card className="p-8">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="rounded-full bg-red-500/10 p-3">
              <AlertCircle className="h-8 w-8 text-red-600" />
            </div>
            <div>
              <h3 className="font-semibold text-ink-900">Something went wrong</h3>
              <p className="mt-1 text-sm text-ink-600">{error}</p>
            </div>
            <Button onClick={() => {
              setLoading(true)
              setError(null)
              fetchTeams()
            }}>
              Try Again
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink-900">Team Registrations</h1>
          <p className="mt-1 text-sm text-ink-600">View and manage team member registration details</p>
        </div>
        <Button 
          variant="outline" 
          size="sm"
          onClick={() => {
            setLoading(true)
            fetchTeams()
          }}
          className="gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard title="Total Teams" value={stats.totalTeams} icon={Users} color="blue" />
        <StatsCard title="Fully Registered" value={stats.fullyRegistered} icon={Check} color="green" />
        <StatsCard title="Partial" value={stats.partialRegistered} icon={Clock} color="amber" />
        <StatsCard title="Not Started" value={stats.notStarted} icon={AlertCircle} color="red" />
      </div>

      {/* Search and Filters */}
      <Card className="p-4">
        <div className="flex flex-col gap-4 sm:flex-row">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <Input
              type="text"
              placeholder="Search teams by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          
          {/* Status Filter */}
          <div className="flex gap-2">
            <button
              onClick={() => setStatusFilter('all')}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                statusFilter === 'all'
                  ? 'bg-brand-500 text-white'
                  : 'bg-[rgb(var(--surface-muted))] text-ink-600 hover:bg-[rgb(var(--surface-muted))]/80'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setStatusFilter('complete')}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                statusFilter === 'complete'
                  ? 'bg-green-500 text-white'
                  : 'bg-[rgb(var(--surface-muted))] text-ink-600 hover:bg-[rgb(var(--surface-muted))]/80'
              }`}
            >
              Complete
            </button>
            <button
              onClick={() => setStatusFilter('pendingApproval')}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                statusFilter === 'pendingApproval'
                  ? 'bg-amber-500 text-white'
                  : 'bg-[rgb(var(--surface-muted))] text-ink-600 hover:bg-[rgb(var(--surface-muted))]/80'
              }`}
            >
              Pending Approval
            </button>
            <button
              onClick={() => setStatusFilter('partial')}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                statusFilter === 'partial'
                  ? 'bg-amber-500 text-white'
                  : 'bg-[rgb(var(--surface-muted))] text-ink-600 hover:bg-[rgb(var(--surface-muted))]/80'
              }`}
            >
              Partial
            </button>
            <button
              onClick={() => setStatusFilter('notStarted')}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                statusFilter === 'notStarted'
                  ? 'bg-red-500 text-white'
                  : 'bg-[rgb(var(--surface-muted))] text-ink-600 hover:bg-[rgb(var(--surface-muted))]/80'
              }`}
            >
              Not Started
            </button>
          </div>
        </div>
        
        {/* Results count */}
        <div className="mt-3 text-sm text-ink-500">
          Showing {filteredTeams.length} of {teams.length} teams
        </div>
      </Card>

      {/* Teams Table */}
      <Card className="overflow-hidden">
        {filteredTeams.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-ink-500">
              {searchQuery || statusFilter !== 'all' 
                ? 'No teams match your filters' 
                : 'No teams found'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[rgb(var(--surface-muted))] border-b border-[rgb(var(--border))]">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-ink-600">
                    Team Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-ink-600">
                    Team ID
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-ink-600">
                    Members
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-ink-600">
                    Progress
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-ink-600">
                    Status
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-ink-600">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgb(var(--border))] bg-white">
                {filteredTeams.map(team => (
                  <TeamTableRow
                    key={team.id}
                    team={team}
                    expanded={expandedTeam === team.id}
                    details={teamDetails[team.id]}
                    onToggle={() => fetchTeamDetails(team.id)}
                    onUpdateStatus={updateMemberStatus}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
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

function TeamTableRow({ team, expanded, details, onToggle, onUpdateStatus }) {
  const totalMembers = team.totalMembers || 0
  const registeredMembers = team.registeredMembers || 0
  
  const registrationProgress = totalMembers > 0
    ? (registeredMembers / totalMembers) * 100
    : 0

  const isComplete = totalMembers > 0 && registeredMembers === totalMembers
  const isPartial = registeredMembers > 0 && registeredMembers < totalMembers
  const isPendingApproval = isComplete && !team.eventRegistered

  // Calculate approval stats from details
  const approvedCount = details?.registrations?.filter(r => r.status === 'approved').length || 0
  const pendingCount = details?.registrations?.filter(r => r.status === 'pending').length || 0
  const rejectedCount = details?.registrations?.filter(r => r.status === 'rejected').length || 0

  return (
    <>
      <tr className="hover:bg-[rgb(var(--surface-muted))]/50 transition-colors">
        {/* Team Name */}
        <td className="px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-600">
              <Users className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="font-semibold text-ink-900">{team.name || 'Unnamed Team'}</div>
              {expanded && (approvedCount > 0 || pendingCount > 0 || rejectedCount > 0) && (
                <div className="mt-1 flex gap-2 text-xs">
                  {approvedCount > 0 && (
                    <span className="text-green-600">✓ {approvedCount}</span>
                  )}
                  {pendingCount > 0 && (
                    <span className="text-amber-600">⏰ {pendingCount}</span>
                  )}
                  {rejectedCount > 0 && (
                    <span className="text-red-600">✗ {rejectedCount}</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </td>

        {/* Team ID */}
        <td className="px-6 py-4">
          <div className="font-mono text-xs text-ink-600">{team.id.slice(0, 12)}...</div>
        </td>

        {/* Members Count */}
        <td className="px-6 py-4 text-center">
          <div className="font-semibold text-ink-900">
            {registeredMembers} / {totalMembers}
          </div>
        </td>

        {/* Progress Bar */}
        <td className="px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="h-2 w-full min-w-[100px] overflow-hidden rounded-full bg-[rgb(var(--surface-muted))]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-600 transition-all duration-500"
                style={{ width: `${registrationProgress}%` }}
              />
            </div>
            <span className="whitespace-nowrap text-xs font-medium text-ink-600">
              {registrationProgress.toFixed(0)}%
            </span>
          </div>
        </td>

        {/* Status Badge */}
        <td className="px-6 py-4 text-center">
          {isComplete && !isPendingApproval && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-500/10 px-3 py-1 text-xs font-medium text-green-600">
              <Check className="h-3.5 w-3.5" />
              Complete
            </span>
          )}
          {isPendingApproval && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-600">
              <Clock className="h-3.5 w-3.5" />
              Pending Approval
            </span>
          )}
          {isPartial && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-600">
              <Clock className="h-3.5 w-3.5" />
              In Progress
            </span>
          )}
          {registeredMembers === 0 && totalMembers > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-3 py-1 text-xs font-medium text-red-600">
              <AlertCircle className="h-3.5 w-3.5" />
              Not Started
            </span>
          )}
          {totalMembers === 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-500/10 px-3 py-1 text-xs font-medium text-gray-600">
              No Members
            </span>
          )}
        </td>

        {/* Actions */}
        <td className="px-6 py-4 text-center">
          <button
            onClick={onToggle}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500/10 px-3 py-1.5 text-sm font-medium text-brand-600 transition-colors hover:bg-brand-500/20"
          >
            {expanded ? (
              <>
                <ChevronDown className="h-4 w-4" />
                Hide
              </>
            ) : (
              <>
                <ChevronRight className="h-4 w-4" />
                View
              </>
            )}
          </button>
        </td>
      </tr>

      {/* Expanded Member Details Row */}
      {expanded && details && (
        <tr>
          <td colSpan="6" className="bg-[rgb(var(--surface-muted))]/30 px-6 py-4">
            {!details.registrations || details.registrations.length === 0 ? (
              <div className="rounded-lg bg-white p-8 text-center">
                <AlertCircle className="mx-auto h-8 w-8 text-ink-400" />
                <p className="mt-2 text-sm text-ink-500">No member registrations yet</p>
              </div>
            ) : (
              <div className="rounded-lg bg-white p-4">
                <h4 className="mb-4 text-sm font-semibold text-ink-700">
                  Team Members ({details.registrations.length})
                </h4>
                
                {/* Members Table */}
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b border-[rgb(var(--border))]">
                      <tr>
                        <th className="pb-2 text-left text-xs font-medium text-ink-600">Name</th>
                        <th className="pb-2 text-left text-xs font-medium text-ink-600">College</th>
                        <th className="pb-2 text-left text-xs font-medium text-ink-600">Location</th>
                        <th className="pb-2 text-left text-xs font-medium text-ink-600">Year</th>
                        <th className="pb-2 text-left text-xs font-medium text-ink-600">Department</th>
                        <th className="pb-2 text-left text-xs font-medium text-ink-600">Email</th>
                        <th className="pb-2 text-left text-xs font-medium text-ink-600">Phone</th>
                        <th className="pb-2 text-center text-xs font-medium text-ink-600">Status</th>
                        <th className="pb-2 text-center text-xs font-medium text-ink-600">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[rgb(var(--border))]">
                      {details.registrations.map(member => (
                        <MemberTableRow
                          key={member.id}
                          member={member}
                          onUpdateStatus={(status) => onUpdateStatus(member.id, status, team.id)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

function MemberTableRow({ member, onUpdateStatus }) {
  const config = STATUS_CONFIG[member.status]
  const StatusIcon = config.icon
  const [loading, setLoading] = useState(false)

  const handleStatusUpdate = async (status) => {
    setLoading(true)
    try {
      await onUpdateStatus(status)
    } finally {
      setLoading(false)
    }
  }

  return (
    <tr className="hover:bg-[rgb(var(--surface-muted))]/30 transition-colors">
      {/* Name */}
      <td className="py-3 pr-4">
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-ink-900">{member.name}</span>
          {member.isLeader && (
            <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600">Leader</span>
          )}
        </div>
      </td>

      {/* College */}
      <td className="py-3 pr-4">
        <div className="text-sm text-ink-700">{member.institute || '—'}</div>
      </td>

      {/* Location */}
      <td className="py-3 pr-4">
        <div className="text-sm text-ink-700">{member.collegeLocation || '—'}</div>
      </td>

      {/* Year */}
      <td className="py-3 pr-4">
        <div className="text-sm text-ink-700">{member.yearOfStudy || '—'}</div>
      </td>

      {/* Department */}
      <td className="py-3 pr-4">
        <div className="text-sm text-ink-700">{member.department || '—'}</div>
      </td>

      {/* Email */}
      <td className="py-3 pr-4">
        <a 
          href={`mailto:${member.email}`}
          className="text-sm text-brand-600 hover:text-brand-700 hover:underline"
        >
          {member.email}
        </a>
      </td>

      {/* Phone */}
      <td className="py-3 pr-4">
        <a 
          href={`tel:${member.phone}`}
          className="text-sm text-brand-600 hover:text-brand-700 hover:underline"
        >
          {member.phone}
        </a>
      </td>

      {/* Status */}
      <td className="py-3 pr-4 text-center">
        <div className="flex flex-col items-center gap-1">
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${config.bg} ${config.color}`}>
            <StatusIcon className="h-3.5 w-3.5" />
            {config.label}
          </span>
          {member.status === 'approved' && member.approvedBy === 'system' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-600">
              Auto
            </span>
          )}
        </div>
      </td>

      {/* Actions */}
      <td className="py-3 text-center">
        <div className="flex items-center justify-center gap-1">
          {member.status !== 'approved' && (
            <button
              onClick={() => handleStatusUpdate('approved')}
              disabled={loading}
              className="rounded-lg p-1.5 text-green-600 transition-colors hover:bg-green-500/10 disabled:opacity-50"
              title="Approve"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
            </button>
          )}
          {member.status !== 'rejected' && (
            <button
              onClick={() => handleStatusUpdate('rejected')}
              disabled={loading}
              className="rounded-lg p-1.5 text-red-600 transition-colors hover:bg-red-500/10 disabled:opacity-50"
              title="Reject"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <X className="h-4 w-4" />
              )}
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}
