import * as Icons from 'lucide-react'
import { motion } from 'framer-motion'
import { TRACKS } from '@/utils/constants.js'
import { Marquee } from '@/components/ui/Marquee.jsx'

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

export function TracksSection() {
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

      <div className="relative w-full">
        {/* Heading */}
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.95 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="mb-12 px-4 text-center sm:px-6 lg:px-8"
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

        {/* Continuous Scrolling Carousel */}
        <motion.div
          initial={{ opacity: 0, y: 60, scale: 0.9 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          className="relative"
        >
          <Marquee className="[--duration:30s]">
            {TRACKS.map((track, idx) => {
              const cfg = domainConfig[idx]
              return <DomainCard key={track.id} track={track} config={cfg} />
            })}
          </Marquee>
          
          {/* Gradient overlays */}
          <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[#0A1128] to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-[#0A1128] to-transparent" />
        </motion.div>
      </div>
    </section>
  )
}

function DomainCard({ track, config }) {
  const Icon = Icons[track.icon] || Icons.Circle
  
  return (
    <div className="mx-4 w-80 shrink-0">
      <div
        className={`group relative flex h-full flex-col items-center overflow-hidden rounded-3xl border bg-gradient-to-br p-8 text-center backdrop-blur-md transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl ${config.cardBg} ${config.border}`}
      >
        {/* Animated top accent bar */}
        <div className={`absolute left-0 right-0 top-0 h-1 ${config.accentBar}`}>
          <div className={`h-full w-0 ${config.accentBar} opacity-50 transition-all duration-500 group-hover:w-full`} />
        </div>
        
        {/* Multiple corner glows for depth */}
        <div className={`pointer-events-none absolute -right-6 -top-6 h-32 w-32 rounded-full blur-3xl opacity-10 transition-opacity duration-500 group-hover:opacity-30 ${config.accentBar}`} />
        <div className={`pointer-events-none absolute -left-6 -bottom-6 h-24 w-24 rounded-full blur-2xl opacity-10 ${config.accentBar}`} />

        {/* Icon with glass effect */}
        <div className={`relative mb-6 flex h-24 w-24 items-center justify-center rounded-2xl ${config.iconBg} shadow-lg ring-1 ring-white/10 backdrop-blur-sm transition-all duration-300 group-hover:scale-110 group-hover:rotate-3`}>
          <Icon className={`h-12 w-12 ${config.iconColor} transition-transform duration-300 group-hover:scale-110`} />
          {/* Subtle shine effect */}
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/10 to-transparent" />
        </div>

        {/* Title with better spacing */}
        <h3 className={`mb-3 font-display text-base font-bold uppercase tracking-wider ${config.titleColor}`}>
          {track.title}
        </h3>
        
        {/* Decorative divider */}
        <div className="relative mb-4 h-px w-16 overflow-hidden rounded-full bg-white/10">
          <div className={`absolute h-full w-8 ${config.accentBar} opacity-60 transition-all duration-500 group-hover:w-full`} />
        </div>
        
        {/* Description with better readability */}
        <p className="text-sm leading-relaxed text-white/70">
          {track.description}
        </p>
        
        {/* Bottom fade for polish */}
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-black/20 to-transparent" />
      </div>
    </div>
  )
}
