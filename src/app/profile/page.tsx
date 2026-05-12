"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth/auth-context"
import { useSession } from "@/hooks/use-session"
import { useProfileNavbar } from "@/lib/navbar-context"
import LoadingSpinner from "@/components/ui/loading-spinner"

/**
 * `/profile` — redirect stub. The canonical profile view lives at
 * `/profile/[handle]`. When authenticated, we resolve the logged-in
 * user's handle and forward them to `/profile/<handle>`. Unauthenticated
 * visitors get bounced to `/`.
 *
 * We call useProfileNavbar() so there's no flash of the default navbar
 * during the redirect.
 */
export default function ProfileRedirectPage() {
  useProfileNavbar()
  const router = useRouter()
  const { isAuthenticated, isLoading } = useAuth()
  const { handle, isLoading: isSessionLoading } = useSession()

  useEffect(() => {
    if (isLoading) return
    if (!isAuthenticated) {
      router.replace("/")
      return
    }
    if (isSessionLoading) return
    if (handle) {
      router.replace(`/profile/${encodeURIComponent(handle)}`)
    } else {
      router.replace("/")
    }
  }, [isLoading, isAuthenticated, isSessionLoading, handle, router])

  return (
    <div className="loading-screen">
      <div className="loading-screen__inner">
        <LoadingSpinner size="md" />
      </div>
    </div>
  )
}
