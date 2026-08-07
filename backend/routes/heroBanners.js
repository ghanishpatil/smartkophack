import express from 'express'
import { getDb, getBucket } from '../services/firebaseAdmin.js'
import { verifyFirebaseToken, loadUserRole, requireRole } from '../middleware/auth.js'
import multer from 'multer'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'

/**
 * Hero banner slideshow — admin-managed landscape banners shown on the home page.
 *
 * Mirrors the sponsors module for security: images are uploaded server-side with
 * the Firebase Admin SDK (bypasses client rules, no direct-from-browser writes),
 * only admins may create/update/delete, and reads are public. Slideshow display
 * settings (enabled, animation, interval) live in a single Firestore doc.
 */

const router = express.Router()

router.use((req, res, next) => {
  if (req.method === 'OPTIONS') return res.status(200).end()
  next()
})

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 }, // 12 MB per banner
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    if (allowed.includes(file.mimetype)) cb(null, true)
    else cb(new Error('Invalid file type. Only JPEG, PNG, and WebP images are allowed.'))
  },
})

const SETTINGS_DOC = 'heroSettings/config'
const ALLOWED_ANIMATIONS = ['fade', 'slide', 'zoom', 'flip']

function sanitizeSettings(body = {}) {
  const out = {}
  if (typeof body.enabled === 'boolean') out.enabled = body.enabled
  if (typeof body.animation === 'string' && ALLOWED_ANIMATIONS.includes(body.animation)) {
    out.animation = body.animation
  }
  if (body.intervalMs != null) {
    const n = Number(body.intervalMs)
    if (Number.isFinite(n)) out.intervalMs = Math.max(2000, Math.min(20000, Math.round(n)))
  }
  // After one full pass of the banners, reveal the normal home hero.
  if (typeof body.revealHomeAfterCycle === 'boolean') out.revealHomeAfterCycle = body.revealHomeAfterCycle
  return out
}

async function readSettings(db) {
  const snap = await db.doc(SETTINGS_DOC).get()
  const d = snap.exists ? snap.data() : {}
  return {
    enabled: typeof d.enabled === 'boolean' ? d.enabled : false,
    animation: ALLOWED_ANIMATIONS.includes(d.animation) ? d.animation : 'fade',
    intervalMs: typeof d.intervalMs === 'number' ? d.intervalMs : 5000,
    revealHomeAfterCycle: typeof d.revealHomeAfterCycle === 'boolean' ? d.revealHomeAfterCycle : true,
  }
}

/**
 * @route  GET /api/hero-banners
 * @desc   Public — list active banners (ordered) + slideshow settings.
 * @access Public
 */
router.get('/', async (req, res, next) => {
  try {
    const db = getDb()
    let banners = []
    try {
      const snap = await db.collection('heroBanners').orderBy('order', 'asc').get()
      snap.forEach((doc) => banners.push({ id: doc.id, ...doc.data() }))
    } catch {
      // Fallback if the composite/order index is unavailable
      const snap = await db.collection('heroBanners').get()
      banners = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
      banners.sort((a, b) => (a.order || 0) - (b.order || 0))
    }
    const settings = await readSettings(db)
    res.json({ banners, settings })
  } catch (error) {
    next(error)
  }
})

/**
 * @route  PUT /api/hero-banners/settings
 * @desc   Admin — update slideshow display settings.
 * @access Private (Admin)
 * NOTE: declared before "/:id" so it isn't captured as an id param.
 */
router.put(
  '/settings',
  verifyFirebaseToken,
  loadUserRole,
  requireRole('admin'),
  async (req, res, next) => {
    try {
      const db = getDb()
      const patch = sanitizeSettings(req.body || {})
      patch.updatedAt = new Date().toISOString()
      patch.updatedBy = req.user.uid
      await db.doc(SETTINGS_DOC).set(patch, { merge: true })
      res.json({ ok: true, settings: await readSettings(db) })
    } catch (error) {
      next(error)
    }
  },
)

/**
 * @route  POST /api/hero-banners
 * @desc   Admin — upload a banner image + metadata.
 * @access Private (Admin)
 */
router.post(
  '/',
  verifyFirebaseToken,
  loadUserRole,
  requireRole('admin'),
  upload.single('image'),
  async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'Banner image is required' })

      const caption = req.body.caption ? String(req.body.caption).trim().slice(0, 200) : ''
      const link = req.body.link ? String(req.body.link).trim().slice(0, 2048) : ''
      const order = req.body.order != null ? parseInt(req.body.order, 10) : 0
      if (Number.isNaN(order) || order < 0) {
        return res.status(400).json({ error: 'Order must be a non-negative integer' })
      }
      if (link) {
        try {
          const u = new URL(link)
          if (!['http:', 'https:'].includes(u.protocol)) {
            return res.status(400).json({ error: 'Link must be a valid HTTP/HTTPS URL' })
          }
        } catch {
          return res.status(400).json({ error: 'Link must be a valid URL' })
        }
      }

      const bucket = getBucket()
      if (!bucket) return res.status(500).json({ error: 'Storage not configured' })

      const filename = `heroBanners/${uuidv4()}-${Date.now()}${path.extname(req.file.originalname)}`
      const file = bucket.file(filename)
      await file.save(req.file.buffer, {
        metadata: {
          contentType: req.file.mimetype,
          metadata: { firebaseStorageDownloadTokens: uuidv4() },
        },
        public: true,
      })
      const imageUrl = `https://storage.googleapis.com/${bucket.name}/${filename}`

      const data = {
        imageUrl,
        imagePath: filename,
        caption,
        link,
        order,
        active: req.body.active === 'false' ? false : true,
        createdAt: new Date().toISOString(),
        createdBy: req.user.uid,
      }
      const db = getDb()
      const ref = await db.collection('heroBanners').add(data)
      res.status(201).json({ id: ref.id, ...data })
    } catch (error) {
      next(error)
    }
  },
)

/**
 * @route  PUT /api/hero-banners/:id
 * @desc   Admin — update banner metadata and/or replace the image.
 * @access Private (Admin)
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
      const db = getDb()
      const ref = db.collection('heroBanners').doc(id)
      const snap = await ref.get()
      if (!snap.exists) return res.status(404).json({ error: 'Banner not found' })

      const patch = { updatedAt: new Date().toISOString(), updatedBy: req.user.uid }
      if (req.body.caption !== undefined) patch.caption = String(req.body.caption).trim().slice(0, 200)
      if (req.body.link !== undefined) {
        const link = String(req.body.link).trim().slice(0, 2048)
        if (link) {
          try {
            const u = new URL(link)
            if (!['http:', 'https:'].includes(u.protocol)) {
              return res.status(400).json({ error: 'Link must be a valid HTTP/HTTPS URL' })
            }
          } catch {
            return res.status(400).json({ error: 'Link must be a valid URL' })
          }
        }
        patch.link = link
      }
      if (req.body.order !== undefined) {
        const order = parseInt(req.body.order, 10)
        if (Number.isNaN(order) || order < 0) {
          return res.status(400).json({ error: 'Order must be a non-negative integer' })
        }
        patch.order = order
      }
      if (req.body.active !== undefined) patch.active = req.body.active === 'true' || req.body.active === true

      if (req.file) {
        const bucket = getBucket()
        const oldPath = snap.data().imagePath
        if (oldPath) {
          try { await bucket.file(oldPath).delete() } catch { /* ignore */ }
        }
        const filename = `heroBanners/${uuidv4()}-${Date.now()}${path.extname(req.file.originalname)}`
        const file = bucket.file(filename)
        await file.save(req.file.buffer, {
          metadata: {
            contentType: req.file.mimetype,
            metadata: { firebaseStorageDownloadTokens: uuidv4() },
          },
          public: true,
        })
        patch.imageUrl = `https://storage.googleapis.com/${bucket.name}/${filename}`
        patch.imagePath = filename
      }

      await ref.update(patch)
      const updated = await ref.get()
      res.json({ id: updated.id, ...updated.data() })
    } catch (error) {
      next(error)
    }
  },
)

/**
 * @route  DELETE /api/hero-banners/:id
 * @desc   Admin — delete a banner and its stored image.
 * @access Private (Admin)
 */
router.delete(
  '/:id',
  verifyFirebaseToken,
  loadUserRole,
  requireRole('admin'),
  async (req, res, next) => {
    try {
      const { id } = req.params
      const db = getDb()
      const ref = db.collection('heroBanners').doc(id)
      const snap = await ref.get()
      if (!snap.exists) return res.status(404).json({ error: 'Banner not found' })

      const imagePath = snap.data().imagePath
      if (imagePath) {
        try { await getBucket().file(imagePath).delete() } catch { /* ignore */ }
      }
      await ref.delete()
      res.json({ message: 'Banner deleted successfully' })
    } catch (error) {
      next(error)
    }
  },
)

export default router
