import express from 'express'
import { getDb } from '../services/firebaseAdmin.js'
import { verifyFirebaseToken, loadUserRole, requireRole } from '../middleware/auth.js'

const router = express.Router()

// Handle OPTIONS preflight for CORS
router.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }
  next()
})

/**
 * @route   GET /api/registrations
 * @desc    Get all registrations (admin only)
 * @access  Private (Admin)
 */
router.get(
  '/',
  verifyFirebaseToken,
  loadUserRole,
  requireRole('admin'),
  async (req, res, next) => {
    try {
      const db = getDb()
      const snapshot = await db.collection('registrations')
        .orderBy('createdAt', 'desc')
        .get()

      const registrations = []
      snapshot.forEach(doc => {
        registrations.push({ id: doc.id, ...doc.data() })
      })

      res.json(registrations)
    } catch (error) {
      next(error)
    }
  }
)

// NOTE: Member registration is now handled in a single leader-driven step via
// POST /api/participant/register-team-members (see routes/participant.js).
// The team leader submits all member details (leader + up to 3 others) at once.
// The legacy per-member, ID-card-based upload endpoint has been removed.

/**
 * @route   GET /api/registrations/team/:teamId/members
 * @desc    Get all member registrations for a team
 * @access  Private (Team member or Admin)
 */
router.get(
  '/team/:teamId/members',
  verifyFirebaseToken,
  loadUserRole,
  async (req, res, next) => {
    try {
      const { teamId } = req.params
      const db = getDb()

      // Verify team exists
      const teamDoc = await db.collection('teams').doc(teamId).get()
      if (!teamDoc.exists) {
        return res.status(404).json({ error: 'Team not found' })
      }

      const teamData = teamDoc.data()

      // Check authorization: must be admin/observer or team member (schema: leaderId + memberIds)
      const memberIds = Array.isArray(teamData.memberIds) ? teamData.memberIds : []
      const isMember = teamData.leaderId === req.user.uid || memberIds.includes(req.user.uid)
      // Role is resolved by loadUserRole into req.profile.role (req.user has no role).
      // Observers (read-only viewers) get the same read access as admins here.
      const isPrivileged = req.profile?.role === 'admin' || req.profile?.role === 'viewer'
      if (!isPrivileged && !isMember) {
        return res.status(403).json({ error: 'Access denied' })
      }

      const snapshot = await db.collection('memberRegistrations')
        .where('teamId', '==', teamId)
        .orderBy('createdAt', 'asc')
        .get()

      const registrations = []
      snapshot.forEach(doc => {
        registrations.push({ id: doc.id, ...doc.data() })
      })

      // New model: declared team size lives on the team doc (leader picks 1-4).
      // Fall back to memberIds length for legacy teams created before this change.
      const declaredSize = typeof teamData.teamSize === 'number' && teamData.teamSize > 0
        ? teamData.teamSize
        : memberIds.length

      res.json({
        teamId,
        teamName: teamData.name || 'Unnamed Team',
        totalMembers: declaredSize,
        registeredMembers: registrations.length,
        registrations,
      })
    } catch (error) {
      next(error)
    }
  }
)

/**
 * @route   GET /api/registrations/teams
 * @desc    Get all teams with their member registration status (admin only)
 * @access  Private (Admin)
 */
router.get(
  '/teams',
  verifyFirebaseToken,
  loadUserRole,
  requireRole('admin'),
  async (req, res, next) => {
    try {
      const db = getDb()

      // Get all teams
      const teamsSnapshot = await db.collection('teams').get()
      const teams = []

      for (const teamDoc of teamsSnapshot.docs) {
        const teamData = teamDoc.data()
        const teamId = teamDoc.id

        // Get member registrations for this team
        const regsSnapshot = await db.collection('memberRegistrations')
          .where('teamId', '==', teamId)
          .get()

        const registrations = []
        regsSnapshot.forEach(doc => {
          registrations.push({ id: doc.id, ...doc.data() })
        })

        const memberIdsLen = Array.isArray(teamData.memberIds) ? teamData.memberIds.length : 0
        const declaredSize = typeof teamData.teamSize === 'number' && teamData.teamSize > 0
          ? teamData.teamSize
          : memberIdsLen

        // Count member approval statuses so the list view can show pending icon.
        let pendingMembers = 0
        let approvedMembers = 0
        for (const r of registrations) {
          const s = String(r.status || 'pending').toLowerCase()
          if (s === 'approved') approvedMembers++
          else if (s === 'pending') pendingMembers++
        }

        teams.push({
          id: teamId,
          name: teamData.name || 'Unnamed Team',
          totalMembers: declaredSize,
          registeredMembers: registrations.length,
          pendingMembers,
          approvedMembers,
          eventRegistered: teamData.eventRegistered || false,
          paymentStatus: teamData.paymentStatus || 'unpaid',
          createdAt: teamData.createdAt,
        })
      }

      // Sort by created date
      teams.sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0
        return dateB - dateA
      })

      res.json(teams)
    } catch (error) {
      next(error)
    }
  }
)

/**
 * @route   GET /api/registrations/:id
 * @desc    Get single registration
 * @access  Private (Admin or Owner)
 */
router.get(
  '/:id',
  verifyFirebaseToken,
  loadUserRole,
  async (req, res, next) => {
    try {
      const { id } = req.params
      const db = getDb()
      const doc = await db.collection('registrations').doc(id).get()

      if (!doc.exists) {
        return res.status(404).json({ error: 'Registration not found' })
      }

      const data = doc.data()

      // Allow admin or owner to view (role lives on req.profile, not req.user).
      if (req.profile?.role !== 'admin' && data.userId !== req.user.uid) {
        return res.status(403).json({ error: 'Access denied' })
      }

      res.json({ id: doc.id, ...data })
    } catch (error) {
      next(error)
    }
  }
)

/**
 * @route   PUT /api/registrations/:id/status
 * @desc    Update registration status (admin only)
 * @access  Private (Admin)
 */
router.put(
  '/:id/status',
  verifyFirebaseToken,
  loadUserRole,
  requireRole('admin'),
  async (req, res, next) => {
    try {
      const { id } = req.params
      const { status } = req.body

      if (!['pending', 'approved', 'rejected'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status. Must be: pending, approved, or rejected' })
      }

      const db = getDb()
      const docRef = db.collection('registrations').doc(id)
      const doc = await docRef.get()

      if (!doc.exists) {
        return res.status(404).json({ error: 'Registration not found' })
      }

      await docRef.update({
        status,
        updatedAt: new Date().toISOString(),
        updatedBy: req.user.uid,
      })

      const updated = await docRef.get()
      res.json({ id: updated.id, ...updated.data() })
    } catch (error) {
      next(error)
    }
  }
)

/**
 * @route   PUT /api/registrations/member/:id/status
 * @desc    Approve / reject a single member registration (admin only)
 * @access  Private (Admin)
 */
router.put(
  '/member/:id/status',
  verifyFirebaseToken,
  loadUserRole,
  requireRole('admin'),
  async (req, res, next) => {
    try {
      const { id } = req.params
      const status = String(req.body?.status || '')

      if (!['pending', 'approved', 'rejected'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status. Must be: pending, approved, or rejected' })
      }

      const db = getDb()
      const docRef = db.collection('memberRegistrations').doc(id)
      const doc = await docRef.get()

      if (!doc.exists) {
        return res.status(404).json({ error: 'Member registration not found' })
      }

      await docRef.update({
        status,
        updatedAt: new Date().toISOString(),
        updatedBy: req.user.uid,
      })

      const updated = await docRef.get()
      res.json({ id: updated.id, ...updated.data() })
    } catch (error) {
      next(error)
    }
  }
)

/**
 * @route   PUT /api/registrations/members/bulk-approve
 * @desc    Approve all *pending* member registrations for the given teams in one
 *          go (admin only). Only touches docs whose status is 'pending' — already
 *          approved/rejected members are left untouched. No other team fields are
 *          modified, so registration/submission gating is unaffected.
 * @access  Private (Admin)
 */
router.put(
  '/members/bulk-approve',
  verifyFirebaseToken,
  loadUserRole,
  requireRole('admin'),
  async (req, res, next) => {
    try {
      const rawIds = Array.isArray(req.body?.teamIds) ? req.body.teamIds : []
      const teamIds = [...new Set(rawIds.filter((id) => typeof id === 'string' && id.trim()))].slice(0, 1000)
      if (teamIds.length === 0) {
        return res.status(400).json({ error: 'teamIds array is required.' })
      }

      const db = getDb()
      const nowIso = new Date().toISOString()
      const uid = req.user.uid

      let approved = 0
      let batch = db.batch()
      let ops = 0

      // Per-team query keeps us on the auto-created single-field index (teamId),
      // avoiding any composite-index requirement in production. Status is
      // filtered in memory so we only update genuinely pending members.
      for (const teamId of teamIds) {
        const snap = await db.collection('memberRegistrations')
          .where('teamId', '==', teamId)
          .get()
        for (const d of snap.docs) {
          const s = String(d.data()?.status || 'pending').toLowerCase()
          if (s !== 'pending') continue
          batch.update(d.ref, { status: 'approved', updatedAt: nowIso, updatedBy: uid })
          approved++
          ops++
          if (ops >= 450) {
            await batch.commit()
            batch = db.batch()
            ops = 0
          }
        }
      }
      if (ops > 0) await batch.commit()

      res.json({ ok: true, approved, teams: teamIds.length })
    } catch (error) {
      next(error)
    }
  }
)

export default router
