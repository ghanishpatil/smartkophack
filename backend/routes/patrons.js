import express from 'express'
import { body, validationResult, param } from 'express-validator'
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
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Only allow image files
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, and WebP images are allowed.'))
    }
  }
})

/**
 * @route   GET /api/patrons
 * @desc    Get all patrons (public)
 * @access  Public
 */
router.get('/', async (req, res, next) => {
  try {
    const db = getDb()
    const snapshot = await db.collection('patrons')
      .orderBy('order', 'asc')
      .get()

    const patrons = []
    snapshot.forEach(doc => {
      patrons.push({ id: doc.id, ...doc.data() })
    })

    res.json(patrons)
  } catch (error) {
    next(error)
  }
})

/**
 * @route   POST /api/patrons
 * @desc    Create a new patron (admin only)
 * @access  Private (Admin)
 */
router.post(
  '/',
  verifyFirebaseToken,
  loadUserRole,
  requireRole('admin'),
  upload.single('image'),
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('designation').trim().notEmpty().withMessage('Designation is required'),
    body('order').optional().isInt({ min: 0 }).withMessage('Order must be a non-negative integer'),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
      }

      if (!req.file) {
        return res.status(400).json({ error: 'Image file is required' })
      }

      const { name, designation, order } = req.body

      // Upload image to Firebase Storage
      const bucket = getStorage().bucket()
      const filename = `patrons/${uuidv4()}-${Date.now()}${path.extname(req.file.originalname)}`
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

      const imageUrl = `https://storage.googleapis.com/${bucket.name}/${filename}`

      // Create patron document
      const patronData = {
        name: name.trim(),
        designation: designation.trim(),
        order: order ? parseInt(order) : 0,
        imageUrl,
        imagePath: filename,
        createdAt: new Date().toISOString(),
        createdBy: req.user.uid,
      }

      const docRef = await getDb().collection('patrons').add(patronData)

      res.status(201).json({
        id: docRef.id,
        ...patronData,
      })
    } catch (error) {
      next(error)
    }
  }
)

/**
 * @route   PUT /api/patrons/:id
 * @desc    Update a patron (admin only)
 * @access  Private (Admin)
 */
router.put(
  '/:id',
  verifyFirebaseToken,
  loadUserRole,
  requireRole('admin'),
  upload.single('image'),
  [
    param('id').notEmpty().withMessage('Patron ID is required'),
    body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
    body('designation').optional().trim().notEmpty().withMessage('Designation cannot be empty'),
    body('order').optional().isInt({ min: 0 }).withMessage('Order must be a non-negative integer'),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
      }

      const { id } = req.params
      const { name, designation, order } = req.body

      // Check if patron exists
      const patronRef = getDb().collection('patrons').doc(id)
      const patronDoc = await patronRef.get()

      if (!patronDoc.exists) {
        return res.status(404).json({ error: 'Patron not found' })
      }

      const updateData = {
        updatedAt: new Date().toISOString(),
        updatedBy: req.user.uid,
      }

      if (name) updateData.name = name.trim()
      if (designation) updateData.designation = designation.trim()
      if (order !== undefined) updateData.order = parseInt(order)

      // If new image is uploaded, delete old one and upload new one
      if (req.file) {
        const bucket = getStorage().bucket()
        const oldImagePath = patronDoc.data().imagePath

        // Delete old image if exists
        if (oldImagePath) {
          try {
            await bucket.file(oldImagePath).delete()
          } catch (error) {
            console.error('Error deleting old patron image:', error)
          }
        }

        // Upload new image
        const filename = `patrons/${uuidv4()}-${Date.now()}${path.extname(req.file.originalname)}`
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

        const imageUrl = `https://storage.googleapis.com/${bucket.name}/${filename}`
        updateData.imageUrl = imageUrl
        updateData.imagePath = filename
      }

      await patronRef.update(updateData)

      const updated = await patronRef.get()
      res.json({ id: updated.id, ...updated.data() })
    } catch (error) {
      next(error)
    }
  }
)

/**
 * @route   DELETE /api/patrons/:id
 * @desc    Delete a patron (admin only)
 * @access  Private (Admin)
 */
router.delete(
  '/:id',
  verifyFirebaseToken,
  loadUserRole,
  requireRole('admin'),
  [param('id').notEmpty().withMessage('Patron ID is required')],
  async (req, res, next) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
      }

      const { id } = req.params

      const patronRef = getDb().collection('patrons').doc(id)
      const patronDoc = await patronRef.get()

      if (!patronDoc.exists) {
        return res.status(404).json({ error: 'Patron not found' })
      }

      const patronData = patronDoc.data()

      // Delete image from storage
      if (patronData.imagePath) {
        try {
          const bucket = getStorage().bucket()
          await bucket.file(patronData.imagePath).delete()
        } catch (error) {
          console.error('Error deleting patron image:', error)
        }
      }

      // Delete patron document
      await patronRef.delete()

      res.json({ message: 'Patron deleted successfully' })
    } catch (error) {
      next(error)
    }
  }
)

export default router
