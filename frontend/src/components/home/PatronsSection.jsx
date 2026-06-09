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
    designation: "President's Desk",
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
              whileHover={{ y: -4 }}
              className="group relative"
            >
              <div className="relative overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-white shadow-lg transition-shadow duration-300 hover:shadow-xl">
                {/* Image Container */}
                <div className="relative aspect-[4/3] overflow-hidden bg-gradient-to-br from-slate-50 to-slate-100">
                  <img
                    src={patron.image}
                    alt={patron.name}
                    className="h-full w-full object-cover object-center transition-transform duration-300 group-hover:scale-105"
                    onError={(e) => {
                      e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"%3E%3Crect fill="%23f1f5f9" width="400" height="300"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" font-family="system-ui" font-size="80" font-weight="600" fill="%2394a3b8"%3E' + patron.name.charAt(0) + '%3C/text%3E%3C/svg%3E'
                    }}
                  />
                  {/* Subtle gradient overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent" />
                </div>

                {/* Content */}
                <div className="p-6">
                  <div className="mb-2 inline-block rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
                    PATRON
                  </div>
                  
                  <h3 className="mt-2 font-display text-xl font-bold text-ink-900">
                    {patron.name}
                  </h3>
                  
                  <p className="mt-2 text-sm font-medium text-ink-600">
                    {patron.designation}
                  </p>

                  {/* Bottom accent */}
                  <div className="mt-4 h-1 w-12 rounded-full bg-brand-500" />
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}

