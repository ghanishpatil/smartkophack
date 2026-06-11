import { useState } from 'react'
import { Upload, Check, X, Loader2 } from 'lucide-react'
import { Card } from '@/components/ui/Card.jsx'
import { Button } from '@/components/ui/Button.jsx'
import { Input } from '@/components/ui/Input.jsx'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000'

export function TeamMemberRegistrationForm({ members, teamId, user, onSuccess }) {
  const [formData, setFormData] = useState(
    members.reduce((acc, member) => {
      acc[member.uid] = {
        name: member.displayName || '',
        institute: '',
        email: member.email || '',
        phone: '',
        idCard: null,
      }
      return acc
    }, {})
  )
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const handleInputChange = (memberId, field, value) => {
    setFormData(prev => ({
      ...prev,
      [memberId]: {
        ...prev[memberId],
        [field]: value
      }
    }))
  }

  const handleFileChange = (memberId, file) => {
    if (file && file.type !== 'application/pdf') {
      setError('Only PDF files are allowed')
      return
    }
    if (file && file.size > 10 * 1024 * 1024) {
      setError('File size must be less than 10MB')
      return
    }
    setFormData(prev => ({
      ...prev,
      [memberId]: {
        ...prev[memberId],
        idCard: file
      }
    }))
    setError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setUploading(true)
    setError('')

    try {
      const token = await user.getIdToken()

      // Submit each member's registration
      for (const member of members) {
        const data = formData[member.uid]
        
        // Validation
        if (!data.name.trim() || !data.institute.trim() || !data.email.trim() || !data.phone.trim() || !data.idCard) {
          throw new Error(`Please complete all fields for ${member.displayName}`)
        }

        const formDataToSend = new FormData()
        formDataToSend.append('name', data.name.trim())
        formDataToSend.append('institute', data.institute.trim())
        formDataToSend.append('email', data.email.trim())
        formDataToSend.append('phone', data.phone.trim())
        formDataToSend.append('teamId', teamId)
        formDataToSend.append('userId', member.uid)
        formDataToSend.append('idCard', data.idCard)

        const response = await fetch(`${API_BASE}/api/registrations/member`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formDataToSend,
        })

        if (!response.ok) {
          const err = await response.json()
          throw new Error(err.error || 'Failed to submit registration')
        }
      }

      if (onSuccess) onSuccess()
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <Card className="p-6">
      <h2 className="text-xl font-bold text-ink-900 mb-4">Register All Team Members</h2>
      <p className="text-sm text-ink-600 mb-6">
        As team leader, fill out registration details for all {members.length} team members below.
      </p>

      <form onSubmit={handleSubmit} className="space-y-8">
        {members.map((member, index) => (
          <div key={member.uid} className="border-t pt-6 first:border-t-0 first:pt-0">
            <h3 className="font-semibold text-ink-900 mb-4">
              Member {index + 1}: {member.displayName}
              {member.isLeader && <span className="ml-2 text-xs text-brand-600">(Leader)</span>}
            </h3>
            
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Full Name"
                value={formData[member.uid]?.name || ''}
                onChange={(e) => handleInputChange(member.uid, 'name', e.target.value)}
                required
                placeholder="Enter full name"
              />
              
              <Input
                label="Institute/College"
                value={formData[member.uid]?.institute || ''}
                onChange={(e) => handleInputChange(member.uid, 'institute', e.target.value)}
                required
                placeholder="Enter institute name"
              />
              
              <Input
                label="Email"
                type="email"
                value={formData[member.uid]?.email || ''}
                onChange={(e) => handleInputChange(member.uid, 'email', e.target.value)}
                required
                placeholder="email@example.com"
              />
              
              <Input
                label="Phone Number"
                type="tel"
                value={formData[member.uid]?.phone || ''}
                onChange={(e) => handleInputChange(member.uid, 'phone', e.target.value)}
                required
                placeholder="10 digit phone"
                maxLength={10}
              />
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium text-ink-700 mb-2">
                ID Card (PDF, max 10MB)
              </label>
              <div className="flex items-center gap-3">
                <label className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-2 rounded-lg border-2 border-dashed border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))]/30 px-4 py-3 transition-colors hover:border-brand-500 hover:bg-brand-500/5">
                    <Upload className="h-5 w-5 text-brand-600" />
                    <span className="text-sm text-ink-600">
                      {formData[member.uid]?.idCard ? formData[member.uid].idCard.name : 'Choose PDF file'}
                    </span>
                  </div>
                  <input
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    onChange={(e) => handleFileChange(member.uid, e.target.files?.[0])}
                    required
                  />
                </label>
                {formData[member.uid]?.idCard && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => handleFileChange(member.uid, null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <Button
          type="submit"
          className="w-full gap-2"
          disabled={uploading}
        >
          {uploading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Submitting...
            </>
          ) : (
            <>
              <Check className="h-4 w-4" />
              Submit All Registrations
            </>
          )}
        </Button>
      </form>
    </Card>
  )
}
