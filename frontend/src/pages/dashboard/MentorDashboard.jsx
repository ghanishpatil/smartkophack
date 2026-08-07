import { useCallback, useEffect, useMemo, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { Calendar, StickyNote, TrendingUp, FileText, Users, Layers } from 'lucide-react'
import { db, isFirebaseConfigured } from '@/firebase/client.js'
import { useAuth } from '@/context/AuthContext.jsx'
import { Card } from '@/components/ui/Card.jsx'
import { Input, Textarea } from '@/components/ui/Input.jsx'
import { Button } from '@/components/ui/Button.jsx'
import { Badge } from '@/components/ui/Badge.jsx'
import { usePageSeo } from '@/hooks/usePageSeo.js'
import { useApi } from '@/hooks/useApi.js'

/* ── TeamCard lifted outside MentorDashboard so React can reconcile it
   properly across renders without recreating the component type. ── */
function TeamCard({ t, problemStatements, notes, session, setNotes, setSession, onSaveNote }) {
  const ps = problemStatements.find((p) => p.id === t.problemStatementId)
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-lg font-semibold text-ink-900">{t.name}</h3>
        <div className="flex flex-wrap gap-2">
          {t._viaDomainTrack && <Badge tone="default">via Domain+Track</Badge>}
          {t._viaProblemStatement && <Badge tone="default">via Problem Statement</Badge>}
          <Badge tone="brand">{t.status || 'active'}</Badge>
        </div>
      </div>
      {ps ? (
        <div className="mt-2 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))]/40 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-ink-700">
              {ps.isOpenInnovation ? 'Open Innovation Problem Statement' : 'Problem Statement'}
            </span>
            <span className="font-mono text-[10px] text-ink-400">{ps.id}</span>
            {ps.isOpenInnovation && <Badge tone="warn">Open Innovation</Badge>}
          </div>
          <p className="mt-1 text-sm font-medium text-ink-900">{ps.title}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {ps.category && <Badge tone="default">{ps.category}</Badge>}
            {ps.theme && <Badge tone="default">{ps.theme}</Badge>}
            {ps.isOpenInnovation && ps.selfDomain && <Badge tone="default">{ps.selfDomain}</Badge>}
          </div>
          {ps.description && (
            <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-ink-600">
              {ps.description}
            </p>
          )}
        </div>
      ) : t.problemStatementId ? (
        <p className="mt-1 text-xs text-ink-400">Problem statement: {t.problemStatementId}</p>
      ) : (
        <p className="mt-1 text-xs text-ink-400">No problem statement selected yet.</p>
      )}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 flex items-center gap-2 text-sm font-medium text-ink-700">
            <Calendar className="h-4 w-4 text-brand-600" />
            Next session
          </label>
          <Input
            placeholder="e.g. Aug 12 · 4:00 PM"
            value={session[t.id] || ''}
            onChange={(e) => setSession((prev) => ({ ...prev, [t.id]: e.target.value }))}
          />
        </div>
        <div>
          <label className="mb-1 flex items-center gap-2 text-sm font-medium text-ink-700">
            <TrendingUp className="h-4 w-4 text-brand-600" />
            Progress pulse
          </label>
          <p className="text-xs text-ink-500">Track milestones — teams see updates in their feed.</p>
        </div>
      </div>
      <div className="mt-4">
        <label className="mb-1 flex items-center gap-2 text-sm font-medium text-ink-700">
          <StickyNote className="h-4 w-4 text-brand-600" />
          Mentor notes
        </label>
        <Textarea
          value={notes[t.id] || ''}
          onChange={(e) => setNotes((prev) => ({ ...prev, [t.id]: e.target.value }))}
          placeholder="Focus areas, risks, and encouragement for the team."
        />
      </div>
      <Button className="mt-4" variant="secondary" onClick={() => onSaveNote(t.id)}>
        Save note
      </Button>
    </Card>
  )
}

export function MentorDashboard() {
  usePageSeo({ title: 'Mentor', description: 'Mentor workspace.' })
  const { user } = useAuth()
  const api = useApi()
  const [teams, setTeams] = useState([])
  const [problemStatements, setProblemStatements] = useState([])
  const [mentorAssignments, setMentorAssignments] = useState([])
  const [notes, setNotes] = useState({})
  const [session, setSession] = useState({})
  const [msg, setMsg] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!db || !isFirebaseConfigured() || !user) return
      try {
        const data = await api.mentorAssignments()
        if (cancelled) return
        const rows = data.teams || []
        setTeams(rows)
        setProblemStatements(data.problemStatements || [])
        setMentorAssignments(data.mentorAssignments || [])

        // Fetch all notes in parallel instead of sequentially
        const noteEntries = await Promise.all(
          rows.map(async (t) => {
            try {
              const mSnap = await getDoc(doc(db, 'mentorNotes', `${user.uid}_${t.id}`))
              if (mSnap.exists()) {
                const d = mSnap.data()
                return { id: t.id, body: d.body || '', nextSession: d.nextSession || '' }
              }
            } catch { /* note not found or permission issue */ }
            return null
          }),
        )
        const n = {}
        const s = {}
        for (const entry of noteEntries) {
          if (entry) { n[entry.id] = entry.body; s[entry.id] = entry.nextSession }
        }
        if (!cancelled) { setNotes(n); setSession(s) }
      } catch (e) {
        if (!cancelled) {
          setTeams([])
          setMsg(e?.message || 'Failed to load assignments.')
          console.error('[MentorDashboard] load error:', e)
        }
      }
    }
    load()
    return () => { cancelled = true }
  }, [user, api])

  const saveNote = useCallback(async (teamId) => {
    setMsg('')
    try {
      await api.mentorNote({ teamId, body: notes[teamId] || '', nextSession: session[teamId] || '' })
      setMsg('Saved.')
      setTimeout(() => setMsg(''), 3000)
    } catch (e) { setMsg(e.message || 'Save failed') }
  }, [api, notes, session])

  // Group teams by assignment source — memoised so it only recomputes when teams change
  const { domainTrackGroups, psMap, directTeams } = useMemo(() => {
    const dtGroups = {}
    const ps = {}
    const direct = []
    for (const t of teams) {
      if (t._viaDomainTrack) {
        const key = `${t._assignedDomain || 'Any'}|${t._assignedTrack || 'Any'}`
        if (!dtGroups[key]) dtGroups[key] = { domain: t._assignedDomain, track: t._assignedTrack, teams: [] }
        dtGroups[key].teams.push(t)
      } else if (t._viaProblemStatement && t.problemStatementId) {
        if (!ps[t.problemStatementId]) ps[t.problemStatementId] = []
        ps[t.problemStatementId].push(t)
      } else {
        direct.push(t)
      }
    }
    return { domainTrackGroups: dtGroups, psMap: ps, directTeams: direct }
  }, [teams])

  const cardProps = { problemStatements, notes, session, setNotes, setSession, onSaveNote: saveNote }

  return (
    <div className="w-full max-w-4xl space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold text-ink-900">Mentor cockpit</h1>
        <p className="mt-2 text-sm text-ink-600">Track team momentum, schedule sessions, and leave structured mentor notes.</p>
      </div>

      {msg ? <p className="rounded-lg bg-brand-500/10 px-4 py-2 text-sm font-medium text-brand-700">{msg}</p> : null}

      {/* My assignments summary */}
      {mentorAssignments.length > 0 && (
        <div className="rounded-xl border border-brand-500/20 bg-brand-500/5 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-700">My domain + track assignments</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {mentorAssignments.map((a, i) => (
              <span key={i} className="rounded-full border border-brand-500/20 bg-white px-2.5 py-1 text-xs font-medium text-brand-700">
                {[a.domain, a.track].filter(Boolean).join(' · ')}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Summary stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="text-center">
          <Users className="mx-auto h-6 w-6 text-brand-600" />
          <p className="mt-2 font-display text-2xl font-bold text-ink-900">{teams.length}</p>
          <p className="text-xs text-ink-500">Total teams</p>
        </Card>
        <Card className="text-center">
          <Layers className="mx-auto h-6 w-6 text-brand-600" />
          <p className="mt-2 font-display text-2xl font-bold text-ink-900">{mentorAssignments.length}</p>
          <p className="text-xs text-ink-500">Domain+Track combos</p>
        </Card>
        <Card className="text-center">
          <StickyNote className="mx-auto h-6 w-6 text-brand-600" />
          <p className="mt-2 font-display text-2xl font-bold text-ink-900">
            {Object.values(notes).filter((n) => n.trim()).length}
          </p>
          <p className="text-xs text-ink-500">Notes written</p>
        </Card>
      </div>

      {teams.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-600">No teams assigned yet. Ask your admin to assign you via domain+track, problem statement, or directly.</p>
        </Card>
      ) : (
        <>
          {/* Domain + Track groups */}
          {Object.keys(domainTrackGroups).length > 0 && (
            <div className="space-y-6">
              <h2 className="flex items-center gap-2 font-display text-xl font-semibold text-ink-900">
                <Layers className="h-5 w-5 text-brand-600" />
                By Domain + Track
              </h2>
              {Object.entries(domainTrackGroups).map(([key, group]) => (
                <div key={key} className="space-y-4">
                  <div className="flex items-center gap-2 rounded-lg bg-brand-500/10 px-4 py-2">
                    <Layers className="h-4 w-4 text-brand-600" />
                    <span className="text-sm font-semibold text-brand-700">
                      {[group.domain, group.track].filter(Boolean).join(' · ')}
                    </span>
                    <Badge tone="brand">{group.teams.length} team{group.teams.length > 1 ? 's' : ''}</Badge>
                  </div>
                  {group.teams.map((t) => <TeamCard key={t.id} t={t} {...cardProps} />)}
                </div>
              ))}
            </div>
          )}

          {/* Problem Statement groups */}
          {Object.keys(psMap).length > 0 && (
            <div className="space-y-6">
              <h2 className="flex items-center gap-2 font-display text-xl font-semibold text-ink-900">
                <FileText className="h-5 w-5 text-brand-600" />
                By Problem Statement
              </h2>
              {Object.entries(psMap).map(([psId, psTeams]) => {
                const ps = problemStatements.find((p) => p.id === psId)
                return (
                  <div key={psId} className="space-y-4">
                    <div className="flex items-center gap-2 rounded-lg bg-brand-500/10 px-4 py-2">
                      <FileText className="h-4 w-4 text-brand-600" />
                      <span className="text-sm font-semibold text-brand-700">{ps?.title || psId}</span>
                      {ps?.category && <Badge tone="default">{ps.category}</Badge>}
                      {ps?.theme && <Badge tone="default">{ps.theme}</Badge>}
                      <Badge tone="brand">{psTeams.length} team{psTeams.length > 1 ? 's' : ''}</Badge>
                    </div>
                    {psTeams.map((t) => <TeamCard key={t.id} t={t} {...cardProps} />)}
                  </div>
                )
              })}
            </div>
          )}

          {/* Directly assigned */}
          {directTeams.length > 0 && (
            <div className="space-y-4">
              <h2 className="flex items-center gap-2 font-display text-xl font-semibold text-ink-900">
                <Users className="h-5 w-5 text-brand-600" />
                Directly Assigned Teams
              </h2>
              {directTeams.map((t) => <TeamCard key={t.id} t={t} {...cardProps} />)}
            </div>
          )}
        </>
      )}
    </div>
  )
}
