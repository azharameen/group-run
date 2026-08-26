import { Navigate, Outlet, useLocation } from "react-router-dom"

import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/context/AuthContext"

export function ProtectedRoute() {
  const { status } = useAuth()
  const location = useLocation()

  if (status === "loading") {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm space-y-4" aria-label="Loading session">
          <Skeleton className="mx-auto size-12 rounded-xl" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    )
  }

  if (status === "unauthenticated") {
    return <Navigate to="/sign-in" replace state={{ from: location }} />
  }

  return <Outlet />
}
