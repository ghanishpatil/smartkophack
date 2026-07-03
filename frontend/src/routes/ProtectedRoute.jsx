import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext.jsx'
import { roleHome, canAccess } from '@/utils/roles.js'
import { Skeleton } from '@/components/ui/Skeleton.jsx'

export function ProtectedRoute({ roles }) {
  const { user, profile, loading, firebaseReady } = useAuth()
  const location = useLocation()

  if (!firebaseReady) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-lg flex-col gap-4 p-8">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-40 w-full" />
        <p className="text-center text-sm text-ink-500">
          Add Firebase environment variables to enable authentication. See{' '}
          <code className="rounded bg-ink-100 px-1 py-0.5 text-xs">frontend/.env.example</code>.
        </p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-lg flex-col gap-4 p-8">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/auth" replace state={{ from: location.pathname }} />
  }

  // First-login gate: force password change before accessing anything else.
  if (profile?.mustChangePassword === true && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />
  }

  const r = profile?.role || 'participant'
  if (roles?.length && !canAccess(r, roles)) {
    return <Navigate to={roleHome(r)} replace />
  }

  return <Outlet />
}
