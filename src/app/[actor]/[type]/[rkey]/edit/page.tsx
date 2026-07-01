"use client"

import { useEffect, useMemo } from "react"
import { useParams, useRouter } from "next/navigation"
import { useUserProfile } from "@/hooks/use-user-profile"
import { isRecordType, parseActor, recordUrl, type RecordType } from "@/lib/urls"
import ActivityEditRoute from "@/components/feed/activity-edit-route"
import ProjectEditRoute from "@/components/project/project-edit-route"
import EmptyState from "@/components/ui/empty-state"
import { FileQuestion } from "lucide-react"

/**
 * Handle-forward record editor route: `/{actor}/{type}/{rkey}/edit`.
 * Resolves the actor to a DID (the write target), validates the type, and
 * renders the matching editor. A DID-addressed URL canonicalizes to the
 * handle form once resolved, mirroring the read route.
 */
export default function RecordEditPage() {
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

  // Canonicalize a DID-addressed edit URL to the handle form once resolved.
  useEffect(() => {
    if (!type) return
    if (actor.kind === "did" && handle && rkey) {
      router.replace(`${recordUrl(handle, type, rkey)}/edit`)
    }
  }, [actor.kind, handle, type, rkey, router])

  if (!type || actor.kind === "invalid") {
    return (
      <EmptyState
        icon={FileQuestion}
        title="Not found"
        description="This link doesn't point to an activity or project we can edit."
        className="pt-[120px]"
      />
    )
  }

  if (type === "activity") {
    return <ActivityEditRoute did={did} rkey={rkey} resolving={resolving} />
  }

  return <ProjectEditRoute did={did} rkey={rkey} resolving={resolving} />
}
