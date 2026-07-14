import { useEffect, useMemo, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
} from '@tanstack/react-table'
import {
  Search, Layers, BookOpen, X, ChevronRight, Users as UsersIcon,
  ArrowUpDown, ArrowUp, ArrowDown, ChevronDown, Copy, Check, Star,
  Filter, ExternalLink, Clock, AlertCircle, TrendingUp, Flame, ChevronLeft,
  HeartPulse, GraduationCap, Bus, Utensils, Recycle, Sprout, Factory, Lightbulb, Tag,
  Download, FileText,
} from 'lucide-react'
import { Skeleton } from '@/components/ui/Skeleton.jsx'
import { Input } from '@/components/ui/Input.jsx'
import { Button } from '@/components/ui/Button.jsx'
import { EmptyState } from '@/components/ui/EmptyState.jsx'
import { usePageSeo } from '@/hooks/usePageSeo.js'
import { APP } from '@/utils/constants.js'
import { publicApi } from '@/services/api.js'
import { useEvent } from '@/context/EventContext.jsx'
import { Link } from 'react-router-dom'

/* ── Tracks (2): Software, Hardware ─────────────────────────── */
const TRACKS = ['Software', 'Hardware']
const trackStyles = {
  Software: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500', border: 'border-blue-200' },
  Hardware: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500', border: 'border-amber-200' },
}
const defaultTrack = { bg: 'bg-ink-100', text: 'text-ink-700', dot: 'bg-ink-400', border: 'border-ink-200' }

/* ── Domains (7): icon + color per domain ───────────────────── */
const DOMAINS = [
  'Health',
  'Education',
  'Transportation',
  'Food Safety & Security',
  'Waste Management',
  'Agriculture',
  'Industry & MSME Innovation',
  'Open Innovation',
]

const domainStyles = {
  'Health': { Icon: HeartPulse, text: 'text-rose-700', bg: 'bg-rose-50', iconBg: 'bg-rose-100' },
  'Education': { Icon: GraduationCap, text: 'text-violet-700', bg: 'bg-violet-50', iconBg: 'bg-violet-100' },
  'Transportation': { Icon: Bus, text: 'text-cyan-700', bg: 'bg-cyan-50', iconBg: 'bg-cyan-100' },
  'Food Safety & Security': { Icon: Utensils, text: 'text-orange-700', bg: 'bg-orange-50', iconBg: 'bg-orange-100' },
  'Waste Management': { Icon: Recycle, text: 'text-emerald-700', bg: 'bg-emerald-50', iconBg: 'bg-emerald-100' },
  'Agriculture': { Icon: Sprout, text: 'text-lime-700', bg: 'bg-lime-50', iconBg: 'bg-lime-100' },
  'Industry & MSME Innovation': { Icon: Factory, text: 'text-indigo-700', bg: 'bg-indigo-50', iconBg: 'bg-indigo-100' },
  'Open Innovation': { Icon: Lightbulb, text: 'text-amber-700', bg: 'bg-amber-50', iconBg: 'bg-amber-100' },
}
const defaultDomain = { Icon: Tag, text: 'text-ink-700', bg: 'bg-ink-100', iconBg: 'bg-ink-100' }

const getTrackStyle = (track) => trackStyles[track] || defaultTrack
const getDomainStyle = (domain) => domainStyles[domain] || defaultDomain

/* ── Deadline helpers ───────────────────────────────────────── */
function deadlineMeta(deadlineIso) {
  if (!deadlineIso) return { label: 'Not set', tone: 'neutral', urgent: false, days: null }
  const now = Date.now()
  const target = new Date(deadlineIso).getTime()
  const diff = target - now
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (diff < 0) return { label: 'Closed', tone: 'overdue', urgent: false, days }
  if (days === 0) return { label: 'Due today', tone: 'overdue', urgent: true, days }
  if (days <= 3) return { label: `${days}d left`, tone: 'urgent', urgent: true, days }
  if (days <= 7) return { label: `${days}d left`, tone: 'warning', urgent: false, days }
  return { label: `${days}d left`, tone: 'normal', urgent: false, days }
}

const deadlineToneStyles = {
  overdue: 'bg-red-50 text-red-700 border-red-200',
  urgent: 'bg-orange-50 text-orange-700 border-orange-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  normal: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  neutral: 'bg-ink-100 text-ink-600 border-ink-200',
}

/* ── Participation helpers ──────────────────────────────────── */
function participationMeta(count, maxTeams) {
  const c = typeof count === 'number' ? count : 0
  if (typeof maxTeams === 'number' && maxTeams > 0) {
    const pct = Math.min(100, Math.round((c / maxTeams) * 100))
    let status = 'available'
    if (pct >= 100) status = 'full'
    else if (pct >= 80) status = 'almost-full'
    else if (pct >= 50) status = 'popular'
    return { count: c, max: maxTeams, pct, status }
  }
  let status = 'low'
  if (c >= 20) status = 'trending'
  else if (c >= 10) status = 'popular'
  else if (c >= 5) status = 'rising'
  return { count: c, max: null, pct: null, status }
}

/* ── Bookmark store (localStorage) ──────────────────────────── */
const BOOKMARK_KEY = 'skh-bookmarked-ps'
const loadBookmarks = () => {
  try { return new Set(JSON.parse(localStorage.getItem(BOOKMARK_KEY) || '[]')) }
  catch { return new Set() }
}
const saveBookmarks = (set) => localStorage.setItem(BOOKMARK_KEY, JSON.stringify([...set]))

/* ── Detail Drawer ──────────────────────────────────────────── */
function DetailDrawer({ ps, onClose, onToggleBookmark, isBookmarked, deadline }) {
  if (!ps) return null
  const track = getTrackStyle(ps.category || 'Software')
  const domain = getDomainStyle(ps.theme || ps.domain)
  const part = participationMeta(ps.selectionCount, ps.maxTeams)
  const dl = deadlineMeta(deadline)
  const [copied, setCopied] = useState(false)

  const copyId = () => {
    navigator.clipboard?.writeText(ps.id)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const shareLink = () => {
    const url = `${window.location.origin}/problems?ps=${encodeURIComponent(ps.id)}`
    navigator.clipboard?.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex justify-end"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 32, stiffness: 280 }}
        className="relative flex w-full max-w-2xl flex-col overflow-hidden bg-[rgb(var(--surface))] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky Header */}
        <div className="flex items-start justify-between gap-3 border-b border-[rgb(var(--border))] px-6 py-4">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${domain.iconBg}`}>
              <domain.Icon className={`h-5 w-5 ${domain.text}`} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-brand-600">{ps.id}</span>
                <button
                  onClick={copyId}
                  className="rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
                  aria-label="Copy PS ID"
                >
                  {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                </button>
              </div>
              <h2 className="mt-0.5 font-display text-base font-bold leading-snug text-ink-900 break-words">
                {ps.title}
              </h2>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={onToggleBookmark}
              className="rounded-lg p-2 text-ink-400 hover:bg-ink-100 hover:text-amber-500"
              title={isBookmarked ? 'Remove bookmark' : 'Bookmark'}
            >
              <Star className={`h-4 w-4 ${isBookmarked ? 'fill-amber-400 text-amber-500' : ''}`} />
            </button>
            <button
              type="button"
              onClick={shareLink}
              className="rounded-lg p-2 text-ink-400 hover:bg-ink-100 hover:text-brand-600"
              title="Copy share link"
            >
              <ExternalLink className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          {/* Stats strip */}
          <div className="grid grid-cols-3 gap-px bg-[rgb(var(--border))]">
            <div className="bg-[rgb(var(--surface))] px-4 py-4 text-center">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-500">Teams Joined</p>
              <p className="mt-1 font-display text-xl font-bold text-ink-900">
                {part.count}{part.max ? <span className="text-ink-400">/{part.max}</span> : ''}
              </p>
            </div>
            <div className="bg-[rgb(var(--surface))] px-4 py-4 text-center">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-500">Track</p>
              <p className={`mt-1 font-display text-base font-bold ${track.text}`}>{ps.category || 'Software'}</p>
            </div>
            <div className="bg-[rgb(var(--surface))] px-4 py-4 text-center">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-500">Deadline</p>
              <p className={`mt-1 inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-bold ${deadlineToneStyles[dl.tone]}`}>
                <Clock className="h-3 w-3" />
                {dl.label}
              </p>
            </div>
          </div>

          {/* Field rows */}
          <div className="divide-y divide-[rgb(var(--border))] px-6">
            {[
              { label: 'Department', value: ps.department, Icon: Layers },
              { label: 'Domain', value: ps.theme || ps.domain, Icon: domain.Icon },
            ].filter((f) => f.value).map(({ label, value, Icon }) => (
              <div key={label} className="flex items-start gap-3 py-3.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink-100">
                  <Icon className="h-4 w-4 text-ink-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">{label}</p>
                  <p className="mt-0.5 text-sm font-medium text-ink-900">{value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Description */}
          {ps.description ? (
            <div className="border-t border-[rgb(var(--border))] px-6 py-5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">Description</p>
              <p className="mt-2 whitespace-pre-line break-words text-sm leading-relaxed text-ink-700">
                {ps.description}
              </p>
            </div>
          ) : null}

          {/* Capacity bar */}
          {part.max ? (
            <div className="border-t border-[rgb(var(--border))] px-6 py-4">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">Capacity</p>
                <span className="text-xs font-bold text-ink-700">{part.pct}% filled</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink-100">
                <div
                  className={`h-full transition-all ${
                    part.status === 'full' ? 'bg-red-500' :
                    part.status === 'almost-full' ? 'bg-orange-500' :
                    part.status === 'popular' ? 'bg-amber-500' :
                    'bg-emerald-500'
                  }`}
                  style={{ width: `${part.pct}%` }}
                />
              </div>
            </div>
          ) : null}
        </div>
      </motion.div>
    </motion.div>
  )
}

/* ── Sortable header ────────────────────────────────────────── */
function SortableHeader({ column, children, align = 'left' }) {
  const sorted = column.getIsSorted()
  return (
    <button
      type="button"
      onClick={column.getToggleSortingHandler()}
      className={`flex w-full items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-500 transition-colors hover:text-ink-900 ${
        align === 'right' ? 'justify-end' : 'justify-start'
      }`}
    >
      {children}
      {sorted === 'asc' ? <ArrowUp className="h-3 w-3" /> :
       sorted === 'desc' ? <ArrowDown className="h-3 w-3" /> :
       <ArrowUpDown className="h-3 w-3 opacity-30" />}
    </button>
  )
}

/* ── PS Number cell — click to copy ─────────────────────────── */
function PsNumberCell({ id }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        navigator.clipboard?.writeText(id)
        setCopied(true)
        setTimeout(() => setCopied(false), 1200)
      }}
      className="group/cp inline-flex items-center gap-1.5 rounded-md bg-brand-50 px-2 py-1 font-mono text-[11px] font-bold text-brand-700 transition-colors hover:bg-brand-100"
      title="Click to copy"
    >
      {id}
      {copied ? (
        <Check className="h-3 w-3 text-emerald-600" />
      ) : (
        <Copy className="h-3 w-3 opacity-0 transition-opacity group-hover/cp:opacity-100" />
      )}
    </button>
  )
}

/* ── Main Page ──────────────────────────────────────────────── */
export function ProblemsPage() {
  usePageSeo({ title: 'Problem Statements', description: `Browse hackathon problem statements for ${APP.name}.` })
  const { eventId } = useEvent()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [eventCfg, setEventCfg] = useState(null)
  const [globalSearch, setGlobalSearch] = useState('')
  const [filters, setFilters] = useState({
    track: 'all',
    domain: 'all',
    participation: 'all',
    status: 'all',
  })
  const [showFilters, setShowFilters] = useState(false)
  const [selected, setSelected] = useState(null)
  const [bookmarks, setBookmarks] = useState(loadBookmarks)
  const [sorting, setSorting] = useState([{ id: 'serial', desc: false }])
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 25 })

  /* ── Load data ── */
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const [rows, cfg] = await Promise.all([
          publicApi.listProblemStatements(eventId || undefined),
          publicApi.getEventConfig(eventId || undefined).catch(() => null),
        ])
        if (cancelled) return
        setItems(Array.isArray(rows) ? rows : [])
        setEventCfg(cfg)
      } catch {
        if (!cancelled) setItems([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [eventId])

  /* ── Deep-link on initial load (?ps=ID) ── */
  useEffect(() => {
    const url = new URL(window.location.href)
    const psId = url.searchParams.get('ps')
    if (psId && items.length > 0) {
      const found = items.find((p) => p.id === psId)
      if (found) setSelected(found)
    }
  }, [items])

  /* ── Bookmark handlers ── */
  const toggleBookmark = useCallback((id) => {
    setBookmarks((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      saveBookmarks(next)
      return next
    })
  }, [])

  /* ── Derive filter options ── */
  const tracks = useMemo(() => {
    const found = [...new Set(items.map((p) => p.category).filter(Boolean))]
    const merged = [...TRACKS]
    for (const t of found) if (!merged.includes(t)) merged.push(t)
    return merged
  }, [items])
  const domains = useMemo(() => {
    const found = [...new Set(items.map((p) => p.theme || p.domain).filter(Boolean))]
    const merged = [...DOMAINS]
    for (const d of found) if (!merged.includes(d)) merged.push(d)
    return merged
  }, [items])

  /* ── Apply filters ── */
  const filteredData = useMemo(() => {
    let list = items.filter((p) => p.published !== false)

    if (globalSearch.trim()) {
      const q = globalSearch.toLowerCase()
      list = list.filter((p) =>
        (p.id || '').toLowerCase().includes(q) ||
        (p.title || '').toLowerCase().includes(q) ||
        (p.theme || p.domain || '').toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q),
      )
    }

    if (filters.track !== 'all') list = list.filter((p) => p.category === filters.track)
    if (filters.domain !== 'all') list = list.filter((p) => (p.theme || p.domain) === filters.domain)

    if (filters.participation !== 'all') {
      list = list.filter((p) => {
        const c = p.selectionCount || 0
        if (filters.participation === 'low') return c < 5
        if (filters.participation === 'medium') return c >= 5 && c < 15
        if (filters.participation === 'high') return c >= 15
        return true
      })
    }

    if (filters.status === 'open') list = list.filter((p) => participationMeta(p.selectionCount, p.maxTeams).status !== 'full')
    if (filters.status === 'full') list = list.filter((p) => participationMeta(p.selectionCount, p.maxTeams).status === 'full')
    if (filters.status === 'bookmarked') list = list.filter((p) => bookmarks.has(p.id))

    return list
  }, [items, globalSearch, filters, bookmarks])

  /* ── Columns ── */
  const columns = useMemo(() => [
    {
      id: 'serial',
      header: ({ column }) => <SortableHeader column={column}>#</SortableHeader>,
      accessorFn: (_row, idx) => idx + 1,
      cell: (info) => (
        <span className="font-mono text-xs text-ink-500">
          {String(info.row.index + 1).padStart(3, '0')}
        </span>
      ),
      size: 60,
    },
    {
      id: 'title',
      header: ({ column }) => <SortableHeader column={column}>Problem Statement Title</SortableHeader>,
      accessorFn: (row) => row.title || '',
      cell: ({ getValue, row }) => (
        <div className="min-w-0">
          <p className="line-clamp-2 text-sm font-semibold text-ink-900 transition-colors group-hover:text-brand-600">
            {getValue()}
          </p>
          {row.original.description ? (
            <p className="mt-0.5 line-clamp-1 text-[11px] text-ink-500">
              {row.original.description.slice(0, 100)}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      id: 'track',
      header: ({ column }) => <SortableHeader column={column}>Track</SortableHeader>,
      accessorFn: (row) => row.category || 'Software',
      cell: ({ getValue }) => {
        const t = getValue()
        const style = getTrackStyle(t)
        return (
          <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${style.bg} ${style.text} ${style.border}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
            {t}
          </span>
        )
      },
    },
    {
      id: 'psNumber',
      header: ({ column }) => <SortableHeader column={column}>PS Number</SortableHeader>,
      accessorFn: (row) => row.id,
      cell: ({ getValue }) => <PsNumberCell id={getValue()} />,
    },
    {
      id: 'participation',
      header: ({ column }) => <SortableHeader column={column} align="right">Teams</SortableHeader>,
      accessorFn: (row) => row.selectionCount || 0,
      cell: ({ getValue, row }) => {
        const count = getValue()
        const part = participationMeta(count, row.original.maxTeams)
        return (
          <div className="flex items-center justify-end gap-2">
            {part.status === 'trending' && <Flame className="h-3.5 w-3.5 text-orange-500" title="Trending" />}
            {part.status === 'almost-full' && <AlertCircle className="h-3.5 w-3.5 text-orange-500" title="Almost full" />}
            {part.status === 'full' && <span className="rounded bg-red-100 px-1.5 py-0.5 text-[9px] font-bold text-red-700">FULL</span>}
            {(part.status === 'popular' || part.status === 'rising') && <TrendingUp className="h-3.5 w-3.5 text-amber-500" title="Popular" />}
            <div className="text-right">
              <p className="font-mono text-sm font-bold text-ink-900">
                {count}{part.max ? <span className="text-ink-400">/{part.max}</span> : ''}
              </p>
              {part.pct !== null ? (
                <div className="mt-0.5 h-1 w-14 overflow-hidden rounded-full bg-ink-100">
                  <div
                    className={`h-full ${
                      part.pct >= 100 ? 'bg-red-500' :
                      part.pct >= 80 ? 'bg-orange-500' :
                      part.pct >= 50 ? 'bg-amber-500' :
                      'bg-emerald-500'
                    }`}
                    style={{ width: `${part.pct}%` }}
                  />
                </div>
              ) : null}
            </div>
          </div>
        )
      },
      sortingFn: 'basic',
    },
    {
      id: 'domain',
      header: ({ column }) => <SortableHeader column={column}>Domain</SortableHeader>,
      accessorFn: (row) => row.theme || row.domain || '',
      cell: ({ getValue }) => {
        const d = getValue()
        if (!d) return <span className="text-xs text-ink-400">—</span>
        const style = getDomainStyle(d)
        return (
          <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium ${style.bg} ${style.text}`}>
            <style.Icon className="h-3 w-3" />
            <span className="truncate">{d}</span>
          </span>
        )
      },
    },
    {
      id: 'deadline',
      header: ({ column }) => <SortableHeader column={column}>Deadline</SortableHeader>,
      accessorFn: () => eventCfg?.submissionDeadline || null,
      cell: () => {
        const dl = deadlineMeta(eventCfg?.submissionDeadline)
        return (
          <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-bold ${deadlineToneStyles[dl.tone]}`}>
            <Clock className="h-3 w-3" />
            {dl.label}
          </span>
        )
      },
      sortingFn: 'basic',
    },
  ], [eventCfg])

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  })

  function clearFilters() {
    setGlobalSearch('')
    setFilters({
      track: 'all',
      domain: 'all',
      participation: 'all',
      status: 'all',
    })
  }

  const activeFilterCount = Object.values(filters).filter((v) => v !== 'all').length

  /* ── Stats ── */
  const totalCount = items.filter((p) => p.published !== false).length
  const swCount = items.filter((p) => (p.category || 'Software') === 'Software' && p.published !== false).length
  const hwCount = items.filter((p) => p.category === 'Hardware' && p.published !== false).length
  const totalTeams = items.reduce((sum, p) => sum + (p.selectionCount || 0), 0)

  return (
    <>
      {/* ═══ HERO ═══ */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <img src="/ps-banner.png" alt="" className="h-full w-full object-cover" draggable={false} />
          <div className="absolute inset-0 bg-gradient-to-r from-ink-950/85 via-ink-950/65 to-ink-950/85" />
          <div className="absolute inset-0 bg-gradient-to-t from-ink-950/95 via-transparent to-ink-950/40" />
        </div>
        <div className="relative w-full px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400" />
              {APP.shortName} 2026 · Problem Statement Explorer
            </div>
            <h1 className="font-display text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl">
              Problem Statements
            </h1>
            <p className="mt-3 max-w-2xl text-base text-white/75 sm:text-lg">
              Browse curated challenges from government departments, industry partners, and academia.
              Search, filter, and select your problem to begin.
            </p>
            
            {/* Download & Guidelines Actions */}
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <a
                href="/SKH_IDEA_PRESENTATION_FORMAT.pptx"
                download
                className="inline-flex items-center gap-2 rounded-lg border-2 border-white/30 bg-white/10 px-4 py-2.5 font-semibold text-white backdrop-blur-sm transition-all hover:border-white/50 hover:bg-white/20 hover:shadow-lg"
              >
                <Download className="h-5 w-5" />
                Download Presentation Format
              </a>
              <Link
                to="/guidelines"
                className="inline-flex items-center gap-2 rounded-lg border-2 border-emerald-400/40 bg-emerald-400/10 px-4 py-2.5 font-semibold text-white backdrop-blur-sm transition-all hover:border-emerald-400/60 hover:bg-emerald-400/20 hover:shadow-lg"
              >
                <FileText className="h-5 w-5" />
                View Guidelines
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ═══ STATS BAR ═══ */}
      <section className="relative z-20 w-full -mt-8 px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 shadow-lg sm:grid-cols-4">
          <div className="text-center">
            <p className="text-[10px] font-bold uppercase tracking-wider text-ink-500">Total Statements</p>
            <p className="mt-1 font-display text-2xl font-extrabold text-ink-900 sm:text-3xl">{totalCount}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] font-bold uppercase tracking-wider text-ink-500">Software</p>
            <p className="mt-1 font-display text-2xl font-extrabold text-blue-600 sm:text-3xl">{swCount}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] font-bold uppercase tracking-wider text-ink-500">Hardware</p>
            <p className="mt-1 font-display text-2xl font-extrabold text-amber-600 sm:text-3xl">{hwCount}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] font-bold uppercase tracking-wider text-ink-500">Teams Engaged</p>
            <p className="mt-1 font-display text-2xl font-extrabold text-emerald-600 sm:text-3xl">{totalTeams}</p>
          </div>
        </div>
      </section>

      {/* ═══ FILTERS + TABLE ═══ */}
      <section className="w-full px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        {/* Top toolbar */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex-1">
            <Input
              icon={Search}
              placeholder="Search by title, ID, domain, keyword…"
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
            />
          </div>
          <Button
            type="button"
            variant={showFilters || activeFilterCount > 0 ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setShowFilters((v) => !v)}
            className="gap-1.5"
          >
            <Filter className="h-4 w-4" />
            Filters
            {activeFilterCount > 0 ? (
              <span className="ml-0.5 rounded-full bg-white/20 px-1.5 text-[10px] font-bold">{activeFilterCount}</span>
            ) : null}
          </Button>
        </div>

        {/* Filter panel */}
        <AnimatePresence>
          {showFilters ? (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mb-4 overflow-hidden rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]"
            >
              <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
                <FilterSelect label="Track" value={filters.track} options={tracks} onChange={(v) => setFilters((f) => ({ ...f, track: v }))} />
                <FilterSelect label="Domain" value={filters.domain} options={domains} onChange={(v) => setFilters((f) => ({ ...f, domain: v }))} />
                <FilterSelect
                  label="Participation"
                  value={filters.participation}
                  options={[
                    { value: 'low', label: 'Low (< 5 teams)' },
                    { value: 'medium', label: 'Medium (5–14 teams)' },
                    { value: 'high', label: 'High (15+ teams)' },
                  ]}
                  onChange={(v) => setFilters((f) => ({ ...f, participation: v }))}
                />
                <FilterSelect
                  label="Status"
                  value={filters.status}
                  options={[
                    { value: 'open', label: 'Open for selection' },
                    { value: 'full', label: 'Full' },
                    { value: 'bookmarked', label: 'My bookmarks' },
                  ]}
                  onChange={(v) => setFilters((f) => ({ ...f, status: v }))}
                />
              </div>
              {(activeFilterCount > 0 || globalSearch) ? (
                <div className="flex items-center justify-between border-t border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))]/40 px-4 py-2.5">
                  <p className="text-xs text-ink-500">
                    {activeFilterCount + (globalSearch ? 1 : 0)} active filter{activeFilterCount + (globalSearch ? 1 : 0) > 1 ? 's' : ''}
                  </p>
                  <button type="button" onClick={clearFilters} className="text-xs font-semibold text-brand-600 hover:text-brand-700">
                    Clear all
                  </button>
                </div>
              ) : null}
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* Result count */}
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm text-ink-600">
            Showing <strong className="text-ink-900">{filteredData.length}</strong> of {totalCount} problem statements
          </p>
          <p className="hidden text-xs text-ink-400 sm:block">Click any row to view full details</p>
        </div>

        {/* Table */}
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
          </div>
        ) : filteredData.length === 0 ? (
          <EmptyState preset="no-results" action={clearFilters} actionLabel="Clear filters" />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-hidden rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] shadow-sm md:block">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-ink-50">
                    {table.getHeaderGroups().map((headerGroup) => (
                      <tr key={headerGroup.id} className="border-b border-[rgb(var(--border))]">
                        <th className="w-10 px-3 py-3.5"></th>
                        {headerGroup.headers.map((header) => (
                          <th key={header.id} className="px-3 py-3.5 text-left">
                            {flexRender(header.column.columnDef.header, header.getContext())}
                          </th>
                        ))}
                        <th className="w-10 px-3 py-3.5"></th>
                      </tr>
                    ))}
                  </thead>
                  <tbody>
                    {table.getRowModel().rows.map((row) => {
                      const ps = row.original
                      const bookmarked = bookmarks.has(ps.id)
                      return (
                        <tr
                          key={ps.id}
                          onClick={() => setSelected(ps)}
                          className="group cursor-pointer border-b border-[rgb(var(--border))] last:border-b-0 transition-colors hover:bg-brand-50/40"
                        >
                          <td className="px-3 py-3.5" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => toggleBookmark(ps.id)}
                              className="rounded p-1 text-ink-300 hover:bg-ink-100 hover:text-amber-500"
                              aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark'}
                            >
                              <Star className={`h-4 w-4 ${bookmarked ? 'fill-amber-400 text-amber-500' : ''}`} />
                            </button>
                          </td>
                          {row.getVisibleCells().map((cell) => (
                            <td key={cell.id} className="px-3 py-3.5">
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </td>
                          ))}
                          <td className="px-3 py-3.5 text-right">
                            <ChevronRight className="h-4 w-4 text-ink-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-500" />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile cards */}
            <div className="space-y-3 md:hidden">
              {table.getRowModel().rows.map((row) => {
                const ps = row.original
                const track = getTrackStyle(ps.category || 'Software')
                const domain = getDomainStyle(ps.theme || ps.domain)
                const part = participationMeta(ps.selectionCount, ps.maxTeams)
                const dl = deadlineMeta(eventCfg?.submissionDeadline)
                const bookmarked = bookmarks.has(ps.id)
                return (
                  <button
                    key={ps.id}
                    type="button"
                    onClick={() => setSelected(ps)}
                    className="block w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 text-left shadow-sm transition-shadow hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-[10px] font-bold text-brand-600">{ps.id}</span>
                          <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] font-semibold ${track.bg} ${track.text} ${track.border}`}>
                            <span className={`h-1 w-1 rounded-full ${track.dot}`} />
                            {ps.category || 'Software'}
                          </span>
                        </div>
                        <p className="mt-1.5 line-clamp-2 text-sm font-semibold text-ink-900">{ps.title}</p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); toggleBookmark(ps.id) }}
                        className="rounded p-1 text-ink-300 hover:text-amber-500"
                      >
                        <Star className={`h-4 w-4 ${bookmarked ? 'fill-amber-400 text-amber-500' : ''}`} />
                      </button>
                    </div>
                    {(ps.theme || ps.domain) ? (
                      <div className="mt-2">
                        <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${domain.bg} ${domain.text}`}>
                          <domain.Icon className="h-2.5 w-2.5" />
                          {ps.theme || ps.domain}
                        </span>
                      </div>
                    ) : null}
                    <div className="mt-2.5 flex items-center justify-between text-[11px]">
                      <span className="inline-flex items-center gap-1 text-ink-600">
                        <UsersIcon className="h-3 w-3" />
                        {part.count}{part.max ? `/${part.max}` : ''} teams
                      </span>
                      <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-bold ${deadlineToneStyles[dl.tone]}`}>
                        <Clock className="h-3 w-3" />
                        {dl.label}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Pagination */}
            {table.getPageCount() > 1 ? (
              <div className="mt-5 flex flex-col items-center justify-between gap-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3 sm:flex-row">
                <p className="text-xs text-ink-500">
                  Page <strong className="text-ink-900">{table.getState().pagination.pageIndex + 1}</strong> of{' '}
                  <strong className="text-ink-900">{table.getPageCount()}</strong>
                  <span className="ml-2 text-ink-400">({filteredData.length} total)</span>
                </p>
                <div className="flex items-center gap-2">
                  <select
                    value={table.getState().pagination.pageSize}
                    onChange={(e) => table.setPageSize(Number(e.target.value))}
                    className="h-8 rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--page-bg))] px-2 text-xs"
                  >
                    {[10, 25, 50, 100].map((s) => <option key={s} value={s}>{s}/page</option>)}
                  </select>
                  <button
                    type="button"
                    onClick={() => table.previousPage()}
                    disabled={!table.getCanPreviousPage()}
                    className="rounded-md border border-[rgb(var(--border))] p-1.5 text-ink-600 disabled:opacity-40 hover:bg-[rgb(var(--surface-muted))]"
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => table.nextPage()}
                    disabled={!table.getCanNextPage()}
                    className="rounded-md border border-[rgb(var(--border))] p-1.5 text-ink-600 disabled:opacity-40 hover:bg-[rgb(var(--surface-muted))]"
                    aria-label="Next page"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </section>

      {/* Detail Drawer */}
      <AnimatePresence>
        {selected ? (
          <DetailDrawer
            ps={selected}
            onClose={() => setSelected(null)}
            onToggleBookmark={() => toggleBookmark(selected.id)}
            isBookmarked={bookmarks.has(selected.id)}
            deadline={eventCfg?.submissionDeadline}
          />
        ) : null}
      </AnimatePresence>
    </>
  )
}

/* ── Filter select component ──────────────────────────────── */
function FilterSelect({ label, value, options, onChange }) {
  const isObj = options.length > 0 && typeof options[0] === 'object'
  return (
    <div>
      <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-ink-500">{label}</label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-full appearance-none rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--page-bg))] pl-3 pr-8 text-sm text-ink-700 transition-colors hover:border-brand-500/50 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
        >
          <option value="all">All</option>
          {options.map((opt) => {
            const v = isObj ? opt.value : opt
            const l = isObj ? opt.label : opt
            return <option key={v} value={v}>{l}</option>
          })}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
      </div>
    </div>
  )
}
