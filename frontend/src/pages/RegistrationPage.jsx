import { useState } from 'react'
import { motion } from 'framer-motion'
import { Upload, FileText, CheckCircle, Loader2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button.jsx'
import { Input } from '@/components/ui/Input.jsx'
import { Card } from '@/components/ui/Card.jsx'
import { useAuth } from '@/context/AuthContext.jsx'
import { Link } from 'react-router-dom'

const API_BASE = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || 'http://localhost:4000'

export function RegistrationPage() {
  const [name, setName] = useState('')
  const [institute, setInstitute] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [idCard, setIdCard] = useState(null)
  const [preview, setPreview] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const { user } = useAuth()

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (file) {
      // Validate file type
      if (file.type !== 'application/pdf') {
        setError('Only PDF files are allowed')
        return
      }

      // Validate file size (10MB)
      if (file.size > 10 * 1024 * 1024) {
        setError('File size must be less than 10MB')
        return
      }

      setIdCard(file)
      setPreview(file.name)
      setError('')
    }
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

    setSubmitting(true)

    try {
      const token = await user.getIdToken()
      const formData = new FormData()
      formData.append('name', name.trim())
      formData.append('institute', institute.trim())
      formData.append('email', email.trim())
      formData.append('phone', phone.trim())
      formData.append('idCard', idCard)

      const res = await fetch(`${API_BASE}/api/registrations`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      })

      if (res.ok) {
        setSuccess(true)
        // Reset form
        setName('')
        setInstitute('')
        setEmail('')
        setPhone('')
        setIdCard(null)
        setPreview(null)
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

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[rgb(var(--page-bg))] px-4">
        <Card className="max-w-md p-8 text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-amber-500" />
          <h2 className="mt-4 font-display text-xl font-bold text-ink-900">Authentication Required</h2>
          <p className="mt-2 text-sm text-ink-600">Please sign in to register for the hackathon</p>
          <Link to="/auth">
            <Button className="mt-4">Sign In</Button>
          </Link>
        </Card>
      </div>
    )
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[rgb(var(--page-bg))] px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
        >
          <Card className="max-w-md p-8 text-center">
            <CheckCircle className="mx-auto h-16 w-16 text-green-500" />
            <h2 className="mt-4 font-display text-2xl font-bold text-ink-900">Registration Successful!</h2>
            <p className="mt-2 text-sm text-ink-600">
              Your registration has been submitted successfully. You will receive a confirmation email shortly.
            </p>
            <Link to="/">
              <Button className="mt-6">Back to Home</Button>
            </Link>
          </Card>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[rgb(var(--page-bg))] py-12 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="text-center">
            <h1 className="font-display text-3xl font-bold text-ink-900 sm:text-4xl">
              Hackathon Registration
            </h1>
            <p className="mt-2 text-sm text-ink-600">
              Fill in your details to register for Smart Kopargaon Hackathon
            </p>
          </div>

          <Card className="mt-8 p-6 sm:p-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-ink-700">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your full name"
                  className="mt-1"
                  required
                />
              </div>

              {/* Institute */}
              <div>
                <label className="block text-sm font-medium text-ink-700">
                  Institute/College <span className="text-red-500">*</span>
                </label>
                <Input
                  value={institute}
                  onChange={(e) => setInstitute(e.target.value)}
                  placeholder="Enter your institute name"
                  className="mt-1"
                  required
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-ink-700">
                  Email Address <span className="text-red-500">*</span>
                </label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your.email@example.com"
                  className="mt-1"
                  required
                />
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm font-medium text-ink-700">
                  Phone Number <span className="text-red-500">*</span>
                </label>
                <Input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                  placeholder="10-digit mobile number"
                  maxLength={10}
                  className="mt-1"
                  required
                />
                <p className="mt-1 text-xs text-ink-500">Enter 10-digit mobile number without +91</p>
              </div>

              {/* ID Card Upload */}
              <div>
                <label className="block text-sm font-medium text-ink-700">
                  ID Card (PDF) <span className="text-red-500">*</span>
                </label>
                <div className="mt-1">
                  {preview ? (
                    <div className="flex items-center gap-3 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))] p-3">
                      <FileText className="h-8 w-8 text-brand-500" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-ink-900">{preview}</p>
                        <p className="text-xs text-ink-500">
                          {(idCard.size / (1024 * 1024)).toFixed(2)} MB
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setIdCard(null)
                          setPreview(null)
                        }}
                        className="text-sm text-red-600 hover:text-red-700"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))] p-6 transition-colors hover:border-brand-500 hover:bg-brand-500/5">
                      <Upload className="h-10 w-10 text-ink-400" />
                      <p className="mt-2 text-sm font-medium text-ink-600">
                        Click to upload ID card
                      </p>
                      <p className="mt-1 text-xs text-ink-500">
                        PDF only, max 10MB
                      </p>
                      <input
                        type="file"
                        accept="application/pdf"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
                <p className="mt-1 text-xs text-ink-500">
                  Upload your college/university ID card as PDF
                </p>
              </div>

              {/* Error Message */}
              {error && (
                <div className="rounded-lg bg-red-500/10 p-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              {/* Submit Button */}
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
                  'Submit Registration'
                )}
              </Button>
            </form>
          </Card>
        </motion.div>
      </div>
    </div>
  )
}
