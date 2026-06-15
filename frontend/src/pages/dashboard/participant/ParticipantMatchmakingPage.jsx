import { useEffect, useState, useCallback } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, Users, Sparkles, UserPlus, X, Building2, Tag,
  ArrowRight, Info, RefreshCw, UsersRound, Clock, CheckCircle2, Send,
} from 'lucide-react'
import { usePageSeo } from '@/hooks/usePageSeo.js'
import { useApi } from '@/hooks/useApi.js'
import { useAuth } from '@/context/AuthContext.jsx'
import { useEvent } from '@/context/EventContext.jsx'
import { Card } from '@/components/ui/Card.jsx'
import { Button } from '@/components/ui/Button.jsx'
import { Badge } from '@/components/ui/Badge.jsx'
import { Input } from '@/components/ui/Input.jsx'
import { Skeleton } from '@/components/ui/Skeleton.jsx'
import { EmptyState } from '@/components/ui/EmptyState.jsx'
import { Tabs } from '@/components/ui/Tabs.jsx'

const stagger = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } }
const fadeUp = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } } }

/** Deterministic avatar gradient from a string. */
function avatarGradient(seed = '') {
  const palettes = [
    'from-brand-500 to-cyan-500',
    'from-purple-500 to-pink-500',
    'from-emerald-500 to-teal-500',
    'from-amber-500 to-orange-500',
    'from-rose-500 to-red-500',
    'from-indigo-500 to-blue-500',
  ]
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) & 0xffffffff
  return palettes[Math.abs(hash) % palettes.length]
}

function PersonCard({ person }) {
  const initials = (person.displayName || '?').trim()[0]?.toUpperCase() || '?'
  return (
    <motion.div variants={fadeUp}>
      <Card hover className="h-full">
        <div className="flex items-start gap-3">
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${avatarGradient(person.uid)} font-display text-lg font-bold text-white`}>
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-semibold text-ink-900">{person.displayName}</h3>
            {person.institute && (
              <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-ink-500">
                <Building2 className="h-3 w-3 shrink-0" /> {person.institute}
              </p>
            )}
            {person.trackChoice && (
              <Badge tone="info" className="mt-1.5">{person.trackChoice}</Badge>
            )}
          </div>
        </div>

        {person.bio && (
          <p className="mt-3 line-clamp-2 text-sm text-ink-600">{person.bio}</p>
        )}

        {person.skills?.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {person.skills.slice(0, 8).map((s) => (
              <span key={s} className="rounded-lg bg-brand-500/10 px-2 py-0.5 text-xs font-medium text-brand-700">
                {s}
              </span>
            ))}
            {person.skills.length > 8 && (
              <span className="rounded-lg bg-[rgb(var(--surface-muted))] px-2 py-0.5 text-xs text-ink-500">
                +{person.skills.length - 8}
              </span>
            )}
          </div>
        )}
      </Card>
    </motion.div>
  )
}

function TeamCard({ team, onRequest, requestState, inTeam }) {
  const state = requestState // undefined | 'pending' | 'sending'
  return (
    <motion.div variants={fadeUp}>
      <Card hover className="flex h-full flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${avatarGradient(team.teamId)} text-white`}>
              <UsersRound className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="truncate font-semibold text-ink-900">{team.name}</h3>
              <p className="text-xs text-ink-500">{team.memberCount}/{team.maxSize} members</p>
            </div>
          </div>
          <Badge tone={team.spotsLeft <= 1 ? 'warn' : 'success'}>
            {team.spotsLeft} {team.spotsLeft === 1 ? 'spot' : 'spots'} left
          </Badge>
        </div>

        {team.bio && <p className="mt-3 line-clamp-2 text-sm text-ink-600">{team.bio}</p>}

        {team.skills?.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {team.skills.slice(0, 6).map((s) => (
              <span key={s} className="rounded-lg bg-cyan-500/10 px-2 py-0.5 text-xs font-medium text-cyan-700">
                {s}
              </span>
            ))}
          </div>
        )}

        <div className="mt-4 flex-1" />

        {/* Action */}
        {inTeam ? (
          <p className="flex items-center gap-1.5 text-xs text-ink-400">
            <Info className="h-3 w-3" /> You're already on a team.
          </p>
        ) : state === 'pending' ? (
          <Button variant="secondary" size="sm" disabled className="w-full">
            <Clock className="mr-1.5 h-4 w-4" /> Request Sent
          </Button>
        ) : (
          <Button
            size="sm"
            className="w-full"
            loading={state === 'sending'}
            onClick={() => onRequest(team.teamId)}
          >
            <Send className="mr-1.5 h-4 w-4" /> Request to Join
          </Button>
        )}
      </Card>
    </motion.div>
  )
}

export function ParticipantMatchmakingPage() {
  usePageSeo({ title: 'Find Teammates', description: 'Discover teammates and open teams.' })
  const api = useApi()
  const { profile } = useAuth()
  const { eventCfg, eventLoading } = useEvent()
  const inTeam = Boolean(profile?.teamId)

  const [tab, setTab] = useState('people')
  const [search, setSearch] = useState('')
  const [people, setPeople] = useState([])
  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // Map of teamId → 'pending' | 'sending' for the request button state
  const [requestStates, setRequestStates] = useState({})
  const [toast, setToast] = useState('')

  const matchmakingEnabled = Boolean(eventCfg?.matchmakingEnabled)

  const load = useCallback(async (skill = '') => {
    setLoading(true)
    setError('')
    try {
      const [pRes, tRes, myReqs] = await Promise.all([
        api.matchmakingCandidates(skill).catch(() => ({ candidates: [] })),
        api.matchmakingOpenTeams().catch(() => ({ teams: [] })),
        api.matchmakingMyRequests().catch(() => ({ requests: [] })),
      ])
      setPeople(Array.isArray(pRes?.candidates) ? pRes.candidates : [])
      setTeams(Array.isArray(tRes?.teams) ? tRes.teams : [])
      // Pre-mark teams the user already has a pending request for
      const pending = {}
      for (const r of (myReqs?.requests || [])) {
        if (r.status === 'pending') pending[r.teamId] = 'pending'
      }
      setRequestStates(pending)
    } catch (e) {
      setError(e?.message || 'Could not load matchmaking data.')
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    if (matchmakingEnabled) load()
  }, [load, matchmakingEnabled])

  // Debounced skill search (people only)
  useEffect(() => {
    if (!matchmakingEnabled) return
    const t = setTimeout(() => {
      if (tab === 'people') {
        api.matchmakingCandidates(search.trim())
          .then((res) => setPeople(Array.isArray(res?.candidates) ? res.candidates : []))
          .catch(() => {})
      }
    }, 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  async function requestJoin(teamId) {
    setRequestStates((s) => ({ ...s, [teamId]: 'sending' }))
    try {
      await api.matchmakingRequestJoin(teamId, '')
      setRequestStates((s) => ({ ...s, [teamId]: 'pending' }))
      setToast('Request sent! The team leader will review it.')
      setTimeout(() => setToast(''), 4000)
    } catch (e) {
      setRequestStates((s) => { const n = { ...s }; delete n[teamId]; return n })
      setToast(e?.message || 'Could not send request.')
      setTimeout(() => setToast(''), 4000)
    }
  }

  // Route guard: if admin disabled matchmaking, redirect away.
  if (!eventLoading && eventCfg && !matchmakingEnabled) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="mx-auto max-w-5xl space-y-6">
      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="fixed left-1/2 top-6 z-50 -translate-x-1/2 rounded-xl border border-brand-500/30 bg-[rgb(var(--surface))] px-4 py-3 text-sm font-medium text-ink-800 shadow-card-hover"
          >
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" /> {toast}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <motion.div variants={fadeUp} className="relative overflow-hidden rounded-3xl border border-[rgb(var(--border))] bg-gradient-to-br from-brand-500/5 via-[rgb(var(--surface))] to-cyan-500/5 p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-2 text-brand-600">
            <Sparkles className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wide">Matchmaking</span>
          </div>
          <h1 className="mt-2 font-display text-2xl font-bold text-ink-900 sm:text-3xl">Find Your Dream Team</h1>
          <p className="mt-1 max-w-lg text-sm text-ink-500">
            Browse solo participants by skill or discover teams with open spots. Great teams win hackathons.
          </p>
        </div>
      </motion.div>

      {/* In-team notice */}
      {inTeam && (
        <motion.div variants={fadeUp}>
          <Card className="flex items-center justify-between gap-3 border-emerald-500/20 bg-emerald-500/5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-ink-900">You're already on a team</p>
                <p className="text-xs text-ink-500">Browse for fun, or invite teammates using your team's invite code.</p>
              </div>
            </div>
            <Link to="/dashboard/team"><Button variant="secondary" size="sm">My Team</Button></Link>
          </Card>
        </motion.div>
      )}

      {/* Tabs + refresh */}
      <motion.div variants={fadeUp} className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          tabs={[
            { id: 'people', label: 'Solo Participants', icon: UserPlus, count: people.length || null },
            { id: 'teams', label: 'Open Teams', icon: UsersRound, count: teams.length || null },
          ]}
          activeTab={tab}
          onChange={setTab}
          variant="pill"
        />
        <Button variant="ghost" size="sm" onClick={() => load(search.trim())}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Refresh
        </Button>
      </motion.div>

      {/* People tab */}
      {tab === 'people' && (
        <>
          <motion.div variants={fadeUp}>
            <Input
              icon={Search}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by skill — e.g. React, ML, Figma…"
            />
          </motion.div>

          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-44 rounded-2xl" />)}
            </div>
          ) : error ? (
            <EmptyState preset="error" description={error} />
          ) : people.length === 0 ? (
            <EmptyState
              preset="no-results"
              icon={UserPlus}
              title={search ? 'No one matches that skill' : 'No solo participants yet'}
              description={search ? 'Try a different skill or clear the filter.' : 'Check back soon — or set yourself as "looking for a team" in Settings so others can find you.'}
            />
          ) : (
            <motion.div variants={stagger} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <AnimatePresence>
                {people.map((p) => <PersonCard key={p.uid} person={p} />)}
              </AnimatePresence>
            </motion.div>
          )}
        </>
      )}

      {/* Teams tab */}
      {tab === 'teams' && (
        <>
          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-44 rounded-2xl" />)}
            </div>
          ) : teams.length === 0 ? (
            <EmptyState
              preset="no-data"
              icon={UsersRound}
              title="No open teams right now"
              description="All teams are full or none have spots yet. Try the Solo Participants tab to build your own team."
            />
          ) : (
            <motion.div variants={stagger} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {teams.map((t) => (
                <TeamCard
                  key={t.teamId}
                  team={t}
                  onRequest={requestJoin}
                  requestState={requestStates[t.teamId]}
                  inTeam={inTeam}
                />
              ))}
            </motion.div>
          )}
        </>
      )}
    </motion.div>
  )
}
