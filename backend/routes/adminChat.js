/**
 * Admin AI Chatbot — powered by Google Gemini via Vertex AI
 *
 * Uses the Firebase service account credentials already in FIREBASE_SERVICE_ACCOUNT_JSON
 * to authenticate with Vertex AI — no separate API key needed.
 *
 * POST /api/admin/chatbot
 * Body: { message: string, history: [{ role: 'user'|'model', text: string }] }
 */

import { Router } from 'express'
import { GoogleAuth } from 'google-auth-library'
import { verifyFirebaseToken, loadUserRole, requireRole } from '../middleware/auth.js'

const router = Router()
router.use(verifyFirebaseToken, loadUserRole, requireRole('admin'))

const GEMINI_MODEL = 'gemini-2.5-flash'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

// Cache auth client — token auto-refreshes when expired
let _authClient = null

async function getAccessToken() {
  if (!_authClient) {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
    if (!serviceAccountJson) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON not set')
    const credentials = JSON.parse(serviceAccountJson)
    _authClient = new GoogleAuth({
      credentials,
      scopes: [
        'https://www.googleapis.com/auth/generative-language',
        'https://www.googleapis.com/auth/cloud-platform',
      ],
    })
  }
  return _authClient.getAccessToken()
}

const SYSTEM_PROMPT = `You are the SKH Admin Assistant — a helpful, concise AI assistant embedded inside the admin panel of the Smart Kopargaon Hackathon (SKH) platform.

## Platform Overview
SKH is a national-level hackathon platform built for Kopargaon Taluka, hosted by Sanjivani University. It manages the full lifecycle of a hackathon: registration, team formation, problem statement selection, submissions, jury evaluation, and results.

## User Roles
- **Admin**: Full platform control. Can manage all data, assign roles, configure events.
- **Participant**: Forms/joins teams, registers, selects a problem statement, submits work.
- **Judge (Jury)**: Evaluates assigned teams' submissions using a scoring rubric.
- **Mentor**: Guides assigned teams. Can be assigned by domain+track, problem statement, or directly to a team.

## Key Concepts

### Events & Lifecycle
- The platform supports multiple hackathon editions (events). One is "active" at a time.
- Lifecycle phases: DRAFT → REGISTRATION → SUBMISSIONS → EVALUATION → RESULTS → ARCHIVED
- Admin can set the active event, toggle registration open/closed, set deadlines.

### Teams
- Teams have 2–4 members. One is the leader.
- Teams must register for the event (with optional entry fee via Razorpay).
- Teams select one problem statement from the published list.
- Teams submit files (PPT, PDF, video, GitHub link) and finalize before the deadline.

### Problem Statements (PS)
- Each PS has: title, organization, department, track (Software/Hardware), domain (one of 7), description, max teams cap.
- PS IDs are auto-assigned as skh001, skh002, etc. on bulk import.
- 8 official domains: Health, Education, Transportation, Food Safety & Security, Waste Management, Agriculture, Industry & MSME Innovation, Open Innovation.
- 2 tracks: Software, Hardware.
- Admin can bulk import via CSV, or add individually.

### Mentor Assignment
- Mentors can be assigned in 3 ways:
  1. By Domain + Track: Mentor automatically covers all teams whose PS matches that domain/track.
  2. By Problem Statement: Mentor covers all teams working on that specific PS.
  3. Directly to a Team: One-to-one assignment.
- Multiple assignments per mentor are supported.

### Jury / Evaluation
- Judges are assigned to specific problem statements.
- They evaluate teams using a configurable scoring rubric.
- Admin can view evaluation progress and shortlist teams for next phases.

### Competition Phases
- Admin can define multiple competition phases (e.g. Idea Submission, Prototype, Grand Finale).
- Each phase has a state machine: UPCOMING → ACTIVE → LOCKED → COMPLETED → ARCHIVED.
- Only one phase can be ACTIVE at a time.
- Teams can be shortlisted for specific phases.

### Payments
- Entry fee is optional and configurable per event.
- Payments go through Razorpay. Admin can also record manual payments.

### Access Control
- Admin can change user roles, ban users, or delete users.
- Deleting a user removes their profile, team membership, evaluations, mentor notes, and notifications.
- Super admin accounts are protected from modification.

### Announcements
- Admin can broadcast announcements to all users or specific audiences.
- Announcements trigger email notifications.

### Results / Leaderboard
- Results are only visible when admin sets resultsPublished: true on the event.
- Rankings are based on average jury scores.

## Admin Panel Navigation
- **Overview**: Dashboard with key stats.
- **Registrations**: View and manage team registrations.
- **Teams**: Full team list with bulk operations.
- **Payments**: Payment status and manual recording.
- **Problem Statements**: Create, edit, bulk import, delete PS.
- **Competition Phases**: Define and manage hackathon phases.
- **Submissions**: View all team submissions.
- **Jury Management**: Assign judges to problem statements.
- **Mentor Management**: Assign mentors by domain+track, PS, or team.
- **Evaluations**: View evaluation progress.
- **Shortlisting**: Manage team shortlists per phase.
- **Announcements**: Broadcast messages.
- **Timeline**: Manage the public-facing event timeline.
- **Reports & Analytics**: Export data, view charts.
- **Access Control**: Manage user roles and accounts.
- **Activity Logs**: Audit trail of all admin actions.
- **Settings**: Event configuration (registration, fees, deadlines, evaluation criteria).
- **System Health**: Backend health check.
- **Security**: Security events and incidents.
- **Tutorial / Guide**: Step-by-step admin guide.

## Your Behavior
- Be concise and direct. Admins are busy.
- Give step-by-step instructions when asked how to do something.
- If something isn't possible in the platform, say so clearly.
- Don't make up features that don't exist.
- Use bullet points for multi-step answers.
- Keep responses under 300 words unless the question genuinely requires more detail.`

router.post('/', async (req, res, next) => {
  try {
    const message = String(req.body?.message || '').trim().slice(0, 2000)
    if (!message) return res.status(400).json({ error: 'message required' })

    // Get fresh access token from service account
    let token
    try {
      token = await getAccessToken()
    } catch (e) {
      console.error('[AdminChat] Auth error:', e.message)
      return res.status(503).json({ error: 'Failed to authenticate with Gemini. Check FIREBASE_SERVICE_ACCOUNT_JSON.' })
    }

    // Build conversation history (max last 10 turns)
    const rawHistory = Array.isArray(req.body?.history) ? req.body.history : []
    const history = rawHistory.slice(-10).map((h) => ({
      role: h.role === 'model' ? 'model' : 'user',
      parts: [{ text: String(h.text || '').slice(0, 1000) }],
    }))

    const contents = [
      ...history,
      { role: 'user', parts: [{ text: message }] },
    ]

    const payload = {
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents,
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 600,
        topP: 0.9,
      },
    }

    const geminiRes = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    })

    if (!geminiRes.ok) {
      const errText = await geminiRes.text().catch(() => '')
      console.error('[AdminChat] Gemini error:', geminiRes.status, errText.slice(0, 400))
      let errMsg = `Gemini error (${geminiRes.status})`
      try {
        const errJson = JSON.parse(errText)
        const detail = errJson?.error?.message || ''
        if (detail) errMsg = detail
      } catch { /* use default */ }
      return res.status(502).json({ error: errMsg })
    }

    const data = await geminiRes.json()
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''

    if (!reply) {
      console.error('[AdminChat] Empty response:', JSON.stringify(data).slice(0, 300))
      return res.status(502).json({ error: 'Empty response from Gemini.' })
    }

    res.json({ reply })
  } catch (e) {
    next(e)
  }
})

export default router
