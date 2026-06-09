import { useCallback, useEffect, useState } from 'react'
import { usePageSeo } from '@/hooks/usePageSeo.js'
import { useApi } from '@/hooks/useApi.js'
import { useEvent } from '@/context/EventContext.jsx'
import { ROLES } from '@/utils/roles.js'
import { Card } from '@/components/ui/Card.jsx'
import { Button } from '@/components/ui/Button.jsx'
import { Input } from '@/components/ui/Input.jsx'
import { Skeleton } from '@/components/ui/Skeleton.jsx'
import { Badge } from '@/components/ui/Badge.jsx'
import { Users, FileText, Layers, X } from 'lucide-react'
import { publicApi } from '@/services/api.js'

const DOMAIN_OPTIONS = [
  'Health', 'Education', 'Transportation', 'Food Safety & Security',
  'Waste Management', 'Agriculture', 'Industry & MSME Innovation', 'Open Innovation',
]
const TRACK_OPTIONS = ['Software', 'Hardware']

const SELECT_CLS = 'w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2.5 text-sm text-ink-900 transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20'

export function AdminMentorsPage() {
  usePageSeo({ title: 'Mentors', description: 'Mentor assignments.' })
  const api = useApi()
  const { eventId } = useEvent()
  const [users, setUsers] = useState([])
  const [teams, setTeams] = useState([])
  const [problems, setProblems] = useState([])
  const [overview, setOverview] = useState([])
  const [loading, setLoading] = useState(true)

  // Assign to team
  const [teamId, setTeamId] = useState('')
  const [mentorEmailTeam, setMentorEmailTeam] = useState('')

  // Assign to problem statement
  const [problemId, setProblemId] = useState('')
  const [mentorEmailPS, setMentorEmailPS] = useState('')

  // Assign to domain + track
  const [dtDomain, setDtDomain] = useState('')
  const [dtTrack, setDtTrack] = useState('')
  const [mentorEmailDT, setMentorEmailDT] = useState('')

  const [msg, setMsg] = useState('')
  const [msgType, setMsgType] = useState('info')

  const refresh = useCallback(async () => {
    try {
      const [userRows, teamRows, ps, ov] = await Promise.all([
        api.listUsers().catch(() => []),
        api.adminTeams().catch(() => []),
        publicApi.listProblemStatements(eventId || undefined).catch(() => []),
        api.getMentorAssignmentsOverview().catch(() => ({ mentors: [] })),
      ])
      setUsers(Array.isArray(userRows) ? userRows : [])
      setTeams(Array.isArray(teamRows) ? teamRows : [])
      setProblems(Array.isArray(ps) ? ps : [])
      setOverview(Array.isArray(ov?.mentors) ? ov.mentors : [])
    } catch {
      // individual failures are already caught above — this only fires on unexpected errors
    } finally {
      setLoading(false)
    }
  }, [api, eventId])

  useEffect(() => { void refresh() }, [refresh])

  const mentors = users.filter((u) => u.role === ROLES.MENTOR)

  function showMsg(text, type = 'info') {
    setMsg(text)
    setMsgType(type)
    setTimeout(() => setMsg(''), 5000)
  }

  function findMentor(email) {
    return users.find((u) => u.email?.toLowerCase() === email.trim().toLowerCase())
  }

  async function assignToTeam() {
    if (!teamId) return showMsg('Please select a team.', 'error')
    const mentor = findMentor(mentorEmailTeam)
    if (!mentor || mentor.role !== ROLES.MENTOR) return showMsg('Mentor email not found or not in Mentor role.', 'error')
    try {
      await api.assignMentor({ teamId, mentorId: mentor.id })
      showMsg('Mentor assigned to team successfully.', 'success')
      setTeamId(''); setMentorEmailTeam('')
      await refresh()
    } catch (e) { showMsg(e.message || 'Failed.', 'error') }
  }

  async function assignToProblem() {
    if (!problemId) return showMsg('Please select a problem statement.', 'error')
    const mentor = findMentor(mentorEmailPS)
    if (!mentor || mentor.role !== ROLES.MENTOR) return showMsg('Mentor email not found or not in Mentor role.', 'error')
    try {
      await api.assignMentorToProblem({ problemStatementId: problemId, mentorId: mentor.id })
      showMsg('Mentor assigned to problem statement successfully.', 'success')
      setProblemId(''); setMentorEmailPS('')
      await refresh()
    } catch (e) { showMsg(e.message || 'Failed.', 'error') }
  }

  async function assignDomainTrack() {
    if (!dtDomain && !dtTrack) return showMsg('Select at least a domain or a track.', 'error')
    const mentor = findMentor(mentorEmailDT)
    if (!mentor || mentor.role !== ROLES.MENTOR) return showMsg('Mentor email not found or not in Mentor role.', 'error')
    try {
      await api.assignMentorDomainTrack({ mentorId: mentor.id, domain: dtDomain || null, track: dtTrack || null })
      showMsg(`Mentor assigned to ${[dtDomain, dtTrack].filter(Boolean).join(' + ')} successfully.`, 'success')
      setDtDomain(''); setDtTrack(''); setMentorEmailDT('')
      await refresh()
    } catch (e) { showMsg(e.message || 'Failed.', 'error') }
  }

  async function removeAssignment(mentorId, domain, track) {
    try {
      await api.unassignMentorDomainTrack({ mentorId, domain, track })
      showMsg('Assignment removed.', 'success')
      await refresh()
    } catch (e) { showMsg(e.message || 'Failed.', 'error') }
  }

  if (loading) return <Skeleton className="h-64 w-full rounded-2xl" />

  return (
    <div className="w-full max-w-2xl space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold text-ink-900">Mentor management</h1>
        <p className="mt-2 text-sm text-ink-600">
          Assign mentors by domain + track, by problem statement, or directly to a team.
        </p>
      </div>

      {msg ? (
        <p className={`rounded-lg px-4 py-2.5 text-sm font-medium ${
          msgType === 'success' ? 'bg-emerald-500/10 text-emerald-700' :
          msgType === 'error' ? 'bg-red-500/10 text-red-700' :
          'bg-brand-500/10 text-brand-700'
        }`}>{msg}</p>
      ) : null}

      {/* Mentor availability */}
      {mentors.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          <span className="text-xs font-medium text-ink-500">Available mentors:</span>
          {mentors.map((m) => (
            <Badge key={m.id} tone="brand" className="text-xs">{m.email}</Badge>
          ))}
        </div>
      ) : (
        <p className="rounded-lg bg-amber-500/10 px-4 py-2.5 text-sm text-amber-700">
          No users with Mentor role found. Assign the mentor role first via Access Control.
        </p>
      )}

      {/* ═══ Option 1: Domain + Track ═══ */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <Layers className="h-5 w-5 text-brand-600" />
          <h2 className="font-display text-lg font-semibold text-ink-900">Assign by Domain + Track</h2>
        </div>
        <p className="mb-4 text-sm text-ink-600">
          The mentor will automatically mentor <strong>all teams</strong> whose problem statement matches the selected domain and/or track.
          You can assign multiple combinations to the same mentor.
        </p>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">Domain</label>
              <select value={dtDomain} onChange={(e) => setDtDomain(e.target.value)} className={SELECT_CLS}>
                <option value="">— Any domain —</option>
                {DOMAIN_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">Track</label>
              <select value={dtTrack} onChange={(e) => setDtTrack(e.target.value)} className={SELECT_CLS}>
                <option value="">— Any track —</option>
                {TRACK_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">Mentor email</label>
            <Input value={mentorEmailDT} onChange={(e) => setMentorEmailDT(e.target.value)} placeholder="mentor@example.com" />
          </div>
          <Button className="w-full" onClick={assignDomainTrack}>
            Assign by Domain + Track
          </Button>
        </div>
      </Card>

      {/* ═══ Current domain+track assignments overview ═══ */}
      {overview.filter((m) => m.mentorAssignments?.length > 0).length > 0 && (
        <Card>
          <h2 className="mb-4 font-display text-base font-semibold text-ink-900">Current Domain + Track Assignments</h2>
          <div className="space-y-3">
            {overview.filter((m) => m.mentorAssignments?.length > 0).map((m) => (
              <div key={m.id} className="rounded-lg border border-[rgb(var(--border))] p-3">
                <p className="text-sm font-medium text-ink-900">{m.displayName || m.email}</p>
                <p className="text-xs text-ink-500">{m.email}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {m.mentorAssignments.map((a, i) => (
                    <span key={i} className="inline-flex items-center gap-1.5 rounded-full border border-brand-500/20 bg-brand-500/5 px-2.5 py-1 text-xs font-medium text-brand-700">
                      {[a.domain, a.track].filter(Boolean).join(' · ')}
                      <button
                        type="button"
                        onClick={() => removeAssignment(m.id, a.domain, a.track)}
                        className="rounded-full p-0.5 hover:bg-red-500/10 hover:text-red-600"
                        title="Remove"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ═══ Option 2: Problem Statement ═══ */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <FileText className="h-5 w-5 text-brand-600" />
          <h2 className="font-display text-lg font-semibold text-ink-900">Assign to Problem Statement</h2>
        </div>
        <p className="mb-4 text-sm text-ink-600">
          Mentor all teams working on a specific problem statement.
        </p>
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">Problem Statement</label>
            <select value={problemId} onChange={(e) => setProblemId(e.target.value)} className={SELECT_CLS}>
              <option value="">Select a problem statement...</option>
              {problems.map((ps) => (
                <option key={ps.id} value={ps.id}>
                  {ps.title || ps.id} {ps.category ? `[${ps.category}]` : ''} {ps.theme ? `· ${ps.theme}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">Mentor email</label>
            <Input value={mentorEmailPS} onChange={(e) => setMentorEmailPS(e.target.value)} placeholder="mentor@example.com" />
          </div>
          <Button className="w-full" variant="secondary" onClick={assignToProblem}>
            Assign to Problem Statement
          </Button>
        </div>
      </Card>

      {/* ═══ Option 3: Individual Team ═══ */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <Users className="h-5 w-5 text-brand-600" />
          <h2 className="font-display text-lg font-semibold text-ink-900">Assign to Individual Team</h2>
        </div>
        <p className="mb-4 text-sm text-ink-600">
          Directly assign a mentor to a specific team.
        </p>
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">Team</label>
            <select value={teamId} onChange={(e) => setTeamId(e.target.value)} className={SELECT_CLS}>
              <option value="">Select a team...</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name || 'Unnamed'} ({t.code || t.id.slice(0, 6)})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">Mentor email</label>
            <Input value={mentorEmailTeam} onChange={(e) => setMentorEmailTeam(e.target.value)} placeholder="mentor@example.com" />
          </div>
          <Button className="w-full" variant="secondary" onClick={assignToTeam}>
            Assign to Team
          </Button>
        </div>
      </Card>
    </div>
  )
}
