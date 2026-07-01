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

  // Canonicalize the address bar to the record's current handle once
  // resolved: a DID-addressed URL becomes the handle form, AND a stale
  // handle — one the author has since migrated away from, recovered to
  // its stable DID via the indexer (#184) — self-heals to the current
  // handle. `handle === did` means no real handle resolved, so the URL is
  // left untouched rather than rewritten to a DID.
  useEffect(() => {
    if (!type || !handle || !rkey) return
    if (handle === did) return
    const addressedByDid = actor.kind === "did"
    const staleHandle =
      actor.kind === "handle" && handle.toLowerCase() !== actorRaw.toLowerCase()
    if (addressedByDid || staleHandle) {
      router.replace(recordUrl(handle, type, rkey))
    }
  }, [actor.kind, actorRaw, handle, did, type, rkey, router])

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
