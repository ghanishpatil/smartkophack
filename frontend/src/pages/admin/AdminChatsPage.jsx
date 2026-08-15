import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MessageCircle, Search, RefreshCw, Users, Handshake, Paperclip } from 'lucide-react'
import { usePageSeo } from '@/hooks/usePageSeo.js'
import { useApi } from '@/hooks/useApi.js'
import { Badge } from '@/components/ui/Badge.jsx'
import { Button } from '@/components/ui/Button.jsx'
import { Skeleton } from '@/components/ui/Skeleton.jsx'

// ─── Helpers ──────────────────────────────────────────────────────────────

function relTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const diff = Date.now() - d.getTime()
  const min = Math.round(diff / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.round(hr / 24)
  if (day < 7) return `${day}d ago`
  return d.toLocaleDateString()
}

function fullTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString()
}

function fileSizeLabel(bytes) {
  const n = Number(bytes)
  if (!Number.isFinite(n) || n <= 0) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${Math.round((n / (1024 * 1024)) * 10) / 10} MB`
}

const PANEL = 'flex flex-col overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]'

// ─── Message bubble ─────────────────────────────────────────────────────────

function MessageBubble({ m }) {
  const isMentor = m.senderRole === 'mentor'
  return (
    <div className={`flex ${isMentor ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-2xl border px-3 py-2 ${
          isMentor ? 'border-amber-500/30 bg-amber-500/10' : 'border-[rgb(var(--border))] bg-[rgb(var(--surface))]'
        }`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-ink-800">{m.senderName || 'Unknown'}</span>
          {m.senderRole ? (
            <Badge tone={isMentor ? 'warn' : 'neutral'} className="text-[9px]">{m.senderRole}</Badge>
          ) : null}
          <span className="text-[10px] text-ink-400">{fullTime(m.createdAt)}</span>
        </div>
        {m.text ? (
          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-ink-700">{m.text}</p>
        ) : null}
        {m.file?.url ? (
          <a
            href={m.file.url}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))]/60 px-2.5 py-1.5 text-xs text-brand-700 hover:bg-[rgb(var(--surface-muted))]"
          >
            <Paperclip className="h-3.5 w-3.5" />
            <span className="max-w-[12rem] truncate">{m.file.name || 'Attachment'}</span>
            {m.file.size ? <span className="text-ink-400">({fileSizeLabel(m.file.size)})</span> : null}
          </a>
        ) : null}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────

export function AdminChatsPage() {
  usePageSeo({ title: 'Chat Monitor', description: 'Monitor team and mentor chats.' })
  const api = useApi()

  const [conversations, setConversations] = useState([])
  const [loadingConvos, setLoadingConvos] = useState(true)
  const [selected, setSelected] = useState(null) // conversation object
  const [messages, setMessages] = useState([])
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [msgError, setMsgError] = useState('')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all') // all | team | mentor
  const scrollRef = useRef(null)

  const loadConversations = useCallback(async () => {
    setLoadingConvos(true)
    try {
      const res = await api.adminChats()
      setConversations(Array.isArray(res?.conversations) ? res.conversations : [])
    } catch {
      setConversations([])
    } finally {
      setLoadingConvos(false)
    }
  }, [api])

  useEffect(() => { void loadConversations() }, [loadConversations])

  const loadMessages = useCallback(async (conv) => {
    if (!conv) return
    setLoadingMsgs(true)
    setMsgError('')
    try {
      const res = await api.adminChatMessages(conv.type, conv.teamId)
      setMessages(Array.isArray(res?.messages) ? res.messages : [])
    } catch (e) {
      setMessages([])
      setMsgError(e.message || 'Could not load messages')
    } finally {
      setLoadingMsgs(false)
    }
  }, [api])

  function openConversation(conv) {
    setSelected(conv)
    void loadMessages(conv)
  }

  // Auto-scroll to the newest message whenever the thread updates.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return conversations.filter((c) => {
      if (typeFilter !== 'all' && c.type !== typeFilter) return false
      if (!q) return true
      return `${c.teamName} ${c.teamId} ${c.lastMessage} ${c.lastSenderName}`.toLowerCase().includes(q)
    })
  }, [conversations, search, typeFilter])

  const counts = useMemo(() => ({
    team: conversations.filter((c) => c.type === 'team').length,
    mentor: conversations.filter((c) => c.type === 'mentor').length,
  }), [conversations])

  return (
    <div className="w-full max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 font-display text-3xl font-bold text-ink-900">
            <MessageCircle className="h-7 w-7 text-brand-500" /> Chat Monitor
          </h1>
          <p className="mt-2 text-sm text-ink-600">
            Read-only view of every team chat and mentor chat. Most recently active conversations appear first.
          </p>
        </div>
        <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => void loadConversations()}>
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge tone="brand">{conversations.length} conversations</Badge>
        <Badge tone="neutral">{counts.team} team</Badge>
        <Badge tone="warn">{counts.mentor} mentor</Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Conversation list */}
        <div className={`${PANEL} lg:col-span-1`}>
          <div className="space-y-3 border-b border-[rgb(var(--border))] p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search team or message…"
                className="w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-2.5 pl-9 pr-3 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            </div>
            <div className="flex gap-1.5">
              {[['all', 'All'], ['team', 'Team'], ['mentor', 'Mentor']].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTypeFilter(id)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    typeFilter === id ? 'bg-brand-500 text-white' : 'bg-[rgb(var(--surface-muted))] text-ink-600 hover:bg-[rgb(var(--border))]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="max-h-[34rem] overflow-y-auto">
            {loadingConvos ? (
              <div className="space-y-2 p-3">
                {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
              </div>
            ) : filtered.length === 0 ? (
              <p className="p-6 text-center text-sm text-ink-500">No conversations found.</p>
            ) : (
              <ul className="divide-y divide-[rgb(var(--border))]">
                {filtered.map((c) => {
                  const active = selected?.key === c.key
                  return (
                    <li key={c.key}>
                      <button
                        type="button"
                        onClick={() => openConversation(c)}
                        className={`flex w-full flex-col gap-1 px-3 py-3 text-left transition-colors ${
                          active ? 'bg-brand-500/10' : 'hover:bg-[rgb(var(--surface-muted))]/50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium text-ink-900">{c.teamName}</span>
                          <Badge tone={c.type === 'mentor' ? 'warn' : 'brand'} className="shrink-0 text-[10px]">
                            {c.type === 'mentor' ? 'Mentor' : 'Team'}
                          </Badge>
                        </div>
                        <p className="truncate text-xs text-ink-500">
                          {c.lastSenderName ? <span className="font-medium text-ink-600">{c.lastSenderName}: </span> : null}
                          {c.lastMessage ? c.lastMessage : <span className="italic text-ink-400">No messages yet</span>}
                        </p>
                        <span className="text-[10px] text-ink-400">{c.lastMessageAt ? relTime(c.lastMessageAt) : '—'}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Message thread */}
        <div className={`${PANEL} lg:col-span-2`}>
          {!selected ? (
            <div className="flex h-[38rem] flex-col items-center justify-center gap-2 text-center text-ink-500">
              <MessageCircle className="h-10 w-10 text-ink-300" />
              <p className="text-sm">Select a conversation to view its messages.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 border-b border-[rgb(var(--border))] p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {selected.type === 'mentor'
                      ? <Handshake className="h-4 w-4 shrink-0 text-amber-500" />
                      : <Users className="h-4 w-4 shrink-0 text-brand-500" />}
                    <h2 className="truncate font-display text-lg font-semibold text-ink-900">{selected.teamName}</h2>
                    <Badge tone={selected.type === 'mentor' ? 'warn' : 'brand'} className="shrink-0 text-[10px]">
                      {selected.type === 'mentor' ? 'Mentor chat' : 'Team chat'}
                    </Badge>
                  </div>
                  <p className="mt-0.5 font-mono text-[10px] text-ink-400">{selected.teamId}</p>
                </div>
                <Button variant="secondary" size="sm" className="shrink-0 gap-1.5" onClick={() => void loadMessages(selected)}>
                  <RefreshCw className="h-3.5 w-3.5" /> Refresh
                </Button>
              </div>

              <div ref={scrollRef} className="h-[34rem] space-y-3 overflow-y-auto bg-[rgb(var(--surface-muted))]/30 p-4">
                {loadingMsgs ? (
                  <div className="space-y-3">
                    {[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-2/3 rounded-xl" />)}
                  </div>
                ) : msgError ? (
                  <p className="text-sm text-red-600">{msgError}</p>
                ) : messages.length === 0 ? (
                  <p className="py-10 text-center text-sm text-ink-500">No messages in this conversation.</p>
                ) : (
                  messages.map((m) => <MessageBubble key={m.id} m={m} />)
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <p className="text-xs text-ink-400">
        Monitoring is read-only — admins can view messages but cannot post or delete. Timestamps use your local time.
      </p>
    </div>
  )
}
