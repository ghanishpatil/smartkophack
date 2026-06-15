import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { User, Mail, Building2, Tag, Shield, LogOut, CheckCircle2, Sparkles, Users } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { usePageSeo } from '@/hooks/usePageSeo.js'
import { useAuth } from '@/context/AuthContext.jsx'
import { useApi } from '@/hooks/useApi.js'
import { Card } from '@/components/ui/Card.jsx'
import { Button } from '@/components/ui/Button.jsx'
import { Input, Textarea } from '@/components/ui/Input.jsx'
import { Badge } from '@/components/ui/Badge.jsx'
import { SkillTagEditor } from '@/components/participant/SkillTagEditor.jsx'

const schema = z.object({
  displayName: z.string().trim().min(1, 'Name is required').max(80),
  institute: z.string().trim().max(160),
  trackChoice: z.string().trim().max(120),
})

export function ParticipantSettingsPage() {
  usePageSeo({ title: 'Settings', description: 'Your account and profile.' })
  const { user, profile, updateUserProfile, logout } = useAuth()
  const api = useApi()
  const navigate = useNavigate()
  const [saved, setSaved] = useState(false)

  // ── Feature 3: Skill tags & profile ──
  const [skills, setSkills] = useState([])
  const [bio, setBio] = useState('')
  const [lookingForTeam, setLookingForTeam] = useState(false)
  const [skillSuggestions, setSkillSuggestions] = useState([])
  const [skillsLoaded, setSkillsLoaded] = useState(false)
  const [skillsDirty, setSkillsDirty] = useState(false)
  const [skillsSaving, setSkillsSaving] = useState(false)
  const [skillsSaved, setSkillsSaved] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      displayName: '',
      institute: '',
      trackChoice: '',
    },
  })

  useEffect(() => {
    reset({
      displayName: profile?.displayName || '',
      institute: profile?.institute || '',
      trackChoice: profile?.trackChoice || '',
    })
  }, [profile, reset])

  // Load skill profile once on mount
  useEffect(() => {
    let cancelled = false
    api.getMyProfile()
      .then((data) => {
        if (cancelled || !data) return
        setSkills(Array.isArray(data.skills) ? data.skills : [])
        setBio(data.bio || '')
        setLookingForTeam(Boolean(data.lookingForTeam))
        setSkillSuggestions(Array.isArray(data.suggestions) ? data.suggestions : [])
        setSkillsLoaded(true)
      })
      .catch(() => setSkillsLoaded(true))
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function onSubmit(values) {
    await updateUserProfile({
      displayName: values.displayName?.trim() || '',
      institute: values.institute?.trim() || '',
      trackChoice: values.trackChoice?.trim() || '',
    })
    reset(values)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  async function saveSkills() {
    setSkillsSaving(true)
    try {
      await api.updateMySkills({ skills, bio: bio.trim(), lookingForTeam })
      setSkillsDirty(false)
      setSkillsSaved(true)
      setTimeout(() => setSkillsSaved(false), 3000)
    } finally {
      setSkillsSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="font-display text-2xl font-bold text-ink-900 sm:text-3xl">Settings</h1>
        <p className="mt-1 text-sm text-ink-500">Manage your profile and account preferences.</p>
      </motion.div>

      {/* Account Info Card */}
      <Card>
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-500/10 font-display text-xl font-bold text-brand-600">
            {(profile?.displayName || user?.email || '?')[0].toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-ink-900">
              {profile?.displayName || 'Participant'}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-500">
              <Mail className="h-3.5 w-3.5" />
              <span>{user?.email}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge tone="brand">{profile?.role || 'participant'}</Badge>
              {profile?.teamId && <Badge tone="success">In a team</Badge>}
            </div>
          </div>
        </div>
      </Card>

      {/* Profile Form */}
      <Card>
        <h2 className="flex items-center gap-2 font-display text-base font-semibold text-ink-900">
          <User className="h-4 w-4 text-brand-600" />
          Profile Information
        </h2>
        <p className="mt-1 text-xs text-ink-500">This information is visible to your team and judges.</p>

        <form className="mt-5 space-y-4" onSubmit={handleSubmit(onSubmit)}>
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-ink-700">
              <User className="h-3.5 w-3.5 text-ink-400" /> Display Name
            </label>
            <Input {...register('displayName')} error={errors.displayName?.message} placeholder="Your full name" />
          </div>

          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-ink-700">
              <Building2 className="h-3.5 w-3.5 text-ink-400" /> Institute / College
            </label>
            <Input {...register('institute')} error={errors.institute?.message} placeholder="e.g. Sanjivani University" />
          </div>

          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-ink-700">
              <Tag className="h-3.5 w-3.5 text-ink-400" /> Track / Focus Area
            </label>
            <Input {...register('trackChoice')} error={errors.trackChoice?.message} placeholder="e.g. Cyber Security, AI/ML, IoT" />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" disabled={!isDirty || isSubmitting} loading={isSubmitting}>
              Save Changes
            </Button>
            {saved && (
              <motion.span
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-1.5 text-sm text-emerald-600"
              >
                <CheckCircle2 className="h-4 w-4" /> Saved
              </motion.span>
            )}
          </div>
        </form>
      </Card>

      {/* Skills & Profile (Feature 3) */}
      <Card>
        <h2 className="flex items-center gap-2 font-display text-base font-semibold text-ink-900">
          <Sparkles className="h-4 w-4 text-brand-600" />
          Skills & Expertise
        </h2>
        <p className="mt-1 text-xs text-ink-500">
          Tag your tech stack so mentors and teammates know your strengths. This also powers team matchmaking.
        </p>

        {!skillsLoaded ? (
          <div className="mt-5 h-12 animate-pulse rounded-xl bg-[rgb(var(--surface-muted))]" />
        ) : (
          <div className="mt-5 space-y-5">
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-ink-700">
                <Tag className="h-3.5 w-3.5 text-ink-400" /> Your Skills
              </label>
              <SkillTagEditor
                value={skills}
                onChange={(next) => { setSkills(next); setSkillsDirty(true) }}
                suggestions={skillSuggestions}
                max={12}
              />
            </div>

            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-ink-700">
                <User className="h-3.5 w-3.5 text-ink-400" /> Short Bio
              </label>
              <Textarea
                value={bio}
                onChange={(e) => { setBio(e.target.value); setSkillsDirty(true) }}
                rows={3}
                maxLength={300}
                placeholder="A line or two about what you love to build…"
              />
              <p className="mt-1 text-right text-xs text-ink-400">{bio.length}/300</p>
            </div>

            {/* Looking for team toggle */}
            <button
              type="button"
              onClick={() => { setLookingForTeam((v) => !v); setSkillsDirty(true) }}
              className="flex w-full items-center justify-between rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))]/30 px-4 py-3 transition-all hover:border-brand-500/30"
            >
              <div className="flex items-center gap-3">
                <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${lookingForTeam ? 'bg-emerald-500/15 text-emerald-600' : 'bg-[rgb(var(--surface-muted))] text-ink-400'}`}>
                  <Users className="h-4 w-4" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium text-ink-900">Looking for a team</p>
                  <p className="text-xs text-ink-500">Show me in matchmaking so others can find me</p>
                </div>
              </div>
              <span className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${lookingForTeam ? 'bg-emerald-500' : 'bg-ink-300'}`}>
                <motion.span
                  layout
                  className="inline-block h-5 w-5 rounded-full bg-white shadow"
                  animate={{ x: lookingForTeam ? 22 : 2 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                />
              </span>
            </button>

            <div className="flex items-center gap-3 pt-1">
              <Button onClick={saveSkills} disabled={!skillsDirty || skillsSaving} loading={skillsSaving}>
                Save Profile
              </Button>
              {skillsSaved && (
                <motion.span
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center gap-1.5 text-sm text-emerald-600"
                >
                  <CheckCircle2 className="h-4 w-4" /> Saved
                </motion.span>
              )}
            </div>
          </div>
        )}
      </Card>

      {/* Security */}
      <Card>
        <h2 className="flex items-center gap-2 font-display text-base font-semibold text-ink-900">
          <Shield className="h-4 w-4 text-brand-600" />
          Account Security
        </h2>
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))]/30 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-ink-900">Email</p>
              <p className="text-xs text-ink-500">{user?.email}</p>
            </div>
            <Badge tone="success">Verified</Badge>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))]/30 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-ink-900">Auth Provider</p>
              <p className="text-xs text-ink-500">{user?.providerData?.[0]?.providerId === 'google.com' ? 'Google' : 'Email & Password'}</p>
            </div>
            <Badge tone="neutral">{user?.providerData?.[0]?.providerId === 'google.com' ? 'OAuth' : 'Password'}</Badge>
          </div>
        </div>
      </Card>

      {/* Sign Out */}
      <Card className="border-red-500/20">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-base font-semibold text-ink-900">Sign Out</h2>
            <p className="text-xs text-ink-500">Log out of your account on this device.</p>
          </div>
          <Button
            variant="secondary"
            className="border-red-500/40 text-red-600 hover:bg-red-500/10"
            onClick={() => logout().then(() => navigate('/'))}
          >
            <LogOut className="mr-1.5 h-4 w-4" /> Sign Out
          </Button>
        </div>
      </Card>
    </div>
  )
}
