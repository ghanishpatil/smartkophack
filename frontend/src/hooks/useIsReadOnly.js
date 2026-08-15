import { useAuth } from '@/context/AuthContext.jsx'
import { ROLES } from '@/utils/roles.js'

/**
 * True when the signed-in user is an Observer (read-only viewer). Admin pages
 * use this to hide every edit/action control so Observers get a genuine
 * view-only experience. The backend also blocks all non-GET requests for this
 * role, so this is defense-in-depth (UI) on top of the authoritative guard.
 */
export function useIsReadOnly() {
  const { profile } = useAuth()
  return (profile?.role || '') === ROLES.VIEWER
}
