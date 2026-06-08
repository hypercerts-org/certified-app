"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import { FileQuestion } from "lucide-react"
import { useAuth } from "@/lib/auth/auth-context"
import { useUserProfile } from "@/hooks/use-user-profile"
import {
  COLLECTION_BY_TYPE,
  isRecordType,
  parseActor,
  recordUrl,
  type RecordType,
} from "@/lib/urls"
import { resolveRecordCid } from "@/lib/atproto/typed-lists"
import { usePageTitle } from "@/lib/navbar-context"
import LoadingSpinner from "@/components/ui/loading-spinner"
import EmptyState from "@/components/ui/empty-state"
import UpdateForm from "@/components/context/update-form"

/**
 * `/{actor}/{type}/{rkey}/update/new` — post a new update about an
 * activity or project. Resolves the actor to the subject's author DID
 * (the repo the update is written to), resolves the subject's CID for
 * the strongRef, and renders the shared <UpdateForm>.
 */
export default function NewUpdatePage() {
  usePageTitle("New update")
  const params = useParams()
  const { did: ownDid } = useAuth()

  const actorRaw = typeof params.actor === "string" ? params.actor : ""
  const typeRaw = typeof params.type === "string" ? params.type : ""
  const rkey =
    typeof params.rkey === "string" ? decodeURIComponent(params.rkey) : ""

  const actor = useMemo(() => parseActor(actorRaw), [actorRaw])
  const type: RecordType | null = isRecordType(typeRaw) ? typeRaw : null
  const {
    did,
    handle,
    isLoading: resolving,
  } = useUserProfile(actor.kind === "invalid" ? null : actor.value)

  const subjectUri =
    did && type ? `at://${did}/${COLLECTION_BY_TYPE[type]}/${rkey}` : null

  const [subjectCid, setSubjectCid] = useState<string | null>(null)
  const [cidResolving, setCidResolving] = useState(true)
  useEffect(() => {
    if (!subjectUri) return
    let cancelled = false
    setCidResolving(true)
    resolveRecordCid(subjectUri)
      .then((cid) => {
        if (!cancelled) setSubjectCid(cid)
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setCidResolving(false)
      })
    return () => {
      cancelled = true
    }
  }, [subjectUri])

  if (!type || actor.kind === "invalid") {
    return (
      <EmptyState
        icon={FileQuestion}
        title="Not found"
        description="This link doesn't point to an activity or project."
        className="pt-[120px]"
      />
    )
  }

  if (resolving || cidResolving || !did || !ownDid) {
    return (
      <div className="flex justify-center py-24">
        <LoadingSpinner size="md" />
      </div>
    )
  }

  const actorSlug = handle || actorRaw
  const backHref = `${recordUrl(actorSlug, type, rkey)}?tab=updates`

  return (
    <UpdateForm
      ownDid={ownDid}
      targetDid={did}
      subjectUri={subjectUri!}
      subjectCid={subjectCid}
      backHref={backHref}
      mode="create"
    />
  )
}
