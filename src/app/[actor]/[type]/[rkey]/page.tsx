"use client"

import { useEffect, useMemo } from "react"
import { useParams, useRouter } from "next/navigation"
import { useUserProfile } from "@/hooks/use-user-profile"
import { isRecordType, parseActor, recordUrl, type RecordType } from "@/lib/urls"
import ActivityDetailRoute from "@/components/feed/activity-detail-route"
import ProjectDetailRoute from "@/components/project/project-detail-route"
import EmptyState from "@/components/ui/empty-state"
import { FileQuestion } from "lucide-react"

/**
 * Handle-forward record route: `/{actor}/{type}/{rkey}`.
 *
 *  - `actor` is a handle (canonical) or a DID (durable share form).
 *  - `type` is a friendly segment (`activity` | `project`) mapped to a
 *    collection in `@/lib/urls`.
 *
 * The actor is resolved to a DID (to fetch the record) and a handle (to
 * display). When the URL addressed the record by DID, we canonicalize the
 * address bar to the handle form once it's known — durable in transit,
 * pretty on screen.
 */
export default function RecordDetailPage() {
  const params = useParams()
  const router = useRouter()

  const actorRaw = typeof params.actor === "string" ? params.actor : ""
  const typeRaw = typeof params.type === "string" ? params.type : ""
  const rkey = typeof params.rkey === "string" ? decodeURIComponent(params.rkey) : ""

  const actor = useMemo(() => parseActor(actorRaw), [actorRaw])
  const type: RecordType | null = isRecordType(typeRaw) ? typeRaw : null

  const {
    did,
    handle,
    isLoading: resolving,
  } = useUserProfile(actor.kind === "invalid" ? null : actor.value)

  // Canonicalize a DID-addressed URL to the handle form once resolved.
  useEffect(() => {
    if (!type) return
    if (actor.kind === "did" && handle && rkey) {
      router.replace(recordUrl(handle, type, rkey))
    }
  }, [actor.kind, handle, type, rkey, router])

  if (!type || actor.kind === "invalid") {
    return (
      <EmptyState
        icon={FileQuestion}
        title="Not found"
        description="This link doesn't point to an activity or project we can show."
        className="pt-[120px]"
      />
    )
  }

  if (type === "activity") {
    return (
      <ActivityDetailRoute
        did={did}
        handle={handle}
        rkey={rkey}
        resolving={resolving}
      />
    )
  }

  return (
    <ProjectDetailRoute
      did={did}
      handle={handle}
      rkey={rkey}
      resolving={resolving}
    />
  )
}
