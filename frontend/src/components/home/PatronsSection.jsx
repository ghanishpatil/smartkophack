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

const coPatrons = [
  {
    id: 1,
    name: 'Dr. AjayKumar G. Thakur',
    designation: 'Vice-Chancellor, Sanjivani University',
    image: '/vice-chancellor.jpg',
  },
  {
    id: 2,
    name: 'Prof. Amol A. Dhakane',
    designation: 'Registrar, Sanjivani University',
    image: '/registrar.jpg',
  },
]

const deans = [
  {
    id: 1,
    name: 'Dr. Kavitha Rani Paramasivan',
    designation: 'Dean, School of Engineering and Technology',
    image: '/dean-set.jpeg',
  },
  {
    id: 2,
    name: 'Dr. R. Priya',
    designation: 'Dean, School of Commerce and Management',
    image: '/dean-scm.jpg',
  },
  {
    id: 3,
    name: 'Dr. Samadhan B. Dahikar',
    designation: 'Dean, School of Sciences',
    image: '/dean-sciences.jpeg',
  },
  {
    id: 4,
    name: 'Dr. Sarita Pawar',
    designation: 'Dean of SPS',
    image: '/dean-pharma.jpeg',
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

function LeaderCard({ person, badge, accent = 'brand' }) {
  const accentBg = {
    brand: 'bg-brand-500',
    cyan: 'bg-cyan-500',
    navy: 'bg-navy-600',
  }[accent]

  return (
    <motion.div variants={cardVariants} className="group relative h-full">
      {/* Solid offset backing block — the brutalist "hard shadow" */}
      <div
        className={`pointer-events-none absolute inset-0 translate-x-2 translate-y-2 ${accentBg} transition-transform duration-200 group-hover:translate-x-1 group-hover:translate-y-1`}
        aria-hidden
      />

      <div className="relative flex h-full flex-col border-[3px] border-ink-900 bg-white transition-transform duration-200 group-hover:translate-x-1 group-hover:translate-y-1">
        {/* Image block */}
        <div className="relative aspect-square w-full overflow-hidden border-b-[3px] border-ink-900 bg-ink-100">
          <img
            src={person.image}
            alt={person.name}
            className="h-full w-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
            onError={(e) => {
              e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300"%3E%3Crect fill="%23e2e8f0" width="300" height="300"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" font-family="system-ui" font-size="120" font-weight="700" fill="%230f172a"%3E' + person.name.charAt(0) + '%3C/text%3E%3C/svg%3E'
            }}
          />

          {/* Badge — solid block, top-left */}
          <span className={`absolute left-0 top-0 border-b-[3px] border-r-[3px] border-ink-900 ${accentBg} px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-white`}>
            {badge}
          </span>
        </div>

        {/* Details */}
        <div className="flex flex-1 flex-col justify-between p-4">
          <h3 className="font-display text-lg font-bold leading-tight tracking-tight text-ink-900">
            {person.name}
          </h3>

          <p className="mt-3 border-t-2 border-dashed border-ink-200 pt-3 font-mono text-xs font-semibold uppercase tracking-wide text-ink-500">
            {person.designation}
          </p>
        </div>
      </div>
    </motion.div>
  )
}

function LeaderGrid({ people, badge, accent, className }) {
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-100px' }}
      className={className}
    >
      {people.map((person) => (
        <LeaderCard key={person.id} person={person} badge={badge} accent={accent} />
      ))}
    </motion.div>
  )
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

        <LeaderGrid
          people={patrons}
          badge="Patron"
          accent="brand"
          className="mx-auto mt-16 grid max-w-3xl gap-10 sm:grid-cols-2"
        />

        {/* ── Co-Patrons ── */}
        {coPatrons.length > 0 && (
          <div className="mt-20 sm:mt-24">
            <SectionHeading
              label="Our Co-Patrons"
              title="Guiding Leadership"
              description="Steering the vision with dedication and expertise"
            />
            <LeaderGrid
              people={coPatrons}
              badge="Co-Patron"
              accent="cyan"
              className="mx-auto mt-16 grid max-w-3xl gap-10 sm:grid-cols-2"
            />
          </div>
        )}

        {/* ── Deans ── */}
        {deans.length > 0 && (
          <div className="mt-20 sm:mt-24">
            <SectionHeading
              label="Our Deans"
              title="Academic Leadership"
              description="The academic minds shaping innovation and excellence"
            />
            <LeaderGrid
              people={deans}
              badge="Dean"
              accent="navy"
              className="mt-16 grid gap-10 sm:grid-cols-2 lg:grid-cols-4"
            />
          </div>
        )}
      </div>
    </section>
  )
}
