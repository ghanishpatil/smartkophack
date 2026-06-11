import express from 'express'
import { getDb, getBucket } from '../services/firebaseAdmin.js'
import { verifyFirebaseToken, loadUserRole, requireRole } from '../middleware/auth.js'
import multer from 'multer'
import { v4 as uuidv4 } from 'uuid'

const router = express.Router()

// Handle OPTIONS preflight for CORS
router.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }
  next()
})

// Configure multer for memory storage
const storage = multer.memoryStorage()
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Only allow PDF files
    if (file.mimetype === 'application/pdf') {
      cb(null, true)
    } else {
      cb(new Error('Only PDF files are allowed for ID card upload'))
    }
  }
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

/**
 * @route   POST /api/registrations/member
 * @desc    Submit individual member registration for a team
 * @access  Private (Authenticated)
 */
router.post(
  '/member',
  verifyFirebaseToken,
  upload.single('idCard'),
  async (req, res, next) => {
    try {
      console.log('[MEMBER REGISTRATION POST] Request received')
      console.log('[MEMBER REGISTRATION POST] Body:', req.body)
      console.log('[MEMBER REGISTRATION POST] File:', req.file ? 'present' : 'missing')

      // Manual validation
      if (!req.body.name || !req.body.name.trim()) {
        return res.status(400).json({ error: 'Name is required' })
      }

      if (!req.body.institute || !req.body.institute.trim()) {
        return res.status(400).json({ error: 'Institute is required' })
      }

      if (!req.body.email || !req.body.email.trim()) {
        return res.status(400).json({ error: 'Email is required' })
      }

      // Email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(req.body.email.trim())) {
        return res.status(400).json({ error: 'Invalid email format' })
      }

      if (!req.body.phone || !req.body.phone.trim()) {
        return res.status(400).json({ error: 'Phone number is required' })
      }

      // Phone validation (10 digits)
      const phoneRegex = /^\d{10}$/
      if (!phoneRegex.test(req.body.phone.trim())) {
        return res.status(400).json({ error: 'Phone number must be 10 digits' })
      }

      if (!req.body.teamId || !req.body.teamId.trim()) {
        return res.status(400).json({ error: 'Team ID is required' })
      }

      if (!req.body.userId || !req.body.userId.trim()) {
        return res.status(400).json({ error: 'User ID is required' })
      }

      if (!req.file) {
        return res.status(400).json({ error: 'ID card PDF is required' })
      }

      const name = req.body.name.trim()
      const institute = req.body.institute.trim()
      const email = req.body.email.trim().toLowerCase()
      const phone = req.body.phone.trim()
      const teamId = req.body.teamId.trim()
      const userId = req.body.userId.trim()

      const db = getDb()

      // Verify team exists
      const teamDoc = await db.collection('teams').doc(teamId).get()
      if (!teamDoc.exists) {
        return res.status(404).json({ error: 'Team not found' })
      }

      const teamData = teamDoc.data()
      
      // Verify the authenticated user is a member of this team
      const isAuthUserMember = teamData.members?.some(m => m.uid === req.user.uid)
      if (!isAuthUserMember) {
        return res.status(403).json({ error: 'You are not a member of this team' })
      }

      // Verify the authenticated user is the team leader
      const isLeader = teamData.members?.some(m => m.uid === req.user.uid && m.isLeader === true)
      if (!isLeader) {
        return res.status(403).json({ error: 'Only the team leader can register members' })
      }

      // Verify the userId being registered is actually a member of the team
      const isTargetUserMember = teamData.members?.some(m => m.uid === userId)
      if (!isTargetUserMember) {
        return res.status(400).json({ error: 'The user being registered is not a member of this team' })
      }

      // Check if this specific member already has a registration for this team
      const existingReg = await db.collection('memberRegistrations')
        .where('teamId', '==', teamId)
        .where('userId', '==', userId)
        .limit(1)
        .get()

      if (!existingReg.empty) {
        return res.status(400).json({ error: `Registration already exists for this member` })
      }

      // Check for duplicate email within team
      const existingEmail = await db.collection('memberRegistrations')
        .where('teamId', '==', teamId)
        .where('email', '==', email)
        .limit(1)
        .get()

      if (!existingEmail.empty) {
        return res.status(400).json({ error: 'This email is already used by another team member' })
      }

      // Check for duplicate phone within team
      const existingPhone = await db.collection('memberRegistrations')
        .where('teamId', '==', teamId)
        .where('phone', '==', phone)
        .limit(1)
        .get()

      if (!existingPhone.empty) {
        return res.status(400).json({ error: 'This phone number is already used by another team member' })
      }

      // Upload ID card to Firebase Storage
      const bucket = getBucket()
      if (!bucket) {
        console.error('[MEMBER REGISTRATION POST] Firebase Storage not initialized')
        return res.status(500).json({ error: 'Storage not configured' })
      }

      console.log('[MEMBER REGISTRATION POST] Uploading to bucket:', bucket.name)
      const filename = `member-registrations/${teamId}/${req.user.uid}-${Date.now()}.pdf`
      const file = bucket.file(filename)

      console.log('[MEMBER REGISTRATION POST] Saving file with buffer size:', req.file.buffer.length)

      let idCardUrl = ''
      try {
        await file.save(req.file.buffer, {
          metadata: {
            contentType: 'application/pdf',
            metadata: {
              firebaseStorageDownloadTokens: uuidv4(),
            },
          },
          public: false,
        })

        console.log('[MEMBER REGISTRATION POST] File saved successfully')

        // Get signed URL valid for 1 year
        const [url] = await file.getSignedUrl({
          action: 'read',
          expires: Date.now() + 365 * 24 * 60 * 60 * 1000,
        })
        idCardUrl = url
        console.log('[MEMBER REGISTRATION POST] Signed URL generated')
      } catch (uploadError) {
        console.error('[MEMBER REGISTRATION POST] Upload error:', uploadError)
        throw uploadError
      }

      // Create member registration document
      const registrationData = {
        name,
        institute,
        email,
        phone,
        idCardUrl,
        idCardPath: filename,
        userId: userId,
        teamId,
        teamName: teamData.name || 'Unnamed Team',
        registeredBy: req.user.uid, // Track who submitted this registration
        status: 'pending',
        createdAt: new Date().toISOString(),
      }

      const docRef = await db.collection('memberRegistrations').add(registrationData)

      res.status(201).json({
        id: docRef.id,
        ...registrationData,
      })
    } catch (error) {
      console.error('Error creating member registration:', error)
      console.error('Error stack:', error.stack)
      next(error)
    }
  }
)

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

      // Check authorization: must be admin or team member
      const isMember = teamData.members?.some(m => m.uid === req.user.uid)
      if (req.user.role !== 'admin' && !isMember) {
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

      res.json({
        teamId,
        teamName: teamData.name || 'Unnamed Team',
        totalMembers: teamData.members?.length || 0,
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

        teams.push({
          id: teamId,
          name: teamData.name || 'Unnamed Team',
          totalMembers: teamData.members?.length || 0,
          registeredMembers: registrations.length,
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

      // Allow admin or owner to view
      if (req.user.role !== 'admin' && data.userId !== req.user.uid) {
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

export default router
