import { useEffect, useRef, useState, useCallback } from 'react'
import * as Icons from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { TRACKS } from '@/utils/constants.js'

const domainConfig = [
  { iconBg: 'bg-rose-500/20',    iconColor: 'text-rose-400',    cardBg: 'from-rose-500/10 to-rose-500/5',    border: 'border-rose-500/30',    titleColor: 'text-rose-300',    accentBar: 'bg-rose-500'    },
  { iconBg: 'bg-violet-500/20',  iconColor: 'text-violet-400',  cardBg: 'from-violet-500/10 to-violet-500/5',  border: 'border-violet-500/30',  titleColor: 'text-violet-300',  accentBar: 'bg-violet-500'  },
  { iconBg: 'bg-cyan-500/20',    iconColor: 'text-cyan-400',    cardBg: 'from-cyan-500/10 to-cyan-500/5',    border: 'border-cyan-500/30',    titleColor: 'text-cyan-300',    accentBar: 'bg-cyan-500'    },
  { iconBg: 'bg-orange-500/20',  iconColor: 'text-orange-400',  cardBg: 'from-orange-500/10 to-orange-500/5',  border: 'border-orange-500/30',  titleColor: 'text-orange-300',  accentBar: 'bg-orange-500'  },
  { iconBg: 'bg-emerald-500/20', iconColor: 'text-emerald-400', cardBg: 'from-emerald-500/10 to-emerald-500/5', border: 'border-emerald-500/30', titleColor: 'text-emerald-300', accentBar: 'bg-emerald-500' },
  { iconBg: 'bg-lime-500/20',    iconColor: 'text-lime-400',    cardBg: 'from-lime-500/10 to-lime-500/5',    border: 'border-lime-500/30',    titleColor: 'text-lime-300',    accentBar: 'bg-lime-500'    },
  { iconBg: 'bg-indigo-500/20',  iconColor: 'text-indigo-400',  cardBg: 'from-indigo-500/10 to-indigo-500/5',  border: 'border-indigo-500/30',  titleColor: 'text-indigo-300',  accentBar: 'bg-indigo-500'  },
  { iconBg: 'bg-amber-500/20',   iconColor: 'text-amber-400',   cardBg: 'from-amber-500/10 to-amber-500/5',   border: 'border-amber-500/30',   titleColor: 'text-amber-300',   accentBar: 'bg-amber-500'   },
]

const VISIBLE = 3
const AUTO_MS = 3500

export function TracksSection() {
  const [current, setCurrent] = useState(0)
  const [direction, setDirection] = useState(1)
  const [progress, setProgress] = useState(0)
  const timerRef = useRef(null)
  const progressRef = useRef(null)
  const total = TRACKS.length

  const go = useCallback((dir) => {
    setDirection(dir)
    setCurrent((c) => (c + dir + total) % total)
    setProgress(0)
  }, [total])

  useEffect(() => {
    setProgress(0)
    const startTime = Date.now()
    progressRef.current = setInterval(() => {
      setProgress(Math.min(((Date.now() - startTime) / AUTO_MS) * 100, 100))
    }, 30)
    timerRef.current = setTimeout(() => go(1), AUTO_MS)
    return () => { clearTimeout(timerRef.current); clearInterval(progressRef.current) }
  }, [current, go])

  const pause = () => { clearTimeout(timerRef.current); clearInterval(progressRef.current) }
  const resume = () => {
    setProgress(0)
    const startTime = Date.now()
    progressRef.current = setInterval(() => {
      setProgress(Math.min(((Date.now() - startTime) / AUTO_MS) * 100, 100))
    }, 30)
    timerRef.current = setTimeout(() => go(1), AUTO_MS)
  }

  const visibleIndices = Array.from({ length: VISIBLE }, (_, i) => (current + i) % total)

  const slideVariants = {
    enter: (dir) => ({ opacity: 0, x: dir > 0 ? 80 : -80, scale: 0.95 }),
    center: { opacity: 1, x: 0, scale: 1, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
    exit:  (dir) => ({ opacity: 0, x: dir > 0 ? -80 : 80, scale: 0.95, transition: { duration: 0.4 } }),
  }

  return (
    <section className="relative overflow-hidden py-20 sm:py-28">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0A1128] via-[#0d1b3e] to-[#0A1128]" />
      <div className="pointer-events-none absolute inset-0 opacity-20" style={{
        backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.08) 1px, transparent 0)',
        backgroundSize: '32px 32px',
      }} />
      <div className="pointer-events-none absolute -left-32 top-1/2 h-96 w-96 -translate-y-1/2 rounded-full bg-brand-500/10 blur-[100px]" />
      <div className="pointer-events-none absolute -right-32 top-1/2 h-96 w-96 -translate-y-1/2 rounded-full bg-cyan-500/10 blur-[100px]" />

      <div className="relative w-full px-4 sm:px-6 lg:px-8">

        {/* Heading — slides up when scrolled into view */}
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.95 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="mb-12 text-center"
        >
          <span className="inline-block rounded-full border border-brand-500/30 bg-brand-500/10 px-4 py-1 text-xs font-bold uppercase tracking-[0.2em] text-brand-300">
            Innovation Domains
          </span>
          <h2 className="mt-4 font-display text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl">
            Domains of Impact
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-white/60 sm:text-base">
            No problem is too big… No idea is too small
          </p>
        </motion.div>

        {/* Carousel — zooms in from below when scrolled into view */}
        <motion.div
          initial={{ opacity: 0, y: 60, scale: 0.9 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
        >
          <div
            className="relative px-12"
            onMouseEnter={pause}
            onMouseLeave={resume}
          >
            {/* overflow-visible so hover scale is never clipped */}
            <div className="py-6" style={{ overflow: 'visible' }}>
              <AnimatePresence mode="popLayout" custom={direction}>
                <motion.div
                  key={current}
                  custom={direction}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
                >
                  {visibleIndices.map((idx) => {
                    const track = TRACKS[idx]
                    const cfg = domainConfig[idx]
                    const Icon = Icons[track.icon] || Icons.Circle
                    return (
                      <motion.div
                        key={track.id}
                        whileHover={{ y: -8, scale: 1.03 }}
                        transition={{ duration: 0.3, ease: 'easeOut' }}
                        style={{ overflow: 'visible' }}
                        className={`group relative flex flex-col items-center rounded-3xl border bg-gradient-to-br p-8 text-center backdrop-blur-sm transition-shadow duration-300 hover:shadow-2xl ${cfg.cardBg} ${cfg.border}`}
                      >
                        {/* Top accent bar */}
                        <div className={`absolute left-0 right-0 top-0 h-1 rounded-t-3xl ${cfg.accentBar}`} />
                        {/* Corner glow */}
                        <div className={`pointer-events-none absolute -right-4 -top-4 h-24 w-24 rounded-full blur-2xl opacity-20 ${cfg.accentBar}`} />

                        {/* Icon */}
                        <div className={`relative flex h-20 w-20 items-center justify-center rounded-full ${cfg.iconBg} ring-2 ring-white/10 shadow-xl`}>
                          <Icon className={`h-10 w-10 ${cfg.iconColor}`} />
                        </div>

                        <h3 className={`mt-4 font-display text-sm font-bold uppercase tracking-widest ${cfg.titleColor}`}>
                          {track.title}
                        </h3>
                        <div className={`mt-2 h-px w-10 opacity-40 ${cfg.accentBar}`} />
                        <p className="mt-2 text-xs leading-relaxed text-white/60">
                          {track.description}
                        </p>
                      </motion.div>
                    )
                  })}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Arrows */}
            <button type="button" onClick={() => go(-1)}
              className="absolute left-0 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white backdrop-blur-sm transition-all hover:border-brand-500/50 hover:bg-brand-500/20"
              aria-label="Previous">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button type="button" onClick={() => go(1)}
              className="absolute right-0 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white backdrop-blur-sm transition-all hover:border-brand-500/50 hover:bg-brand-500/20"
              aria-label="Next">
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </motion.div>

        {/* Progress bar + dots */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4 }}
          className="mt-8 flex flex-col items-center gap-3"
        >
          <div className="h-0.5 w-48 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-brand-400 transition-none" style={{ width: `${progress}%` }} />
          </div>
          <div className="flex items-center gap-2">
            {TRACKS.map((_, i) => (
              <button key={i} type="button"
                onClick={() => { setDirection(i > current ? 1 : -1); setCurrent(i) }}
                className={`rounded-full transition-all duration-300 ${i === current ? 'h-2 w-6 bg-brand-400' : 'h-2 w-2 bg-white/20 hover:bg-white/40'}`}
                aria-label={`Domain ${i + 1}`}
              />
            ))}
          </div>
        </motion.div>

      </div>
    </section>
  )
}
