import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import compression from 'compression'
import rateLimit from 'express-rate-limit'
import { initFirebaseAdmin } from './services/firebaseAdmin.js'
import { ensureHackathonInstall } from './services/hackathonBootstrap.js'
import { publicRouter, adminRouter, judgesRouter, mentorsRouter } from './routes/api.js'
import { participantRouter } from './routes/participant.js'
import chatRouter from './routes/chat.js'
import adminChatRouter from './routes/adminChat.js'
import patronsRouter from './routes/patrons.js'
import sponsorsRouter from './routes/sponsors.js'
import registrationRouter from './routes/registration.js'
import { razorpayWebhookHandler } from './routes/webhooks.js'
import { notFound, errorHandler } from './middleware/error.js'

// ─── Startup environment validation ─────────────────────────────────────────
function validateEnv() {
  const warnings = []
  const errors = []

  // RAZORPAY_WEBHOOK_SECRET must be a secret string, not a URL
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || ''
  if (webhookSecret.startsWith('http://') || webhookSecret.startsWith('https://')) {
    errors.push(
      'RAZORPAY_WEBHOOK_SECRET looks like a URL, not a secret. ' +
      'Copy the webhook signing secret from Razorpay Dashboard → Webhooks → your webhook → "Secret". ' +
      'Webhook signature verification will FAIL until this is fixed.',
    )
  }

  // FRONTEND_URL should not be localhost in production
  const frontendUrl = process.env.FRONTEND_URL || ''
  if (process.env.NODE_ENV === 'production' && (frontendUrl.includes('localhost') || !frontendUrl)) {
    errors.push(
      'FRONTEND_URL is set to localhost or empty in production. ' +
      'All email links will point to localhost. Set FRONTEND_URL to your production domain.',
    )
  }
  if (!frontendUrl) {
    warnings.push('FRONTEND_URL is not set — email links will use a placeholder URL.')
  }

  // Brevo API key
  if (!process.env.BREVO_API_KEY) {
    warnings.push('BREVO_API_KEY is not set — all emails will be silently skipped.')
  }

  // EMAIL_FROM_ADDRESS should be a domain email, not a personal Gmail
  const fromAddr = process.env.EMAIL_FROM_ADDRESS || ''
  if (fromAddr.endsWith('@gmail.com') || fromAddr.endsWith('@yahoo.com') || fromAddr.endsWith('@hotmail.com')) {
    warnings.push(
      `EMAIL_FROM_ADDRESS is a personal email (${fromAddr}). ` +
      'Brevo requires a verified sender domain. Use a domain email like noreply@yourdomain.com ' +
      'and verify the domain in Brevo → Senders & Domains.',
    )
  }

  for (const w of warnings) console.warn(`[skh-backend] ⚠️  ENV WARNING: ${w}`)
  for (const e of errors) console.error(`[skh-backend] ❌ ENV ERROR: ${e}`)
}

validateEnv()
initFirebaseAdmin()

const app = express()
const port = Number(process.env.PORT) || 4000
const isProd = process.env.NODE_ENV === 'production'

if (isProd) {
  app.set('trust proxy', 1)
}

const corsOrigins = (process.env.CORS_ORIGIN || '')
  .split(/[,\r\n]+/)
  .map((s) => s.trim().replace(/[\r\n]+/g, ''))
  .filter(Boolean)

// Log parsed CORS origins at startup for debugging
console.log(`[skh-backend] CORS origins (${corsOrigins.length}):`, corsOrigins)

if (isProd && corsOrigins.length === 0) {
  console.error(
    '[skh-backend] NODE_ENV=production requires CORS_ORIGIN (comma-separated frontend origins). Refusing to start with open CORS.',
  )
  process.exit(1)
}

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
)
// PERF: Gzip/brotli compression for all responses — reduces payload size by ~70%
app.use(compression())
app.use(
  cors({
    origin(origin, cb) {
      if (!isProd) {
        cb(null, true)
        return
      }
      if (!corsOrigins.length) {
        cb(null, false)
        return
      }
      // In production, reject requests with no Origin header to prevent CSRF
      if (!origin) {
        cb(null, false)
        return
      }
      // Normalize: strip trailing slashes and compare lowercase to handle
      // edge cases with env var formatting from hosting platforms.
      const normalizedOrigin = origin.replace(/\/+$/, '').toLowerCase()
      const allowed = corsOrigins.some(
        (o) => o.replace(/\/+$/, '').toLowerCase() === normalizedOrigin,
      )
      if (!allowed) {
        console.warn(`[CORS] Blocked origin: "${origin}" (normalized: "${normalizedOrigin}") | Allowed: ${JSON.stringify(corsOrigins)}`)
      }
      // Reflect the exact origin string when allowed (required with credentials: true)
      cb(null, allowed ? origin : false)
    },
    credentials: true,
  }),
)
app.use(morgan(isProd ? 'combined' : 'tiny'))

/** Razorpay webhooks require the raw body to verify `X-Razorpay-Signature`. */
// NOTE: 30 req/min limit. If batch payments spike (e.g. 50+ teams paying
// within a minute), increase this or use a sliding-window limiter.
// Razorpay retries failed webhooks, so dropped calls will eventually succeed.
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // increased from 30 to handle batch payment spikes
  standardHeaders: true,
  legacyHeaders: false,
})
app.post(
  '/api/webhooks/razorpay',
  webhookLimiter,
  express.raw({ type: 'application/json', limit: '512kb' }),
  razorpayWebhookHandler,
)

app.use(express.json({ limit: '2mb' }))

// ─── PERFORMANCE: Cache headers for public endpoints ────────────────────────
// These endpoints change rarely — let browsers and CDNs cache them.
// This eliminates network roundtrips on repeated page visits.
app.use('/api/event-config', (_req, res, next) => {
  res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=60')
  next()
})
app.use('/api/problem-statements', (_req, res, next) => {
  res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=120')
  next()
})
app.use('/api/timeline', (_req, res, next) => {
  res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=120')
  next()
})
app.use('/api/events', (_req, res, next) => {
  res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=60')
  next()
})
app.use('/api/patrons', (_req, res, next) => {
  res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=120')
  next()
})
app.use('/api/sponsors', (_req, res, next) => {
  res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=120')
  next()
})
app.use('/api/results', (_req, res, next) => {
  res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=60')
  next()
})
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 400 : 2000,
  standardHeaders: true,
  legacyHeaders: false,
})
app.use('/api', limiter)

// MED-07: Tighter per-endpoint rate limits for sensitive operations.
// These apply on top of the global /api limiter above.
const paymentLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: isProd ? 10 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many payment requests. Try again later.' },
})
const teamActionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: isProd ? 10 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many team requests. Try again later.' },
})

app.use('/api', publicRouter)

// ─── HONEYPOT TRAPS ───────────────────────────────────────────────────────────
// These routes DO NOT EXIST in the real application.
// Any request to them is 100% suspicious — bots, AI scanners, or attackers probing.
// Each hit: logs a security event + auto-creates a HIGH severity incident.

async function triggerHoneypot(req, route) {
  try {
    const { logSecurityEvent, EVENT_TYPE, SEVERITY, extractIp, extractDeviceInfo } = await import('./services/securityLog.js')
    const { createIncident, addIncidentNote } = await import('./services/incidentManager.js')
    const { getDb } = await import('./services/firebaseAdmin.js')
    const ip = extractIp(req)
    const device = extractDeviceInfo(req)
    const hasAuth = Boolean(req.headers.authorization)
    const body = JSON.stringify(req.body || {}).slice(0, 300)

    // Always log the security event (append-only, every hit recorded)
    const { lookupGeoIp, formatGeoInfo } = await import('./services/geoIp.js')
    const { parseUserAgent, deviceFingerprint } = await import('./services/deviceParser.js')
    const geo = await lookupGeoIp(ip)
    const geoStr = formatGeoInfo(geo)
    const deviceParsed = parseUserAgent(device)
    const fingerprint = deviceFingerprint(ip, device)

    await logSecurityEvent({
      ipAddress: ip,
      deviceInfo: device,
      eventType: EVENT_TYPE.HONEYPOT_TRIGGERED,
      targetEntity: route,
      severity: SEVERITY.HIGH,
      status: 'blocked',
      metadata: {
        method: req.method, route, hasAuth, body: body.slice(0, 200),
        geo: geo || null, location: geoStr,
        browser: deviceParsed.browser, os: deviceParsed.os,
        deviceType: deviceParsed.deviceType, isBot: deviceParsed.isBot,
        fingerprint,
      },
    })

    // Deduplicate incidents: only create one per route while it's still OPEN/INVESTIGATING.
    // Repeated hits from the same scanner add a note instead of flooding the list.
    const db = getDb()
    if (db) {
      const existing = await db.collection('securityIncidents')
        .where('source', '==', 'honeypot')
        .where('targetEntity', '==', route)
        .where('status', 'in', ['OPEN', 'INVESTIGATING'])
        .limit(1)
        .get()

      if (existing.empty) {
        await createIncident({
          title: `Honeypot triggered: ${route}`,
          description: `Automated probe or attack attempt detected on hidden endpoint.\nRoute: ${route}\nMethod: ${req.method}\nIP: ${ip}\nLocation: ${geoStr}\nHad auth header: ${hasAuth}\nDevice: ${device.slice(0, 150)}`,
          severity: 'HIGH',
          source: 'honeypot',
          targetEntity: route,
          metadata: { ip, method: req.method, hasAuth, device: device.slice(0, 200), body: body.slice(0, 200), geo: geo || null, location: geoStr },
        })
      } else {
        // Add a note to the existing open incident instead of creating a duplicate
        await addIncidentNote(
          existing.docs[0].id,
          null,
          `Repeat hit — IP: ${ip} | Location: ${geoStr} | Method: ${req.method} | hasAuth: ${hasAuth}`
        )
      }
    }
  } catch { /* never crash the main request */ }
}

function honeypot(route) {
  app.all(route, async (req, res) => {
    await triggerHoneypot(req, route)
    // Return realistic-looking 404 — don't reveal it's a trap
    res.status(404).json({ error: 'Not found' })
  })
}

// ── Common admin panel probes (WordPress, Laravel, Django, cPanel, etc.) ──
honeypot('/admin')
honeypot('/admin/login')
honeypot('/admin/dashboard')
honeypot('/wp-admin')
honeypot('/wp-admin/admin-ajax.php')
honeypot('/wp-login.php')
honeypot('/administrator')
honeypot('/administrator/index.php')
honeypot('/phpmyadmin')
honeypot('/pma')
honeypot('/cpanel')
honeypot('/webmail')

// ── Environment & config file leaks (extremely common AI/scanner targets) ──
honeypot('/.env')
honeypot('/.env.local')
honeypot('/.env.production')
honeypot('/.env.backup')
honeypot('/config.json')
honeypot('/config.yml')
honeypot('/config.yaml')
honeypot('/settings.json')
honeypot('/secrets.json')
honeypot('/credentials.json')
honeypot('/firebase.json')          // looks like Firebase config leak
honeypot('/serviceAccountKey.json') // Firebase service account — high value target

// ── Git / source code exposure ──
honeypot('/.git/config')
honeypot('/.git/HEAD')
honeypot('/.gitignore')
honeypot('/backup.zip')
honeypot('/backup.sql')
honeypot('/dump.sql')
honeypot('/database.sql')

// ── API key / token endpoints (AI scanner favorites) ──
honeypot('/api/keys')
honeypot('/api/token')
honeypot('/api/tokens')
honeypot('/api/secret')
honeypot('/api/secrets')
honeypot('/api/config')
honeypot('/api/internal/config')    // original honeypot
honeypot('/api/admin/export/all')   // original honeypot
honeypot('/api/v1/admin')
honeypot('/api/v2/admin')
honeypot('/api/debug')
honeypot('/api/test')
honeypot('/api/graphql')            // GraphQL introspection probe
honeypot('/graphql')

// ── Common framework debug/info endpoints ──
honeypot('/actuator')               // Spring Boot
honeypot('/actuator/env')
honeypot('/actuator/health')
honeypot('/debug')
honeypot('/info')
honeypot('/status')
honeypot('/server-status')          // Apache mod_status
honeypot('/server-info')
honeypot('/_profiler')              // Symfony profiler
honeypot('/telescope')              // Laravel Telescope
honeypot('/horizon')                // Laravel Horizon
honeypot('/nova')                   // Laravel Nova

// ── AI-specific attack patterns (LLM prompt injection, model endpoints) ──
honeypot('/api/ai/prompt')
honeypot('/api/llm')
honeypot('/api/openai')
honeypot('/api/chat/completions')   // OpenAI-style endpoint probe
honeypot('/api/generate')           // Ollama/local LLM probe
honeypot('/v1/chat/completions')    // OpenAI API format probe
honeypot('/v1/completions')

// ── Firebase / cloud-specific probes ──
honeypot('/__/firebase/init.json')  // Firebase hosting config
honeypot('/__/firebase/init.js')
honeypot('/firebase-config.js')
honeypot('/google-services.json')

// ── Common vulnerability scanner paths ──
honeypot('/xmlrpc.php')             // WordPress XML-RPC
honeypot('/eval-stdin.php')         // PHP eval probe
honeypot('/shell.php')
honeypot('/cmd.php')
honeypot('/upload.php')
honeypot('/.well-known/security.txt') // Legitimate but also probed by scanners

// HIGH-02 fix: Rate limiters MUST be registered before the router they protect.
// Previously these were registered after app.use('/api/participant', participantRouter)
// which meant Express had already matched and handled the request before the limiter
// middleware could run — making them completely ineffective.
app.use('/api/participant/create-razorpay-order', paymentLimiter)
app.use('/api/participant/verify-razorpay-payment', paymentLimiter)
app.use('/api/participant/create-team', teamActionLimiter)
app.use('/api/participant/join-team', teamActionLimiter)
app.use('/api/participant', participantRouter)
app.use('/api/chat', chatRouter)
app.use('/api/patrons', patronsRouter)
app.use('/api/sponsors', sponsorsRouter)
app.use('/api/registrations', registrationRouter)
app.use('/api/admin', adminRouter())
app.use('/api/admin/chatbot', adminChatRouter)
app.use('/api/judges', judgesRouter())
app.use('/api/mentors', mentorsRouter())

app.use(notFound)
app.use(errorHandler)

app.listen(port, () => {
  console.log(`[skh-backend] ${isProd ? 'production' : 'development'} listening on :${port}`)
  void ensureHackathonInstall().catch((e) => {
    console.warn('[skh-backend] Hackathon bootstrap skipped:', e.message)
  })
})
