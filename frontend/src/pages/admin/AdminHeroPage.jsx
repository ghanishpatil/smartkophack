import { useEffect, useRef, useState } from 'react'
import { Image as ImageIcon, Trash2, Plus, Loader2, Upload, GripVertical, Eye, EyeOff, Save } from 'lucide-react'
import { usePageSeo } from '@/hooks/usePageSeo.js'
import { useApi } from '@/hooks/useApi.js'
import { useAuth } from '@/context/AuthContext.jsx'
import { Card } from '@/components/ui/Card.jsx'
import { Button } from '@/components/ui/Button.jsx'
import { Input } from '@/components/ui/Input.jsx'

const API_BASE = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || 'http://localhost:4000'

const ANIMATIONS = [
  { value: 'fade', label: 'Fade' },
  { value: 'slide', label: 'Slide' },
  { value: 'zoom', label: 'Zoom' },
  { value: 'flip', label: 'Flip' },
]

export function AdminHeroPage() {
  usePageSeo({ title: 'Latest News', description: 'Manage the home page Latest News banners.' })
  const api = useApi()
  const { user } = useAuth()
  const [banners, setBanners] = useState([])
  const [settings, setSettings] = useState({ enabled: false, animation: 'fade', intervalMs: 5000, revealHomeAfterCycle: true })
  const [loading, setLoading] = useState(true)
  const [savingSettings, setSavingSettings] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [msg, setMsg] = useState(null) // { type, text }

  function flash(type, text) {
    setMsg({ type, text })
    setTimeout(() => setMsg(null), 3500)
  }

  async function load() {
    try {
      // Fresh fetch (bypass the cached publicApi) so admin sees latest after edits.
      const res = await fetch(`${API_BASE}/api/hero-banners`)
      const data = await res.json()
      setBanners(Array.isArray(data?.banners) ? data.banners : [])
      if (data?.settings) setSettings((s) => ({ ...s, ...data.settings }))
    } catch {
      setBanners([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function saveSettings() {
    setSavingSettings(true)
    try {
      const res = await api.updateHeroSettings({
        enabled: settings.enabled,
        animation: settings.animation,
        intervalMs: settings.intervalMs,
      })
      if (res?.settings) setSettings((s) => ({ ...s, ...res.settings }))
      flash('success', 'Slideshow settings saved.')
    } catch (e) {
      flash('error', e?.message || 'Could not save settings.')
    } finally {
      setSavingSettings(false)
    }
  }

  async function deleteBanner(id) {
    if (!window.confirm('Delete this banner? This cannot be undone.')) return
    try {
      const token = await user.getIdToken()
      const res = await fetch(`${API_BASE}/api/hero-banners/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || 'Delete failed')
      setBanners((prev) => prev.filter((b) => b.id !== id))
      flash('success', 'Banner deleted.')
    } catch (e) {
      flash('error', e?.message || 'Delete failed.')
    }
  }

  async function toggleActive(banner) {
    try {
      const token = await user.getIdToken()
      const fd = new FormData()
      fd.append('active', String(!(banner.active !== false)))
      const res = await fetch(`${API_BASE}/api/hero-banners/${banner.id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      })
      if (!res.ok) throw new Error('Update failed')
      await load()
    } catch (e) {
      flash('error', e?.message || 'Update failed.')
    }
  }

  return (
    <div className="w-full max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink-900">Latest News</h1>
          <p className="mt-1 text-sm text-ink-600">Manage landscape (16:9) banners shown in the Latest News section on the home page.</p>
        </div>
        <Button onClick={() => { setEditing(null); setShowModal(true) }} className="gap-2">
          <Plus className="h-4 w-4" /> Add Banner
        </Button>
      </div>

      {msg && (
        <div className={`rounded-xl px-4 py-2.5 text-sm font-medium ${msg.type === 'success' ? 'bg-emerald-500/10 text-emerald-700' : 'bg-red-500/10 text-red-700'}`}>
          {msg.text}
        </div>
      )}

      {/* Slideshow settings */}
      <Card>
        <h2 className="font-display text-base font-semibold text-ink-900">Slideshow settings</h2>
        <p className="mt-1 text-xs text-ink-500">Turn on to show the Latest News slideshow on the home page (next to the stats). Off = section hidden.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <label className="flex items-center gap-3 rounded-xl border border-[rgb(var(--border))] px-4 py-3">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-ink-300 text-brand-500 focus:ring-brand-500"
              checked={Boolean(settings.enabled)}
              onChange={(e) => setSettings((s) => ({ ...s, enabled: e.target.checked }))}
            />
            <span className="text-sm font-medium text-ink-800">Enable slideshow</span>
          </label>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-600">Animation</label>
            <select
              value={settings.animation}
              onChange={(e) => setSettings((s) => ({ ...s, animation: e.target.value }))}
              className="w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2.5 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            >
              {ANIMATIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-600">Slide interval (seconds)</label>
            <Input
              type="number"
              min={2}
              max={20}
              value={Math.round((settings.intervalMs || 5000) / 1000)}
              onChange={(e) => setSettings((s) => ({ ...s, intervalMs: Math.max(2, Math.min(20, Number(e.target.value) || 5)) * 1000 }))}
            />
          </div>
        </div>
        <Button className="mt-4 gap-2" onClick={saveSettings} disabled={savingSettings}>
          {savingSettings ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save settings
        </Button>
      </Card>

      {/* Banners */}
      {loading ? (
        <div className="flex h-40 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-brand-500" /></div>
      ) : banners.length === 0 ? (
        <Card className="py-12 text-center">
          <ImageIcon className="mx-auto h-12 w-12 text-ink-300" />
          <p className="mt-4 font-display text-lg font-semibold text-ink-900">No banners yet</p>
          <p className="mt-1 text-sm text-ink-600">Add a landscape banner to build your slideshow.</p>
          <Button className="mt-4 gap-2" onClick={() => { setEditing(null); setShowModal(true) }}>
            <Plus className="h-4 w-4" /> Add Banner
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {banners.slice().sort((a, b) => (a.order || 0) - (b.order || 0)).map((b) => (
            <Card key={b.id} className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="relative aspect-[16/9] w-full shrink-0 overflow-hidden rounded-lg bg-gray-100 sm:w-56">
                <img src={b.imageUrl} alt={b.caption || 'Banner'} className="h-full w-full object-cover" />
                {b.active === false && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-xs font-semibold text-white">Hidden</div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs text-ink-500">
                  <GripVertical className="h-3.5 w-3.5" /> Order {b.order ?? 0}
                </div>
                <p className="mt-1 truncate text-sm font-medium text-ink-900">{b.caption || <span className="text-ink-400">No caption</span>}</p>
                {b.link ? <a href={b.link} target="_blank" rel="noreferrer" className="truncate text-xs text-brand-600 hover:underline">{b.link}</a> : null}
              </div>
              <div className="flex shrink-0 gap-2">
                <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => toggleActive(b)}>
                  {b.active === false ? <><Eye className="h-3.5 w-3.5" /> Show</> : <><EyeOff className="h-3.5 w-3.5" /> Hide</>}
                </Button>
                <Button variant="secondary" size="sm" onClick={() => { setEditing(b); setShowModal(true) }}>Edit</Button>
                <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-500/10" onClick={() => deleteBanner(b.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {showModal && (
        <BannerModal
          banner={editing}
          onClose={() => { setShowModal(false); setEditing(null) }}
          onSuccess={() => { setShowModal(false); setEditing(null); void load() }}
          onError={(t) => flash('error', t)}
        />
      )}
    </div>
  )
}

function BannerModal({ banner, onClose, onSuccess, onError }) {
  const { user } = useAuth()
  const [caption, setCaption] = useState(banner?.caption || '')
  const [link, setLink] = useState(banner?.link || '')
  const [order, setOrder] = useState(banner?.order ?? 0)
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(banner?.imageUrl || '')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)

  function onPick(e) {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  async function submit() {
    if (!banner && !file) { onError('Please choose a banner image.'); return }
    setBusy(true)
    try {
      const token = await user.getIdToken()
      const fd = new FormData()
      fd.append('caption', caption.trim())
      fd.append('link', link.trim())
      fd.append('order', String(Number(order) || 0))
      if (file) fd.append('image', file)
      const url = banner ? `${API_BASE}/api/hero-banners/${banner.id}` : `${API_BASE}/api/hero-banners`
      const res = await fetch(url, {
        method: banner ? 'PUT' : 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || 'Save failed')
      onSuccess()
    } catch (e) {
      onError(e?.message || 'Save failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-bold text-ink-900">{banner ? 'Edit Banner' : 'Add Banner'}</h2>
        <p className="mt-1 text-sm text-ink-500">Use a landscape 16:9 image (e.g. 1920×1080). Max 12&nbsp;MB · JPEG/PNG/WebP.</p>

        <div className="mt-4 space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">Banner image {banner ? '(leave empty to keep current)' : '*'}</label>
            {preview ? (
              <div className="mb-2 aspect-[16/9] w-full overflow-hidden rounded-lg bg-gray-100">
                <img src={preview} alt="Preview" className="h-full w-full object-cover" />
              </div>
            ) : null}
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={onPick} className="hidden" />
            <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
              <Upload className="mr-1.5 h-3.5 w-3.5" /> {preview ? 'Change image' : 'Choose image'}
            </Button>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">Caption (optional)</label>
            <Input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Shown as an overlay on the banner" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">Link (optional)</label>
            <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://..." />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">Order</label>
            <Input type="number" min={0} value={order} onChange={(e) => setOrder(e.target.value)} />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy} className="gap-2">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {banner ? 'Save changes' : 'Add banner'}
          </Button>
        </div>
      </div>
    </div>
  )
}
