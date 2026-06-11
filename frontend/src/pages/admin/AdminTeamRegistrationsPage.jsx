import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Users, FileText, Check, X, Clock, Loader2, Eye, ChevronDown, ChevronRight, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button.jsx'
import { Card } from '@/components/ui/Card.jsx'
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
  const { user } = useAuth()

  useEffect(() => {
    fetchTeams()
  }, [])

  async function fetchTeams() {
    try {
      const token = await user.getIdToken()
      const res = await fetch(`${API_BASE}/api/registrations/teams`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      setTeams(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('Failed to fetch teams:', error)
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
      const data = await res.json()
      setTeamDetails(prev => ({ ...prev, [teamId]: data }))
      setExpandedTeam(teamId)
    } catch (error) {
      console.error('Failed to fetch team details:', error)
    }
  }

  async function updateMemberStatus(memberId, status, teamId) {
    try {
      const token = await user.getIdToken()
      const res = await fetch(`${API_BASE}/api/registrations/${memberId}/status`, {
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
          <h1 className="font-display text-2xl font-bold text-ink-900">Team Registrations</h1>
          <p className="mt-1 text-sm text-ink-600">View team-wise member registration details</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard title="Total Teams" value={stats.totalTeams} icon={Users} color="blue" />
        <StatsCard title="Fully Registered" value={stats.fullyRegistered} icon={Check} color="green" />
        <StatsCard title="Partial" value={stats.partialRegistered} icon={Clock} color="amber" />
        <StatsCard title="Not Started" value={stats.notStarted} icon={AlertCircle} color="red" />
      </div>

      {/* Teams List */}
      <div className="space-y-3">
        {teams.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-sm text-ink-500">No teams found</p>
          </Card>
        ) : (
          teams.map(team => (
            <TeamCard
              key={team.id}
              team={team}
              expanded={expandedTeam === team.id}
              details={teamDetails[team.id]}
              onToggle={() => fetchTeamDetails(team.id)}
              onUpdateStatus={updateMemberStatus}
            />
          ))
        )}
      </div>
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

function TeamCard({ team, expanded, details, onToggle, onUpdateStatus }) {
  const registrationProgress = team.totalMembers > 0
    ? (team.registeredMembers / team.totalMembers) * 100
    : 0

  const isComplete = team.totalMembers > 0 && team.registeredMembers === team.totalMembers
  const isPartial = team.registeredMembers > 0 && team.registeredMembers < team.totalMembers

  return (
    <Card className="overflow-hidden">
      {/* Team Header */}
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-[rgb(var(--surface-muted))]"
      >
        <div className="flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500/10">
            <Users className="h-5 w-5 text-brand-600" />
          </div>
          <div>
            <h3 className="font-semibold text-ink-900">{team.name}</h3>
            <p className="text-sm text-ink-500">
              {team.registeredMembers} / {team.totalMembers} members registered
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isComplete && (
            <span className="rounded-full bg-green-500/10 px-3 py-1 text-xs font-medium text-green-600">
              Complete
            </span>
          )}
          {isPartial && (
            <span className="rounded-full bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-600">
              In Progress
            </span>
          )}
          {team.registeredMembers === 0 && (
            <span className="rounded-full bg-red-500/10 px-3 py-1 text-xs font-medium text-red-600">
              Not Started
            </span>
          )}
          {expanded ? (
            <ChevronDown className="h-5 w-5 text-ink-400" />
          ) : (
            <ChevronRight className="h-5 w-5 text-ink-400" />
          )}
        </div>
      </button>

      {/* Progress Bar */}
      <div className="px-4 pb-4">
        <div className="h-2 w-full overflow-hidden rounded-full bg-[rgb(var(--surface-muted))]">
          <div
            className="h-full rounded-full bg-brand-500 transition-all"
            style={{ width: `${registrationProgress}%` }}
          />
        </div>
      </div>

      {/* Team Members Details */}
      <AnimatePresence>
        {expanded && details && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-[rgb(var(--border))]"
          >
            <div className="p-4">
              {details.registrations.length === 0 ? (
                <p className="text-center text-sm text-ink-500">No member registrations yet</p>
              ) : (
                <div className="space-y-3">
                  {details.registrations.map(member => (
                    <MemberCard
                      key={member.id}
                      member={member}
                      onUpdateStatus={(status) => onUpdateStatus(member.id, status, team.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  )
}

function MemberCard({ member, onUpdateStatus }) {
  const config = STATUS_CONFIG[member.status]
  const StatusIcon = config.icon

  return (
    <div className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))]/30 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-3">
            <h4 className="font-medium text-ink-900">{member.name}</h4>
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${config.bg} ${config.color}`}>
              <StatusIcon className="h-3 w-3" />
              {config.label}
            </span>
          </div>
          <div className="grid gap-2 text-sm text-ink-600 sm:grid-cols-2">
            <div>
              <span className="font-medium">Institute:</span> {member.institute}
            </div>
            <div>
              <span className="font-medium">Email:</span> {member.email}
            </div>
            <div>
              <span className="font-medium">Phone:</span> {member.phone}
            </div>
            <div>
              <a
                href={member.idCardUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-brand-600 hover:text-brand-700"
              >
                <Eye className="h-3.5 w-3.5" />
                View ID Card
              </a>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {member.status !== 'approved' && (
            <button
              onClick={() => onUpdateStatus('approved')}
              className="rounded p-2 text-green-600 hover:bg-green-500/10"
              title="Approve"
            >
              <Check className="h-4 w-4" />
            </button>
          )}
          {member.status !== 'rejected' && (
            <button
              onClick={() => onUpdateStatus('rejected')}
              className="rounded p-2 text-red-600 hover:bg-red-500/10"
              title="Reject"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
