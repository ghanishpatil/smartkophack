import { Link } from 'react-router-dom'
import { Mail, MapPin, Phone, Github, Twitter, Linkedin, ExternalLink } from 'lucide-react'
import { APP } from '@/utils/constants.js'

const footerLinks = {
  platform: [
    { to: '/about', label: 'About SKH' },
    { to: '/problems', label: 'Problem Bank' },
    { to: '/timeline', label: 'Event Timeline' },
    { to: '/announcements', label: 'Announcements' },
    { to: '/faq', label: 'FAQ' },
  ],
  resources: [
    { to: '/sponsors', label: 'Partners & Sponsors' },
    { to: '/auth', label: 'Participant Login' },
    { to: '/contact', label: 'Contact Us' },
    { to: '/guidelines', label: 'Submission Guidelines' },
    { to: '/code-of-conduct', label: 'Code of Conduct' },
  ],
}

const socials = [
  { icon: Twitter, href: '#', label: 'Twitter' },
  { icon: Linkedin, href: '#', label: 'LinkedIn' },
  { icon: Github, href: '#', label: 'GitHub' },
]

export function Footer() {
  return (
    <footer className="relative border-t border-[rgb(var(--border))] bg-ink-950">
      {/* Grid pattern overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgb(148 163 184 / 0.4) 1px, transparent 1px), linear-gradient(to bottom, rgb(148 163 184 / 0.4) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      <div className="relative w-full px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-12">
          {/* Brand column */}
          <div className="lg:col-span-4">
            <div className="flex items-center gap-2.5">
              <img src="/logo.png" alt={APP.shortName} className="h-12 w-12 rounded-xl object-contain shadow-md shadow-brand-500/20 ring-1 ring-brand-500/10" />
              <div>
                <p className="font-display text-lg font-bold text-white">{APP.name}</p>
                <p className="text-xs font-medium text-ink-400">{APP.university}</p>
              </div>
            </div>
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-ink-400">
              A national-level innovation platform for {APP.region} — connecting students,
              government departments, industry, mentors, and jury in one secure, scalable ecosystem.
            </p>

            {/* Social links */}
            <div className="mt-6 flex gap-3">
              {socials.map(({ icon: Icon, href, label }) => (
                <a
                  key={label}
                  href={href}
                  aria-label={label}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-ink-800 text-ink-400 transition-all duration-200 hover:border-brand-500/40 hover:text-brand-400 hover:shadow-glow-brand/20"
                >
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>

          {/* Platform links */}
          <div className="lg:col-span-3">
            <p className="font-display text-sm font-semibold uppercase tracking-wider text-ink-300">
              Platform
            </p>
            <ul className="mt-4 space-y-2.5">
              {footerLinks.platform.map(({ to, label }) => (
                <li key={to}>
                  <Link
                    to={to}
                    className="text-sm text-ink-400 transition-colors duration-200 hover:text-brand-400"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Resources links */}
          <div className="lg:col-span-2">
            <p className="font-display text-sm font-semibold uppercase tracking-wider text-ink-300">
              Resources
            </p>
            <ul className="mt-4 space-y-2.5">
              {footerLinks.resources.map(({ to, href, label }) => (
                <li key={label}>
                  {to ? (
                    <Link
                      to={to}
                      className="text-sm text-ink-400 transition-colors duration-200 hover:text-brand-400"
                    >
                      {label}
                    </Link>
                  ) : (
                    <a
                      href={href}
                      className="inline-flex items-center gap-1 text-sm text-ink-400 transition-colors duration-200 hover:text-brand-400"
                    >
                      {label}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Contact column */}
          <div className="lg:col-span-3">
            <p className="font-display text-sm font-semibold uppercase tracking-wider text-ink-300">
              Contact
            </p>
            <ul className="mt-4 space-y-3">
              <li className="flex gap-2.5 text-sm text-ink-400">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
                <span>{APP.venue}</span>
              </li>
              <li className="flex gap-2.5 text-sm text-ink-400">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
                <a className="transition-colors hover:text-brand-400" href={`mailto:${APP.contactEmail}`}>
                  {APP.contactEmail}
                </a>
              </li>
              <li className="flex gap-2.5 text-sm text-ink-400">
                <Phone className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
                <span>{APP.contactPhone}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="relative border-t border-ink-800/60">
        <div className="flex w-full flex-col items-center justify-between gap-3 px-4 py-5 sm:flex-row sm:px-6 lg:px-8">
          <p className="text-xs text-ink-500">
            © {new Date().getFullYear()} {APP.university}. An initiative for national-level innovation.
          </p>
          <div className="flex gap-4 text-xs text-ink-500">
            <a href="#" className="transition-colors hover:text-ink-300">Privacy Policy</a>
            <a href="#" className="transition-colors hover:text-ink-300">Terms of Use</a>
            <a href="#" className="transition-colors hover:text-ink-300">Disclaimer</a>
          </div>
        </div>
      </div>
    </footer>
  )
}
