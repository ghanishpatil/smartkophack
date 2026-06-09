import { motion } from 'framer-motion'
import { SectionHeading } from '@/components/ui/SectionHeading.jsx'

const patrons = [
  {
    id: 1,
    name: 'Patron Name 1',
    designation: 'Designation / Position',
    image: '/patron-1.jpg',
  },
  {
    id: 2,
    name: 'Patron Name 2',
    designation: 'Designation / Position',
    image: '/patron-2.jpg',
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
              <div className="relative overflow-hidden rounded-3xl border border-[rgb(var(--border))] bg-gradient-to-br from-[rgb(var(--surface))] to-[rgb(var(--surface-muted))]/30 p-8 shadow-lg transition-all duration-300 hover:shadow-xl hover:shadow-brand-500/10">
                {/* Gradient overlay on hover */}
                <div className="pointer-events-none absolute inset-0 rounded-3xl bg-gradient-to-br from-brand-500/0 to-cyan-500/0 opacity-0 transition-opacity duration-300 group-hover:from-brand-500/5 group-hover:to-cyan-500/5 group-hover:opacity-100" />

                {/* Decorative blob */}
                <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-brand-500/10 blur-3xl transition-all duration-300 group-hover:bg-brand-500/20" />

                <div className="relative flex flex-col items-center text-center">
                  {/* Profile Image */}
                  <div className="relative mb-6 h-40 w-40 overflow-hidden rounded-full border-4 border-[rgb(var(--surface))] shadow-xl ring-4 ring-brand-500/20 transition-all duration-300 group-hover:ring-brand-500/40">
                    <div className="absolute inset-0 bg-gradient-to-br from-brand-500/20 to-cyan-500/20" />
                    <img
                      src={patron.image}
                      alt={patron.name}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                      onError={(e) => {
                        // Fallback to placeholder if image fails to load
                        e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"%3E%3Crect fill="%23f1f5f9" width="200" height="200"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="60" fill="%2394a3b8"%3E' + patron.name.charAt(0) + '%3C/text%3E%3C/svg%3E'
                      }}
                    />
                  </div>

                  {/* Name */}
                  <h3 className="font-display text-2xl font-bold tracking-tight text-ink-900 transition-colors duration-300 group-hover:text-brand-700">
                    {patron.name}
                  </h3>

                  {/* Designation */}
                  <p className="mt-3 text-base font-medium text-ink-600 transition-colors duration-300 group-hover:text-ink-700">
                    {patron.designation}
                  </p>

                  {/* Decorative underline */}
                  <div className="mt-4 h-1 w-16 rounded-full bg-gradient-to-r from-brand-500 to-cyan-500 opacity-0 transition-all duration-300 group-hover:w-24 group-hover:opacity-100" />
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}

