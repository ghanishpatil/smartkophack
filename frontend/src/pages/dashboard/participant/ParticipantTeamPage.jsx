import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Clock, Crown, LogOut, Users, Pencil, Github, Linkedin, Globe, Tag, Shield, Sparkles, Mail, Phone, MapPin, GraduationCap, Building2, Info, ArrowRight, Hash, Copy, Check } from 'lucide-react'
import { usePageSeo } from '@/hooks/usePageSeo.js'
import { useParticipantWorkspace } from '@/hooks/useParticipantWorkspace.js'
import { useAuth } from '@/context/AuthContext.jsx'
import { Card } from '@/components/ui/Card.jsx'
import { Button } from '@/components/ui/Button.jsx'
import { Input } from '@/components/ui/Input.jsx'
import { Badge } from '@/components/ui/Badge.jsx'
import { Skeleton } from '@/components/ui/Skeleton.jsx'
import { formatDate } from '@/utils/format.js'

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

export function ParticipantTeamPage() {
  usePageSeo({ title: 'My Team', description: 'Create your team and manage member details.' })
  const { user, refreshProfile } = useAuth()
  const { api, team, loading, refreshTeam, reload, eventCfg } = useParticipantWorkspace()
  const maxTeamSize = eventCfg?.maxTeamSize || 4

  const [teamName, setTeamName] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [roster, setRoster] = useState(null)
  const [rosterLoading, setRosterLoading] = useState(false)
  const [copiedId, setCopiedId] = useState(false)

  async function copyTeamId() {
    const id = team?.inviteCode || roster?.inviteCode
    if (!id) return
    try {
      await navigator.clipboard.writeText(id)
      setCopiedId(true)
      setTimeout(() => setCopiedId(false), 1800)
    } catch { /* clipboard unavailable */ }
  }

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
      setTeamName(''); setMsg('Team created! Next, add your member details on the Registration page.')
    } catch (e) { setMsg(e.message || 'Could not create team') } finally { setBusy(false) }
  }

  async function leaveTeam() {
    if (!globalThis.confirm('Delete this team and all its details? This cannot be undone.')) return
    setBusy(true); setMsg('')
    try { await api.leaveTeam(); await refreshProfile(); await reload(); setRoster(null); setMsg('Team removed.') } catch (e) { setMsg(e.message || 'Could not remove team') } finally { setBusy(false) }
  }

  const uid = user?.uid
  const isLeader = roster?.leaderId === uid || team?.leaderId === uid
  const memberDetails = Array.isArray(roster?.memberDetails) ? roster.memberDetails : []
  const teamSize = roster?.teamSize || team?.teamSize || memberDetails.length
  const detailsComplete = memberDetails.length > 0

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
            <p className="text-sm text-ink-500">1–{maxTeamSize} members · Added by the team leader</p>
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

      {/* ━━ No Team: Create ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {!team ? (
        <motion.div variants={fadeUp}>
          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-brand-500/10 blur-2xl" />
            <div className="relative max-w-lg">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600">
                <Sparkles className="h-5 w-5" />
              </div>
              <h2 className="mt-4 font-display text-lg font-bold text-ink-900">Create Your Team</h2>
              <p className="mt-1 text-sm text-ink-500">
                You are the team leader. After creating your team, add details for every member
                (1 to {maxTeamSize}) on the Registration page.
              </p>
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <p>Use the same team as registered on the <strong>UMS registration portal</strong>.</p>
              </div>
              <Input className="mt-4" label="Team name" value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="Team Phoenix" maxLength={80} />
              <Button className="mt-4 w-full" disabled={busy || formationClosed} onClick={createTeam}>Create team</Button>
            </div>
          </Card>
        </motion.div>
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
                  <div className="min-w-0">
                    <h2 className="font-display text-2xl font-extrabold text-ink-900">{team.name}</h2>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-ink-500">
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" /> {teamSize} member{teamSize === 1 ? '' : 's'}
                      </span>
                    </div>
                    {/* Team ID — used to identify your team (replaces the old join code) */}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                        <Hash className="h-3 w-3" /> Team ID
                      </span>
                      <code className="max-w-full truncate rounded-md border border-[rgb(var(--border))] bg-white px-2 py-1 font-mono text-sm font-bold tracking-wider text-ink-800">
                        {team.inviteCode || roster?.inviteCode || '—'}
                      </code>
                      <button
                        type="button"
                        onClick={copyTeamId}
                        className="inline-flex items-center gap-1 rounded-md border border-[rgb(var(--border))] bg-white px-2 py-1 text-xs font-medium text-brand-600 transition-colors hover:bg-brand-500/5"
                      >
                        {copiedId ? <><Check className="h-3.5 w-3.5" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}
                      </button>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {isLeader && (
                    <Link to="/dashboard/registration">
                      <Button variant="secondary" size="sm" className="gap-2" disabled={busy}>
                        <Pencil className="h-3.5 w-3.5" /> {detailsComplete ? 'Edit Details' : 'Add Details'}
                      </Button>
                    </Link>
                  )}
                  {isLeader && !team.eventRegistered && (
                    <Button variant="ghost" size="sm" className="gap-2 text-red-600 hover:bg-red-500/5" disabled={busy} onClick={leaveTeam}>
                      <LogOut className="h-3.5 w-3.5" /> Delete
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          </motion.div>

          {/* ━━ Members ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
          <motion.div variants={fadeUp}>
            <h3 className="mb-4 flex items-center gap-2 font-display text-lg font-bold text-ink-900">
              <Shield className="h-5 w-5 text-brand-600" /> Members
            </h3>
            {loading || rosterLoading ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {[1, 2].map((i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}
              </div>
            ) : detailsComplete ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {memberDetails.map((m, i) => (
                  <Card key={m.id || i} className="py-4">
                    <div className="flex items-center gap-3">
                      <Avatar name={m.fullName} />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 font-semibold text-ink-900 truncate">
                          {m.fullName || 'Member'}
                          {m.isLeader && <Badge tone="gradient" className="gap-1"><Crown className="h-3 w-3" /> Leader</Badge>}
                        </p>
                        <p className="text-xs text-ink-500">{m.yearOfStudy} · {m.department}</p>
                      </div>
                    </div>
                    <div className="mt-3 space-y-1.5 border-t border-dashed border-[rgb(var(--border))] pt-3 text-xs text-ink-600">
                      <p className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-ink-400" /> <span className="truncate">{m.email}</span></p>
                      <p className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-ink-400" /> {m.phone}</p>
                      <p className="flex items-center gap-2"><Building2 className="h-3.5 w-3.5 text-ink-400" /> <span className="truncate">{m.college}</span></p>
                      <p className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-ink-400" /> <span className="truncate">{m.collegeLocation}</span></p>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="flex flex-col items-start gap-3 py-6">
                <div className="flex items-center gap-2 text-ink-700">
                  <GraduationCap className="h-5 w-5 text-brand-600" />
                  <p className="font-semibold">No member details yet</p>
                </div>
                <p className="text-sm text-ink-500">Add details for every team member to complete your registration.</p>
                {isLeader && (
                  <Link to="/dashboard/registration">
                    <Button size="sm" className="gap-2">Add Member Details <ArrowRight className="h-4 w-4" /></Button>
                  </Link>
                )}
              </Card>
            )}
          </motion.div>

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
                    <span className="text-sm text-amber-800">Submission locked — team changes restricted.</span>
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
