import { motion } from 'framer-motion'
import { Landmark, Users, Building2, Clock } from 'lucide-react'
import { STATS } from '@/utils/constants.js'
import { AnimatedCounter } from '@/components/ui/AnimatedCounter.jsx'
import { useInView } from '@/hooks/useInView.js'

const icons = [Landmark, Users, Building2, Clock]

const cardVariants = {
  hidden: { opacity: 0, y: 40, scale: 0.9, filter: 'blur(8px)' },
  visible: (i) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    filter: 'blur(0px)',
    transition: {
      delay: i * 0.12,
      duration: 0.7,
      ease: [0.16, 1, 0.3, 1],
    },
  }),
}

export function StatsSection() {
  const [ref, visible] = useInView({ rootMargin: '-15% 0px' })
  return (
    <section ref={ref} className="relative overflow-hidden border-b border-[rgb(var(--border))] py-16 sm:py-20">
      {/* Subtle background gradient */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-brand-500/[0.03] via-transparent to-cyan-500/[0.03]" />

      <div className="relative w-full grid gap-6 px-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-8">
        {STATS.map((s, i) => {
          const Icon = icons[i] || Landmark
          const numericPart = s.value.replace(/[^\d]/g, '')
          const suffix = s.value.replace(/[\d]/g, '')

          return (
            <motion.div
              key={s.label}
              custom={i}
              variants={cardVariants}
              initial="hidden"
              animate={visible ? 'visible' : 'hidden'}
              className="group relative overflow-hidden rounded-2xl border-[3px] border-ink-900 bg-white/55 p-6 text-center shadow-[6px_6px_0_0_rgb(15_23_42)] backdrop-blur-xl transition-transform duration-200 hover:translate-x-1 hover:translate-y-1 hover:shadow-[3px_3px_0_0_rgb(15_23_42)]"
            >
              {/* Glossy top highlight for the glass feel */}
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
                  <AnimatedCounter
                    value={parseInt(numericPart, 10) || 0}
                    suffix={suffix}
                    duration={2}
                  />
                </div>
                <p className="mt-1.5 text-sm font-medium text-ink-500">{s.label}</p>
              </div>
            </motion.div>
          )
        })}
      </div>
    </section>
  )
}
