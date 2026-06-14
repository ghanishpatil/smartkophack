/**
 * Geo/IP lookup using ip-api.com (free, no API key required).
 * Rate limit: 45 requests/minute on the free tier.
 * Results are cached in-memory for 1 hour to avoid hammering the API.
 *
 * SECURITY NOTE: ip-api.com free tier only supports HTTP (not HTTPS).
 * The user's IP address is sent over an unencrypted connection. This is
 * acceptable for non-PII enrichment in security logs, but should NOT be
 * used for transmitting sensitive user data. If HTTPS is required,
 * upgrade to ip-api.com Pro ($12/mo) or switch to ipinfo.io/ipdata.co.
 *
 * Returns: { country, countryCode, region, city, isp, org, query }
 * Returns null on failure — never throws.
 */

const cache = new Map() // ip → { data, expiresAt }
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour
const CACHE_MAX_SIZE = 5000 // max entries before forced eviction

// Periodic cleanup — runs every 10 minutes to evict expired entries
// Prevents unbounded memory growth from unique IPs hitting honeypots.
setInterval(() => {
  const now = Date.now()
  for (const [ip, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(ip)
  }
}, 10 * 60 * 1000).unref() // unref() so the timer doesn't keep the process alive

// Private/reserved IP ranges — no point looking these up
const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^::1$/,
  /^localhost$/,
  /^$/, // empty
]

function isPrivateIp(ip) {
  return PRIVATE_IP_PATTERNS.some(p => p.test(ip))
}

export async function lookupGeoIp(ip) {
  if (!ip || isPrivateIp(ip)) return null

  // Check cache
  const cached = cache.get(ip)
  if (cached && cached.expiresAt > Date.now()) return cached.data

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000) // 3s timeout

    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,countryCode,regionName,city,isp,org,query`,
      { signal: controller.signal }
    )
    clearTimeout(timeout)

    if (!res.ok) return null
    const data = await res.json()
    if (data.status !== 'success') return null

    const result = {
      country: data.country || '',
      countryCode: data.countryCode || '',
      region: data.regionName || '',
      city: data.city || '',
      isp: data.isp || '',
      org: data.org || '',
      ip: data.query || ip,
    }

    // Cache the result (with size guard to prevent unbounded growth)
    if (cache.size >= CACHE_MAX_SIZE) {
      // Evict oldest 20% of entries
      const entries = [...cache.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt)
      const evictCount = Math.ceil(CACHE_MAX_SIZE * 0.2)
      for (let i = 0; i < evictCount && i < entries.length; i++) {
        cache.delete(entries[i][0])
      }
    }
    cache.set(ip, { data: result, expiresAt: Date.now() + CACHE_TTL_MS })
    return result
  } catch {
    return null // timeout, network error, etc. — never crash
  }
}

/**
 * Format geo info as a readable string for logs/incidents.
 */
export function formatGeoInfo(geo) {
  if (!geo) return 'Unknown location'
  const parts = [geo.city, geo.region, geo.country].filter(Boolean)
  const loc = parts.join(', ') || 'Unknown'
  const isp = geo.isp || geo.org || ''
  return isp ? `${loc} (${isp})` : loc
}
