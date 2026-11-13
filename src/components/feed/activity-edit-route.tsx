"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { parseAtUri, recordUrl, rkeyFromUri } from "@/lib/urls"
import { useRouter } from "next/navigation"
import { PenLine } from "lucide-react"
import { useAuth } from "@/lib/auth/auth-context"
import { useOrg } from "@/lib/groups/org-context"
import { authFetch } from "@/lib/auth/fetch"
import EmptyState from "@/components/ui/empty-state"
import Button from "@/components/ui/button"
import PageContainer from "@/components/ui/page-container"
import PageHeader from "@/components/ui/page-header"
import SignedOutPrompt from "@/components/layout/signed-out-prompt"
import FormActionBar from "@/components/create/form-action-bar"
import {
  ActivityFormFields,
  activityFormProblems,
  type ContributorRow,
} from "@/components/create/activity-form"
import { useRightsOptions } from "@/components/create/use-rights-options"
import LoadingSpinner from "@/components/ui/loading-spinner"
import type { LinearDocument } from "@/lib/leaflet/types"
import type { BlobRef } from "@atproto/api"
import { uploadBlob, type UploadedBlob } from "@/lib/atproto/profile"
import { useActivity, invalidateActivity } from "@/hooks/use-activity"
import { normalizeIdentity } from "@/components/create/contributor-identity-field"
import LocationPickerDialog, {
  type AddedLocation,
} from "@/components/create/location-picker-dialog"
import type {
  ClaimActivity,
  StrongRef,
  ActivityContributor,
} from "@/lib/atproto/activity-types"
import type { HypercertsSmallImage } from "@/lib/atproto/types"
import {
  evaluateWorkScope,
  resolveActivityImageUrl,
} from "@/lib/atproto/activity"
import { asLinearDocument, isEmptyLongDescription } from "@/lib/leaflet/guards"
import { putCertRecord } from "@/lib/atproto/cert"
import { InvalidSwapError } from "@/lib/atproto/repo-write"
import { saveWithSwap } from "@/lib/atproto/save-with-swap"
import { splitLocationName } from "@/lib/atproto/location"
import { usePageTitle } from "@/lib/navbar-context"

/**
 * `/activity/[did]/[rkey]/edit` — full-page cert editor. Same visual
 * shell as `/create` (single-page form, no tabs), pre-filled from the
 * cert's existing record. Save routes through `putCertRecord` with a
 * `swapRecord` CID precondition so a concurrent edit elsewhere can't
 * silently clobber this write.
 *
 * Auth gate: signed-in + (own cert OR acting as the group that owns
 * the cert with owner/admin role). Mirrors the inline-edit gate on
 * the read-mode page.
 *
 * Contributors with a strong-ref identity variant (not the inline
 * `#contributorIdentity` shape that the /create form emits) are
 * passed through unchanged at save time — the editor doesn't surface
 * them as rows but it does preserve them via the `...effectiveValue`
 * overlay in the save handler.
 *
 * The fields are `<ActivityFormFields>`, the same component /create
 * renders, so the two forms share inputs, labels and layout.
 */

/** Convert the lexicon contributor union to the row shape this form
 *  edits. Strong-ref contributor identities can't be edited inline
 *  (they're records, not strings) and are dropped from the row list —
 *  the save handler reattaches them through the `...effectiveValue`
 *  overlay so they survive a round-trip. */
function contributorRowFromRecord(
  c: ActivityContributor,
  idx: number,
): ContributorRow | null {
  const id = c.contributorIdentity
  if (!id || typeof id !== "object") return null
  if (!("identity" in id) || typeof id.identity !== "string") return null
  const weightRaw = c.contributionWeight
  const weight = typeof weightRaw === "string" ? weightRaw : ""
  let role = ""
  const details = c.contributionDetails
  if (details && typeof details === "object" && "role" in details) {
    role = typeof (details as { role?: unknown }).role === "string"
      ? (details as { role: string }).role
      : ""
  } else if (typeof details === "string") {
    role = details
  }
  return {
    key: `seed-${idx}-${id.identity}`,
    identity: id.identity,
    weight,
    role,
    // Pre-filled rows are committed by definition — they came from a
    // saved record, so the card renders immediately on page load.
    picked: true,
  }
}

/** Return contributors that AREN'T representable as rows (strongRef
 *  identities). Carried forward unchanged through save. */
function carriedForwardContributors(
  contributors: ActivityContributor[] | undefined,
): ActivityContributor[] {
  if (!contributors) return []
  return contributors.filter((c) => {
    const id = c.contributorIdentity
    if (!id || typeof id !== "object") return true
    return !("identity" in id) || typeof id.identity !== "string"
  })
}

interface ResolvedLocationRow {
  ref: StrongRef
  name: string
}

/**
 * `/{actor}/activity/{rkey}/edit` — full-page cert editor. `actor` is
 * resolved to a DID by the parent route; this component takes the resolved
 * `did` + `rkey` as props (`resolving` is true while that resolution is in
 * flight, so we hold the loading state instead of flashing "not found").
 */
export default function ActivityEditRoute({
  did,
  rkey,
  resolving,
}: {
  did: string | null
  rkey: string | null
  resolving: boolean
}) {
  usePageTitle("Edit activity")
  const router = useRouter()

  const { isAuthenticated, isLoading: authLoading, did: sessionDid } = useAuth()
  const { activeOrg } = useOrg()

  // The edit endpoint to call: own repo via XRPC proxy when the
  // viewer's session DID matches the cert's owner; the group BFF
  // when the cert is owned by the active org and the role permits.
  const canEditAsActiveOrg =
    !!activeOrg && !!did && activeOrg.groupDid === did &&
    (activeOrg.role === "owner" || activeOrg.role === "admin")
  const isCreator = activeOrg
    ? canEditAsActiveOrg
    : !!sessionDid && sessionDid === did
  const editTargetDid = canEditAsActiveOrg ? did : undefined

  const { activity, isLoading: activityLoading, error: activityError } =
    useActivity(did, rkey)

  // -------------------------------------------------------------------
  // Form state — same shape as /create. All fields are seeded from the
  // existing record once `activity` resolves (see seed effect below).
  // -------------------------------------------------------------------
  const [title, setTitle] = useState("")
  const [shortDescription, setShortDescription] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [workScope, setWorkScope] = useState("")
  const [description, setDescription] = useState<LinearDocument | null>(null)
  const [contributors, setContributors] = useState<ContributorRow[]>([])

  // Image: existing record's image still renders by default; only on
  // replace do we stage a new blob.
  const [pendingImageBlob, setPendingImageBlob] = useState<UploadedBlob | null>(null)
  const [pendingImagePreviewUrl, setPendingImagePreviewUrl] = useState<string | null>(null)
  const [imageRemoved, setImageRemoved] = useState(false)

  const [locations, setLocations] = useState<ResolvedLocationRow[]>([])
  const [isLocationDialogOpen, setIsLocationDialogOpen] = useState(false)

  const rights = useRightsOptions()
  const [rightsUri, setRightsUri] = useState<string>("")

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Set by a Save click with requirements unmet: every under-minimum
  // count then turns red, not only the ones already edited.
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const shortDescRef = useRef<HTMLTextAreaElement>(null)

  /** Snapshot captured at seed time — the swap-record baseline. The
   *  save handler diffs against this to detect concurrent edits. */
  const [mountSnapshot, setMountSnapshot] = useState<{
    value: ClaimActivity
    cid: string
  } | null>(null)
  const seededRef = useRef(false)

  // The publishing identity ("Add me", new location records): the group
  // when acting as one, otherwise the signed-in account.
  const effectivePublisherDid: string =
    activeOrg?.groupDid ?? sessionDid ?? ""

  // -------------------------------------------------------------------
  // Seed form fields from the loaded activity. Runs exactly once per
  // mount — `seededRef` keeps a manual revert (user types, then we
  // re-render because of another state update) from being clobbered
  // by re-running the seeder. The swap baseline is captured here too.
  // -------------------------------------------------------------------
  useEffect(() => {
    if (seededRef.current) return
    if (!activity) return
    const v = activity.value
    // Intentional setState in effect (TECH-814): one-shot ref-guarded (seededRef) seeding of editable form state + swap-record cid baseline after the async record load; re-running would clobber user edits. Long-term fix is a key-remount form child, tracked separately
    setTitle(v.title ?? "")
    setShortDescription(v.shortDescription ?? "")
    setStartDate(
      typeof v.startDate === "string" ? v.startDate.slice(0, 10) : "",
    )
    setEndDate(
      typeof v.endDate === "string" ? v.endDate.slice(0, 10) : "",
    )
    setWorkScope(evaluateWorkScope(v.workScope) ?? "")
    setDescription(
      asLinearDocument(v.description) ??
        (typeof v.description === "string" && v.description.trim().length > 0
          ? {
              $type: "pub.leaflet.pages.linearDocument" as const,
              blocks: [
                {
                  block: {
                    $type: "pub.leaflet.blocks.text" as const,
                    plaintext: v.description,
                  },
                },
              ],
            }
          : null),
    )
    const rows: ContributorRow[] = []
    ;(v.contributors ?? []).forEach((c, idx) => {
      const r = contributorRowFromRecord(c, idx)
      if (r) rows.push(r)
    })
    setContributors(rows)
    setRightsUri(v.rights?.uri ?? "")
    setMountSnapshot({ value: v, cid: activity.cid })
    seededRef.current = true
  }, [activity])

  // Records' "Contributors…" opens `…/edit#contributors`. The form only
  // renders once the record has loaded, so the browser's own jump to the
  // fragment finds nothing; scroll there once the form is filled in.
  const [hashTarget] = useState(() =>
    typeof window === "undefined" ? "" : window.location.hash.slice(1),
  )
  const formReady = !!mountSnapshot
  useEffect(() => {
    if (!formReady || !hashTarget) return
    const target = document.getElementById(hashTarget)
    if (!target) return
    let userScrolled = false
    const onUserScroll = () => {
      userScrolled = true
    }
    const go = () => {
      if (!userScrolled) target.scrollIntoView({ block: "start" })
    }
    const frame = requestAnimationFrame(go)
    // Content above the section still settles after the first paint (the
    // description editor loads on demand and grows the page), so follow
    // the section for a moment, until the user scrolls themselves.
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(go)
    observer?.observe(document.body)
    const stop = window.setTimeout(() => observer?.disconnect(), 2000)
    const events = ["wheel", "touchstart", "keydown"] as const
    for (const e of events) {
      window.addEventListener(e, onUserScroll, { passive: true })
    }
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(stop)
      observer?.disconnect()
      for (const e of events) window.removeEventListener(e, onUserScroll)
    }
  }, [formReady, hashTarget])

  // -------------------------------------------------------------------
  // Hydrate existing locations into display rows. Names live on the
  // location record itself (one getRecord per strongRef) — we use the
  // same shape `LocationPickerDialog` emits so the row UI is uniform.
  // -------------------------------------------------------------------
  // The refs-empty reset is adjusted during render when the record
  // identity changes (keyed on uri|cid, not object identity, which
  // isn't render-stable); initial state is already []. Only the async
  // name hydration lives in the effect.
  const activityKey = activity ? `${activity.uri}|${activity.cid}` : null
  const [prevActivityKey, setPrevActivityKey] = useState(activityKey)
  if (prevActivityKey !== activityKey) {
    setPrevActivityKey(activityKey)
    if (activity && (activity.value.locations ?? []).length === 0) {
      setLocations([])
    }
  }

  useEffect(() => {
    if (!activity) return
    const refs = activity.value.locations ?? []
    if (refs.length === 0) return
    let aborted = false
    Promise.all(
      refs.map(async (ref): Promise<ResolvedLocationRow> => {
        const parsed = parseAtUri(ref.uri)
        if (!parsed) return { ref, name: ref.uri }
        const qs = new URLSearchParams({
          repo: parsed.did,
          collection: parsed.collection,
          rkey: parsed.rkey,
        })
        try {
          const res = await authFetch(
            `/api/xrpc/com/atproto/repo/getRecord?${qs.toString()}`,
          )
          if (!res.ok) return { ref, name: rkeyFromUri(ref.uri) || ref.uri }
          const data = (await res.json()) as { value?: { name?: string } }
          const raw = data.value?.name?.trim() ?? ""
          const split = splitLocationName(raw)
          const name =
            split.name || raw || rkeyFromUri(ref.uri) || "Location"
          return { ref, name }
        } catch {
          return { ref, name: rkeyFromUri(ref.uri) || ref.uri }
        }
      }),
    ).then((rows) => {
      if (aborted) return
      setLocations(rows)
    })
    return () => {
      aborted = true
    }
  }, [activity])

  // Revoke object URL on unmount.
  useEffect(() => {
    return () => {
      if (pendingImagePreviewUrl) URL.revokeObjectURL(pendingImagePreviewUrl)
    }
  }, [pendingImagePreviewUrl])

  // Clear save error whenever any field changes.
  useEffect(() => {
    // Intentional setState in effect (TECH-814): deliberate cross-field watcher clearing the save error on any edit; setError(null) bails out (no render) whenever error is already null, so cost is one render only while an error is showing
    setError(null)
  }, [
    title,
    shortDescription,
    startDate,
    endDate,
    workScope,
    description,
    contributors,
    pendingImageBlob,
    imageRemoved,
    locations,
    rightsUri,
  ])

  const handleImageFile = useCallback(
    async (file: File) => {
      const previewUrl = URL.createObjectURL(file)
      setPendingImagePreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return previewUrl
      })
      setImageRemoved(false)
      const targetDid = activeOrg ? activeOrg.groupDid : null
      const blob = await uploadBlob(
        file,
        targetDid ? { targetDid } : undefined,
      )
      setPendingImageBlob(blob)
    },
    [activeOrg],
  )

  const handleImageRemove = useCallback(() => {
    setPendingImageBlob(null)
    setPendingImagePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setImageRemoved(true)
  }, [])

  // Display URL for the image slot: in-flight preview > existing
  // server image (unless removed) > placeholder icon.
  const existingImageUrl =
    !imageRemoved && activity?.value.image && did
      ? resolveActivityImageUrl(activity.value.image, did)
      : null
  const displayImageUrl = pendingImagePreviewUrl ?? existingImageUrl

  // The page's one header (DESIGN.md §9.13): back to the record, the title
  // as the page's h1, one line of description. Shared by every gate below
  // so the page keeps its frame while the record loads.
  const recordHref = did && rkey ? recordUrl(did, "activity", rkey) : null
  const pageHeader = (
    <PageHeader
      back={
        recordHref
          ? { href: recordHref, label: "Activity" }
          : { href: "/records", label: "Records" }
      }
      title="Edit activity"
      description="Your changes update the published activity."
    />
  )
  const gate = (body: React.ReactNode) => (
    <PageContainer>
      {pageHeader}
      {body}
    </PageContainer>
  )

  // Auth-loading / signed-out states. Mirrors /create's gates.
  if (resolving || authLoading || activityLoading) {
    return gate(
      <div className="flex justify-center py-16">
        <LoadingSpinner size="md" />
      </div>,
    )
  }

  if (!isAuthenticated) {
    return gate(
      <SignedOutPrompt
        icon={PenLine}
        title="Sign in to edit"
        description="You need to be signed in to edit an activity."
        headingLevel={2}
      />,
    )
  }

  if (activityError || !activity) {
    return gate(
      <EmptyState
        icon={PenLine}
        title="Activity not found"
        description={activityError || "Couldn't load this activity to edit."}
        headingLevel={2}
      >
        <Button href="/records" variant="secondary" size="sm">
          Go to Records
        </Button>
      </EmptyState>,
    )
  }

  // A `partial` record came from the indexer fallback because the live PDS
  // was unreachable (#184), so it is missing contributors, locations, the
  // long description and rights. Editing from it would seed the form with
  // those fields blank and silently strip them from the authoritative
  // record on save — refuse to edit until the full record loads.
  if (activity.partial) {
    return gate(
      <EmptyState
        icon={PenLine}
        title="Can't edit right now"
        description="We couldn't load the full activity, so editing now could lose details. Try again in a minute."
        headingLevel={2}
      />,
    )
  }

  if (!isCreator) {
    return gate(
      <EmptyState
        icon={PenLine}
        title="You can't edit this activity"
        description="Only the activity's creator (or the active group it's published under) can make changes."
        headingLevel={2}
      >
        {recordHref ? (
          <Button href={recordHref} variant="secondary" size="sm">
            View activity
          </Button>
        ) : null}
      </EmptyState>,
    )
  }

  // ----- submit -----
  // What still blocks saving (lengths, contributor rows, dates).
  const problems = activityFormProblems({
    title,
    shortDescription,
    startDate,
    endDate,
    contributors,
  })

  const doSave = async () => {
    if (isSubmitting) return
    if (!sessionDid || !did || !rkey || !mountSnapshot) return
    // Save stays enabled so a click always explains itself, as on
    // /create: list what's missing, flag the counts and focus the first
    // offending field.
    if (problems.unmet.length > 0) {
      setSubmitAttempted(true)
      setError(`Before saving: ${problems.unmet.join("; ")}.`)
      if (problems.focus === "title") titleInputRef.current?.focus()
      else if (problems.focus === "shortDescription") shortDescRef.current?.focus()
      return
    }

    setIsSubmitting(true)
    setError(null)

    // Build the next record by overlaying form values on the captured
    // snapshot. Strong-ref contributors (and any future field we don't
    // surface in the form) survive via the spread.
    const next: ClaimActivity = { ...mountSnapshot.value }

    next.title = title.trim()
    next.shortDescription = shortDescription.trim()

    if (description && !isEmptyLongDescription(description)) {
      next.description = description
    } else {
      delete (next as { description?: unknown }).description
    }

    if (startDate) {
      next.startDate = new Date(`${startDate}T00:00:00.000Z`).toISOString()
    } else {
      delete (next as { startDate?: unknown }).startDate
    }
    if (endDate) {
      next.endDate = new Date(`${endDate}T00:00:00.000Z`).toISOString()
    } else {
      delete (next as { endDate?: unknown }).endDate
    }

    if (workScope.trim()) {
      next.workScope = {
        $type: "org.hypercerts.claim.activity#workScopeString",
        scope: workScope.trim(),
      }
    } else {
      delete (next as { workScope?: unknown }).workScope
    }

    // Contributors — rebuild from rows + carry-forward strongRefs.
    const seen = new Set<string>()
    const rowContributors: ActivityContributor[] = []
    for (const c of contributors) {
      const norm = normalizeIdentity(c.identity)
      if (!norm) continue
      const key = norm.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      const entry: ActivityContributor = {
        contributorIdentity: {
          $type: "org.hypercerts.claim.activity#contributorIdentity",
          identity: norm,
        } as ActivityContributor["contributorIdentity"],
      }
      if (c.weight.trim()) entry.contributionWeight = c.weight.trim()
      if (c.role.trim()) {
        entry.contributionDetails = {
          $type: "org.hypercerts.claim.activity#contributorRole",
          role: c.role.trim(),
        } as ActivityContributor["contributionDetails"]
      }
      rowContributors.push(entry)
    }
    const carried = carriedForwardContributors(mountSnapshot.value.contributors)
    const merged = [...rowContributors, ...carried]
    if (merged.length > 0) {
      next.contributors = merged
    } else {
      delete (next as { contributors?: unknown }).contributors
    }

    // Image. Three states: unchanged (no pending blob, not removed),
    // replaced (pending blob), or removed (imageRemoved flag).
    if (pendingImageBlob) {
      const imageValue: HypercertsSmallImage = {
        $type: "org.hypercerts.defs#smallImage",
        image: pendingImageBlob as unknown as BlobRef,
      }
      next.image = imageValue
    } else if (imageRemoved) {
      delete (next as { image?: unknown }).image
    }
    // else: leave next.image as the snapshot's existing image.

    if (locations.length > 0) {
      next.locations = locations.map((l) => l.ref)
    } else {
      delete (next as { locations?: unknown }).locations
    }

    if (rightsUri) {
      const chosen = rights.options.find((o) => o.ref.uri === rightsUri)
      if (chosen) next.rights = chosen.ref
    } else {
      // Honor the "No rights" pick: drop the field.
      delete (next as { rights?: unknown }).rights
    }

    try {
      // saveWithSwap diffs on a small flat user-shape (matches the
      // pattern activity-detail's inline-edit uses). The full record
      // is rebuilt inside `write` from the captured `mountSnapshot`
      // overlay + the closed-over form state — so the conflict
      // detector compares the scalars the user actually edited while
      // collection-shaped fields (contributors, locations, rights,
      // image) survive unchanged across a silent rebase.
      type UserShape = {
        title: string
        shortDescription: string
        description: LinearDocument | null
        workScope: string
        startDate: string
        endDate: string
        [key: string]: unknown
      }
      const userDrafts: UserShape = {
        title: title.trim(),
        shortDescription: shortDescription.trim(),
        description: description,
        workScope: workScope.trim(),
        startDate,
        endDate,
      }
      const userMountSnapshot: UserShape = {
        title: mountSnapshot.value.title ?? "",
        shortDescription: mountSnapshot.value.shortDescription ?? "",
        description:
          asLinearDocument(mountSnapshot.value.description) ?? null,
        workScope: evaluateWorkScope(mountSnapshot.value.workScope) ?? "",
        startDate:
          typeof mountSnapshot.value.startDate === "string"
            ? mountSnapshot.value.startDate.slice(0, 10)
            : "",
        endDate:
          typeof mountSnapshot.value.endDate === "string"
            ? mountSnapshot.value.endDate.slice(0, 10)
            : "",
      }
      const result = await saveWithSwap<UserShape, UserShape>({
        mountSnapshot: userMountSnapshot,
        initialCid: mountSnapshot.cid,
        drafts: userDrafts,
        computeNext: (_serverShape, draftsArg) => draftsArg,
        write: async (_userNext, swapRecord) => {
          await putCertRecord(
            sessionDid,
            editTargetDid ?? sessionDid,
            rkey,
            next,
            { swapRecord },
          )
        },
        read: async () => {
          const qs = new URLSearchParams({
            repo: did,
            collection: "org.hypercerts.claim.activity",
            rkey,
          })
          const res = await fetch(
            `/api/xrpc/com/atproto/repo/getRecord?${qs.toString()}`,
          )
          if (!res.ok) throw new Error(
              "Saved, but couldn't refresh the page. Reload to see your changes.",
            )
          const data = (await res.json()) as {
            cid: string
            value: ClaimActivity
          }
          return {
            cid: data.cid,
            value: {
              title: data.value.title ?? "",
              shortDescription: data.value.shortDescription ?? "",
              description:
                asLinearDocument(data.value.description) ?? null,
              workScope: evaluateWorkScope(data.value.workScope) ?? "",
              startDate:
                typeof data.value.startDate === "string"
                  ? data.value.startDate.slice(0, 10)
                  : "",
              endDate:
                typeof data.value.endDate === "string"
                  ? data.value.endDate.slice(0, 10)
                  : "",
            },
          }
        },
      })

      if (!result.ok) {
        if (result.reason === "conflict") {
          setError(
            `Someone else saved while you were editing — conflicts on ${result.conflictingFields.join(", ")}. Refresh to load the latest version.`,
          )
        } else {
          setError(
            "Couldn't auto-merge after several retries — refresh to load the latest version.",
          )
        }
        setIsSubmitting(false)
        return
      }

      // Drop the cached pre-edit record so the detail view we navigate to
      // re-fetches the just-saved version rather than rendering stale data.
      invalidateActivity(did, rkey)
      router.push(
        recordUrl(did, "activity", rkey),
      )
    } catch (err) {
      if (err instanceof InvalidSwapError) {
        setError(
          "Someone else saved while you were editing — please refresh and try again.",
        )
      } else {
        setError(err instanceof Error ? err.message : "Failed to save activity")
      }
      setIsSubmitting(false)
    }
  }

  const handleCancel = () => {
    if (did && rkey) {
      router.push(
        recordUrl(did, "activity", rkey),
      )
    } else {
      router.back()
    }
  }

  return (
    <PageContainer>
      {pageHeader}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void doSave()
        }}
      >
        <ActivityFormFields
          title={title}
          onTitleChange={setTitle}
          titleRef={titleInputRef}
          // Not when arriving at a section (`#contributors`): focusing the
          // title would pull the page back up (and open the phone keyboard).
          autoFocusTitle={!hashTarget}
          shortDescription={shortDescription}
          onShortDescriptionChange={setShortDescription}
          shortDescriptionRef={shortDescRef}
          showAllErrors={submitAttempted}
          description={description}
          onDescriptionChange={setDescription}
          descriptionPlaceholder="Full description of this activity."
          editorDid={did ?? ""}
          onEditorImageUpload={(file) =>
            uploadBlob(
              file,
              activeOrg ? { targetDid: activeOrg.groupDid } : undefined,
            )
          }
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
          workScope={workScope}
          onWorkScopeChange={setWorkScope}
          imageUrl={displayImageUrl}
          hasPendingImage={!!pendingImageBlob}
          hasImage={!!displayImageUrl}
          onImageFile={handleImageFile}
          onImageRemove={handleImageRemove}
          locations={locations}
          onRemoveLocation={(uri) =>
            setLocations((rows) => rows.filter((r) => r.ref.uri !== uri))
          }
          onAddLocation={() => setIsLocationDialogOpen(true)}
          rights={rights}
          rightsUri={rightsUri}
          onRightsChange={setRightsUri}
          contributors={contributors}
          setContributors={setContributors}
          selfDid={effectivePublisherDid || null}
        />

        <FormActionBar
          submitLabel="Save changes"
          submittingLabel="Saving…"
          isSubmitting={isSubmitting}
          submitDisabled={!mountSnapshot}
          error={error}
          onCancel={handleCancel}
          identityLabel="Saving as"
        />

        {isLocationDialogOpen && sessionDid ? (
          <LocationPickerDialog
            ownDid={sessionDid}
            targetDid={effectivePublisherDid}
            onClose={() => setIsLocationDialogOpen(false)}
            onPick={(added: AddedLocation) => {
              setLocations((rows) => {
                if (rows.some((r) => r.ref.uri === added.ref.uri)) return rows
                return [...rows, { ref: added.ref, name: added.name }]
              })
              setIsLocationDialogOpen(false)
            }}
          />
        ) : null}
      </form>
    </PageContainer>
  )
}
