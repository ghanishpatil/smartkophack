import express from 'express'
import { getDb, getBucket } from '../services/firebaseAdmin.js'
import { verifyFirebaseToken, loadUserRole, requireRole } from '../middleware/auth.js'
import { cachedFetch, cacheInvalidate, CACHE_NS, CACHE_TTL } from '../services/responseCache.js'
import multer from 'multer'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'

const router = express.Router()

// Handle OPTIONS preflight for CORS on all routes
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
 * @desc    Get all patrons (public, cached)
 * @access  Public
 */
router.get('/', async (req, res, next) => {
  try {
    const data = await cachedFetch(CACHE_NS.PATRONS, '_all', CACHE_TTL.PATRONS, async () => {
      const db = getDb()
      const snapshot = await db.collection('patrons')
        .orderBy('order', 'asc')
        .get()
      const patrons = []
      snapshot.forEach(doc => {
        patrons.push({ id: doc.id, ...doc.data() })
      })
      return patrons
    })
    res.json(data)
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
  async (req, res, next) => {
    try {
      // Manual validation
      if (!req.body.name || !req.body.name.trim()) {
        return res.status(400).json({ error: 'Name is required' })
      }
      
      if (!req.body.designation || !req.body.designation.trim()) {
        return res.status(400).json({ error: 'Designation is required' })
      }

      if (!req.file) {
        return res.status(400).json({ error: 'Image file is required' })
      }

      const name = req.body.name.trim()
      const designation = req.body.designation.trim()
      const order = req.body.order ? parseInt(req.body.order) : 0
      
      if (isNaN(order) || order < 0) {
        return res.status(400).json({ error: 'Order must be a non-negative integer' })
      }

      // Upload image to Firebase Storage
      const bucket = getBucket()
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
        name,
        designation,
        order,
        imageUrl,
        imagePath: filename,
        createdAt: new Date().toISOString(),
        createdBy: req.user.uid,
      }

      const docRef = await getDb().collection('patrons').add(patronData)

      cacheInvalidate(CACHE_NS.PATRONS)
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
  async (req, res, next) => {
    try {
      const { id } = req.params
      
      // Manual validation
      if (req.body.name && !req.body.name.trim()) {
        return res.status(400).json({ error: 'Name cannot be empty' })
      }
      
      if (req.body.designation && !req.body.designation.trim()) {
        return res.status(400).json({ error: 'Designation cannot be empty' })
      }
      
      if (req.body.order !== undefined) {
        const orderNum = parseInt(req.body.order)
        if (isNaN(orderNum) || orderNum < 0) {
          return res.status(400).json({ error: 'Order must be a non-negative integer' })
        }
      }

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

      if (req.body.name) updateData.name = req.body.name.trim()
      if (req.body.designation) updateData.designation = req.body.designation.trim()
      if (req.body.order !== undefined) updateData.order = parseInt(req.body.order)

      // If new image is uploaded, delete old one and upload new one
      if (req.file) {
        const bucket = getBucket()
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
      cacheInvalidate(CACHE_NS.PATRONS)
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
  async (req, res, next) => {
    try {
      const { id } = req.params
      
      if (!id || !id.trim()) {
        return res.status(400).json({ error: 'Patron ID is required' })
      }

      const patronRef = getDb().collection('patrons').doc(id)
      const patronDoc = await patronRef.get()

      if (!patronDoc.exists) {
        return res.status(404).json({ error: 'Patron not found' })
      }

      const patronData = patronDoc.data()

      // Delete image from storage
      if (patronData.imagePath) {
        try {
          const bucket = getBucket()
          await bucket.file(patronData.imagePath).delete()
        } catch (error) {
          console.error('Error deleting patron image:', error)
        }
      }

      // Delete patron document
      await patronRef.delete()

      cacheInvalidate(CACHE_NS.PATRONS)
      res.json({ message: 'Patron deleted successfully' })
    } catch (error) {
      next(error)
    }
  }
)

export default router
