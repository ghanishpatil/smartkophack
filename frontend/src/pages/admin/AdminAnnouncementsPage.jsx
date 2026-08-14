import { useCallback, useEffect, useState } from 'react'
import { Megaphone, Trash2, Pin, Edit3, Send } from 'lucide-react'
import { usePageSeo } from '@/hooks/usePageSeo.js'
import { useApi } from '@/hooks/useApi.js'
import { useResolvedEventId } from '@/hooks/useResolvedEventId.js'
import { Card } from '@/components/ui/Card.jsx'
import { Button } from '@/components/ui/Button.jsx'
import { Input, Textarea } from '@/components/ui/Input.jsx'
import { Badge } from '@/components/ui/Badge.jsx'
import { Skeleton } from '@/components/ui/Skeleton.jsx'
import { ConfirmModal } from '@/components/admin/ConfirmModal.jsx'
import { formatDate } from '@/utils/format.js'

const AUDIENCES = ['all', 'participants', 'team_leaders', 'mentors', 'judges', 'admins']
const AUDIENCE_LABELS = {
  all: 'Everyone',
  participants: 'Participants',
  team_leaders: 'Registered Team Leaders',
  mentors: 'Mentors',
  judges: 'Judges',
  admins: 'Admins',
}

export function AdminAnnouncementsPage() {
  usePageSeo({ title: 'Announcements', description: 'Create and manage announcements.' })
  const api = useApi()
  const { eventId } = useResolvedEventId()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [audience, setAudience] = useState('participants')
  const [pinned, setPinned] = useState(false)
  const [sendEmail, setSendEmail] = useState(true)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  // List
  const [announcements, setAnnouncements] = useState([])
  const [listLoading, setListLoading] = useState(true)
  const [confirm, setConfirm] = useState(null)
  const [editingId, setEditingId] = useState(null)

  const loadList = useCallback(async () => {
    setListLoading(true)
    try {
      const rows = await api.listAnnouncements()
      setAnnouncements(Array.isArray(rows) ? rows : [])
    } catch {
      setAnnouncements([])
    } finally {
      setListLoading(false)
    }
  }, [api])

  useEffect(() => { void loadList() }, [loadList])

  async function publish() {
    if (!title.trim() || !body.trim()) { setMsg('Title and body required.'); return }
    setBusy(true)
    setMsg('')
    try {
      const res = await api.broadcastAnnouncement({
        title, body, audience, pinned, sendEmail,
        ...(eventId ? { eventId } : {}),
      })
      setTitle('')
      setBody('')
      setPinned(false)
      setMsg(sendEmail ? `✓ Published. Email sent to ${res.emailSent || 0} user(s).` : '✓ Published.')
      await loadList()
    } catch (e) {
      setMsg(e.message || 'Failed')
    } finally {
      setBusy(false)
    }
  }

  async function deleteAnnouncement(id) {
    setConfirm(null)
    try {
      await api.deleteAnnouncement(id)
      await loadList()
    } catch (e) {
      alert(e.message || 'Delete failed')
    }
  }

  async function togglePin(id, currentPinned) {
    try {
      await api.patchAnnouncement(id, { pinned: !currentPinned })
      await loadList()
    } catch (e) {
      alert(e.message || 'Update failed')
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <Megaphone className="h-6 w-6 text-brand-600" />
          <h1 className="font-display text-3xl font-bold text-ink-900">Announcements</h1>
        </div>
        <p className="mt-2 text-sm text-ink-600">
          Publish announcements to participants. Email notifications are sent automatically.
        </p>
      </div>

      {/* Compose */}
      <Card>
        <h2 className="font-display text-base font-semibold text-ink-900">New Announcement</h2>
        {msg && (
          <p className={`mt-3 rounded-lg px-3 py-2 text-sm ${
            msg.startsWith('✓') ? 'bg-emerald-500/10 text-emerald-700' : 'bg-red-500/10 text-red-700'
          }`}>{msg}</p>
        )}
        <div className="mt-4 space-y-4">
          <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Important update..." />
          <Textarea label="Body" value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="Write your announcement..." />
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
              Pin to top
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
              Send email notification
            </label>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink-700">Audience</label>
            <select
              className="h-10 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 text-sm"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
            >
              {AUDIENCES.map((a) => <option key={a} value={a}>{AUDIENCE_LABELS[a] || a}</option>)}
            </select>
          </div>
          <Button className="w-full gap-2" onClick={publish} disabled={busy || !title.trim() || !body.trim()} loading={busy}>
            <Send className="h-4 w-4" /> Publish Announcement
          </Button>
        </div>
      </Card>

      {/* Email Reminders */}
      <Card>
        <h2 className="font-display text-base font-semibold text-ink-900">Quick Reminders</h2>
        <div className="mt-3 space-y-2">
          <ReminderBtn label="Payment Reminders" desc="Email unpaid teams" api={api} action="payment" />
          <ReminderBtn label="Submission (24h)" desc="Teams without submission" api={api} action="submission" hours={24} />
          <ReminderBtn label="Submission (6h)" desc="Urgent" api={api} action="submission" hours={6} />
        </div>
      </Card>

      {/* Existing Announcements */}
      <div>
        <h2 className="mb-3 font-display text-lg font-semibold text-ink-900">
          Previous Announcements ({announcements.length})
        </h2>
        {listLoading ? (
          <Skeleton className="h-40 w-full rounded-2xl" />
        ) : announcements.length === 0 ? (
          <Card><p className="py-6 text-center text-sm text-ink-400">No announcements yet.</p></Card>
        ) : (
          <div className="space-y-3">
            {announcements.map((a) => (
              <Card key={a.id} className={a.pinned ? 'border-brand-500/30' : ''}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-ink-900">{a.title}</h3>
                      {a.pinned && <Badge tone="brand" className="text-[9px]"><Pin className="h-2.5 w-2.5" /> Pinned</Badge>}
                      <Badge tone="neutral" className="text-[9px]">{AUDIENCE_LABELS[a.audience] || a.audience || 'all'}</Badge>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-ink-600">{a.body}</p>
                    <p className="mt-2 text-[10px] text-ink-400">{formatDate(a.createdAt)}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-ink-400 hover:text-brand-600"
                      onClick={() => togglePin(a.id, a.pinned)}
                      title={a.pinned ? 'Unpin' : 'Pin'}
                    >
                      <Pin className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-ink-400 hover:text-red-600"
                      onClick={() => setConfirm({
                        title: 'Delete announcement?',
                        body: `Delete "${a.title}"? This cannot be undone.`,
                        variant: 'danger',
                        action: () => deleteAnnouncement(a.id),
                      })}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <ConfirmModal
        open={Boolean(confirm)}
        title={confirm?.title || ''}
        variant={confirm?.variant || 'danger'}
        onCancel={() => setConfirm(null)}
        onConfirm={() => confirm?.action?.()}
        confirmLabel="Delete"
      >
        {confirm?.body}
      </ConfirmModal>
    </div>
  )
}

function ReminderBtn({ label, desc, api, action, hours }) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState('')
  async function send() {
    setBusy(true); setResult('')
    try {
      const res = action === 'payment' ? await api.sendPaymentReminders() : await api.sendSubmissionReminders(hours)
      setResult(`✓ ${res.sent} sent`)
    } catch (e) { setResult(`✗ ${e.message}`) }
    finally { setBusy(false) }
  }
  return (
    <div className="flex items-center justify-between rounded-lg border border-[rgb(var(--border))] px-3 py-2">
      <div>
        <p className="text-xs font-medium text-ink-900">{label}</p>
        <p className="text-[10px] text-ink-500">{desc}</p>
        {result && <p className="text-[10px] font-medium text-brand-600">{result}</p>}
      </div>
      <Button variant="secondary" size="xs" disabled={busy} onClick={send}>{busy ? '...' : 'Send'}</Button>
    </div>
  )
}
