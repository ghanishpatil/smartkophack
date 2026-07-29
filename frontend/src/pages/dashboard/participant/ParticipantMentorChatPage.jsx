import { useCallback, useEffect, useRef, useState } from 'react'
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore'
import { Send, MessageCircle, ArrowDown, UserCheck } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { db } from '@/firebase/client.js'
import { usePageSeo } from '@/hooks/usePageSeo.js'
import { useApi } from '@/hooks/useApi.js'
import { useAuth } from '@/context/AuthContext.jsx'
import { Button } from '@/components/ui/Button.jsx'
import { Skeleton } from '@/components/ui/Skeleton.jsx'
import { ChatFileUpload, FileMessageBubble } from '@/components/chat/ChatFileUpload.jsx'

export function ParticipantMentorChatPage() {
  usePageSeo({ title: 'Mentor Chat', description: 'Chat with your assigned mentor.' })
  const api = useApi()
  const { user, profile } = useAuth()
  const teamId = profile?.teamId
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [text, setText] = useState('')
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const [mentorAssigned, setMentorAssigned] = useState(null) // null = still checking
  const messagesEndRef = useRef(null)
  const containerRef = useRef(null)
  const inputRef = useRef(null)

  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'instant' })
  }, [])

  // Real-time listener
  useEffect(() => {
    if (!db || !teamId) {
      setLoading(false)
      return
    }
    // Mark as read when opening chat
    api.mentorChatMarkRead().catch(() => {})

    const q = query(
      collection(db, `mentorChats/${teamId}/messages`),
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
          senderRole: data.senderRole || 'participant',
          type: data.type || 'text',
          file: data.file || null,
          createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
        }
      }).reverse()
      setMessages(msgs)
      setLoading(false)
    }, () => {
      setLoading(false)
    })
    return () => unsub()
  }, [teamId])

  // Check whether a mentor is assigned to this team (direct, via PS, or domain/track).
  useEffect(() => {
    if (!teamId) { setMentorAssigned(false); return }
    let cancelled = false
    api.mentorChatStatus()
      .then((res) => { if (!cancelled) setMentorAssigned(Boolean(res?.assigned)) })
      .catch(() => { if (!cancelled) setMentorAssigned(false) })
    return () => { cancelled = true }
  }, [teamId, api])

  // Auto-scroll on new messages
  useEffect(() => {
    if (messages.length) scrollToBottom(false)
  }, [messages.length, scrollToBottom])

  const handleScroll = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 100)
  }, [])

  const handleSend = useCallback(async () => {
    if (!text.trim() || sending) return
    setSending(true)
    try {
      await api.mentorChatSend(text.trim(), null)
      setText('')
      inputRef.current?.focus()
    } catch (e) {
      alert(e.message || 'Failed to send message')
    } finally {
      setSending(false)
    }
  }, [api, text, sending])

  const handleFileUploaded = useCallback(async (file) => {
    try {
      await api.mentorChatSend(`📎 ${file.name}`, null, file)
    } catch (e) {
      alert(e.message || 'Failed to send file')
    }
  }, [api])

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  if (loading) return <Skeleton className="h-[500px] w-full rounded-2xl" />

  if (!teamId) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center text-center">
        <MessageCircle className="mb-4 h-12 w-12 text-ink-300" />
        <h2 className="font-display text-xl font-bold text-ink-900">No Team Yet</h2>
        <p className="mt-2 text-sm text-ink-500">Join or create a team to chat with your mentor.</p>
      </div>
    )
  }

  // Before a mentor is attached to the team, show a friendly waiting state.
  // If a mentor has already messaged, one is clearly engaged, so keep the chat
  // (the participant's own messages don't count toward this).
  const mentorHasMessaged = messages.some((m) => m.senderRole === 'mentor')
  if (mentorAssigned === false && !mentorHasMessaged) {
    return (
      <div className="mx-auto flex h-[60vh] max-w-3xl flex-col items-center justify-center text-center">
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600">
          <UserCheck className="h-8 w-8" />
        </div>
        <h2 className="font-display text-xl font-bold text-ink-900">A mentor will be assigned soon</h2>
        <p className="mt-2 max-w-md text-sm text-ink-500">
          Your team doesn&apos;t have a mentor yet. Once the organizers assign one, this space will
          open up and you can start chatting with them right here.
        </p>
        <p className="mt-1 text-xs text-ink-400">Hang tight — you&apos;ll be able to reach your mentor from this page.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-12rem)] max-w-3xl flex-col lg:h-[calc(100vh-10rem)]">
      {/* Header */}
      <div className="flex items-center justify-between rounded-t-2xl border border-b-0 border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
            <UserCheck className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-display text-sm font-bold text-ink-900 sm:text-base">Mentor Chat</h2>
            <p className="text-xs text-ink-500">Real-time chat with your assigned mentor</p>
          </div>
        </div>
        <div className="flex h-2 w-2 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" title="Live" />
      </div>

      {/* Messages Area */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="relative flex-1 overflow-y-auto border-x border-[rgb(var(--border))] bg-[rgb(var(--page-bg))] px-4 py-4 sm:px-6"
      >
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <MessageCircle className="mb-3 h-8 w-8 text-ink-300" />
            <p className="text-sm text-ink-500">No messages yet. Say hi to your mentor!</p>
            <p className="mt-1 text-xs text-ink-400">Messages appear instantly when your mentor replies.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {messages.map((msg) => {
              const isOwn = msg.senderId === user?.uid
              const isMentor = msg.senderRole === 'mentor'
              return (
                <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm sm:max-w-[70%] ${
                    isOwn
                      ? 'bg-brand-500 text-white rounded-br-md'
                      : isMentor
                        ? 'bg-emerald-500/10 border border-emerald-500/20 text-ink-800 rounded-bl-md'
                        : 'bg-[rgb(var(--surface))] border border-[rgb(var(--border))] text-ink-800 rounded-bl-md'
                  }`}>
                    <p className={`mb-0.5 text-[11px] font-semibold ${
                      isOwn ? 'text-white/80' :
                      isMentor ? 'text-emerald-700' : 'text-brand-600'
                    }`}>
                      {isOwn ? 'You' : msg.senderName}
                      {isMentor && !isOwn ? ' · Mentor' : ''}
                    </p>
                    {/* File attachment */}
                    {msg.type === 'file' && msg.file && (
                      <div className="mb-1.5">
                        <FileMessageBubble file={msg.file} isOwn={isOwn} />
                      </div>
                    )}
                    {msg.type === 'file'
                      ? (msg.text && !msg.text.startsWith('📎') ? <p className="whitespace-pre-wrap break-words">{msg.text}</p> : null)
                      : <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                    }
                    <span className={`mt-1 block text-right text-[10px] ${isOwn ? 'text-white/60' : 'text-ink-400'}`}>
                      {msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                  </div>
                </div>
              )
            })}
            <div ref={messagesEndRef} />
          </div>
        )}

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

      {/* Input Area */}
      <div className="flex items-end gap-2 rounded-b-2xl border border-t border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3 sm:gap-3 sm:p-4">
        <ChatFileUpload
          teamId={teamId}
          storagePath="mentorChatFiles"
          onUploaded={handleFileUploaded}
          disabled={sending}
        />
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message to your mentor..."
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
