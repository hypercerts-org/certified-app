"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth/auth-context"
import { useOrg } from "@/lib/groups/org-context"
import { useSession } from "@/hooks/use-session"
import { usePageTitle } from "@/lib/navbar-context"
import LoadingSpinner from "@/components/ui/loading-spinner"
import { ownProfileEditUrl } from "@/components/profile/profile-edit-url"

/**
 * `/settings/edit-profile`: a redirect. Profiles are edited in one place,
 * inline on the profile itself; `?edit=1` opens the editor there. This
 * forwards to the profile of the identity the viewer is acting as (the
 * active group, or the personal account), like `/profile` does, so old
 * links and bookmarks keep working. The settings layout's AuthGuard
 * handles signed-out visitors.
 */
export default function EditProfileRedirectPage() {
  usePageTitle("Edit profile")
  const router = useRouter()
  const { did, isLoading: isAuthLoading } = useAuth()
  const { handle, isLoading: isSessionLoading } = useSession()
  const { activeOrg, isLoading: isOrgsLoading } = useOrg()

  useEffect(() => {
    if (isAuthLoading || isSessionLoading || isOrgsLoading) return
    router.replace(
      ownProfileEditUrl({
        activeGroup: activeOrg,
        personalHandle: handle,
        personalDid: did,
      }),
    )
  }, [isAuthLoading, isSessionLoading, isOrgsLoading, activeOrg, handle, did, router])

  return (
    <div className="loading-screen">
      <div className="loading-screen__inner">
        <LoadingSpinner size="md" />
      </div>
    </div>
  )
}
