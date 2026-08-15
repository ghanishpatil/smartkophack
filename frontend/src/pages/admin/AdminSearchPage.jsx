import { useState } from 'react'
import { Search, Users, Crown, Mail, Phone, Building2, GraduationCap, Layers, ShieldCheck, UserCircle } from 'lucide-react'
import { usePageSeo } from '@/hooks/usePageSeo.js'
import { useApi } from '@/hooks/useApi.js'
import { Card } from '@/components/ui/Card.jsx'
import { Badge } from '@/components/ui/Badge.jsx'
import { Button } from '@/components/ui/Button.jsx'
import { Skeleton } from '@/components/ui/Skeleton.jsx'

const REG_TONE = { registered: 'success', pending: 'warn', blocked: 'danger', rejected: 'danger' }
const JURY_TONE = { qualified: 'success', waitlist: 'warn', not_qualified: 'danger' }
const JURY_LABEL = { qualified: 'Qualified', waitlist: 'Waitlist', not_qualified: 'Not Qualified' }

export function AdminSearchPage() {
  usePageSeo({ title: 'Search Pro', description: 'Search any participant, leader, judge or mentor.' })
  const api = useApi()
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState(null)

  async function runSearch(e) {
    e?.preventDefault?.()
    const term = q.trim()
    if (term.length < 2) {
      setError('Enter at least 2 characters.')
      return
    }
    setError('')
    setLoading(true)
    try {
      const res = await api.adminSearch(term)
      setData(res)
    } catch (err) {
      setError(err?.message || 'Search failed.')
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  const results = Array.isArray(data?.results) ? data.results : []

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 font-display text-3xl font-bold text-ink-900">
          <Search className="h-7 w-7 text-brand-600" /> Search Pro
        </h1>
        <p className="mt-2 text-sm text-ink-600">
          Search <strong>any person</strong> by name, email or phone — including team members who don&rsquo;t have an
          account (only leaders sign in). Matches show the person&rsquo;s full team details and roster.
        </p>
      </div>

      <Card>
        <form onSubmit={runSearch} className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name, email, or phone…"
              className="w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-2.5 pl-9 pr-3 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </div>
          <Button type="submit" className="gap-1.5" disabled={loading}>
            <Search className="h-4 w-4" /> {loading ? 'Searching…' : 'Search'}
          </Button>
        </form>
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        {data && !loading ? (
          <p className="mt-3 text-xs text-ink-500">
            {results.length === 0 ? 'No matches found.' : `${data.count} match${data.count === 1 ? '' : 'es'} for “${data.query}”.`}
          </p>
        ) : null}
      </Card>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-52 w-full rounded-2xl" />)}
        </div>
      ) : (
        <div className="space-y-5">
          {results.map((r, i) => (
            <ResultCard key={`${r.match.email}-${r.match.teamId}-${i}`} match={r.match} team={r.team} />
          ))}
        </div>
      )}
    </div>
  )
}

function ResultCard({ match, team }) {
  const isLeader = match.isLeader || (team && team.leaderId && match.uid && team.leaderId === match.uid)
  return (
    <Card className="space-y-4">
      {/* Matched person */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[rgb(var(--border))] pb-4">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-600">
            {isLeader ? <Crown className="h-5 w-5" /> : match.source === 'user' ? <ShieldCheck className="h-5 w-5" /> : <UserCircle className="h-5 w-5" />}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-lg font-bold text-ink-900">{match.name || '(no name)'}</h2>
              {isLeader ? <Badge tone="brand" className="text-[10px]">Team Leader</Badge> : null}
              {match.source === 'user' && match.role && match.role !== 'participant'
                ? <Badge tone="neutral" className="text-[10px] capitalize">{match.role}</Badge>
                : null}
              {match.source === 'member' && !isLeader ? <Badge tone="neutral" className="text-[10px]">Team Member</Badge> : null}
            </div>
            <div className="mt-1 flex flex-col gap-0.5 text-sm text-ink-600">
              {match.email ? <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-ink-400" /> {match.email}</span> : null}
              {match.phone ? <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 text-ink-400" /> {match.phone}</span> : null}
              {match.college ? <span className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5 text-ink-400" /> {match.college}{match.collegeLocation ? `, ${match.collegeLocation}` : ''}</span> : null}
              {(match.department || match.yearOfStudy) ? (
                <span className="flex items-center gap-1.5"><GraduationCap className="h-3.5 w-3.5 text-ink-400" /> {[match.department, match.yearOfStudy].filter(Boolean).join(' · ')}</span>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Team details */}
      {team ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-ink-400" />
              <h3 className="font-display text-base font-semibold text-ink-900">{team.name || 'Unnamed team'}</h3>
              {team.inviteCode ? <span className="font-mono text-[11px] text-ink-400">#{team.inviteCode}</span> : null}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {team.registrationStatus ? (
                <Badge tone={REG_TONE[team.registrationStatus] || 'neutral'} className="text-[10px] capitalize">{team.registrationStatus}</Badge>
              ) : null}
              {team.paymentStatus ? <Badge tone="neutral" className="text-[10px] capitalize">Pay: {team.paymentStatus}</Badge> : null}
              <Badge tone={team.submissionLocked ? 'success' : 'neutral'} className="text-[10px]">
                {team.submissionLocked ? 'Submission Locked' : 'Not Finalized'}
              </Badge>
              {team.shortlisted ? <Badge tone="brand" className="text-[10px]">Shortlisted</Badge> : null}
              {team.juryStatus ? <Badge tone={JURY_TONE[team.juryStatus] || 'neutral'} className="text-[10px]">{JURY_LABEL[team.juryStatus] || team.juryStatus}</Badge> : null}
            </div>
          </div>

          {team.problemStatementTitle ? (
            <p className="flex items-start gap-1.5 text-sm text-ink-700">
              <Layers className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" />
              <span><span className="font-medium">Problem:</span> {team.problemStatementTitle}
                {team.problemStatementId ? <span className="ml-1 font-mono text-[11px] text-ink-400">({team.problemStatementId})</span> : null}
              </span>
            </p>
          ) : null}

          {/* Roster */}
          <div className="overflow-x-auto rounded-xl border border-[rgb(var(--border))]">
            <table className="w-full text-left text-sm">
              <thead className="bg-[rgb(var(--surface-muted))] text-xs uppercase tracking-wide text-ink-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Member</th>
                  <th className="px-3 py-2 font-medium">Contact</th>
                  <th className="px-3 py-2 font-medium">College</th>
                  <th className="px-3 py-2 font-medium">Dept / Year</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgb(var(--border))]">
                {(team.members || []).map((m, idx) => {
                  const highlight = m.email && match.email && m.email.toLowerCase() === match.email.toLowerCase()
                  return (
                    <tr key={idx} className={highlight ? 'bg-brand-500/5' : ''}>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5 font-medium text-ink-900">
                          {m.isLeader ? <Crown className="h-3 w-3 text-amber-500" /> : null}
                          {m.name || '—'}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-ink-600">
                        <div className="flex flex-col gap-0.5 text-xs">
                          {m.email ? <span className="break-all">{m.email}</span> : null}
                          {m.phone ? <span>{m.phone}</span> : null}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs text-ink-600">
                        <div className="flex items-center gap-1"><Building2 className="h-3 w-3 text-ink-400" /> {m.college || '—'}</div>
                        {m.collegeLocation ? <div className="text-ink-400">{m.collegeLocation}</div> : null}
                      </td>
                      <td className="px-3 py-2 text-xs text-ink-600">
                        <div className="flex items-center gap-1"><GraduationCap className="h-3 w-3 text-ink-400" /> {m.department || '—'}</div>
                        {m.yearOfStudy ? <div className="text-ink-400">{m.yearOfStudy}</div> : null}
                      </td>
                    </tr>
                  )
                })}
                {(team.members || []).length === 0 ? (
                  <tr><td colSpan={4} className="px-3 py-4 text-center text-ink-400">No member details recorded for this team.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <p className="text-sm text-ink-500">This person is not linked to any team.</p>
      )}
    </Card>
  )
}
