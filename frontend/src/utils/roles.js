export const ROLES = {
  PARTICIPANT: 'participant',
  ADMIN: 'admin',
  JUDGE: 'judge',
  MENTOR: 'mentor',
  // Read-only "Observer" — sees the admin dashboard but cannot change anything.
  VIEWER: 'viewer',
  // On-ground attendance check-in for assigned domains.
  REGISTRATION_DESK: 'registration_desk',
  // Supervises all registration desks: full analytics + management (no clear-all).
  REGISTRATION_DESK_INCHARGE: 'registration_desk_incharge',
}

export function roleHome(role) {
  switch (role) {
    case ROLES.ADMIN:
      return '/admin/overview'
    case ROLES.VIEWER:
      return '/admin/overview'
    case ROLES.JUDGE:
      return '/judge/home'
    case ROLES.MENTOR:
      return '/mentor'
    case ROLES.REGISTRATION_DESK:
      return '/reg-desk'
    case ROLES.REGISTRATION_DESK_INCHARGE:
      return '/regdesk-incharge'
    default:
      return '/dashboard'
  }
}

export function canAccess(role, allowed) {
  if (!allowed?.length) return true
  return allowed.includes(role)
}
