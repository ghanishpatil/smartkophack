import { useMemo, useState } from 'react'
import { Check, Loader2, Info, Crown, Users } from 'lucide-react'
import { Card } from '@/components/ui/Card.jsx'
import { Button } from '@/components/ui/Button.jsx'
import { Input } from '@/components/ui/Input.jsx'

const YEAR_OPTIONS = ['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year', 'Postgraduate']

function emptyMember() {
  return {
    fullName: '',
    email: '',
    phone: '',
    college: '',
    collegeLocation: '',
    yearOfStudy: '',
    department: '',
  }
}

/**
 * Team leader enters details for the whole team (leader + up to maxTeamSize-1
 * others). No accounts needed for other members, no ID card. One submit saves
 * everything via /api/participant/register-team-members.
 */
export function TeamRegistrationForm({ team, user, profile, api, maxTeamSize = 4, existing = [], onSuccess }) {
  const initialMembers = useMemo(() => {
    if (Array.isArray(existing) && existing.length > 0) {
      return existing
        .slice()
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((m) => ({
          fullName: m.fullName || '',
          email: m.email || '',
          phone: m.phone || '',
          college: m.college || '',
          collegeLocation: m.collegeLocation || '',
          yearOfStudy: m.yearOfStudy || '',
          department: m.department || '',
        }))
    }
    // First-time: prefill the leader row from the account.
    const leader = emptyMember()
    leader.fullName = profile?.displayName || ''
    leader.email = user?.email || profile?.email || ''
    return [leader]
  }, [existing, profile, user])

  const [teamName, setTeamName] = useState(team?.name && team.name !== 'Untitled team' ? team.name : '')
  const [members, setMembers] = useState(initialMembers)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const size = members.length

  function setSize(n) {
    const next = Math.max(1, Math.min(maxTeamSize, n))
    setMembers((prev) => {
      const copy = prev.slice(0, next)
      while (copy.length < next) copy.push(emptyMember())
      return copy
    })
  }

  function update(idx, field, value) {
    setMembers((prev) => prev.map((m, i) => (i === idx ? { ...m, [field]: value } : m)))
  }

  function validate() {
    if (!teamName.trim()) return 'Please enter your team name.'
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    const seenEmail = new Set()
    const seenPhone = new Set()
    for (let i = 0; i < members.length; i++) {
      const m = members[i]
      const who = i === 0 ? 'Team leader' : `Member ${i + 1}`
      if (!m.fullName.trim()) return `${who}: full name is required.`
      if (!emailRe.test(m.email.trim())) return `${who}: a valid email is required.`
      if (!/^\d{10}$/.test(m.phone.trim())) return `${who}: phone must be exactly 10 digits.`
      if (!m.college.trim()) return `${who}: college name is required.`
      if (!m.collegeLocation.trim()) return `${who}: college location is required.`
      if (!m.yearOfStudy.trim()) return `${who}: year of study is required.`
      if (!m.department.trim()) return `${who}: department is required.`
      const em = m.email.trim().toLowerCase()
      const ph = m.phone.trim()
      if (seenEmail.has(em)) return `Duplicate email within team: ${em}`
      if (seenPhone.has(ph)) return `Duplicate phone within team: ${ph}`
      seenEmail.add(em)
      seenPhone.add(ph)
    }
    return ''
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const v = validate()
    if (v) { setError(v); return }
    setSaving(true)
    setError('')
    try {
      await api.registerTeamMembers({
        teamName: teamName.trim(),
        members: members.map((m) => ({
          fullName: m.fullName.trim(),
          email: m.email.trim(),
          phone: m.phone.trim(),
          college: m.college.trim(),
          collegeLocation: m.collegeLocation.trim(),
          yearOfStudy: m.yearOfStudy.trim(),
          department: m.department.trim(),
        })),
      })
      onSuccess?.()
    } catch (err) {
      setError(err?.message || 'Could not save team details.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2">
        <Users className="h-5 w-5 text-brand-600" />
        <h2 className="font-display text-xl font-bold text-ink-900">Team & Member Details</h2>
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Enter your team <strong>exactly as registered on the UMS registration portal</strong>.
          The team leader fills in details for every member — other members do not need to log in.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-6">
        <Input
          label="Team Name"
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
          placeholder="Team Phoenix"
          maxLength={80}
          required
        />

        {/* Team size selector — full-width & clearly tappable (mobile-friendly) */}
        <div>
          <label className="mb-1 block text-sm font-medium text-ink-700">
            Total team members <span className="text-ink-400">(including you)</span>
          </label>
          <p className="mb-2 text-xs text-ink-500">
            Pick how many people are in your team, then fill each member's details below.
          </p>
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: maxTeamSize }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setSize(n)}
                aria-pressed={size === n}
                className={`h-12 w-full rounded-xl border-2 text-base font-bold transition-colors ${
                  size === n
                    ? 'border-brand-500 bg-brand-500/10 text-brand-700'
                    : 'border-[rgb(var(--border))] text-ink-500 hover:border-brand-400'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs font-medium text-brand-600">
            Selected: {size} member{size === 1 ? '' : 's'}
          </p>
        </div>

        {members.map((m, idx) => (
          <div key={idx} className="rounded-2xl border border-[rgb(var(--border))] p-4">
            <h3 className="mb-4 flex items-center gap-2 font-semibold text-ink-900">
              {idx === 0 ? (
                <><Crown className="h-4 w-4 text-amber-500" /> Team Leader</>
              ) : (
                <>Member {idx + 1}</>
              )}
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Full Name" value={m.fullName} onChange={(e) => update(idx, 'fullName', e.target.value)} placeholder="Full name" maxLength={100} required />
              <Input label="Email" type="email" value={m.email} onChange={(e) => update(idx, 'email', e.target.value)} placeholder="email@example.com" maxLength={120} required />
              <Input label="Mobile Number" type="tel" inputMode="numeric" value={m.phone} onChange={(e) => update(idx, 'phone', e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="10-digit number" maxLength={10} required />
              <Input label="College Name" value={m.college} onChange={(e) => update(idx, 'college', e.target.value)} placeholder="College / Institute" maxLength={150} required />
              <Input label="College Location" value={m.collegeLocation} onChange={(e) => update(idx, 'collegeLocation', e.target.value)} placeholder="City / District" maxLength={150} required />
              <div>
                <label className="mb-1 block text-sm font-medium text-ink-700">Year of Study</label>
                <select
                  value={m.yearOfStudy}
                  onChange={(e) => update(idx, 'yearOfStudy', e.target.value)}
                  required
                  className="h-11 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--page-bg))] px-3 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                >
                  <option value="">Select year</option>
                  {YEAR_OPTIONS.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              <Input label="Department" value={m.department} onChange={(e) => update(idx, 'department', e.target.value)} placeholder="e.g. Computer Engineering" maxLength={100} required />
            </div>
          </div>
        ))}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
        )}

        <Button type="submit" className="w-full gap-2" disabled={saving}>
          {saving ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
          ) : (
            <><Check className="h-4 w-4" /> Save Team Details</>
          )}
        </Button>
      </form>
    </Card>
  )
}
