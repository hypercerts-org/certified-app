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
import {
  getContextAttachment,
  type ContextAttachmentRecord,
} from "@/lib/atproto/context-attachment"
import { usePageTitle } from "@/lib/navbar-context"
import LoadingSpinner from "@/components/ui/loading-spinner"
import EmptyState from "@/components/ui/empty-state"
import UpdateForm from "@/components/context/update-form"

/**
 * `/{actor}/{type}/{rkey}/update/{updateRkey}/edit` — edit an existing
 * update. Loads the record from the author's repo to prefill the shared
 * <UpdateForm>, then overwrites it (with a swapRecord guard).
 */
export default function EditUpdatePage() {
  usePageTitle("Edit update")
  const params = useParams()
  const { did: ownDid } = useAuth()

  const actorRaw = typeof params.actor === "string" ? params.actor : ""
  const typeRaw = typeof params.type === "string" ? params.type : ""
  const rkey =
    typeof params.rkey === "string" ? decodeURIComponent(params.rkey) : ""
  const updateRkey =
    typeof params.updateRkey === "string"
      ? decodeURIComponent(params.updateRkey)
      : ""

  const actor = useMemo(() => parseActor(actorRaw), [actorRaw])
  const type: RecordType | null = isRecordType(typeRaw) ? typeRaw : null
  const {
    did,
    handle,
    isLoading: resolving,
  } = useUserProfile(actor.kind === "invalid" ? null : actor.value)

  const subjectUri =
    did && type ? `at://${did}/${COLLECTION_BY_TYPE[type]}/${rkey}` : null

  const [record, setRecord] = useState<ContextAttachmentRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  // Adjust state during render when the load target changes, so the
  // effect holds only the getContextAttachment lifecycle.
  const loadKey = `${did}|${updateRkey}`
  const [prevLoadKey, setPrevLoadKey] = useState(loadKey)
  if (prevLoadKey !== loadKey) {
    setPrevLoadKey(loadKey)
    setLoading(true)
    setLoadError(false)
  }

  useEffect(() => {
    if (!did || !updateRkey) return
    let cancelled = false
    getContextAttachment(did, updateRkey)
      .then((r) => {
        if (cancelled) return
        if (!r) setLoadError(true)
        else setRecord(r)
      })
      .catch(() => {
        if (!cancelled) setLoadError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [did, updateRkey])

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

  if (resolving || loading || !did || !ownDid) {
    return (
      <div className="flex justify-center py-24">
        <LoadingSpinner size="md" />
      </div>
    )
  }

  if (loadError || !record || !subjectUri) {
    return (
      <EmptyState
        icon={FileQuestion}
        title="Update not found"
        description="We couldn't load this update for editing."
        className="pt-[120px]"
      />
    )
  }

  const actorSlug = handle || actorRaw
  const backHref = `${recordUrl(actorSlug, type, rkey)}?tab=updates`

  return (
    <UpdateForm
      ownDid={ownDid}
      targetDid={did}
      subjectUri={subjectUri}
      subjectCid={record.cid}
      backHref={backHref}
      mode="edit"
      rkey={updateRkey}
      initialValue={record.value}
      initialCid={record.cid}
    />
  )
}
