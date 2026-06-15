import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Clock, Crown, Hash, Link2, LogOut, UserMinus, Users, Pencil, Github, Linkedin, Globe, X, Check, Tag, Shield, Sparkles, Copy, UserPlus, Inbox, Building2 } from 'lucide-react'
import { usePageSeo } from '@/hooks/usePageSeo.js'
import { useParticipantWorkspace } from '@/hooks/useParticipantWorkspace.js'
import { useAuth } from '@/context/AuthContext.jsx'
import { Card } from '@/components/ui/Card.jsx'
import { Button } from '@/components/ui/Button.jsx'
import { Input } from '@/components/ui/Input.jsx'
import { Badge } from '@/components/ui/Badge.jsx'
import { Skeleton } from '@/components/ui/Skeleton.jsx'
import { formatDate } from '@/utils/format.js'

const MAX_TEAM_MEMBERS = 6
const fadeUp = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.4 } } }
const stagger = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.06 } } }

/** Avatar with gradient fallback */
function Avatar({ name, size = 'md' }) {
  const initial = (name || '?').charAt(0).toUpperCase()
  const sizes = { sm: 'h-8 w-8 text-xs', md: 'h-11 w-11 text-sm', lg: 'h-14 w-14 text-lg' }
  return (
    <div className={`${sizes[size]} flex items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-cyan-500 font-display font-bold text-white shadow-md`}>
      {initial}
    </div>
  )
}

/**
 * Join Requests card (Feature 1) — shown to the team LEADER only when matchmaking
 * is enabled. Lists pending requests with approve/decline actions.
 */
function JoinRequestsCard({ api, isLeader, matchmakingEnabled, teamFull, onApproved }) {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.teamJoinRequests()
      setRequests(Array.isArray(res?.requests) ? res.requests : [])
    } catch {
      setRequests([])
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    if (isLeader && matchmakingEnabled) void load()
  }, [isLeader, matchmakingEnabled, load])

  if (!isLeader || !matchmakingEnabled) return null

  async function respond(requestId, action) {
    setBusyId(requestId)
    try {
      await api.respondJoinRequest(requestId, action)
      setRequests((rs) => rs.filter((r) => r.id !== requestId))
      if (action === 'approve') await onApproved?.()
    } catch (e) {
      globalThis.alert?.(e?.message || 'Could not process request.')
    } finally {
      setBusyId('')
    }
  }

  return (
    <motion.div variants={fadeUp}>
      <Card>
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-display text-base font-semibold text-ink-900">
            <Inbox className="h-5 w-5 text-brand-600" /> Join Requests
            {requests.length > 0 && <Badge tone="brand">{requests.length}</Badge>}
          </h3>
          <Button variant="ghost" size="xs" onClick={load}>Refresh</Button>
        </div>

        {loading ? (
          <div className="mt-4 space-y-3">
            {[1, 2].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
        ) : requests.length === 0 ? (
          <p className="mt-4 flex items-center gap-2 rounded-xl bg-[rgb(var(--surface-muted))]/40 px-4 py-3 text-sm text-ink-500">
            <UserPlus className="h-4 w-4" /> No pending requests. Participants who find your team can request to join here.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            <AnimatePresence>
              {requests.map((r) => (
                <motion.div
                  key={r.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))]/30 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <Avatar name={r.userName} size="sm" />
                      <div className="min-w-0">
                        <p className="font-semibold text-ink-900">{r.userName}</p>
                        {r.userInstitute && (
                          <p className="flex items-center gap-1 text-xs text-ink-500">
                            <Building2 className="h-3 w-3" /> {r.userInstitute}
                          </p>
                        )}
                        {r.userSkills?.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {r.userSkills.slice(0, 6).map((s) => (
                              <span key={s} className="rounded-md bg-brand-500/10 px-1.5 py-0.5 text-[10px] font-medium text-brand-700">
                                {s}
                              </span>
                            ))}
                          </div>
                        )}
                        {r.message && <p className="mt-2 text-sm text-ink-600">"{r.message}"</p>}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <Button
                      size="sm"
                      className="flex-1"
                      loading={busyId === r.id}
                      disabled={teamFull || Boolean(busyId)}
                      onClick={() => respond(r.id, 'approve')}
                    >
                      <Check className="mr-1.5 h-4 w-4" /> {teamFull ? 'Team Full' : 'Approve'}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="flex-1 text-red-600 hover:bg-red-500/10"
                      disabled={Boolean(busyId)}
                      onClick={() => respond(r.id, 'decline')}
                    >
                      <X className="mr-1.5 h-4 w-4" /> Decline
                    </Button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </Card>
    </motion.div>
  )
}

export function ParticipantTeamPage() {
  usePageSeo({ title: 'My Team', description: 'Team roster and invites.' })
  const { user, refreshProfile } = useAuth()
  const { api, team, loading, refreshTeam, reload, eventCfg } = useParticipantWorkspace()
  const matchmakingEnabled = Boolean(eventCfg?.matchmakingEnabled)
  const [searchParams, setSearchParams] = useSearchParams()

  const [teamName, setTeamName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [roster, setRoster] = useState(null)
  const [rosterLoading, setRosterLoading] = useState(false)

  useEffect(() => {
    const inviteFromUrl = searchParams.get('invite')
    if (inviteFromUrl && !team) {
      setJoinCode(inviteFromUrl.toUpperCase())
      setMsg('Invite code auto-filled from link. Click "Join team" to continue.')
      setSearchParams({})
    }
  }, [searchParams, setSearchParams, team])

  const loadRoster = useCallback(async () => {
    if (!team?.id) { setRoster(null); return }
    setRosterLoading(true)
    try { setRoster(await api.teamRoster()) } catch { setRoster(null) } finally { setRosterLoading(false) }
  }, [api, team?.id])

  useEffect(() => { void loadRoster() }, [loadRoster])

  const formationClosed = (() => {
    if (!eventCfg) return false
    if (eventCfg.lifecyclePhase === 'ARCHIVED') return true
    const phases = Array.isArray(eventCfg.competitionPhases) ? eventCfg.competitionPhases : []
    if (phases.length > 0) {
      return !phases.some(p => ['DRAFT', 'UPCOMING', 'ACTIVE', 'SUBMISSION_LOCKED', 'EVALUATION', 'SHORTLISTING'].includes(p.status))
    }
    if (eventCfg.submissionDeadline) {
      return new Date(eventCfg.submissionDeadline).getTime() < Date.now()
    }
    return false
  })()

  async function createTeam() {
    if (formationClosed) { setMsg('Team formation is closed at this time.'); return }
    setBusy(true); setMsg('')
    try {
      await api.createTeam(teamName || 'Untitled team')
      await refreshProfile(); await refreshTeam(); await loadRoster()
      setTeamName(''); setMsg('Team created!')
    } catch (e) { setMsg(e.message || 'Could not create team') } finally { setBusy(false) }
  }

  async function joinTeam() {
    if (formationClosed) { setMsg('Team formation is closed at this time.'); return }
    setBusy(true); setMsg('')
    try {
      await api.joinTeam(joinCode.trim().toUpperCase())
      await refreshProfile(); await refreshTeam(); await loadRoster()
      setJoinCode(''); setMsg('Joined team!')
    } catch (e) { setMsg(e.message || 'Could not join team') } finally { setBusy(false) }
  }

  async function copyInviteLink() {
    const code = roster?.inviteCode || team?.inviteCode
    if (!code) return
    const url = `${globalThis.location.origin}/join/${encodeURIComponent(code)}`
    try { await navigator.clipboard.writeText(url); setMsg('Invite link copied!') } catch { setMsg(`Share: ${url}`) }
  }

  async function removeMember(uid) {
    if (!globalThis.confirm('Remove this member from the team?')) return
    setBusy(true); setMsg('')
    try { await api.removeTeamMember(uid); await refreshProfile(); await refreshTeam(); await loadRoster(); setMsg('Member removed.') } catch (e) { setMsg(e.message || 'Could not remove') } finally { setBusy(false) }
  }

  async function leaveTeam() {
    if (!globalThis.confirm('Leave this team? You may need a new invite to rejoin.')) return
    setBusy(true); setMsg('')
    try { await api.leaveTeam(); await refreshProfile(); await reload(); setRoster(null); setMsg('You left the team.') } catch (e) { setMsg(e.message || 'Could not leave') } finally { setBusy(false) }
  }

  const uid = user?.uid
  const isLeader = roster?.leaderId === uid || team?.leaderId === uid
  const membersCount = team?.memberIds?.length ?? roster?.members?.length ?? 0
  const canInviteMore = membersCount < MAX_TEAM_MEMBERS

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="mx-auto max-w-4xl space-y-8">
      {/* Page Header */}
      <motion.div variants={fadeUp}>
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-cyan-500 text-white shadow-lg shadow-brand-500/25">
            <Users className="h-6 w-6" />
          </div>
          <div>
            <h1 className="font-display text-3xl font-extrabold text-ink-900">My Team</h1>
            <p className="text-sm text-ink-500">Max {MAX_TEAM_MEMBERS} members · Collaborate & conquer</p>
          </div>
        </div>
      </motion.div>

      {formationClosed && (
        <motion.div variants={fadeUp}>
          <Card className="border-amber-500/30 bg-amber-500/5">
            <p className="text-sm text-amber-800">Team formation is closed for this phase.</p>
          </Card>
        </motion.div>
      )}

      {msg && (
        <motion.div variants={fadeUp} className="rounded-xl border border-brand-500/20 bg-brand-500/5 px-4 py-3 text-sm text-brand-700">{msg}</motion.div>
      )}

      {/* ━━ No Team: Create / Join ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {!team ? (
        <div className="grid gap-6 md:grid-cols-2">
          <motion.div variants={fadeUp}>
            <Card className="relative overflow-hidden">
              <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-brand-500/10 blur-2xl" />
              <div className="relative">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600">
                  <Sparkles className="h-5 w-5" />
                </div>
                <h2 className="mt-4 font-display text-lg font-bold text-ink-900">Create a Team</h2>
                <p className="mt-1 text-xs text-ink-500">You become the leader with an invite code to share.</p>
                <Input className="mt-4" label="Team name" value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="Team Phoenix" />
                <Button className="mt-4 w-full" disabled={busy || formationClosed} onClick={createTeam}>Create team</Button>
              </div>
            </Card>
          </motion.div>
          <motion.div variants={fadeUp}>
            <Card className="relative overflow-hidden">
              <div className="pointer-events-none absolute -left-8 -bottom-8 h-32 w-32 rounded-full bg-cyan-500/10 blur-2xl" />
              <div className="relative">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-600">
                  <Hash className="h-5 w-5" />
                </div>
                <h2 className="mt-4 font-display text-lg font-bold text-ink-900">Join with Code</h2>
                <p className="mt-1 text-xs text-ink-500">Ask your leader for the six-character invite code.</p>
                <Input className="mt-4" label="Invite code" value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder="AB12CD" />
                <Button variant="secondary" className="mt-4 w-full gap-2" disabled={busy || formationClosed} onClick={joinTeam}>
                  <Hash className="h-4 w-4" /> Join team
                </Button>
              </div>
            </Card>
          </motion.div>
        </div>
      ) : (
        <>
          {/* ━━ Team Header Card ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
          <motion.div variants={fadeUp}>
            <Card className="relative overflow-hidden border-brand-500/10 bg-gradient-to-r from-brand-500/5 to-cyan-500/5">
              <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-brand-500/10 blur-3xl" />
              <div className="relative flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-cyan-500 font-display text-xl font-bold text-white shadow-lg shadow-brand-500/30">
                    {(team.name || 'T').charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h2 className="font-display text-2xl font-extrabold text-ink-900">{team.name}</h2>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-ink-500">
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" /> {membersCount}/{MAX_TEAM_MEMBERS}
                      </span>
                      <span className="flex items-center gap-1 rounded-full bg-brand-500/10 px-2.5 py-0.5 font-mono text-xs font-bold text-brand-700">
                        {roster?.inviteCode || team.inviteCode}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" className="gap-2" disabled={busy || !canInviteMore} onClick={copyInviteLink}>
                    <Copy className="h-3.5 w-3.5" /> Copy Invite
                  </Button>
                  <Button variant="ghost" size="sm" className="gap-2 text-red-600 hover:bg-red-500/5" disabled={busy} onClick={leaveTeam}>
                    <LogOut className="h-3.5 w-3.5" /> Leave
                  </Button>
                </div>
              </div>
              {!canInviteMore && <p className="relative mt-3 text-xs text-amber-700">Team is full — no more invites.</p>}
            </Card>
          </motion.div>

          {/* ━━ Members Grid ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
          <motion.div variants={fadeUp}>
            <h3 className="mb-4 flex items-center gap-2 font-display text-lg font-bold text-ink-900">
              <Shield className="h-5 w-5 text-brand-600" /> Members
            </h3>
            {loading || rosterLoading ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {(roster?.members || []).map((m) => (
                  <Card key={m.uid} className="flex items-center gap-4 py-4">
                    <Avatar name={m.displayName || m.email || m.uid} />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-ink-900 truncate">
                        {m.displayName || 'Participant'}
                        {m.uid === uid && <span className="ml-1.5 text-xs font-normal text-ink-400">(you)</span>}
                      </p>
                      <p className="text-xs text-ink-500 truncate">{m.email || `${m.uid.slice(0, 8)}…`}</p>
                      {team.memberDesignations?.[m.uid] && (
                        <Badge tone="brand" className="mt-1 text-[10px] normal-case">{team.memberDesignations[m.uid]}</Badge>
                      )}
                      {Array.isArray(m.skills) && m.skills.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {m.skills.slice(0, 4).map((s) => (
                            <span key={s} className="rounded-md bg-brand-500/10 px-1.5 py-0.5 text-[10px] font-medium text-brand-700">
                              {s}
                            </span>
                          ))}
                          {m.skills.length > 4 && (
                            <span className="rounded-md bg-[rgb(var(--surface-muted))] px-1.5 py-0.5 text-[10px] text-ink-500">
                              +{m.skills.length - 4}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 self-start">
                      {m.isLeader && (
                        <Badge tone="gradient" className="gap-1"><Crown className="h-3 w-3" /> Leader</Badge>
                      )}
                      <MemberDesignationEdit memberUid={m.uid} currentDesignation={team.memberDesignations?.[m.uid] || ''} isLeader={isLeader} isSelf={m.uid === uid} api={api} onSaved={loadRoster} busy={busy} />
                      {isLeader && m.uid !== uid && (
                        <Button variant="ghost" size="sm" className="text-red-500 hover:bg-red-500/5" disabled={busy || formationClosed || Boolean(team.submissionLocked)} onClick={() => removeMember(m.uid)}>
                          <UserMinus className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </motion.div>

          {/* ━━ Join Requests (leader only, when matchmaking enabled) ━━ */}
          <JoinRequestsCard
            api={api}
            isLeader={isLeader}
            matchmakingEnabled={matchmakingEnabled}
            teamFull={membersCount >= MAX_TEAM_MEMBERS || membersCount >= (eventCfg?.maxTeamSize || 4)}
            onApproved={async () => { await refreshProfile(); await refreshTeam(); await loadRoster() }}
          />

          {/* ━━ Team Profile ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
          <motion.div variants={fadeUp}>
            <TeamProfileCard team={team} isLeader={isLeader} api={api} onSaved={refreshTeam} />
          </motion.div>

          {/* ━━ Activity ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
          <motion.div variants={fadeUp}>
            <Card>
              <h3 className="flex items-center gap-2 font-display text-lg font-bold text-ink-900">
                <Clock className="h-5 w-5 text-ink-400" /> Activity
              </h3>
              <div className="mt-4 space-y-3">
                <div className="flex items-center gap-3 rounded-xl bg-[rgb(var(--surface-muted))]/50 px-4 py-3">
                  <Sparkles className="h-4 w-4 text-brand-500" />
                  <span className="text-sm text-ink-600">Created {team.createdAt ? formatDate(team.createdAt) : '—'}</span>
                </div>
                <div className="flex items-center gap-3 rounded-xl bg-[rgb(var(--surface-muted))]/50 px-4 py-3">
                  <Users className="h-4 w-4 text-emerald-500" />
                  <span className="text-sm text-ink-600">Event registration · {team.eventRegistered ? formatDate(team.eventRegisteredAt) || 'yes' : 'not yet'}</span>
                </div>
                {team.submissionLocked && (
                  <div className="flex items-center gap-3 rounded-xl bg-amber-500/5 px-4 py-3">
                    <Shield className="h-4 w-4 text-amber-600" />
                    <span className="text-sm text-amber-800">Submission locked — roster changes restricted.</span>
                  </div>
                )}
              </div>
            </Card>
          </motion.div>
        </>
      )}
    </motion.div>
  )
}


/** Team Profile Editor */
function TeamProfileCard({ team, isLeader, api, onSaved }) {
  const profile = team?.profile || {}
  const [editing, setEditing] = useState(false)
  const [bio, setBio] = useState(profile.bio || '')
  const [skills, setSkills] = useState((profile.skills || []).join(', '))
  const [github, setGithub] = useState(profile.socialLinks?.github || '')
  const [linkedin, setLinkedin] = useState(profile.socialLinks?.linkedin || '')
  const [website, setWebsite] = useState(profile.socialLinks?.website || '')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  async function save() {
    setSaving(true); setMsg('')
    try {
      await api.updateTeamProfile({
        bio, skills: skills.split(',').map((s) => s.trim()).filter(Boolean),
        socialLinks: { github, linkedin, website },
      })
      setEditing(false); setMsg('Profile saved!'); onSaved?.()
    } catch (e) { setMsg(e.message || 'Save failed') } finally { setSaving(false) }
  }

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-display text-lg font-bold text-ink-900">
          <Globe className="h-5 w-5 text-brand-600" /> Team Profile
        </h3>
        {isLeader && !editing && (
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}><Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit</Button>
        )}
      </div>
      {msg && <p className="mt-2 text-xs text-brand-600">{msg}</p>}
      {editing ? (
        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink-700">Team Bio</label>
            <textarea className="mt-1 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--page-bg))] px-3 py-2 text-sm" rows={3} maxLength={500} placeholder="Tell judges about your team..." value={bio} onChange={(e) => setBio(e.target.value)} />
            <p className="mt-1 text-xs text-ink-400">{bio.length}/500</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-700">Skills / Tech Stack</label>
            <Input className="mt-1" placeholder="React, Python, ML (comma separated)" value={skills} onChange={(e) => setSkills(e.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium text-ink-700"><Github className="h-3.5 w-3.5" /> GitHub</label>
              <Input className="mt-1" placeholder="https://github.com/..." value={github} onChange={(e) => setGithub(e.target.value)} />
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium text-ink-700"><Linkedin className="h-3.5 w-3.5" /> LinkedIn</label>
              <Input className="mt-1" placeholder="https://linkedin.com/..." value={linkedin} onChange={(e) => setLinkedin(e.target.value)} />
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium text-ink-700"><Globe className="h-3.5 w-3.5" /> Website</label>
              <Input className="mt-1" placeholder="https://..." value={website} onChange={(e) => setWebsite(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save Profile'}</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {profile.bio ? (
            <p className="text-sm text-ink-600">{profile.bio}</p>
          ) : (
            <p className="text-sm italic text-ink-400">{isLeader ? 'No bio yet — click Edit.' : 'No team bio set.'}</p>
          )}
          {(profile.skills || []).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {profile.skills.map((s) => (
                <span key={s} className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-brand-500/10 to-cyan-500/10 px-2.5 py-1 text-xs font-medium text-brand-700">
                  <Tag className="h-3 w-3" /> {s}
                </span>
              ))}
            </div>
          )}
          {profile.socialLinks && Object.values(profile.socialLinks).some(Boolean) && (
            <div className="flex flex-wrap gap-3">
              {profile.socialLinks.github && <a href={profile.socialLinks.github} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-ink-600 hover:text-brand-600"><Github className="h-4 w-4" /> GitHub</a>}
              {profile.socialLinks.linkedin && <a href={profile.socialLinks.linkedin} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-ink-600 hover:text-brand-600"><Linkedin className="h-4 w-4" /> LinkedIn</a>}
              {profile.socialLinks.website && <a href={profile.socialLinks.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-ink-600 hover:text-brand-600"><Globe className="h-4 w-4" /> Website</a>}
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

/** Inline member designation editor */
function MemberDesignationEdit({ memberUid, currentDesignation, isLeader, isSelf, api, onSaved, busy }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(currentDesignation)
  const [saving, setSaving] = useState(false)

  if (!isLeader && !isSelf) return null

  if (!editing) {
    return (
      <Button variant="ghost" size="sm" className="text-xs text-ink-400 hover:text-brand-600" disabled={busy} onClick={() => { setValue(currentDesignation); setEditing(true) }} title="Set role">
        <Pencil className="h-3 w-3" />
      </Button>
    )
  }

  async function save() {
    setSaving(true)
    try { await api.updateMemberDesignation(memberUid, value.trim()); setEditing(false); onSaved?.() } catch {} finally { setSaving(false) }
  }

  return (
    <div className="flex items-center gap-1">
      <input className="h-7 w-24 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--page-bg))] px-2 text-xs sm:w-32" placeholder="e.g. Frontend" value={value} onChange={(e) => setValue(e.target.value)} maxLength={60} onKeyDown={(e) => e.key === 'Enter' && save()} autoFocus />
      <button type="button" onClick={save} disabled={saving} className="rounded p-1 text-emerald-600 hover:bg-emerald-500/10"><Check className="h-3.5 w-3.5" /></button>
      <button type="button" onClick={() => setEditing(false)} className="rounded p-1 text-ink-400 hover:bg-ink-200/50"><X className="h-3.5 w-3.5" /></button>
    </div>
  )
}
