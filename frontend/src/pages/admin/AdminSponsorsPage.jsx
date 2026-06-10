import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Building2, Plus, Upload, X, Pencil, Trash2, Save, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button.jsx'
import { Input } from '@/components/ui/Input.jsx'
import { Card } from '@/components/ui/Card.jsx'
import { useAuth } from '@/context/AuthContext.jsx'

export function AdminSponsorsPage() {
  const [sponsors, setSponsors] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingSponsor, setEditingSponsor] = useState(null)
  const { user } = useAuth()

  useEffect(() => {
    fetchSponsors()
  }, [])

  async function fetchSponsors() {
    try {
      const token = await user.getIdToken()
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/sponsors`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      setSponsors(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('Failed to fetch sponsors:', error)
    } finally {
      setLoading(false)
    }
  }

  async function deleteSponsor(id) {
    if (!confirm('Delete this sponsor? This action cannot be undone.')) return
    
    try {
      const token = await user.getIdToken()
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/sponsors/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      
      if (res.ok) {
        setSponsors(sponsors.filter(s => s.id !== id))
      } else {
        const error = await res.json()
        alert(error.error || 'Failed to delete sponsor')
      }
    } catch (error) {
      console.error('Failed to delete sponsor:', error)
      alert('Failed to delete sponsor')
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink-900">Sponsors & Partners</h1>
          <p className="mt-1 text-sm text-ink-600">Manage organization logos displayed in the carousel</p>
        </div>
        <Button onClick={() => setShowAddModal(true)}>
          <Plus className="mr-2 h-4 w-4" /> Add Sponsor
        </Button>
      </div>

      {/* Sponsors grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {sponsors.map((sponsor) => (
          <Card key={sponsor.id} className="relative overflow-hidden p-4">
            <div className="flex flex-col items-center text-center">
              {/* Logo */}
              <div className="mb-3 flex h-24 w-full items-center justify-center overflow-hidden rounded-lg bg-ink-50 p-2">
                <img
                  src={sponsor.logoUrl}
                  alt={sponsor.name}
                  className="h-full w-full object-contain"
                  onError={(e) => {
                    e.target.style.display = 'none'
                    e.target.parentElement.innerHTML = `<div class="flex h-full w-full items-center justify-center"><svg class="h-8 w-8 text-ink-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg></div>`
                  }}
                />
              </div>

              {/* Name */}
              <p className="font-display text-sm font-semibold text-ink-900">{sponsor.name}</p>
              
              {/* Label */}
              {sponsor.label && (
                <p className="mt-1 text-xs font-medium uppercase tracking-wider text-ink-500">
                  {sponsor.label}
                </p>
              )}

              {/* Order badge */}
              <span className="mt-2 inline-block rounded-full bg-brand-500/10 px-2 py-0.5 text-xs font-medium text-brand-700">
                Order: {sponsor.order}
              </span>

              {/* Actions */}
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditingSponsor(sponsor)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-600 hover:bg-red-500/10 hover:text-red-700"
                  onClick={() => deleteSponsor(sponsor.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {sponsors.length === 0 && (
        <Card className="py-12 text-center">
          <Building2 className="mx-auto h-12 w-12 text-ink-300" />
          <p className="mt-4 font-display text-lg font-semibold text-ink-900">No sponsors yet</p>
          <p className="mt-1 text-sm text-ink-600">Add your first sponsor to get started</p>
          <Button className="mt-4" onClick={() => setShowAddModal(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add Sponsor
          </Button>
        </Card>
      )}

      {/* Add/Edit Modal */}
      {(showAddModal || editingSponsor) && (
        <SponsorModal
          sponsor={editingSponsor}
          onClose={() => {
            setShowAddModal(false)
            setEditingSponsor(null)
          }}
          onSuccess={() => {
            fetchSponsors()
            setShowAddModal(false)
            setEditingSponsor(null)
          }}
        />
      )}
    </div>
  )
}

function SponsorModal({ sponsor, onClose, onSuccess }) {
  const [name, setName] = useState(sponsor?.name || '')
  const [label, setLabel] = useState(sponsor?.label || '')
  const [order, setOrder] = useState(sponsor?.order || 0)
  const [logoFile, setLogoFile] = useState(null)
  const [preview, setPreview] = useState(sponsor?.logoUrl || null)
  const [submitting, setSubmitting] = useState(false)
  const { user } = useAuth()

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 15 * 1024 * 1024) {
        alert('Logo file must be less than 15MB')
        return
      }
      setLogoFile(file)
      setPreview(URL.createObjectURL(file))
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    
    if (!name.trim()) {
      alert('Organization name is required')
      return
    }

    if (!sponsor && !logoFile) {
      alert('Logo is required')
      return
    }

    setSubmitting(true)

    try {
      const token = await user.getIdToken()
      const formData = new FormData()
      formData.append('name', name.trim())
      formData.append('label', label.trim())
      formData.append('order', String(order))
      if (logoFile) formData.append('logo', logoFile)

      const url = sponsor
        ? `${import.meta.env.VITE_API_BASE_URL}/api/sponsors/${sponsor.id}`
        : `${import.meta.env.VITE_API_BASE_URL}/api/sponsors`
      
      const res = await fetch(url, {
        method: sponsor ? 'PUT' : 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`
        },
        body: formData
      })

      if (res.ok) {
        onSuccess()
      } else {
        const error = await res.json().catch(() => ({ error: 'Unknown error' }))
        alert(error.error || error.message || 'Failed to save sponsor')
        console.error('Server error:', error)
      }
    } catch (error) {
      console.error('Failed to save sponsor:', error)
      alert(`Failed to save sponsor: ${error.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative mx-4 w-full max-w-lg rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6 shadow-2xl"
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-ink-400 hover:bg-[rgb(var(--surface-muted))] hover:text-ink-600"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 className="font-display text-xl font-bold text-ink-900">
          {sponsor ? 'Edit Sponsor' : 'Add Sponsor'}
        </h2>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {/* Logo upload */}
          <div>
            <label className="mb-2 block text-sm font-medium text-ink-700">
              Logo <span className="text-red-500">*</span>
            </label>
            <div className="flex items-center gap-4">
              {preview && (
                <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg border border-[rgb(var(--border))] bg-ink-50 p-2">
                  <img src={preview} alt="Logo preview" className="h-full w-full object-contain" />
                </div>
              )}
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))] px-4 py-2 text-sm font-medium text-ink-600 transition-colors hover:border-brand-500 hover:text-brand-700">
                <Upload className="h-4 w-4" />
                {preview ? 'Change logo' : 'Upload logo'}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            </div>
            <p className="mt-1 text-xs text-ink-500">PNG, JPG, WebP, SVG • Max 15MB</p>
          </div>

          {/* Name */}
          <div>
            <label className="mb-2 block text-sm font-medium text-ink-700">
              Organization Name <span className="text-red-500">*</span>
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Acme Corporation"
              required
            />
          </div>

          {/* Label */}
          <div>
            <label className="mb-2 block text-sm font-medium text-ink-700">
              Label <span className="text-xs text-ink-500">(optional)</span>
            </label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g., Industry Partner, Powered by"
            />
            <p className="mt-1 text-xs text-ink-500">Appears below the logo in small text</p>
          </div>

          {/* Order */}
          <div>
            <label className="mb-2 block text-sm font-medium text-ink-700">
              Display Order
            </label>
            <Input
              type="number"
              value={order}
              onChange={(e) => setOrder(parseInt(e.target.value) || 0)}
              min="0"
              placeholder="0"
            />
            <p className="mt-1 text-xs text-ink-500">Lower numbers appear first</p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <Button type="submit" disabled={submitting} className="flex-1">
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  {sponsor ? 'Update' : 'Add Sponsor'}
                </>
              )}
            </Button>
            <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}
