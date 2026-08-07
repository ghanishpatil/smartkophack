import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Landmark, Users, Building2, Clock, ChevronLeft, ChevronRight, Newspaper } from 'lucide-react'
import { STATS } from '@/utils/constants.js'
import { AnimatedCounter } from '@/components/ui/AnimatedCounter.jsx'
import { useInView } from '@/hooks/useInView.js'
import { publicApi } from '@/services/api.js'

const icons = [Landmark, Users, Building2, Clock]

const cardVariants = {
  hidden: { opacity: 0, y: 40, scale: 0.9, filter: 'blur(8px)' },
  visible: (i) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    filter: 'blur(0px)',
    transition: { delay: i * 0.12, duration: 0.7, ease: [0.16, 1, 0.3, 1] },
  }),
}

/* Slide animation presets (admin-selectable). */
const SLIDE_VARIANTS = {
  fade: { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } },
  slide: { initial: { opacity: 0, x: '100%' }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: '-100%' } },
  zoom: { initial: { opacity: 0, scale: 1.06 }, animate: { opacity: 1, scale: 1 }, exit: { opacity: 0, scale: 0.97 } },
  flip: { initial: { opacity: 0, rotateY: 35 }, animate: { opacity: 1, rotateY: 0 }, exit: { opacity: 0, rotateY: -35 } },
}

function StatCard({ s, i, visible }) {
  const Icon = icons[i] || Landmark
  const numericPart = s.value.replace(/[^\d]/g, '')
  const suffix = s.value.replace(/[\d]/g, '')
  return (
    <motion.div
      custom={i}
      variants={cardVariants}
      initial="hidden"
      animate={visible ? 'visible' : 'hidden'}
      className="group relative overflow-hidden rounded-2xl border-[3px] border-ink-900 bg-white/55 p-6 text-center shadow-[6px_6px_0_0_rgb(15_23_42)] backdrop-blur-xl transition-transform duration-200 hover:translate-x-1 hover:translate-y-1 hover:shadow-[3px_3px_0_0_rgb(15_23_42)]"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent" />
      <div className="pointer-events-none absolute -right-4 -top-4 h-20 w-20 rounded-full bg-brand-500/10 blur-2xl transition-all group-hover:bg-brand-500/20" />
      <div className="relative">
        <motion.div
          className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl border-2 border-ink-900 bg-brand-500/15 text-brand-600"
          whileHover={{ rotate: [0, -10, 10, 0], transition: { duration: 0.5 } }}
        >
          <Icon className="h-5 w-5" />
        </motion.div>
        <div className="font-display text-3xl font-bold text-ink-900 sm:text-4xl">
          <AnimatedCounter value={parseInt(numericPart, 10) || 0} suffix={suffix} duration={2} />
        </div>
        <p className="mt-1.5 text-sm font-medium text-ink-500">{s.label}</p>
      </div>
    </motion.div>
  )
}

/* Latest News — admin-managed banner slideshow (landscape 16:9, whole banner shown). */
function LatestNews({ banners, settings }) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const animation = SLIDE_VARIANTS[settings?.animation] ? settings.animation : 'fade'
  const variant = SLIDE_VARIANTS[animation]
  const count = banners.length
  const intervalMs = Math.max(2000, Math.min(20000, settings?.intervalMs || 5000))

  useEffect(() => {
    if (paused || count <= 1) return
    const id = setInterval(() => setIndex((i) => (i + 1) % count), intervalMs)
    return () => clearInterval(id)
  }, [paused, count, intervalMs])

  useEffect(() => { if (index >= count) setIndex(0) }, [count, index])

  const go = (dir) => setIndex((i) => (i + dir + count) % count)
  const current = banners[index]
  if (!current) return null

  const Media = (
    <img
      src={current.imageUrl}
      alt={current.caption || 'Latest news banner'}
      className="h-full w-full object-contain"
      draggable={false}
    />
  )

  return (
    <div
      className="relative h-full w-full"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Landscape stage — fills the column height to align with the stats block.
          object-contain keeps the whole banner visible, never cropped/resized. */}
      <div
        className="relative h-full min-h-[220px] w-full overflow-hidden rounded-2xl border-[3px] border-ink-900 bg-gray-900 shadow-[6px_6px_0_0_rgb(15_23_42)]"
        style={{ perspective: 1200 }}
      >
        {/* Latest News label overlay (doesn't affect vertical alignment) */}
        <div className="absolute bottom-3 right-3 z-10 flex items-center gap-2 rounded-lg bg-white/90 px-2.5 py-1 shadow-sm backdrop-blur-sm">
          <Newspaper className="h-3.5 w-3.5 text-brand-600" />
          <span className="font-display text-xs font-bold text-ink-900">Latest News</span>
        </div>

        <AnimatePresence initial={false}>
          <motion.div
            key={index}
            className="absolute inset-0"
            initial={variant.initial}
            animate={variant.animate}
            exit={variant.exit}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          >
            {current.link ? (
              <a href={current.link} target="_blank" rel="noopener noreferrer" className="block h-full w-full">
                {Media}
              </a>
            ) : Media}
          </motion.div>
        </AnimatePresence>

        {current.caption ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4">
            <p className="text-sm font-medium text-white drop-shadow">{current.caption}</p>
          </div>
        ) : null}

        {count > 1 ? (
          <>
            {/* Prev / Next controls — bottom-left */}
            <div className="absolute bottom-3 left-3 z-10 flex items-center gap-2">
              <button
                type="button" onClick={() => go(-1)} aria-label="Previous"
                className="rounded-full bg-black/40 p-2 text-white backdrop-blur-sm transition hover:bg-black/60 focus:outline-none focus:ring-2 focus:ring-white/70"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button" onClick={() => go(1)} aria-label="Next"
                className="rounded-full bg-black/40 p-2 text-white backdrop-blur-sm transition hover:bg-black/60 focus:outline-none focus:ring-2 focus:ring-white/70"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
            {/* Dots — bottom-center */}
            <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
              {banners.map((b, i) => (
                <button
                  key={b.id || i} type="button" onClick={() => setIndex(i)} aria-label={`Go to banner ${i + 1}`}
                  className={`h-2 rounded-full transition-all ${i === index ? 'w-6 bg-white' : 'w-2 bg-white/50 hover:bg-white/80'}`}
                />
              ))}
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}

export function StatsSection() {
  const [ref, visible] = useInView({ rootMargin: '-15% 0px' })
  const [news, setNews] = useState({ banners: [], settings: { enabled: false } })

  useEffect(() => {
    let cancelled = false
    publicApi.getHeroBanners()
      .then((res) => {
        if (cancelled || !res) return
        const banners = (Array.isArray(res.banners) ? res.banners : []).filter((b) => b?.active !== false && b?.imageUrl)
        setNews({ banners, settings: res.settings || { enabled: false } })
      })
      .catch(() => { /* no news — stats-only layout */ })
    return () => { cancelled = true }
  }, [])

  const showNews = Boolean(news.settings?.enabled) && news.banners.length > 0

  return (
    <section ref={ref} className="relative overflow-hidden border-b border-[rgb(var(--border))] py-16 sm:py-20">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-brand-500/[0.03] via-transparent to-cyan-500/[0.03]" />

      {showNews ? (
        // Screenshot layout: stats (2×2) on the left, Latest News slideshow on the right.
        <div className="relative mx-auto grid w-full max-w-7xl items-stretch gap-8 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
          <LatestNews banners={news.banners} settings={news.settings} />
          <div className="grid gap-6 sm:grid-cols-2">
            {STATS.map((s, i) => <StatCard key={s.label} s={s} i={i} visible={visible} />)}
          </div>
        </div>
      ) : (
        // No banners — original full-width stats row.
        <div className="relative grid w-full gap-6 px-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-8">
          {STATS.map((s, i) => <StatCard key={s.label} s={s} i={i} visible={visible} />)}
        </div>
      )}
    </section>
  )
}
