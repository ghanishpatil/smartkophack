import { useState } from 'react'
import { motion } from 'framer-motion'
import { Upload, FileText, X, CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button.jsx'
import { Input } from '@/components/ui/Input.jsx'
import { Card } from '@/components/ui/Card.jsx'

const API_BASE = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || 'http://localhost:4000'

export function MemberRegistrationForm({ member, teamId, onSuccess, user }) {
  const [name, setName] = useState('')
  const [institute, setInstitute] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [idCard, setIdCard] = useState(null)
  const [idCardPreview, setIdCardPreview] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [agreedRules, setAgreedRules] = useState(false)
  const [agreedConduct, setAgreedConduct] = useState(false)

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (file) {
      if (file.type !== 'application/pdf') {
        setError('Only PDF files are allowed')
        return
      }
      if (file.size > 10 * 1024 * 1024) {
        setError('File size must be less than 10MB')
        return
      }
      setIdCard(file)
      setIdCardPreview(file.name)
      setError('')
    }
  }

  function removeIdCard() {
    setIdCard(null)
    setIdCardPreview(null)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    // Validation
    if (!name.trim()) {
      setError('Name is required')
      return
    }
    if (!institute.trim()) {
      setError('Institute is required')
      return
    }
    if (!email.trim()) {
      setError('Email is required')
      return
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email.trim())) {
      setError('Invalid email format')
      return
    }
    if (!phone.trim()) {
      setError('Phone number is required')
      return
    }
    const phoneRegex = /^\d{10}$/
    if (!phoneRegex.test(phone.trim())) {
      setError('Phone number must be 10 digits')
      return
    }
    if (!idCard) {
      setError('ID card PDF is required')
      return
    }
    if (!agreedRules || !agreedConduct) {
      setError('You must accept both declarations')
      return
    }

    setSubmitting(true)

    try {
      const token = await user.getIdToken()
      const formData = new FormData()
      formData.append('name', name.trim())
      formData.append('institute', institute.trim())
      formData.append('email', email.trim())
      formData.append('phone', phone.trim())
      formData.append('teamId', teamId)
      formData.append('idCard', idCard)

      const res = await fetch(`${API_BASE}/api/registrations/member`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      })

      if (res.ok) {
        onSuccess()
      } else {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }))
        setError(errorData.error || 'Failed to submit registration')
      }
    } catch (err) {
      console.error('Registration error:', err)
      setError(`Failed to submit registration: ${err.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500/10">
          <FileText className="h-5 w-5 text-brand-600" />
        </div>
        <div>
          <h3 className="font-semibold text-ink-900">{member.displayName || member.email}</h3>
          <p className="text-sm text-ink-500">Member Registration Form</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Full Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter your full name"
          required
        />

        <Input
          label="Institute / College"
          value={institute}
          onChange={(e) => setInstitute(e.target.value)}
          placeholder="Enter your institute name"
          required
        />

        <Input
          label="Email Address"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your.email@example.com"
          required
        />

        <div>
          <Input
            label="Phone Number"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
            placeholder="10-digit mobile number"
            maxLength={10}
            required
          />
          <p className="mt-1 text-xs text-ink-500">Enter 10-digit mobile number without +91</p>
        </div>

        {/* ID Card Upload */}
        <div>
          <label className="block text-sm font-medium text-ink-700 mb-2">
            ID Card (PDF) <span className="text-red-600">*</span>
          </label>
          {idCardPreview ? (
            <div className="flex items-center gap-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))]/50 p-4">
              <FileText className="h-8 w-8 shrink-0 text-brand-500" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink-900 truncate">{idCardPreview}</p>
                <p className="text-xs text-ink-500">
                  {(idCard.size / (1024 * 1024)).toFixed(2)} MB
                </p>
              </div>
              <button
                type="button"
                onClick={removeIdCard}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-red-600 hover:bg-red-500/10 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))]/30 p-6 transition-all hover:border-brand-500 hover:bg-brand-500/5">
              <Upload className="h-10 w-10 text-ink-400" />
              <p className="mt-2 text-sm font-medium text-ink-600">Click to upload ID card</p>
              <p className="mt-1 text-xs text-ink-500">PDF only, max 10MB</p>
              <input
                type="file"
                accept="application/pdf"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
          )}
          <p className="mt-2 text-xs text-ink-500">Upload your college/university ID card as PDF</p>
        </div>

        {/* Declarations */}
        <motion.label className="flex cursor-pointer items-start gap-3 rounded-xl border border-transparent p-2 transition-colors hover:border-[rgb(var(--border))] hover:bg-[rgb(var(--surface-muted))]/40">
          <input
            type="checkbox"
            checked={agreedRules}
            onChange={(e) => setAgreedRules(e.target.checked)}
            className="mt-1 rounded border-[rgb(var(--border))]"
          />
          <span className="text-sm text-ink-700">
            I confirm my submission follows hackathon rules and originality requirements.
          </span>
        </motion.label>

        <motion.label className="flex cursor-pointer items-start gap-3 rounded-xl border border-transparent p-2 transition-colors hover:border-[rgb(var(--border))] hover:bg-[rgb(var(--surface-muted))]/40">
          <input
            type="checkbox"
            checked={agreedConduct}
            onChange={(e) => setAgreedConduct(e.target.checked)}
            className="mt-1 rounded border-[rgb(var(--border))]"
          />
          <span className="text-sm text-ink-700">
            I agree to the code of conduct and respectful collaboration.
          </span>
        </motion.label>

        {error && (
          <div className="rounded-lg bg-red-500/10 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <Button
          type="submit"
          disabled={submitting}
          className="w-full"
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Submitting...
            </>
          ) : (
            <>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Submit My Registration
            </>
          )}
        </Button>
      </form>
    </Card>
  )
}
