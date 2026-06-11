import express from 'express'
import { getDb, getBucket } from '../services/firebaseAdmin.js'
import { verifyFirebaseToken, loadUserRole, requireRole } from '../middleware/auth.js'
import multer from 'multer'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'

const router = express.Router()

// Handle OPTIONS preflight
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
 * @route   POST /api/registrations
 * @desc    Create a new registration
 * @access  Private (Authenticated)
 */
router.post(
  '/',
  verifyFirebaseToken,
  upload.single('idCard'),
  async (req, res, next) => {
    try {
      console.log('[REGISTRATION POST] Request received')
      console.log('[REGISTRATION POST] Body:', req.body)
      console.log('[REGISTRATION POST] File:', req.file ? 'present' : 'missing')

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

      if (!req.file) {
        return res.status(400).json({ error: 'ID card PDF is required' })
      }

      const name = req.body.name.trim()
      const institute = req.body.institute.trim()
      const email = req.body.email.trim().toLowerCase()
      const phone = req.body.phone.trim()

      // Check for duplicate email
      const db = getDb()
      const existingEmail = await db.collection('registrations')
        .where('email', '==', email)
        .limit(1)
        .get()

      if (!existingEmail.empty) {
        return res.status(400).json({ error: 'This email is already registered' })
      }

      // Check for duplicate phone
      const existingPhone = await db.collection('registrations')
        .where('phone', '==', phone)
        .limit(1)
        .get()

      if (!existingPhone.empty) {
        return res.status(400).json({ error: 'This phone number is already registered' })
      }

      // Upload ID card to Firebase Storage
      const bucket = getBucket()
      if (!bucket) {
        console.error('[REGISTRATION POST] Firebase Storage not initialized')
        return res.status(500).json({ error: 'Storage not configured' })
      }

      console.log('[REGISTRATION POST] Uploading to bucket:', bucket.name)
      const filename = `registrations/${uuidv4()}-${Date.now()}.pdf`
      const file = bucket.file(filename)

      console.log('[REGISTRATION POST] Saving file with buffer size:', req.file.buffer.length)

      let idCardUrl = ''
      try {
        await file.save(req.file.buffer, {
          metadata: {
            contentType: 'application/pdf',
            metadata: {
              firebaseStorageDownloadTokens: uuidv4(),
            },
          },
          public: false, // Keep ID cards private
        })

        console.log('[REGISTRATION POST] File saved successfully')

        // Get signed URL valid for 1 hour
        const [url] = await file.getSignedUrl({
          action: 'read',
          expires: Date.now() + 365 * 24 * 60 * 60 * 1000, // 1 year
        })
        idCardUrl = url
        console.log('[REGISTRATION POST] Signed URL generated')
      } catch (uploadError) {
        console.error('[REGISTRATION POST] Upload error:', uploadError)
        throw uploadError
      }

      // Create registration document
      const registrationData = {
        name,
        institute,
        email,
        phone,
        idCardUrl,
        idCardPath: filename,
        userId: req.user.uid,
        status: 'pending',
        createdAt: new Date().toISOString(),
      }

      const docRef = await db.collection('registrations').add(registrationData)

      res.status(201).json({
        id: docRef.id,
        ...registrationData,
      })
    } catch (error) {
      console.error('Error creating registration:', error)
      console.error('Error stack:', error.stack)
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
