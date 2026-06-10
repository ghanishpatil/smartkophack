import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/Button.jsx'
import { APP } from '@/utils/constants.js'

/* ── Subtle animated network nodes ─────────────────────────── */
const NODES = [
  { x: '8%',  y: '18%', size: 5,  delay: 0 },
  { x: '18%', y: '72%', size: 4,  delay: 0.6 },
  { x: '28%', y: '38%', size: 6,  delay: 1.1 },
  { x: '72%', y: '22%', size: 4,  delay: 0.3 },
  { x: '82%', y: '65%', size: 5,  delay: 0.9 },
  { x: '90%', y: '40%', size: 3,  delay: 1.5 },
  { x: '55%', y: '80%', size: 4,  delay: 0.7 },
  { x: '42%', y: '15%', size: 3,  delay: 1.2 },
]

function NetworkNodes() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {NODES.map((n, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full bg-brand-400/30"
          style={{ left: n.x, top: n.y, width: n.size * 2, height: n.size * 2 }}
          animate={{ scale: [1, 1.6, 1], opacity: [0.3, 0.7, 0.3] }}
          transition={{ duration: 3 + i * 0.4, repeat: Infinity, delay: n.delay, ease: 'easeInOut' }}
        />
      ))}
    </div>
  )
}

export function Hero() {
  return (
    <section className="relative w-full overflow-hidden border-b border-gray-200" style={{ aspectRatio: '16/9' }}>
      {/* ── Background image — 1920×1080 banner, fills 16:9 frame edge to edge ── */}
      <div className="absolute inset-0">
        <img
          src="/smartkpg15.png"
          alt=""
          className="h-full w-full object-cover object-center"
          draggable={false}
        />
        {/* Minimal gradient only on left side for text contrast, logos remain fully visible */}
        <div className="absolute inset-0 bg-gradient-to-r from-white/20 via-transparent via-30% to-transparent" />
      </div>

      {/* ── Ambient depth glow ── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -left-32 top-0 h-96 w-96 rounded-full bg-brand-400/10 blur-[120px]" />
        <div className="absolute right-0 top-1/4 h-80 w-80 rounded-full bg-brand-300/8 blur-[100px]" />
      </div>

      {/* ── Animated network nodes ── */}
      <NetworkNodes />

      {/* ── Hero content ── */}
      {/*
        Height strategy:
        - min-h: enough to fill most of the viewport without being 16:9 locked
        - content is positioned slightly ABOVE center (pb > pt) for premium SaaS feel
        - on mobile: compact, headline visible immediately
      */}
      <div className="relative z-10 flex h-full w-full flex-col items-center justify-start px-6 pb-16 pt-[10%] sm:px-10 lg:px-16">

        {/* Two-column layout: text left, logo right */}
        <div className="flex w-full max-w-7xl items-center gap-8 lg:gap-16">

          {/* ── Left: headline + sub + CTAs ── */}
          <div className="min-w-0 flex-1 text-center lg:text-left">
            <motion.h1
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.65, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
              className="font-display text-[clamp(2rem,5vw,4rem)] font-extrabold leading-[1.1] tracking-tight text-gray-900"
            >
              Innovate for{' '}
              <span className="bg-gradient-to-r from-brand-600 to-brand-500 bg-clip-text text-transparent">
                Kopargaon
              </span>
              <br />
              <span className="text-gray-700">at national-grade scale.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
              className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-gray-600 sm:text-base md:text-lg lg:mx-0"
            >
              Smart Kopargaon Hackathon is an innovation movement that brings together students, government, 
              MSMEs, mentors, and industry experts to co-create impactful solutions for real civic and industrial 
              challenges through a dynamic, scalable, and future-ready platform.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="mt-6 flex w-full flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-4 lg:justify-start"
            >
              <Link to="/auth" className="w-full sm:w-auto">
                <Button size="lg" className="w-full gap-2 shadow-glow-brand sm:w-auto">
                  Register your team
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link to="/problems" className="w-full sm:w-auto">
                <Button
                  size="lg"
                  variant="secondary"
                  className="w-full gap-2 border-gray-300 bg-white/80 text-gray-700 backdrop-blur-sm hover:border-gray-400 hover:bg-white sm:w-auto"
                >
                  Browse problem statements
                </Button>
              </Link>
            </motion.div>

            {/* Trust strip */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.5 }}
              className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 lg:justify-start"
            >
              {['Government-backed', 'Industry-partnered', 'University-hosted'].map((tag) => (
                <span key={tag} className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
                  {tag}
                </span>
              ))}
            </motion.div>
          </div>

          {/* ── Right: floating logo ── */}
          <motion.div
            initial={{ opacity: 0, scale: 0.82, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.85, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="hidden shrink-0 md:block"
          >
            {/* Glow ring behind mascot */}
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-brand-400/15 blur-3xl scale-110" />
              <motion.img
                src="/skh3d.png"
                alt="Smart Kopargaon Hackathon Mascot"
                className="relative h-44 w-44 drop-shadow-2xl md:h-52 md:w-52 lg:h-64 lg:w-64 xl:h-72 xl:w-72"
                animate={{ y: [0, -14, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                draggable={false}
              />
            </div>
          </motion.div>
        </div>

        {/* Scroll cue */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2, duration: 0.6 }}
          className="absolute bottom-5 left-1/2 -translate-x-1/2"
        >
          <motion.div
            animate={{ y: [0, 6, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
            className="flex flex-col items-center gap-1"
          >
            <span className="text-[10px] font-medium uppercase tracking-widest text-gray-400">Scroll</span>
            <ChevronDown className="h-4 w-4 text-gray-400" />
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}
