import express from 'express'
import { getDb } from '../services/firebaseAdmin.js'
import { getStorage } from 'firebase-admin/storage'
import { verifyFirebaseToken, loadUserRole, requireRole } from '../middleware/auth.js'
import multer from 'multer'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'

const router = express.Router()

// Configure multer for memory storage
const storage = multer.memoryStorage()
const upload = multer({
  storage,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB limit for logos
  },
  fileFilter: (req, file, cb) => {
    // Only allow image files
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/svg+xml']
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, WebP, and SVG images are allowed.'))
    }
  }
})

/**
 * @route   GET /api/sponsors
 * @desc    Get all sponsors (public)
 * @access  Public
 */
router.get('/', async (req, res, next) => {
  try {
    const db = getDb()
    const snapshot = await db.collection('sponsors')
      .orderBy('order', 'asc')
      .get()

    const sponsors = []
    snapshot.forEach(doc => {
      sponsors.push({ id: doc.id, ...doc.data() })
    })

    res.json(sponsors)
  } catch (error) {
    next(error)
  }
})

/**
 * @route   POST /api/sponsors
 * @desc    Create a new sponsor (admin only)
 * @access  Private (Admin)
 */
router.post(
  '/',
  verifyFirebaseToken,
  loadUserRole,
  requireRole('admin'),
  upload.single('logo'),
  async (req, res, next) => {
    try {
      // Manual validation since express-validator doesn't work well with multer
      if (!req.body.name || !req.body.name.trim()) {
        return res.status(400).json({ error: 'Organization name is required' })
      }

      if (!req.file) {
        return res.status(400).json({ error: 'Logo file is required' })
      }

      const name = req.body.name.trim()
      const label = req.body.label ? req.body.label.trim() : ''
      const order = req.body.order ? parseInt(req.body.order) : 0

      if (isNaN(order) || order < 0) {
        return res.status(400).json({ error: 'Order must be a non-negative integer' })
      }

      // Upload logo to Firebase Storage
      const bucket = getStorage().bucket()
      const filename = `sponsors/${uuidv4()}-${Date.now()}${path.extname(req.file.originalname)}`
      const file = bucket.file(filename)

      await file.save(req.file.buffer, {
        metadata: {
          contentType: req.file.mimetype,
          metadata: {
            firebaseStorageDownloadTokens: uuidv4(),
          },
        },
      })

      // Make file publicly accessible
      await file.makePublic()

      const logoUrl = `https://storage.googleapis.com/${bucket.name}/${filename}`

      // Create sponsor document
      const sponsorData = {
        name,
        label,
        order,
        logoUrl,
        logoPath: filename,
        createdAt: new Date().toISOString(),
        createdBy: req.user.uid,
      }

      const db = getDb()
      const docRef = await db.collection('sponsors').add(sponsorData)

      res.status(201).json({
        id: docRef.id,
        ...sponsorData,
      })
    } catch (error) {
      next(error)
    }
  }
)

/**
 * @route   PUT /api/sponsors/:id
 * @desc    Update a sponsor (admin only)
 * @access  Private (Admin)
 */
router.put(
  '/:id',
  verifyFirebaseToken,
  loadUserRole,
  requireRole('admin'),
  upload.single('logo'),
  async (req, res, next) => {
    try {
      const { id } = req.params

      // Manual validation
      if (req.body.name && !req.body.name.trim()) {
        return res.status(400).json({ error: 'Name cannot be empty' })
      }

      if (req.body.order !== undefined) {
        const orderNum = parseInt(req.body.order)
        if (isNaN(orderNum) || orderNum < 0) {
          return res.status(400).json({ error: 'Order must be a non-negative integer' })
        }
      }

      // Check if sponsor exists
      const db = getDb()
      const sponsorRef = db.collection('sponsors').doc(id)
      const sponsorDoc = await sponsorRef.get()

      if (!sponsorDoc.exists) {
        return res.status(404).json({ error: 'Sponsor not found' })
      }

      const updateData = {
        updatedAt: new Date().toISOString(),
        updatedBy: req.user.uid,
      }

      if (req.body.name) updateData.name = req.body.name.trim()
      if (req.body.label !== undefined) updateData.label = req.body.label ? req.body.label.trim() : ''
      if (req.body.order !== undefined) updateData.order = parseInt(req.body.order)

      // If new logo is uploaded, delete old one and upload new one
      if (req.file) {
        const bucket = getStorage().bucket()
        const oldLogoPath = sponsorDoc.data().logoPath

        // Delete old logo if exists
        if (oldLogoPath) {
          try {
            await bucket.file(oldLogoPath).delete()
          } catch (error) {
            console.error('Error deleting old sponsor logo:', error)
          }
        }

        // Upload new logo
        const filename = `sponsors/${uuidv4()}-${Date.now()}${path.extname(req.file.originalname)}`
        const file = bucket.file(filename)

        await file.save(req.file.buffer, {
          metadata: {
            contentType: req.file.mimetype,
            metadata: {
              firebaseStorageDownloadTokens: uuidv4(),
            },
          },
        })

        await file.makePublic()

        const logoUrl = `https://storage.googleapis.com/${bucket.name}/${filename}`
        updateData.logoUrl = logoUrl
        updateData.logoPath = filename
      }

      await sponsorRef.update(updateData)

      const updated = await sponsorRef.get()
      res.json({ id: updated.id, ...updated.data() })
    } catch (error) {
      next(error)
    }
  }
)

/**
 * @route   DELETE /api/sponsors/:id
 * @desc    Delete a sponsor (admin only)
 * @access  Private (Admin)
 */
router.delete(
  '/:id',
  verifyFirebaseToken,
  loadUserRole,
  requireRole('admin'),
  async (req, res, next) => {
    try {
      const { id } = req.params

      if (!id || !id.trim()) {
        return res.status(400).json({ error: 'Sponsor ID is required' })
      }

      const db = getDb()
      const sponsorRef = db.collection('sponsors').doc(id)
      const sponsorDoc = await sponsorRef.get()

      if (!sponsorDoc.exists) {
        return res.status(404).json({ error: 'Sponsor not found' })
      }

      const sponsorData = sponsorDoc.data()

      // Delete logo from storage
      if (sponsorData.logoPath) {
        try {
          const bucket = getStorage().bucket()
          await bucket.file(sponsorData.logoPath).delete()
        } catch (error) {
          console.error('Error deleting sponsor logo:', error)
        }
      }

      // Delete sponsor document
      await sponsorRef.delete()

      res.json({ message: 'Sponsor deleted successfully' })
    } catch (error) {
      next(error)
    }
  }
)

export default router
