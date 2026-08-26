export const ROLES = {
  PARTICIPANT: 'participant',
  ADMIN: 'admin',
  JUDGE: 'judge',
  MENTOR: 'mentor',
  // Read-only "Observer" — sees the admin dashboard but cannot change anything.
  VIEWER: 'viewer',
  // On-ground attendance check-in for assigned domains.
  REGISTRATION_DESK: 'registration_desk',
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
    default:
      return '/dashboard'
  }
}

export function canAccess(role, allowed) {
  if (!allowed?.length) return true
  return allowed.includes(role)
}
