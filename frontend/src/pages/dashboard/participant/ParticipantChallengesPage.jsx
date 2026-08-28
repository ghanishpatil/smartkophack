import { useCallback, useEffect, useState } from 'react'
import { Swords, Timer, Lock, CheckCircle2 } from 'lucide-react'
import { usePageSeo } from '@/hooks/usePageSeo.js'
import { useApi } from '@/hooks/useApi.js'
import { Card } from '@/components/ui/Card.jsx'
import { Badge } from '@/components/ui/Badge.jsx'
import { Skeleton } from '@/components/ui/Skeleton.jsx'

function splitCountdown(targetMs, nowMs) {
  const diff = Math.max(0, Math.floor((targetMs - nowMs) / 1000))
  return {
    total: diff,
    h: Math.floor(diff / 3600),
    m: Math.floor((diff % 3600) / 60),
    s: diff % 60,
  }
}

const pad = (n) => String(n).padStart(2, '0')

export function ParticipantChallengesPage() {
  usePageSeo({ title: 'Challenges', description: 'Live challenge drops.' })
  const api = useApi()

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(() => Date.now())
  const [serverOffset, setServerOffset] = useState(0)

  const load = useCallback(async (spin = false) => {
    if (spin) setLoading(true)
    try {
      const res = await api.getChallenges()
      setData(res)
      if (res?.serverTime) {
        const st = new Date(res.serverTime).getTime()
        if (!Number.isNaN(st)) setServerOffset(st - Date.now())
      }
    } catch {
      /* keep last known state */
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => { void load(true) }, [load])

  // Poll for new drops.
  useEffect(() => {
    const id = setInterval(() => load(false), 20000)
    return () => clearInterval(id)
  }, [load])

  // Live 1s tick.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const effectiveNow = now + serverOffset
  const nextDropMs = data?.nextDropAt ? new Date(data.nextDropAt).getTime() : null

  // When the countdown elapses, refetch so the newly dropped challenge appears.
  useEffect(() => {
    if (nextDropMs && effectiveNow >= nextDropMs) {
      void load(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextDropMs, effectiveNow >= (nextDropMs || Infinity)])

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <Skeleton className="h-10 w-56 rounded-lg" />
        <Skeleton className="h-40 w-full rounded-3xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    )
  }

  const enabled = Boolean(data?.enabled)
  const released = Array.isArray(data?.challenges) ? data.challenges : []
  const total = data?.total ?? released.length
  const releasedCount = data?.releasedCount ?? released.length
  const allDropped = enabled && total > 0 && releasedCount >= total
  const cd = nextDropMs ? splitCountdown(nextDropMs, effectiveNow) : null

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 font-display text-3xl font-bold text-ink-900">
          <Swords className="h-7 w-7 text-brand-600" />
          Challenges
        </h1>
        <p className="mt-2 text-sm text-ink-600">
          New challenges are released live during the finals. Solve each one as it drops — judges score your response.
        </p>
      </div>

      {/* Next drop countdown */}
      {!enabled ? (
        <Card className="flex items-center gap-3 border-ink-200 bg-[rgb(var(--surface-muted))]/40">
          <Timer className="h-5 w-5 text-ink-400" />
          <p className="text-sm text-ink-600">Challenges haven’t started yet. Check back soon.</p>
        </Card>
      ) : allDropped ? (
        <Card className="flex items-center gap-3 border-emerald-500/30 bg-emerald-500/5">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          <p className="text-sm font-medium text-ink-800">All {total} challenges have been released. Good luck!</p>
        </Card>
      ) : cd ? (
        <Card className="border-brand-500/30 bg-gradient-to-br from-brand-500/10 to-cyan-500/5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-brand-600">
                {releasedCount === 0 ? 'First challenge drops in' : 'Next challenge drops in'}
              </p>
              <div className="mt-2 flex items-end gap-2 font-display tabular-nums">
                <TimeBlock value={cd.h} unit="hrs" />
                <span className="pb-4 text-2xl font-bold text-brand-400">:</span>
                <TimeBlock value={cd.m} unit="min" />
                <span className="pb-4 text-2xl font-bold text-brand-400">:</span>
                <TimeBlock value={cd.s} unit="sec" />
              </div>
            </div>
            <div className="text-right">
              <p className="font-display text-3xl font-bold text-ink-900">
                {releasedCount}<span className="text-lg text-ink-400"> / {total}</span>
              </p>
              <p className="text-xs text-ink-500">released</p>
            </div>
          </div>
        </Card>
      ) : null}

      {/* Released challenges */}
      <div className="space-y-3">
        <h2 className="font-display text-lg font-semibold text-ink-900">
          Released challenges {released.length > 0 ? `(${released.length})` : ''}
        </h2>
        {released.length === 0 ? (
          <Card className="flex items-center gap-3">
            <Lock className="h-5 w-5 text-ink-400" />
            <p className="text-sm text-ink-600">
              No challenges released yet. The first one will appear here the moment it drops.
            </p>
          </Card>
        ) : (
          released.map((c, i) => (
            <Card key={c.id} className="p-4">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-500/10 font-mono text-sm font-bold text-brand-700">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display font-semibold text-ink-900">{c.title}</h3>
                    <Badge tone="brand" className="text-[10px]">Live</Badge>
                  </div>
                  {c.description ? (
                    <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-ink-600">{c.description}</p>
                  ) : null}
                  {c.whyUniversal ? (
                    <div className="mt-3 rounded-lg border border-brand-500/20 bg-brand-500/[0.04] p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-600">Why it's universal</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink-600">{c.whyUniversal}</p>
                    </div>
                  ) : null}
                  {c.whatToShow ? (
                    <div className="mt-2 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04] p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-600">What your website/demo must show</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink-600">{c.whatToShow}</p>
                    </div>
                  ) : null}
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}

function TimeBlock({ value, unit }) {
  return (
    <div className="flex flex-col items-center">
      <span className="rounded-xl bg-[rgb(var(--surface))] px-3 py-2 text-3xl font-bold text-ink-900 shadow-sm ring-1 ring-[rgb(var(--border))]">
        {pad(value)}
      </span>
      <span className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-ink-400">{unit}</span>
    </div>
  )
}
