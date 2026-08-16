import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Trophy } from 'lucide-react'
import { usePageSeo } from '@/hooks/usePageSeo.js'
import { Skeleton } from '@/components/ui/Skeleton.jsx'
import { APP } from '@/utils/constants.js'

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000'

export function ResultsPage() {
  usePageSeo({ title: 'Results', description: 'Hackathon results — selected teams.' })
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${API}/api/results`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ published: false, teams: [] }))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="px-4 py-16 sm:px-6 lg:px-8"><Skeleton className="h-96 w-full rounded-2xl" /></div>

  const published = data?.published
  const teams = data?.teams || []

  return (
    <>
      {/* ═══════ HERO BANNER ═══════ */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <img src="/skh-banner.png" alt="Smart Kopargaon Hackathon 2026" className="h-full w-full object-cover" draggable={false} />
          <div className="absolute inset-0 bg-gradient-to-r from-ink-950/85 via-ink-950/65 to-ink-950/85" />
          <div className="absolute inset-0 bg-gradient-to-t from-ink-950/95 via-transparent to-ink-950/40" />
        </div>
        <div className="relative w-full px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400" />
              {APP.shortName || 'SKH'} 2026 · Final Standings
            </div>
            <h1 className="font-display text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl">
              Results
            </h1>
            <p className="mt-3 max-w-2xl text-base text-white/75 sm:text-lg">
              {published
                ? 'Congratulations to all the teams who participated and made it to the final selections.'
                : 'Results will be published here once the evaluation phase is complete.'
              }
            </p>
          </motion.div>
        </div>
      </section>

      {/* ═══════ CONTENT ═══════ */}
      <section className="w-full px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        {!published ? (
          <div className="mx-auto flex max-w-lg flex-col items-center justify-center py-20 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-ink-100">
              <Trophy className="h-10 w-10 text-ink-300" />
            </div>
            <h2 className="mt-6 font-display text-2xl font-bold text-ink-900">Results Not Yet Published</h2>
            <p className="mt-3 text-sm text-ink-500">
              The organizing team is still evaluating submissions. Check back soon —
              results will appear here once the jury completes scoring.
            </p>
          </div>
        ) : teams.length === 0 ? (
          <div className="mx-auto flex max-w-lg flex-col items-center justify-center py-20 text-center">
            <Trophy className="mb-4 h-10 w-10 text-ink-300" />
            <p className="text-sm text-ink-500">No teams to display yet.</p>
          </div>
        ) : (
          <div className="mx-auto max-w-4xl">
            <div className="mb-6 text-center">
              <h2 className="font-display text-2xl font-bold text-ink-900 sm:text-3xl">Qualified Teams</h2>
              <p className="mt-2 text-sm text-ink-500">{teams.length} team{teams.length === 1 ? '' : 's'} qualified by the jury panel</p>
            </div>

            {/* Clean table — qualified teams only, no scores */}
            <div className="overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] shadow-sm">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))]/60">
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-ink-500">Sr.</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-ink-500">Team Name</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-ink-500">Domain / Track</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-ink-500">College</th>
                  </tr>
                </thead>
                <tbody>
                  {teams.map((team, i) => (
                    <tr
                      key={team.teamId}
                      className="border-b border-[rgb(var(--border))]/40 last:border-b-0 transition-colors hover:bg-[rgb(var(--surface-muted))]/30"
                    >
                      <td className="px-6 py-4 text-sm text-ink-400 font-medium">{i + 1}</td>
                      <td className="px-6 py-4 text-sm font-semibold text-ink-900">{team.teamName}</td>
                      <td className="px-6 py-4 text-sm text-ink-600">
                        {[team.domain, team.track].filter(Boolean).join(' · ') || '—'}
                      </td>
                      <td className="px-6 py-4 text-sm text-ink-600">{team.college || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </>
  )
}
