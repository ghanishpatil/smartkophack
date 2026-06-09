import { motion } from 'framer-motion'
import { SectionHeading } from '@/components/ui/SectionHeading.jsx'

const patrons = [
  {
    id: 1,
    name: "Hon'ble Shri. Nitinrao Shankarrao Kolhe",
    designation: 'Chairman, SRES',
    image: '/chairman.png',
  },
  {
    id: 2,
    name: "Hon'ble Shri. Amit Nitinrao Kolhe",
    designation: 'President, Sanjivani University',
    image: '/president.png',
  },
]

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0.1,
    },
  },
}

const cardVariants = {
  hidden: { opacity: 0, y: 30, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: 'spring',
      stiffness: 100,
      damping: 15,
      duration: 0.6,
    },
  },
}

export function PatronsSection() {
  return (
    <section className="relative border-t border-[rgb(var(--border))] py-20 sm:py-24 lg:py-28">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <SectionHeading
          label="Our Patrons"
          title="Leadership & Vision"
          description="Guided by visionaries who believe in innovation and excellence"
        />

        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-100px' }}
          className="mt-16 grid gap-8 sm:grid-cols-2 lg:gap-12"
        >
          {patrons.map((patron) => (
            <motion.div
              key={patron.id}
              variants={cardVariants}
              whileHover={{ y: -8, transition: { duration: 0.3 } }}
              className="group relative"
            >
              <div className="relative overflow-hidden rounded-3xl border-2 border-brand-500/20 bg-gradient-to-br from-white via-brand-50/30 to-cyan-50/30 p-10 shadow-xl transition-all duration-500 hover:border-brand-500/40 hover:shadow-2xl hover:shadow-brand-500/20">
                {/* Animated gradient overlay on hover */}
                <div className="pointer-events-none absolute inset-0 rounded-3xl bg-gradient-to-br from-brand-500/0 via-cyan-500/0 to-indigo-500/0 opacity-0 transition-all duration-500 group-hover:from-brand-500/10 group-hover:via-cyan-500/5 group-hover:to-indigo-500/10 group-hover:opacity-100" />

                {/* Decorative corner patterns */}
                <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-gradient-to-br from-brand-400/20 to-cyan-400/20 blur-3xl transition-all duration-500 group-hover:scale-150 group-hover:from-brand-500/30 group-hover:to-cyan-500/30" />
                <div className="pointer-events-none absolute -bottom-12 -left-12 h-32 w-32 rounded-full bg-gradient-to-tr from-indigo-400/15 to-violet-400/15 blur-2xl transition-all duration-500 group-hover:scale-125" />

                {/* Decorative lines */}
                <div className="pointer-events-none absolute left-0 top-0 h-px w-24 bg-gradient-to-r from-brand-500/50 to-transparent" />
                <div className="pointer-events-none absolute right-0 top-0 h-24 w-px bg-gradient-to-b from-brand-500/50 to-transparent" />
                <div className="pointer-events-none absolute bottom-0 left-0 h-24 w-px bg-gradient-to-t from-cyan-500/50 to-transparent" />
                <div className="pointer-events-none absolute bottom-0 right-0 h-px w-24 bg-gradient-to-l from-cyan-500/50 to-transparent" />

                <div className="relative flex flex-col items-center text-center">
                  {/* Profile Image with enhanced styling */}
                  <div className="relative mb-8 h-44 w-44 overflow-hidden rounded-full border-4 border-white shadow-2xl ring-4 ring-brand-500/30 transition-all duration-500 group-hover:scale-105 group-hover:ring-8 group-hover:ring-brand-500/40">
                    {/* Inner gradient border */}
                    <div className="absolute inset-0 rounded-full bg-gradient-to-br from-brand-500/30 via-cyan-500/20 to-indigo-500/30" />
                    
                    {/* Image container */}
                    <div className="relative h-full w-full overflow-hidden rounded-full">
                      <img
                        src={patron.image}
                        alt={patron.name}
                        className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
                        onError={(e) => {
                          // Fallback to placeholder if image fails to load
                          e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"%3E%3Cdefs%3E%3ClinearGradient id="grad" x1="0%25" y1="0%25" x2="100%25" y2="100%25"%3E%3Cstop offset="0%25" style="stop-color:%233b82f6;stop-opacity:0.2" /%3E%3Cstop offset="100%25" style="stop-color:%2306b6d4;stop-opacity:0.3" /%3E%3C/linearGradient%3E%3C/defs%3E%3Crect fill="url(%23grad)" width="200" height="200"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" font-family="system-ui" font-size="70" font-weight="600" fill="%233b82f6"%3E' + patron.name.charAt(0) + '%3C/text%3E%3C/svg%3E'
                        }}
                      />
                    </div>

                    {/* Shine effect on hover */}
                    <div className="pointer-events-none absolute inset-0 -translate-x-full rounded-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-1000 group-hover:translate-x-full" />
                  </div>

                  {/* Badge/Label */}
                  <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-brand-500/10 to-cyan-500/10 px-4 py-1.5 ring-1 ring-brand-500/20">
                    <div className="h-2 w-2 animate-pulse rounded-full bg-brand-500" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-brand-700">Patron</span>
                  </div>

                  {/* Name */}
                  <h3 className="font-display text-2xl font-bold tracking-tight text-ink-900 transition-colors duration-300 group-hover:text-brand-700">
                    {patron.name}
                  </h3>

                  {/* Decorative divider */}
                  <div className="my-4 flex items-center gap-3">
                    <div className="h-px w-8 bg-gradient-to-r from-transparent to-brand-500/40" />
                    <div className="h-1.5 w-1.5 rotate-45 bg-brand-500/60" />
                    <div className="h-px w-8 bg-gradient-to-l from-transparent to-brand-500/40" />
                  </div>

                  {/* Designation */}
                  <p className="text-base font-semibold text-ink-600 transition-colors duration-300 group-hover:text-ink-700">
                    {patron.designation}
                  </p>

                  {/* Bottom decorative element */}
                  <div className="mt-6 flex items-center gap-2">
                    <div className="h-1 w-12 rounded-full bg-gradient-to-r from-brand-500/0 via-brand-500/60 to-brand-500/0 transition-all duration-500 group-hover:w-16 group-hover:via-brand-500" />
                    <div className="h-1 w-1 rounded-full bg-cyan-500/60" />
                    <div className="h-1 w-12 rounded-full bg-gradient-to-r from-cyan-500/0 via-cyan-500/60 to-cyan-500/0 transition-all duration-500 group-hover:w-16 group-hover:via-cyan-500" />
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}

