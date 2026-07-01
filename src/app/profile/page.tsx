"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth/auth-context"
import { useOrg } from "@/lib/groups/org-context"
import { useSession } from "@/hooks/use-session"
import { useProfileNavbar } from "@/lib/navbar-context"
import LoadingSpinner from "@/components/ui/loading-spinner"
import { profileUrl } from "@/lib/urls"

/**
 * `/profile` — redirect stub. The canonical profile view lives at the
 * root, `/{handle}`. When authenticated we resolve the **active**
 * identity (the group from the account switcher, or the personal
 * handle when no group is active) and forward there. Unauthenticated
 * visitors get bounced to `/`.
 *
 * "Active identity" wins over "personal identity" so that the
 * /profile entry point lines up with what the user is currently
 * acting as — same convention as the chrome (`useOrg().activeOrg`
 * decides "me" everywhere in the navbar / drawer).
 *
 * We call useProfileNavbar() so there's no flash of the default
 * navbar during the redirect.
 */
export default function ProfileRedirectPage() {
  useProfileNavbar()
  const router = useRouter()
  const { isAuthenticated, isLoading } = useAuth()
  const { handle: personalHandle, isLoading: isSessionLoading } = useSession()
  const { activeOrg, isLoading: orgsLoading } = useOrg()

  useEffect(() => {
    if (isLoading) return
    if (!isAuthenticated) {
      router.replace("/")
      return
    }
    if (isSessionLoading || orgsLoading) return
    const activeHandle = activeOrg?.handle ?? personalHandle
    if (activeHandle) {
      router.replace(profileUrl(activeHandle))
    } else {
      router.replace("/")
    }
  }, [
    isLoading,
    isAuthenticated,
    isSessionLoading,
    orgsLoading,
    personalHandle,
    activeOrg?.handle,
    router,
  ])

  return (
    <div className="loading-screen">
      <div className="loading-screen__inner">
        <LoadingSpinner size="md" />
      </div>
    </div>
  )
}
