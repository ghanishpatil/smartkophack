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
    fileSize: 15 * 1024 * 1024, // 15MB limit
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
 * @desc    Get all sponsors (public, cached)
 * @access  Public
 */
router.get('/', async (req, res, next) => {
  try {
    const data = await cachedFetch(CACHE_NS.SPONSORS, '_all', CACHE_TTL.SPONSORS, async () => {
      const db = getDb()
      const snapshot = await db.collection('sponsors')
        .orderBy('order', 'asc')
        .get()
      const sponsors = []
      snapshot.forEach(doc => {
        sponsors.push({ id: doc.id, ...doc.data() })
      })
      return sponsors
    })
    res.json(data)
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
      console.log('[SPONSORS POST] Request received')
      console.log('[SPONSORS POST] Body:', req.body)
      console.log('[SPONSORS POST] File:', req.file ? 'present' : 'missing')
      
      // Manual validation since express-validator doesn't work well with multer
      if (!req.body.name || !req.body.name.trim()) {
        console.log('[SPONSORS POST] Validation failed: name missing')
        return res.status(400).json({ error: 'Organization name is required' })
      }

      if (!req.file) {
        console.log('[SPONSORS POST] Validation failed: file missing')
        return res.status(400).json({ error: 'Logo file is required' })
      }

      const name = req.body.name.trim()
      const label = req.body.label ? req.body.label.trim() : ''
      const website = req.body.website ? req.body.website.trim() : ''
      const order = req.body.order ? parseInt(req.body.order) : 0

      if (isNaN(order) || order < 0) {
        return res.status(400).json({ error: 'Order must be a non-negative integer' })
      }

      // Validate website URL if provided
      if (website) {
        try {
          const url = new URL(website)
          if (!['http:', 'https:'].includes(url.protocol)) {
            return res.status(400).json({ error: 'Website must be a valid HTTP/HTTPS URL' })
          }
        } catch {
          return res.status(400).json({ error: 'Website must be a valid URL' })
        }
      }

      // Upload logo to Firebase Storage
      const bucket = getBucket()
      if (!bucket) {
        console.error('[SPONSORS POST] Firebase Storage not initialized')
        return res.status(500).json({ error: 'Storage not configured' })
      }
      
      console.log('[SPONSORS POST] Uploading to bucket:', bucket.name)
      const filename = `sponsors/${uuidv4()}-${Date.now()}${path.extname(req.file.originalname)}`
      const file = bucket.file(filename)

      console.log('[SPONSORS POST] Saving file with buffer size:', req.file.buffer.length)
      
      let logoUrl = ''
      try {
        await file.save(req.file.buffer, {
          metadata: {
            contentType: req.file.mimetype,
            metadata: {
              firebaseStorageDownloadTokens: uuidv4(),
            },
          },
          public: true, // Make it public during upload
        })

        console.log('[SPONSORS POST] File saved successfully')

        // Get public URL
        logoUrl = `https://storage.googleapis.com/${bucket.name}/${filename}`
        console.log('[SPONSORS POST] Public URL:', logoUrl)
      } catch (uploadError) {
        console.error('[SPONSORS POST] Upload error:', uploadError)
        throw uploadError
      }

      // Create sponsor document
      const sponsorData = {
        name,
        label,
        website,
        order,
        logoUrl,
        logoPath: filename,
        createdAt: new Date().toISOString(),
        createdBy: req.user.uid,
      }

      const db = getDb()
      const docRef = await db.collection('sponsors').add(sponsorData)

      cacheInvalidate(CACHE_NS.SPONSORS)
      res.status(201).json({
        id: docRef.id,
        ...sponsorData,
      })
    } catch (error) {
      console.error('Error creating sponsor:', error)
      console.error('Error stack:', error.stack)
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
      if (req.body.website !== undefined) {
        const website = req.body.website ? req.body.website.trim() : ''
        if (website) {
          try {
            const url = new URL(website)
            if (!['http:', 'https:'].includes(url.protocol)) {
              return res.status(400).json({ error: 'Website must be a valid HTTP/HTTPS URL' })
            }
          } catch {
            return res.status(400).json({ error: 'Website must be a valid URL' })
          }
        }
        updateData.website = website
      }
      if (req.body.order !== undefined) updateData.order = parseInt(req.body.order)

      // If new logo is uploaded, delete old one and upload new one
      if (req.file) {
        const bucket = getBucket()
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
          public: true, // Make it public during upload
        })

        const logoUrl = `https://storage.googleapis.com/${bucket.name}/${filename}`
        updateData.logoUrl = logoUrl
        updateData.logoPath = filename
      }

      await sponsorRef.update(updateData)

      const updated = await sponsorRef.get()
      cacheInvalidate(CACHE_NS.SPONSORS)
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
          const bucket = getBucket()
          await bucket.file(sponsorData.logoPath).delete()
        } catch (error) {
          console.error('Error deleting sponsor logo:', error)
        }
      }

      // Delete sponsor document
      await sponsorRef.delete()

      cacheInvalidate(CACHE_NS.SPONSORS)
      res.json({ message: 'Sponsor deleted successfully' })
    } catch (error) {
      next(error)
    }
  }
)

export default router
