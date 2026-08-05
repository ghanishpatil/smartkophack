import { useState } from 'react'
import { motion } from 'framer-motion'
import { Mail, MapPin, Phone, Send, Clock, CheckCircle2, MessageSquare, Headphones } from 'lucide-react'
import { Input, Textarea } from '@/components/ui/Input.jsx'
import { Button } from '@/components/ui/Button.jsx'
import { usePageSeo } from '@/hooks/usePageSeo.js'
import { APP, COORDINATORS } from '@/utils/constants.js'

const contactInfo = [
  { icon: MapPin, label: 'Address', value: APP.venue, accent: 'bg-rose-500/15 text-rose-400' },
  { icon: Mail, label: 'Email', value: APP.contactEmail, href: `mailto:${APP.contactEmail}`, accent: 'bg-brand-500/15 text-brand-400' },
  { icon: Clock, label: 'Office Hours', value: 'Mon–Sat, 9:00 AM – 6:00 PM IST', accent: 'bg-amber-500/15 text-amber-400' },
]

export function ContactPage() {
  usePageSeo({ title: 'Contact', description: `Contact the ${APP.name} organizing team.` })
  const [sent, setSent] = useState(false)

  function onSubmit(e) {
    e.preventDefault()
    setSent(true)
  }

  return (
    <>
      {/* ═══════ HERO BANNER ═══════ */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <img src="/skh-banner.png" alt="Smart Kopargaon Hackathon 2026" className="h-full w-full object-cover" draggable={false} />
          <div className="absolute inset-0 bg-gradient-to-r from-ink-950/85 via-ink-950/65 to-ink-950/85" />
          <div className="absolute inset-0 bg-gradient-to-t from-ink-950/95 via-transparent to-ink-950/40" />
        </div>
        <div className="relative w-full px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400" />
              {APP.shortName} 2026 · Get in Touch
            </div>
            <h1 className="font-display text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl">
              Contact Us
            </h1>
            <p className="mt-3 max-w-2xl text-base text-white/75 sm:text-lg">
              Partnerships, department onboarding, sponsorship decks, and technical
              clarifications — route them here.
            </p>
          </motion.div>
        </div>
      </section>

      {/* ═══════ STATS BAR ═══════ */}
      <section className="relative z-20 w-full -mt-12 px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0A1128] px-6 py-8 shadow-2xl md:px-10">
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-32 left-1/3 h-64 w-64 rounded-full bg-brand-500/10 blur-3xl" />

          <div className="relative z-10 flex flex-col items-center justify-between gap-6 sm:flex-row">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="flex-shrink-0 text-center sm:text-left"
            >
              <h2 className="text-2xl font-black uppercase leading-tight tracking-wide text-[#FF6B00] md:text-3xl">
                Talk To<br />Our Team
              </h2>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="flex items-center gap-8 md:gap-12"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/15">
                  <MessageSquare className="h-6 w-6 text-emerald-400" />
                </div>
                <div className="text-left">
                  <p className="font-display text-lg font-extrabold text-white md:text-xl">24-48 hrs</p>
                  <p className="text-xs font-medium tracking-wide text-white/60">Response Time</p>
                </div>
              </div>
              <div className="h-12 w-px bg-white/15" />
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-500/15">
                  <Mail className="h-6 w-6 text-brand-400" />
                </div>
                <div className="text-left">
                  <p className="font-display text-lg font-extrabold text-white md:text-xl">{APP.contactEmail}</p>
                  <p className="text-xs font-medium tracking-wide text-white/60">Primary Email</p>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ═══════ CONTENT ═══════ */}
      <section className="py-12 sm:py-20">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-5 lg:gap-12">
            {/* Contact info cards */}
            <div className="lg:col-span-2">
              <h2 className="font-display text-lg font-semibold text-ink-900">Reach us directly</h2>
              <p className="mt-2 text-sm text-ink-500">We respond within two working days.</p>
              <div className="mt-6 space-y-3">
                {contactInfo.map((c, i) => (
                  <motion.div
                    key={c.label}
                    initial={{ opacity: 0, x: -12 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.08 }}
                    className="flex gap-4 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${c.accent}`}>
                      <c.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{c.label}</p>
                      {c.href ? (
                        <a href={c.href} className="mt-0.5 text-sm font-medium text-ink-900 hover:text-brand-600">{c.value}</a>
                      ) : (
                        <p className="mt-0.5 text-sm text-ink-700">{c.value}</p>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Student coordinators */}
              <h3 className="mt-8 font-display text-lg font-semibold text-ink-900">Student Coordinators</h3>
              <p className="mt-1 text-sm text-ink-500">Primary points of contact for the hackathon.</p>
              <div className="mt-4 space-y-3">
                {COORDINATORS.coordinators.map((c, i) => (
                  <motion.a
                    key={c.phone}
                    href={`tel:+91${c.phone}`}
                    initial={{ opacity: 0, x: -12 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.08 }}
                    className="flex items-center gap-4 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-500">
                      <Phone className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-ink-900">{c.name}</p>
                      <p className="mt-0.5 text-sm text-ink-600">{c.role} · {c.phone}</p>
                    </div>
                  </motion.a>
                ))}
              </div>

              {/* Student leaders */}
              <h3 className="mt-8 font-display text-lg font-semibold text-ink-900">Student Leaders</h3>
              <p className="mt-1 text-sm text-ink-500">Reach out to our team leaders for quick help.</p>
              <div className="mt-4 space-y-3">
                {COORDINATORS.leaders.map((l, i) => (
                  <motion.a
                    key={l.phone}
                    href={`tel:+91${l.phone}`}
                    initial={{ opacity: 0, x: -12 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.08 }}
                    className="flex items-center gap-4 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-500/15 text-brand-500">
                      <Phone className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-ink-900">{l.name}{l.role ? <span className="ml-1.5 text-xs font-normal text-ink-500">({l.role})</span> : null}</p>
                      <p className="mt-0.5 text-sm text-ink-600">{l.phone}</p>
                    </div>
                  </motion.a>
                ))}
              </div>
            </div>

            {/* Form */}
            <div className="lg:col-span-3">
              <motion.form
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                onSubmit={onSubmit}
                className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6 shadow-card sm:p-8"
              >
                <h3 className="font-display text-lg font-semibold text-ink-900">Send a message</h3>
                <p className="mt-1 text-sm text-ink-500">Fill in the form and we'll get back to you.</p>
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <Input required name="name" label="Name" placeholder="Your full name" />
                  <Input required type="email" name="email" label="Email" placeholder="you@university.edu" />
                </div>
                <div className="mt-4">
                  <Input name="subject" label="Subject" placeholder="What's this about?" />
                </div>
                <div className="mt-4">
                  <Textarea required name="message" label="Message" placeholder="How can we help?" rows={5} />
                </div>
                <Button type="submit" className="mt-6 w-full gap-2">
                  <Send className="h-4 w-4" /> Send message
                </Button>
                {sent ? (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700"
                  >
                    <CheckCircle2 className="h-4 w-4" /> Message sent — in production this routes to your API.
                  </motion.div>
                ) : null}
              </motion.form>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
