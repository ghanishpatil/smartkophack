/**
 * Lightweight User-Agent parser — no external dependencies.
 * Extracts browser, OS, device type from User-Agent string.
 * Used for device fingerprinting in security events.
 */

export function parseUserAgent(ua = '') {
  if (!ua) return { browser: 'Unknown', os: 'Unknown', deviceType: 'Unknown', isBot: false }

  const s = ua.toLowerCase()

  // Bot/scanner detection
  const botPatterns = [
    'bot', 'crawler', 'spider', 'scraper', 'scan', 'curl', 'wget', 'python-requests',
    'go-http', 'java/', 'ruby/', 'php/', 'perl/', 'libwww', 'httpie', 'axios',
    'nuclei', 'nikto', 'sqlmap', 'nmap', 'masscan', 'zgrab', 'dirbuster',
    'gobuster', 'ffuf', 'wfuzz', 'burpsuite', 'postman', 'insomnia',
  ]
  const isBot = botPatterns.some(p => s.includes(p))

  // Browser detection
  let browser = 'Unknown'
  if (s.includes('edg/') || s.includes('edge/')) browser = 'Edge'
  else if (s.includes('opr/') || s.includes('opera')) browser = 'Opera'
  else if (s.includes('chrome/') && !s.includes('chromium')) browser = 'Chrome'
  else if (s.includes('chromium')) browser = 'Chromium'
  else if (s.includes('firefox/')) browser = 'Firefox'
  else if (s.includes('safari/') && !s.includes('chrome')) browser = 'Safari'
  else if (s.includes('msie') || s.includes('trident/')) browser = 'Internet Explorer'
  else if (isBot) browser = 'Bot/Scanner'

  // OS detection
  let os = 'Unknown'
  if (s.includes('windows nt 10')) os = 'Windows 10/11'
  else if (s.includes('windows nt 6.3')) os = 'Windows 8.1'
  else if (s.includes('windows nt 6.1')) os = 'Windows 7'
  else if (s.includes('windows')) os = 'Windows'
  else if (s.includes('mac os x') || s.includes('macos')) os = 'macOS'
  else if (s.includes('iphone')) os = 'iOS (iPhone)'
  else if (s.includes('ipad')) os = 'iOS (iPad)'
  else if (s.includes('android')) os = 'Android'
  else if (s.includes('linux')) os = 'Linux'
  else if (s.includes('ubuntu')) os = 'Ubuntu'
  else if (s.includes('debian')) os = 'Debian'

  // Device type
  let deviceType = 'Desktop'
  if (s.includes('tablet') || s.includes('ipad')) {
    deviceType = 'Tablet'
  } else if (s.includes('mobile') || s.includes('iphone') || (s.includes('android') && !s.includes('tablet'))) {
    deviceType = 'Mobile'
  } else if (isBot) {
    deviceType = 'Bot'
  }

  return { browser, os, deviceType, isBot, raw: ua.slice(0, 200) }
}

/**
 * Create a simple fingerprint hash from parsed device info + IP.
 * Not cryptographically strong — just for grouping similar sessions.
 */
export function deviceFingerprint(ip, ua) {
  const parsed = parseUserAgent(ua)
  const str = `${ip}|${parsed.browser}|${parsed.os}|${parsed.deviceType}`
  // Simple djb2 hash
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i)
    hash = hash & hash // Convert to 32-bit int
  }
  return Math.abs(hash).toString(16).padStart(8, '0')
}
