import { useCallback, useEffect, useRef, useState } from 'react'
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore'
import { Send, Trash2, MessageCircle, Users, ArrowDown, FolderLock } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { db } from '@/firebase/client.js'
import { usePageSeo } from '@/hooks/usePageSeo.js'
import { useApi } from '@/hooks/useApi.js'
import { useAuth } from '@/context/AuthContext.jsx'
import { Button } from '@/components/ui/Button.jsx'
import { Skeleton } from '@/components/ui/Skeleton.jsx'
import { ChatFileUpload, FileMessageBubble } from '@/components/chat/ChatFileUpload.jsx'

export function ParticipantChatPage() {
  usePageSeo({ title: 'Team Storage', description: "Save and share your team's files and notes." })
  const api = useApi()
  const { user, profile } = useAuth()
  const [chatInfo, setChatInfo] = useState(null)
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [text, setText] = useState('')
  const [replyTo, setReplyTo] = useState(null)
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const messagesEndRef = useRef(null)
  const containerRef = useRef(null)
  const inputRef = useRef(null)

  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'instant' })
  }, [])

  // Load chat info (team name, members)
  const loadChatInfo = useCallback(async () => {
    try {
      const info = await api.chatInfo()
      setChatInfo(info)
    } catch {
      setChatInfo(null)
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    void loadChatInfo()
  }, [loadChatInfo])

  // Real-time messages via Firestore onSnapshot
  const teamId = profile?.teamId

  useEffect(() => {
    if (!db || !teamId || !chatInfo?.exists) return
    const q = query(
      collection(db, `chats/${teamId}/messages`),
      orderBy('createdAt', 'desc'),
      limit(80),
    )
    const unsub = onSnapshot(q, (snap) => {
      const msgs = snap.docs.map((d) => {
        const data = d.data()
        return {
          id: d.id,
          text: data.text || '',
          senderId: data.senderId || '',
          senderName: data.senderName || '',
          type: data.type || 'text',
          file: data.file || null,
          replyTo: data.replyTo || null,
          createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
        }
      }).reverse()
      setMessages(msgs)
    }, () => { /* ignore errors */ })
    return () => unsub()
  }, [teamId, chatInfo?.exists])

  // Scroll to bottom on new messages
  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom(false)
    }
  }, [messages.length, scrollToBottom])

  // Show/hide scroll button
  const handleScroll = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100
    setShowScrollBtn(!atBottom)
  }, [])

  const handleSend = useCallback(async () => {
    if (!text.trim() || sending) return
    setSending(true)
    try {
      await api.chatSend(text.trim(), replyTo?.id || null)
      setText('')
      setReplyTo(null)
      inputRef.current?.focus()
    } catch (err) {
      alert(err.message || 'Failed to send message')
    } finally {
      setSending(false)
    }
  }, [api, text, replyTo, sending])

  // Handle file upload — send as a file message
  const handleFileUploaded = useCallback(async (file) => {
    try {
      await api.chatSend(`📎 ${file.name}`, replyTo?.id || null, file)
      setReplyTo(null)
    } catch (err) {
      alert(err.message || 'Failed to send file')
    }
  }, [api, replyTo])

  const handleDelete = useCallback(async (messageId) => {
    if (!confirm('Delete this message?')) return
    try {
      await api.chatDeleteMessage(messageId)
      setMessages((prev) => prev.filter((m) => m.id !== messageId))
    } catch (err) {
      alert(err.message || 'Failed to delete')
    }
  }, [api])

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  if (loading) return <Skeleton className="h-[600px] w-full rounded-2xl" />

  if (!chatInfo?.exists) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center text-center">
        <FolderLock className="mb-4 h-12 w-12 text-ink-300" />
        <h2 className="font-display text-xl font-bold text-ink-900">No Team Yet</h2>
        <p className="mt-2 text-sm text-ink-500">Create your team to get a private space for storing your team's files and notes.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-12rem)] max-w-3xl flex-col lg:h-[calc(100vh-10rem)]">
      {/* Header */}
      <div className="flex items-center justify-between rounded-t-2xl border border-b-0 border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600">
            <FolderLock className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-display text-sm font-bold text-ink-900 sm:text-base">
              {chatInfo.teamName} · Team Storage
            </h2>
            <div className="flex items-center gap-1.5">
              <Users className="h-3 w-3 text-ink-400" />
              <span className="text-xs text-ink-500">Private space to save your team's files &amp; notes</span>
            </div>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={loadChatInfo} title="Refresh">
          <div className="flex h-2 w-2 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" title="Live" />
        </Button>
      </div>

      {/* Messages Area */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="relative flex-1 overflow-y-auto border-x border-[rgb(var(--border))] bg-[rgb(var(--page-bg))] px-4 py-4 sm:px-6"
      >
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <FolderLock className="mb-3 h-8 w-8 text-ink-300" />
            <p className="text-sm text-ink-500">Nothing saved yet.</p>
            <p className="mt-1 text-xs text-ink-400">Upload files or add notes to keep your team's materials here.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg, i) => {
              const isOwn = msg.senderId === user?.uid
              const showName = !isOwn && (i === 0 || messages[i - 1]?.senderId !== msg.senderId)
              return (
                <MessageBubble
                  key={msg.id}
                  msg={msg}
                  isOwn={isOwn}
                  showName={showName}
                  onDelete={isOwn ? () => handleDelete(msg.id) : null}
                  onReply={() => { setReplyTo(msg); inputRef.current?.focus() }}
                />
              )
            })}
            <div ref={messagesEndRef} />
          </div>
        )}

        {/* Scroll to bottom button */}
        <AnimatePresence>
          {showScrollBtn && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              type="button"
              onClick={() => scrollToBottom()}
              className="absolute bottom-4 right-4 flex h-9 w-9 items-center justify-center rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--surface))] shadow-lg"
            >
              <ArrowDown className="h-4 w-4 text-ink-600" />
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Reply preview */}
      <AnimatePresence>
        {replyTo && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-x border-[rgb(var(--border))] bg-brand-500/5 px-4 sm:px-6"
          >
            <div className="flex items-center justify-between py-2">
              <div className="min-w-0">
                <span className="text-xs font-medium text-brand-600">
                  Replying to {replyTo.senderName}
                </span>
                <p className="truncate text-xs text-ink-500">{replyTo.text}</p>
              </div>
              <button type="button" onClick={() => setReplyTo(null)} className="ml-2 text-xs text-ink-400 hover:text-ink-600">✕</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input Area */}
      <div className="flex items-end gap-2 rounded-b-2xl border border-t border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3 sm:gap-3 sm:p-4">
        <ChatFileUpload
          teamId={teamId}
          storagePath="chatFiles"
          onUploaded={handleFileUploaded}
          disabled={sending}
        />
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add a note, or use the paperclip to upload a file..."
          rows={1}
          className="min-h-[2.5rem] max-h-32 flex-1 resize-none rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--page-bg))] px-4 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
        />
        <Button
          size="sm"
          disabled={!text.trim() || sending}
          onClick={handleSend}
          className="h-10 w-10 shrink-0 rounded-xl p-0"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

/** Individual message bubble */
function MessageBubble({ msg, isOwn, showName, onDelete, onReply }) {
  const [showActions, setShowActions] = useState(false)
  const time = msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`group flex ${isOwn ? 'justify-end' : 'justify-start'}`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div className={`relative max-w-[80%] sm:max-w-[70%] ${isOwn ? 'order-2' : ''}`}>
        {showName && (
          <p className="mb-0.5 px-3 text-[11px] font-medium text-brand-600">
            {msg.senderName}
          </p>
        )}
        <div
          className={[
            'relative rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
            isOwn
              ? 'bg-brand-500 text-white rounded-br-md'
              : 'bg-[rgb(var(--surface))] text-ink-800 border border-[rgb(var(--border))] rounded-bl-md',
          ].join(' ')}
        >
          {msg.replyTo && (
            <div className={`mb-1.5 rounded-lg px-2.5 py-1.5 text-xs ${isOwn ? 'bg-white/15' : 'bg-[rgb(var(--surface-muted))]'}`}>
              <span className="font-medium opacity-70">Reply</span>
            </div>
          )}
          {/* File attachment */}
          {msg.type === 'file' && msg.file && (
            <div className="mb-1.5">
              <FileMessageBubble file={msg.file} isOwn={isOwn} />
            </div>
          )}
          {/* Text content — hide the auto-generated "📎 filename" for file messages */}
          {msg.type === 'file'
            ? (msg.text && !msg.text.startsWith('📎') ? <p className="whitespace-pre-wrap break-words">{msg.text}</p> : null)
            : <p className="whitespace-pre-wrap break-words">{msg.text}</p>
          }
          <span className={`mt-1 block text-right text-[10px] ${isOwn ? 'text-white/60' : 'text-ink-400'}`}>
            {time}
          </span>
        </div>

        {/* Action buttons (hover) */}
        <AnimatePresence>
          {showActions && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className={`absolute top-0 flex gap-1 ${isOwn ? '-left-16' : '-right-16'}`}
            >
              <button
                type="button"
                onClick={onReply}
                className="rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-[rgb(var(--surface-muted))] hover:text-ink-600"
                title="Reply"
              >
                <MessageCircle className="h-3.5 w-3.5" />
              </button>
              {onDelete && (
                <button
                  type="button"
                  onClick={onDelete}
                  className="rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-red-500/10 hover:text-red-600"
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
