"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { parseAtUri, recordUrl } from "@/lib/urls"
import { useRouter } from "next/navigation"
import { PenLine } from "lucide-react"
import { useAuth } from "@/lib/auth/auth-context"
import { useOrg } from "@/lib/groups/org-context"
import { authFetch } from "@/lib/auth/fetch"
import SignedOutPrompt from "@/components/layout/signed-out-prompt"
import LoadingSpinner from "@/components/ui/loading-spinner"
import PageContainer from "@/components/ui/page-container"
import PageHeader from "@/components/ui/page-header"
import FormActionBar from "@/components/create/form-action-bar"
import {
  ActivityFormFields,
  activityFormProblems,
  type ContributorRow,
} from "@/components/create/activity-form"
import {
  useRightsOptions,
  type RightsOption,
} from "@/components/create/use-rights-options"
import type { LinearDocument } from "@/lib/leaflet/types"
import type { BlobRef } from "@atproto/api"
import {
  uploadBlob,
  type UploadedBlob,
} from "@/lib/atproto/profile"
import { normalizeIdentity } from "@/components/create/contributor-identity-field"
import LocationPickerDialog, {
  type AddedLocation,
} from "@/components/create/location-picker-dialog"
import type { HypercertsSmallImage } from "@/lib/atproto/types"
import type { StrongRef } from "@/lib/atproto/location"
import { usePageTitle } from "@/lib/navbar-context"
import { useTour } from "@/lib/tour/tour-context"
import { toUserErrorMessage } from "@/lib/utils/api"
import { isEmptyLongDescription } from "@/lib/leaflet/guards"
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard"

/**
 * `/create` — new cert. Mirrors the visual language of the cert detail
 * page (`page-layout cert-detail--wide`) so the editing flow reads as
 * "you're shaping a draft cert that will look exactly like this when
 * published." Surfaces every field the
 * `org.hypercerts.claim.activity` lexicon supports as an inline form:
 *
 *   Required (lexicon-required):
 *     - title             (string, max 256)
 *     - shortDescription  (string, max 300 graphemes)
 *     - createdAt         (auto-stamped at submit)
 *
 *   Inline-editable here:
 *     - description       (Leaflet LinearDocument)
 *     - startDate         (datetime — emitted as ISO from a date input)
 *     - endDate           (datetime — same)
 *     - workScope         (free-form string → `#workScopeString` variant)
 *     - contributors[]    (inline `#contributorIdentity` rows with
 *                          optional weight + `#contributorRole`)
 *     - image             (BlobRef via uploadBlob; wrapped as
 *                          `org.hypercerts.defs#smallImage` on save)
 *     - locations[]       (strongRefs to fresh app.certified.location
 *                          records — created from a search-and-pin
 *                          dialog — OR pasted at:// URIs of existing
 *                          records)
 *     - rights            (strongRef chosen from the curated
 *                          org.hypercerts.claim.rights records; see
 *                          `useRightsOptions`)
 *
 *   shortDescriptionFacets is derived at parse time elsewhere; the
 *   form itself stays plain-text.
 *
 * The fields themselves are `<ActivityFormFields>`, shared with the edit
 * page so the two forms stay identical.
 */

export default function CreatePage() {
  usePageTitle("New activity")
  const { isAuthenticated, isLoading, did } = useAuth()
  const { activeOrg } = useOrg()
  const router = useRouter()
  // During the product tour, don't auto-focus the title — the tour's
  // arrow-key navigation needs focus on its own card, not trapped in this
  // field (the "Give it a title" step highlights it without typing in it).
  const { isActive: tourActive } = useTour()
  // "Effective identity" — the DID the cert is published as on
  // this page. When the user has switched into a group, that's the
  // group's DID; otherwise their own session DID. Used anywhere
  // "self" matters here (Add me shortcut, blob target repo,
  // submit destination) so the form treats the active identity as
  // a first-class subject rather than always falling through to the
  // personal user.
  const effectiveDid: string =
    activeOrg?.groupDid ?? did ?? ""

  const [arrivedFromInApp] = useState(() => {
    if (typeof window === "undefined") return false
    try {
      const referrer = document.referrer ? new URL(document.referrer) : null
      return !!referrer && referrer.origin === window.location.origin
    } catch {
      return false
    }
  })

  // Scalar fields. Dates use the HTML date-input shape (YYYY-MM-DD)
  // and are upcast to ISO datetime at submit so the lexicon's
  // datetime format is respected.
  const [title, setTitle] = useState("")
  const [shortDescription, setShortDescription] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [workScope, setWorkScope] = useState("")
  const [description, setDescription] = useState<LinearDocument | null>(null)
  const [contributors, setContributors] = useState<ContributorRow[]>([])

  // Image — same staging pattern activity-detail uses: a local object
  // URL drives the preview while the blob is being uploaded; once the
  // upload settles, `pendingImageBlob` holds the BlobRef we'll attach
  // to the cert record on submit.
  const [pendingImageBlob, setPendingImageBlob] =
    useState<UploadedBlob | null>(null)
  const [pendingImagePreviewUrl, setPendingImagePreviewUrl] =
    useState<string | null>(null)

  // Locations — array of strongRefs we've already written (or resolved
  // from a pasted URI). New entries are added via the dialog below.
  const [locations, setLocations] = useState<AddedLocation[]>([])
  const [isLocationDialogOpen, setIsLocationDialogOpen] = useState(false)

  // Rights — single strongRef, picked from the curated publisher's
  // records. Default: "Public Display of Contributions", the most
  // permissive option, so a new activity is publishable without a rights
  // decision the author probably hasn't thought about yet. Matched by
  // exact name; if the publisher renames it, the author picks manually.
  const [rightsUri, setRightsUri] = useState<string>("")
  const rights = useRightsOptions(
    useCallback((opts: RightsOption[]) => {
      const defaultPick = opts.find(
        (o) => o.name === "Public Display of Contributions",
      )
      if (defaultPick) {
        setRightsUri((prev) => (prev ? prev : defaultPick.ref.uri))
      }
    }, []),
  )

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Unsaved-changes guard. Rights is excluded — it's auto-filled with a
  // default on load, so it doesn't signal user input on its own.
  const isDirty =
    !isSubmitting &&
    (title.trim() !== "" ||
      shortDescription.trim() !== "" ||
      startDate !== "" ||
      endDate !== "" ||
      workScope.trim() !== "" ||
      !isEmptyLongDescription(description) ||
      contributors.length > 0 ||
      !!pendingImageBlob ||
      locations.length > 0)
  const { confirmDiscard } = useUnsavedChangesGuard(isDirty)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const shortDescRef = useRef<HTMLTextAreaElement>(null)

  // Revoke any staged preview URL on unmount so the blob URL doesn't
  // linger in memory after the user navigates away mid-flow.
  useEffect(() => {
    return () => {
      if (pendingImagePreviewUrl) URL.revokeObjectURL(pendingImagePreviewUrl)
    }
  }, [pendingImagePreviewUrl])

  // Set by a Publish click with requirements unmet: every under-minimum
  // count then turns red, not only the ones already edited.
  const [submitAttempted, setSubmitAttempted] = useState(false)

  useEffect(() => {
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
    locations,
    rightsUri,
  ])

  // Image upload handler — mirrors activity-detail.handleImageFile.
  // Optimistically swaps in a local-object-URL preview while the
  // blob upload is in flight; once it settles, the BlobRef is held
  // in state until cert-create-submit attaches it to the record.
  const handleImageFile = useCallback(async (file: File) => {
    const previewUrl = URL.createObjectURL(file)
    setPendingImagePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return previewUrl
    })
    // Route the blob upload to the group's repo when the active
    // identity is a group; otherwise the user's own.
    const targetDid = activeOrg ? activeOrg.groupDid : null
    try {
      const blob = await uploadBlob(
        file,
        targetDid ? { targetDid } : undefined,
      )
      setPendingImageBlob(blob)
    } catch (err) {
      // Surface the failure and clear the dangling optimistic preview so
      // the form can't be published with an image that never uploaded.
      setError(
        err instanceof Error ? err.message : "Image upload failed",
      )
      setPendingImageBlob(null)
      setPendingImagePreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
    }
  }, [activeOrg])

  const handleImageRemove = useCallback(() => {
    setPendingImageBlob(null)
    setPendingImagePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
  }, [])

  // The page's one header (DESIGN.md §9.13): back to Records, the title as
  // the page's h1, one line of description. Shared by the loading and
  // signed-out states so the page doesn't jump when the session settles.
  const pageHeader = (
    <PageHeader
      back={{ href: "/records", label: "Workspace" }}
      title="New activity"
      description="Describe a piece of work: what was done, when, where and by whom."
    />
  )

  // Auth state takes a tick to resolve on refresh — the session is
  // restored from a cookie via `/api/auth/session` and that round-
  // trip hasn't completed yet. During that window `isAuthenticated`
  // is false but the user is in fact signed in. Surfacing a
  // "Sign in to create" message during the loading window felt
  // jarring on every refresh; we now render a quiet spinner until
  // the session check settles.
  if (isLoading) {
    return (
      <PageContainer>
        {pageHeader}
        <div className="flex justify-center py-16">
          <LoadingSpinner size="md" />
        </div>
      </PageContainer>
    )
  }

  if (!isAuthenticated) {
    return (
      <PageContainer>
        {pageHeader}
        <SignedOutPrompt
          icon={PenLine}
          title="Sign in to create an activity"
          description="Activities are published under your Certified account."
          headingLevel={2}
        />
      </PageContainer>
    )
  }

  // When the user has switched into a group, the cert is published
  // on the group's repo via the BFF route. The /create form is
  // identical either way — only the submit path differs (see
  // handleSubmit's targetDid branch).

  // What still blocks publishing (lengths, contributor rows, dates).
  const problems = activityFormProblems({
    title,
    shortDescription,
    startDate,
    endDate,
    contributors,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!did) return
    // Publish stays enabled so a click always explains itself: list
    // whatever is still missing, flag the counts and focus the first
    // offending field. (This also covers an Enter-key submit.)
    if (problems.unmet.length > 0) {
      setSubmitAttempted(true)
      setError(`Before publishing: ${problems.unmet.join("; ")}.`)
      if (problems.focus === "title") titleInputRef.current?.focus()
      else if (problems.focus === "shortDescription") shortDescRef.current?.focus()
      return
    }

    setIsSubmitting(true)
    setError(null)

    // Build the record payload. Optional fields are added only when
    // populated so the lexicon doesn't receive empty strings or
    // empty arrays that mean something different from "absent".
    type ClaimActivityRecord = {
      $type: "org.hypercerts.claim.activity"
      title: string
      shortDescription: string
      createdAt: string
      description?: LinearDocument
      startDate?: string
      endDate?: string
      workScope?: {
        $type: "org.hypercerts.claim.activity#workScopeString"
        scope: string
      }
      contributors?: Array<{
        contributorIdentity: {
          $type: "org.hypercerts.claim.activity#contributorIdentity"
          identity: string
        }
        contributionWeight?: string
        contributionDetails?: {
          $type: "org.hypercerts.claim.activity#contributorRole"
          role: string
        }
      }>
      image?: HypercertsSmallImage
      locations?: StrongRef[]
      rights?: StrongRef
    }
    const record: ClaimActivityRecord = {
      $type: "org.hypercerts.claim.activity",
      title: title.trim(),
      shortDescription: shortDescription.trim(),
      createdAt: new Date().toISOString(),
    }
    if (description && description.blocks.length > 0) {
      record.description = description
    }
    if (startDate) {
      // YYYY-MM-DD → ISO datetime at start of day in UTC. The
      // lexicon stores datetime; midnight UTC is the conventional
      // "all we know is the date" anchor.
      record.startDate = new Date(`${startDate}T00:00:00.000Z`).toISOString()
    }
    if (endDate) {
      record.endDate = new Date(`${endDate}T00:00:00.000Z`).toISOString()
    }
    if (workScope.trim()) {
      record.workScope = {
        $type: "org.hypercerts.claim.activity#workScopeString",
        scope: workScope.trim(),
      }
    }
    const seenSaveIdentities = new Set<string>()
    const populatedContributors: NonNullable<
      ClaimActivityRecord["contributors"]
    > = []
    for (const c of contributors) {
      const norm = normalizeIdentity(c.identity)
      if (!norm) continue
      const key = norm.toLowerCase()
      if (seenSaveIdentities.has(key)) continue
      seenSaveIdentities.add(key)
      const entry: NonNullable<ClaimActivityRecord["contributors"]>[number] = {
        contributorIdentity: {
          $type: "org.hypercerts.claim.activity#contributorIdentity",
          // Store the canonical form — strip the `@` that the
          // typeahead writes back into the field on pick — so
          // downstream `/api/resolve-did?handle=…` queries don't
          // have to special-case the prefix.
          identity: norm,
        },
      }
      if (c.weight.trim()) entry.contributionWeight = c.weight.trim()
      if (c.role.trim()) {
        entry.contributionDetails = {
          $type: "org.hypercerts.claim.activity#contributorRole",
          role: c.role.trim(),
        }
      }
      populatedContributors.push(entry)
    }
    if (populatedContributors.length > 0) {
      record.contributors = populatedContributors
    }
    if (pendingImageBlob) {
      record.image = {
        $type: "org.hypercerts.defs#smallImage",
        image: pendingImageBlob as unknown as BlobRef,
      }
    }
    if (locations.length > 0) {
      record.locations = locations.map((l) => l.ref)
    }
    if (rightsUri) {
      const chosen = rights.options.find((o) => o.ref.uri === rightsUri)
      if (chosen) record.rights = chosen.ref
    }

    try {
      // Route through the group BFF when the user has switched into
      // a group identity; otherwise use the xrpc proxy on the
      // viewer's own repo. The BFF's PUT route accepts
      // `{ record }` with no rkey → createRecord on the group repo.
      const useGroupRoute = activeOrg !== null
      const url = useGroupRoute
        ? `/api/groups/${encodeURIComponent(effectiveDid)}/activity`
        : "/api/xrpc/com/atproto/repo/createRecord"
      const method = useGroupRoute ? "PUT" : "POST"
      const body = useGroupRoute
        ? { record }
        : {
            repo: effectiveDid,
            collection: "org.hypercerts.claim.activity",
            record,
          }
      const res = await authFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(
          toUserErrorMessage(
            res.status,
            data.error,
            "Couldn't publish your activity. Your draft is still here; try again",
          ),
        )
      }

      const uri: unknown = data?.uri
      const parsed = typeof uri === "string" ? parseAtUri(uri) : null
      if (parsed) {
        router.push(
          recordUrl(parsed.did, "activity", parsed.rkey),
        )
      } else {
        router.push("/")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
      setIsSubmitting(false)
    }
  }

  return (
    <PageContainer>
      {pageHeader}
      <form onSubmit={handleSubmit}>
        <ActivityFormFields
          title={title}
          onTitleChange={setTitle}
          titleRef={titleInputRef}
          // During the product tour, don't auto-focus the title: the
          // tour's arrow-key navigation needs focus on its own card.
          autoFocusTitle={!tourActive}
          titleTourId="create-title"
          shortDescription={shortDescription}
          onShortDescriptionChange={setShortDescription}
          shortDescriptionRef={shortDescRef}
          showAllErrors={submitAttempted}
          description={description}
          onDescriptionChange={setDescription}
          descriptionPlaceholder="Full description of this activity. Headings, lists, links, images, and video embeds are all supported via the toolbar."
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
          imageUrl={pendingImagePreviewUrl}
          hasPendingImage={!!pendingImageBlob}
          hasImage={!!pendingImageBlob}
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
          selfDid={effectiveDid || null}
        />

        <FormActionBar
          submitLabel="Publish activity"
          submittingLabel="Publishing…"
          isSubmitting={isSubmitting}
          error={error}
          onCancel={() => {
            if (!confirmDiscard()) return
            if (arrivedFromInApp) router.back()
            else router.push("/")
          }}
          submitTourId="create-submit"
        />

        {isLocationDialogOpen && did ? (
          <LocationPickerDialog
            ownDid={did}
            targetDid={effectiveDid}
            onClose={() => setIsLocationDialogOpen(false)}
            onPick={(added) => {
              setLocations((rows) => {
                // Don't duplicate the same URI if the user picked an
                // already-attached existing record.
                if (rows.some((r) => r.ref.uri === added.ref.uri)) return rows
                return [...rows, added]
              })
              setIsLocationDialogOpen(false)
            }}
          />
        ) : null}
      </form>
    </PageContainer>
  )
}

