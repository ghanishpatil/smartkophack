export function formatDate(ts) {
  if (!ts) return ''
  let d
  if (typeof ts.toDate === 'function') d = ts.toDate()
  else if (ts instanceof Date) d = ts
  else if (typeof ts.seconds === 'number') d = new Date(ts.seconds * 1000)
  else if (typeof ts._seconds === 'number') d = new Date(ts._seconds * 1000)
  else if (typeof ts === 'number') d = new Date(ts)
  else if (typeof ts === 'string') d = new Date(ts)
  else return ''
  
  // Validate the date is valid
  if (isNaN(d.getTime())) return ''
  
  try {
    return d.toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  } catch {
    return ''
  }
}

export function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
}

export function randomInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}
