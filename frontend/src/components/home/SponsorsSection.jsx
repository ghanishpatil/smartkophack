import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Building2 } from 'lucide-react'
import { SectionHeading } from '@/components/ui/SectionHeading.jsx'
import { Marquee } from '@/components/ui/Marquee.jsx'

export function SponsorsSection() {
  const [sponsors, setSponsors] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const API_BASE = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || 'http://localhost:4000'
    fetch(`${API_BASE}/api/sponsors`)
      .then(res => res.json())
      .then(data => {
        setSponsors(Array.isArray(data) ? data : [])
        setLoading(false)
      })
      .catch(err => {
        console.error('Failed to load sponsors:', err)
        setLoading(false)
      })
  }, [])

  if (loading) {
    return (
      <section className="border-t border-[rgb(var(--border))] py-20 sm:py-28">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Partners"
            title="Sponsors & institutional partners"
            description="A shared stage for public departments, industry bodies, and innovation programs."
          />
          <div className="mt-12 flex justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500/30 border-t-brand-500" />
          </div>
        </div>
      </section>
    )
  }

  if (sponsors.length === 0) {
    return (
      <section className="border-t border-[rgb(var(--border))] py-20 sm:py-28">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Partners"
            title="Sponsors & institutional partners"
            description="A shared stage for public departments, industry bodies, and innovation programs."
          />
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {/* Fallback static sponsors */}
            {[
              { name: 'District Administration', label: 'HOST' },
              { name: 'Industry Consortium', label: 'PLATINUM' },
              { name: 'Innovation Council', label: 'GOLD' },
              { name: 'Startup Hub Nashik', label: 'SILVER' },
            ].map((s) => (
              <div
                key={s.name}
                className="group relative overflow-hidden rounded-2xl border border-brand-500/20 bg-gradient-to-br from-brand-500/5 to-cyan-500/5 p-6 text-center shadow-card transition-all duration-300 hover:border-brand-500/30 hover:shadow-card-hover"
              >
                <div className="absolute -right-4 -top-4 h-16 w-16 rounded-full bg-white/10 blur-2xl transition-all group-hover:bg-white/20" />
                <div className="relative">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-white/40 shadow-sm">
                    <Building2 className="h-6 w-6 text-ink-400" />
                  </div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-600">
                    {s.label}
                  </p>
                  <p className="mt-2 font-display text-sm font-semibold text-ink-900">
                    {s.name}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    )
  }

  // Split sponsors into two rows for seamless infinite scroll
  const firstRow = sponsors.slice(0, Math.ceil(sponsors.length / 2))
  const secondRow = sponsors.slice(Math.ceil(sponsors.length / 2))

  return (
    <section className="relative border-t border-[rgb(var(--border))] py-20 sm:py-28">
      <div className="w-full">
        <div className="px-4 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Partners"
            title="Sponsors & institutional partners"
            description="A shared stage for public departments, industry bodies, and innovation programs."
          />
        </div>

        {/* First carousel row */}
        <div className="relative mt-12">
          <Marquee pauseOnHover className="[--duration:40s]">
            {firstRow.map((sponsor) => (
              <SponsorCard key={sponsor.id} sponsor={sponsor} />
            ))}
          </Marquee>
          <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-[rgb(var(--page-bg))] to-transparent sm:w-32" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-[rgb(var(--page-bg))] to-transparent sm:w-32" />
        </div>

        {/* Second carousel row (reverse direction) */}
        {secondRow.length > 0 && (
          <div className="relative mt-6">
            <Marquee reverse pauseOnHover className="[--duration:40s]">
              {secondRow.map((sponsor) => (
                <SponsorCard key={sponsor.id} sponsor={sponsor} />
              ))}
            </Marquee>
            <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-[rgb(var(--page-bg))] to-transparent sm:w-32" />
            <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-[rgb(var(--page-bg))] to-transparent sm:w-32" />
          </div>
        )}
      </div>
    </section>
  )
}

function SponsorCard({ sponsor }) {
  return (
    <motion.div
      whileHover={{ scale: 1.05 }}
      className="group mx-4 flex w-40 flex-col items-center"
    >
      {/* Logo */}
      <div className="flex h-24 w-full items-center justify-center p-2">
        <img
          src={sponsor.logoUrl}
          alt={sponsor.name}
          className="h-full w-full object-contain grayscale transition-all duration-300 group-hover:grayscale-0"
          onError={(e) => {
            e.target.style.display = 'none'
            e.target.parentElement.innerHTML = `<div class="flex h-full w-full items-center justify-center"><svg class="h-8 w-8 text-ink-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg></div>`
          }}
        />
      </div>

      {/* Optional label */}
      {sponsor.label && (
        <p className="mt-2 text-[10px] font-medium uppercase tracking-wider text-ink-400">
          {sponsor.label}
        </p>
      )}
    </motion.div>
  )
}
