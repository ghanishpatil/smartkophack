import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, X, ArrowRight, Users, FileText, CreditCard, Gavel,
  LayoutDashboard, Megaphone, BarChart3, ShieldCheck, Settings,
  Activity, ScrollText, Layers, Star, Handshake, UserPlus,
  Clock, BookOpen, FileUp, ChevronRight, BadgeCheck,
} from 'lucide-react'
import { useApi } from '@/hooks/useApi.js'

/* ── Static admin nav pages ─────────────────────────────────── */
const PAGES = [
  { label: 'Overview', path: '/admin/overview', icon: LayoutDashboard, group: 'Pages' },
  { label: 'Registrations', path: '/admin/registrations', icon: UserPlus, group: 'Pages' },
  { label: 'Teams', path: '/admin/teams', icon: Users, group: 'Pages' },
  { label: 'Payments', path: '/admin/payments', icon: CreditCard, group: 'Pages' },
  { label: 'Problem Statements', path: '/admin/problems', icon: FileText, group: 'Pages' },
  { label: 'Competition Phases', path: '/admin/phases', icon: Layers, group: 'Pages' },
  { label: 'Submissions', path: '/admin/submissions', icon: FileUp, group: 'Pages' },
  { label: 'Jury Management', path: '/admin/jury', icon: Gavel, group: 'Pages' },
  { label: 'Mentor Management', path: '/admin/mentors', icon: Handshake, group: 'Pages' },
  { label: 'Evaluations', path: '/admin/evaluations', icon: Star, group: 'Pages' },
  { label: 'Shortlisting', path: '/admin/shortlisting', icon: Star, group: 'Pages' },
  { label: 'Certificates', path: '/admin/certificates', icon: BadgeCheck, group: 'Pages' },
  { label: 'Announcements', path: '/admin/announcements', icon: Megaphone, group: 'Pages' },
  { label: 'Timeline', path: '/admin/timeline', icon: Clock, group: 'Pages' },
  { label: 'Reports & Analytics', path: '/admin/reports', icon: BarChart3, group: 'Pages' },
  { label: 'Access Control', path: '/admin/access', icon: ShieldCheck, group: 'Pages' },
  { label: 'Activity Logs', path: '/admin/audit', icon: ScrollText, group: 'Pages' },
  { label: 'Settings', path: '/admin/settings', icon: Settings, group: 'Pages' },
  { label: 'System Health', path: '/admin/health', icon: Activity, group: 'Pages' },
  { label: 'Security', path: '/admin/security', icon: ShieldCheck, group: 'Pages' },
  { label: 'Tutorial / Guide', path: '/admin/tutorial', icon: BookOpen, group: 'Pages' },
]

function highlight(text, query) {
  if (!query) return text
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-brand-200/60 text-brand-900 rounded px-0.5">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  )
}

export function CommandPalette({ open, onClose }) {
  const navigate = useNavigate()
  const api = useApi()
  const [query, setQuery] = useState('')
  const [teams, setTeams] = useState([])
  const [users, setUsers] = useState([])
  const [problems, setProblems] = useState([])
  const [dataLoaded, setDataLoaded] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  // Load data once when palette opens
  useEffect(() => {
    if (!open || dataLoaded) return
    Promise.all([
      api.adminTeams().catch(() => []),
      api.listUsers().catch(() => []),
      api.listProblemStatements().catch(() => []),
    ]).then(([t, u, p]) => {
      setTeams(Array.isArray(t) ? t : [])
      setUsers(Array.isArray(u) ? u : [])
      setProblems(Array.isArray(p) ? p : [])
      setDataLoaded(true)
    })
  }, [open, dataLoaded, api])

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIdx(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // Close on Escape, open on Cmd/Ctrl+K
  useEffect(() => {
    function handler(e) {
      if (e.key === 'Escape') onClose()
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        if (!open) onClose() // toggle handled by parent
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return PAGES.slice(0, 8).map((p) => ({ ...p, type: 'page' }))

    const out = []

    // Pages
    PAGES.forEach((p) => {
      if (p.label.toLowerCase().includes(q)) out.push({ ...p, type: 'page' })
    })

    // Teams
    teams.forEach((t) => {
      if (
        (t.name || '').toLowerCase().includes(q) ||
        (t.code || '').toLowerCase().includes(q) ||
        (t.id || '').toLowerCase().includes(q)
      ) {
        out.push({
          type: 'team',
          label: t.name || 'Unnamed',
          sub: `Code: ${t.code || t.id.slice(0, 6)} · ${t.registrationStatus || t.eventRegistered ? 'Registered' : 'Pending'}`,
          path: '/admin/teams',
          icon: Users,
          group: 'Teams',
          id: t.id,
        })
      }
    })

    // Users
    users.forEach((u) => {
      if (
        (u.displayName || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q)
      ) {
        out.push({
          type: 'user',
          label: u.displayName || u.email || 'User',
          sub: `${u.email} · ${u.role || 'participant'}`,
          path: '/admin/access',
          icon: UserPlus,
          group: 'Users',
          id: u.id,
        })
      }
    })

    // Problem Statements
    problems.forEach((ps) => {
      if (
        (ps.title || '').toLowerCase().includes(q) ||
        (ps.id || '').toLowerCase().includes(q) ||
        (ps.organization || ps.poweredBy || '').toLowerCase().includes(q)
      ) {
        out.push({
          type: 'ps',
          label: ps.title || ps.id,
          sub: `${ps.id} · ${ps.category || ''} · ${ps.theme || ps.domain || ''}`,
          path: '/admin/problems',
          icon: FileText,
          group: 'Problem Statements',
          id: ps.id,
        })
      }
    })

    return out.slice(0, 20)
  }, [query, teams, users, problems])

  // Group results
  const grouped = useMemo(() => {
    const groups = {}
    results.forEach((r) => {
      if (!groups[r.group]) groups[r.group] = []
      groups[r.group].push(r)
    })
    return groups
  }, [results])

  // Flat list for keyboard nav
  const flat = results

  const go = useCallback((item) => {
    navigate(item.path)
    onClose()
  }, [navigate, onClose])

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => Math.min(i + 1, flat.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (flat[activeIdx]) go(flat[activeIdx])
    }
  }

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${activeIdx}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx])

  if (!open) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex items-start justify-center px-4 pt-[10vh]"
        onClick={onClose}
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

        {/* Palette */}
        <motion.div
          initial={{ opacity: 0, y: -16, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -16, scale: 0.97 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Search input */}
          <div className="flex items-center gap-3 border-b border-[rgb(var(--border))] px-4 py-3.5">
            <Search className="h-5 w-5 shrink-0 text-ink-400" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setActiveIdx(0) }}
              onKeyDown={handleKeyDown}
              placeholder="Search pages, teams, users, problem statements…"
              className="flex-1 bg-transparent text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} className="rounded p-1 text-ink-400 hover:text-ink-700">
                <X className="h-4 w-4" />
              </button>
            )}
            <kbd className="rounded border border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))] px-1.5 py-0.5 font-mono text-[10px] text-ink-400">Esc</kbd>
          </div>

          {/* Results */}
          <div ref={listRef} className="max-h-[60vh] overflow-y-auto py-2">
            {flat.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-ink-500">
                No results for <strong>"{query}"</strong>
              </div>
            ) : (
              Object.entries(grouped).map(([group, items]) => (
                <div key={group}>
                  <p className="px-4 pb-1 pt-3 text-[10px] font-bold uppercase tracking-wider text-ink-400">{group}</p>
                  {items.map((item) => {
                    const globalIdx = flat.indexOf(item)
                    const Icon = item.icon || ArrowRight
                    const isActive = globalIdx === activeIdx
                    return (
                      <button
                        key={`${item.type}-${item.id || item.path}-${globalIdx}`}
                        data-idx={globalIdx}
                        type="button"
                        onClick={() => go(item)}
                        onMouseEnter={() => setActiveIdx(globalIdx)}
                        className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                          isActive ? 'bg-brand-500/10' : 'hover:bg-[rgb(var(--surface-muted))]'
                        }`}
                      >
                        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                          isActive ? 'bg-brand-500/15 text-brand-600' : 'bg-[rgb(var(--surface-muted))] text-ink-500'
                        }`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm font-medium ${isActive ? 'text-brand-700' : 'text-ink-900'}`}>
                            {highlight(item.label, query)}
                          </p>
                          {item.sub && (
                            <p className="truncate text-[11px] text-ink-500">{item.sub}</p>
                          )}
                        </div>
                        <ChevronRight className={`h-4 w-4 shrink-0 ${isActive ? 'text-brand-500' : 'text-ink-300'}`} />
                      </button>
                    )
                  })}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))]/40 px-4 py-2">
            <div className="flex items-center gap-3 text-[10px] text-ink-400">
              <span className="flex items-center gap-1"><kbd className="rounded border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-1 py-0.5 font-mono">↑↓</kbd> navigate</span>
              <span className="flex items-center gap-1"><kbd className="rounded border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-1 py-0.5 font-mono">↵</kbd> open</span>
              <span className="flex items-center gap-1"><kbd className="rounded border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-1 py-0.5 font-mono">Esc</kbd> close</span>
            </div>
            <p className="text-[10px] text-ink-400">{flat.length} result{flat.length !== 1 ? 's' : ''}</p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
