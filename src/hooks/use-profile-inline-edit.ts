"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  putProfile,
  uploadAvatar,
  uploadBanner,
  uploadBlob,
  type UploadedBlob,
} from "@/lib/atproto/profile"
import { putOrgMarker } from "@/lib/groups/org-marker"
import {
  putLocationRecord,
  readLocationStrongRef,
  rkeyFromStrongRefUri,
  type StrongRef,
} from "@/lib/atproto/location"
import type {
  CertifiedProfile,
  HypercertsSmallImage,
  HypercertsLargeImage,
} from "@/lib/atproto/types"
import type { BlobRef } from "@atproto/api"
import type { GroupMetadata, OrgUrlItem } from "@/lib/groups/types"
import { formatMonthYear } from "@/lib/utils/format-date"
import {
  newDraftUrlRow,
  type ProfileDrafts,
} from "@/components/profile/profile-inline-edit-types"
import { ORG_TYPE_PRESETS } from "@/lib/groups/org-types"
import { asLinearDocument, isEmptyLongDescription } from "@/lib/leaflet/guards"

// =====================================================================
// Pure helpers — re-coerce stored marker shapes into the editor /
// display shape. Live with the hook because they're only useful in the
// inline-edit context; nothing else in the app reads or writes the
// org-marker fields through these.
// =====================================================================

export interface ParsedLocation {
  name: string | null
  coords: { lat: number; lng: number } | null
  /** When the marker stores a strongRef to a separate
   *  `app.certified.location` record, this is the URI. The save
   *  handler reuses it to overwrite the existing record instead of
   *  spawning a new one. */
  refUri?: string
}

/**
 * Coerce the marker's raw `location` field into the editor / display
 * shape. Accepts every historical form:
 *   - `{ uri, cid }` strongRef → resolved out-of-band by the hook
 *     below; this synchronous parser just records the URI so the save
 *     handler can update in place.
 *   - `{ lat, lng, name? }` inline coord object (legacy local writes).
 *   - plain `string` (legacy free-text only, no coords).
 */
export function parseLocation(v: unknown): ParsedLocation {
  if (typeof v === "string" && v.trim().length > 0) {
    return { name: v.trim(), coords: null }
  }
  if (v && typeof v === "object") {
    const obj = v as Record<string, unknown>
    if (
      typeof obj.uri === "string" &&
      obj.uri.length > 0 &&
      typeof obj.cid === "string"
    ) {
      return { name: null, coords: null, refUri: obj.uri }
    }
    if (typeof obj.lat === "number" && typeof obj.lng === "number") {
      const name =
        typeof obj.name === "string" && obj.name.trim().length > 0
          ? obj.name.trim()
          : null
      return { name, coords: { lat: obj.lat, lng: obj.lng } }
    }
    if (typeof obj.uri === "string" && obj.uri.length > 0) {
      return { name: obj.uri, coords: null }
    }
  }
  return { name: null, coords: null }
}

/**
 * Coerce the record's `organizationType` into the editor's two-bucket
 * shape: `presets` is the intersection with `ORG_TYPE_PRESETS`,
 * `other` collects everything else (typically one free-text value
 * typed into the "Other" chip).
 */
function parseOrgTypes(v: unknown): { presets: string[]; other: string } {
  const items: string[] = []
  if (typeof v === "string" && v.trim().length > 0) items.push(v.trim())
  else if (Array.isArray(v)) {
    for (const x of v) {
      if (typeof x === "string" && x.trim().length > 0) items.push(x.trim())
    }
  }
  const presetSet = new Set<string>(ORG_TYPE_PRESETS as readonly string[])
  const presets = items.filter((x) => presetSet.has(x))
  const otherItems = items.filter((x) => !presetSet.has(x))
  return { presets, other: otherItems.join(", ") }
}

/** All org-type tags to show in read mode, in canonical preset order
 *  followed by any free-text "other" entries. */
export function readableOrgTypeTags(v: unknown): string[] {
  const { presets, other } = parseOrgTypes(v)
  const otherTags = other
    ? other.split(",").map((s) => s.trim()).filter(Boolean)
    : []
  const orderedPresets = ORG_TYPE_PRESETS.filter((p) => presets.includes(p))
  return [...orderedPresets, ...otherTags]
}

/**
 * Format `foundedDate` for display. Accepts the full ISO datetime the
 * record stores, a plain `yyyy-mm-dd` string, or just a 4-digit year.
 * Returns `null` for missing / unparseable values.
 *
 * Year-only inputs (e.g. "2018") pass through unchanged so the org
 * card shows "Founded 2018" rather than parsing "2018" as Jan 2018.
 * Otherwise delegates to formatMonthYear; on parse failure echoes the
 * raw string so a malformed inline value remains visible.
 */
export function readableFoundedDate(v: unknown): string | null {
  if (typeof v !== "string" || v.trim().length === 0) return null
  const s = v.trim()
  if (/^\d{4}$/.test(s)) return s
  return formatMonthYear(s) ?? s
}

/** Build the form a `<input type="date">` expects from a stored value. */
function toDateInputValue(v: unknown): string {
  if (typeof v !== "string") return ""
  const s = v.trim()
  if (s === "") return ""
  if (/^\d{4}$/.test(s)) return `${s}-01-01`
  return s.slice(0, 10)
}

/** Normalise a `<input type="date">` value (yyyy-mm-dd) to an ISO
 *  datetime at UTC midnight so the record stores a stable value. Empty
 *  input yields `undefined` (the field is cleared). */
function fromDateInputValue(s: string): string | undefined {
  const v = s.trim()
  if (v === "") return undefined
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString()
}

// =====================================================================
// Hook
// =====================================================================

export interface UseProfileInlineEditInput {
  /** DID of the viewed profile. */
  did: string | null
  /** DID of the signed-in viewer (may differ from `did`). */
  sessionDid: string | null
  isAuthenticated: boolean
  /** Whether inline-edit is permitted for the current viewer. The
   *  caller computes this from `isOwnProfile && !activeOrg ||
   *  isActingAsThisGroup`. */
  canEditInline: boolean
  /** When the save should route through the group BFF, the group
   *  DID. `undefined` keeps writes on the personal-DID XRPC path. */
  editTargetDid: string | undefined
  /** True when the viewed profile is an org (has an org marker). */
  sidebarIsOrg: boolean
  /** Snapshot of the profile record. For the editable case the caller
   *  sources this from the RAW certs record via `getProfileWithCid(did)`
   *  so it carries the existing avatar/banner blob refs — the preserve
   *  branches in `handleSave` copy them onto `next` when there's no fresh
   *  upload. The avatar-LESS useUserProfile snapshot must NOT be passed
   *  here for editable views or a text-only save drops the blobs. */
  profile: CertifiedProfile | null
  /** CID of the raw profile record at mount, from `getProfileWithCid`.
   *  Captured as a swap precondition at `handleEditClick` and threaded
   *  into the putProfile write so a concurrent edit (other tab/device)
   *  surfaces as an InvalidSwap error instead of silently clobbering.
   *  `null`/`undefined` when there's no existing record (brand-new user)
   *  or the CID couldn't be read — the write then proceeds unconditioned. */
  profileCid?: string | null
  /** Snapshot of the avatar URL from useUserProfile. */
  avatarUrl: string | null
  /** Snapshot of the banner URL from useUserProfile. */
  bannerUrl: string | null
  /** Snapshot of the org marker from useOrgMarker. */
  orgMarker: GroupMetadata | null | undefined
  /** Cache-invalidate callback from useOrgMarker. */
  refreshOrgMarker: () => void | Promise<void>
  /** Org-marker URL list from useOrgMarker. */
  orgUrls: OrgUrlItem[] | null | undefined
  /** Profile-record URLs derived by the caller. */
  additionalUrls: string[]
}

export interface UseProfileInlineEditOutput {
  // --- Edit state ---
  isEditing: boolean
  drafts: ProfileDrafts
  isSaving: boolean
  saveError: string | null
  hasInteracted: boolean
  /** True when the viewer has typed/picked something in edit mode.
   *  Drives the unsaved-changes guard the hook wires up. */
  isDirty: boolean
  /** True when the viewer has picked a new avatar / banner this edit
   *  session (regardless of whether the upload has resolved yet).
   *  Surfaced for UI hints like "Save before navigating away". */
  hasPendingAvatar: boolean
  hasPendingBanner: boolean

  // --- Effective values for rendering (preview > local mirror > snapshot) ---
  effectiveProfile: CertifiedProfile | null
  effectiveAvatarUrl: string | null
  effectiveBannerUrl: string | null
  effectiveOrgMarker: GroupMetadata | null | undefined
  effectiveOrgUrls: OrgUrlItem[]
  effectiveAdditionalUrls: string[]

  // --- Derived display values ---
  displayOrgTypeTags: string[]
  displayLocation: ParsedLocation
  displayFoundedDate: string | null
  displayLongDescription: unknown | null
  /** Synchronous location parse off the marker (mostly used by the
   *  save path to recover the existing strongRef rkey). */
  inlineLocation: ParsedLocation
  resolvedLocationRef: {
    uri: string
    name: string | null
    coords: { lat: number; lng: number } | null
  } | null

  // --- Handlers ---
  handleEditClick: () => void
  handleCancelEdit: () => void
  handleDraftChange: <K extends keyof ProfileDrafts>(
    key: K,
    value: ProfileDrafts[K],
  ) => void
  handleAvatarFile: (file: File) => Promise<void>
  handleBannerFile: (file: File) => Promise<void>
  handleRemoveBanner: () => void
  handleLongDescImageUpload: (file: File) => Promise<UploadedBlob>
  handleSave: () => Promise<void>
}

/**
 * Owns the inline-edit state machine for the profile page: drafts,
 * pending uploads, post-save local mirrors, unsaved-changes guard,
 * and the two-write save path (profile record + org marker +
 * location strongRef). Extracted from the page so the orchestration
 * + tab body rendering reads cleanly without the ~600 lines of
 * inline-edit plumbing intermixed.
 *
 * The hook does NOT own the navbar publish-flags (about-available /
 * groups-available) — those depend on hook outputs plus other
 * page-level facts, so the page composes them.
 *
 * The hook also installs a document-level unsaved-changes guard
 * while `isDirty` is true. Save / Cancel inside the edit banner are
 * exempted by the guard's anchor-closest-class checks.
 */
export function useProfileInlineEdit(
  input: UseProfileInlineEditInput,
): UseProfileInlineEditOutput {
  const {
    did,
    sessionDid,
    isAuthenticated,
    canEditInline,
    editTargetDid,
    sidebarIsOrg,
    profile,
    profileCid,
    avatarUrl,
    bannerUrl,
    orgMarker,
    refreshOrgMarker,
    orgUrls,
    additionalUrls,
  } = input

  // -------------------------------------------------------------------
  // Inline edit state
  // -------------------------------------------------------------------
  const [isEditing, setIsEditing] = useState(false)
  const [drafts, setDrafts] = useState<ProfileDrafts>({
    displayName: "",
    description: "",
    website: "",
    locationName: "",
    locationLat: null,
    locationLng: null,
    foundedDate: "",
    organizationTypes: [],
    organizationTypeOther: "",
    longDescription: null,
    additionalUrls: [],
  })
  // Local mirrors so the sidebar/overview show fresh values immediately
  // after save (without round-tripping through useUserProfile, which
  // doesn't expose a mutate(). The hook re-fetches on its own props
  // changing, so on a hard nav back to the page the canonical value
  // wins again.)
  const [localProfile, setLocalProfile] = useState<CertifiedProfile | null>(
    null,
  )
  const [localOrgMarker, setLocalOrgMarker] = useState<GroupMetadata | null>(
    null,
  )
  const [localAvatarUrl, setLocalAvatarUrl] = useState<string | null>(null)
  const [localBannerUrl, setLocalBannerUrl] = useState<string | null>(null)
  // Mirror the blob: object-URLs promoted into localAvatarUrl/localBannerUrl
  // on save so the revoke-on-refetch effects (and unmount cleanup) below can
  // free them without re-subscribing to the state setters. Without this the
  // promoted blob URL leaks for the page lifetime: localAvatarUrl wins in
  // `effectiveAvatarUrl` and is never cleared once the canonical prop catches
  // up. (quality-036)
  const localAvatarUrlRef = useRef<string | null>(null)
  const localBannerUrlRef = useRef<string | null>(null)
  const [pendingAvatarBlob, setPendingAvatarBlob] =
    useState<UploadedBlob | null>(null)
  const [pendingBannerBlob, setPendingBannerBlob] =
    useState<UploadedBlob | null>(null)
  // In-flight upload promises. The preview object-URL is set synchronously
  // on file-pick, but the resolved blob lands only after the network
  // upload completes. `handleSave` awaits these so a Save fired mid-upload
  // writes the freshly-uploaded blob instead of silently falling back to
  // the stale `base.avatar` / `base.banner`. Cleared on resolve, on
  // edit-click, and on cancel.
  const avatarUploadRef = useRef<Promise<UploadedBlob> | null>(null)
  const bannerUploadRef = useRef<Promise<UploadedBlob> | null>(null)
  // rkey minted for a first-time location record within this edit
  // session. The save path mints a location record via createRecord
  // (no rkey) only when the marker has no existing strongRef. If a
  // later write in the same save (putOrgMarker) throws, that fresh
  // record is orphaned and — without this — would be re-minted on every
  // retry. Capturing the minted rkey lets a retry overwrite the same
  // record (putRecord) instead of spawning another orphan. Cleared on
  // edit-click / cancel / successful save so a new session starts fresh.
  const mintedLocationRkeyRef = useRef<string | null>(null)
  // CID of the profile record captured when the edit session opened
  // (handleEditClick). Threaded as `swapRecord` into the putProfile
  // write so the PDS rejects the write with InvalidSwap if the record
  // moved underneath us (another tab/device) since edit-start. Null
  // when there's no existing record (brand-new user) — the write then
  // proceeds unconditioned, which is correct. Reset on cancel /
  // successful save so a fresh session re-snapshots. (judgment-006 / #71)
  const profileSwapCidRef = useRef<string | null>(null)
  // Local object-URL previews. Created the moment the user picks a
  // file (before the network upload completes) so the edit view shows
  // the new image immediately. On Save these get promoted to
  // `localAvatarUrl` / `localBannerUrl` so the read-only render also
  // shows the new image without waiting for the resolve-did refetch.
  // On Cancel they're revoked and discarded.
  const [pendingAvatarPreviewUrl, setPendingAvatarPreviewUrl] =
    useState<string | null>(null)
  const [pendingBannerPreviewUrl, setPendingBannerPreviewUrl] =
    useState<string | null>(null)
  // Explicit "remove banner" intent within the current edit session.
  // When true, save persists `next.banner = undefined` instead of
  // copying the previous value off the base record. Reset on
  // edit-click / cancel / save.
  const [pendingBannerRemoved, setPendingBannerRemoved] = useState(false)
  // Post-save mirror for the same intent: distinguishes "no banner
  // was ever set" (fall back to hook `bannerUrl`) from "we just saved
  // a removal" (force null until the next refetch).
  const [bannerCleared, setBannerCleared] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [hasInteracted, setHasInteracted] = useState(false)

  // Set localAvatarUrl/localBannerUrl while keeping the revoke-tracking ref
  // in sync. When replacing a previously-promoted object-URL with a new value
  // (or null), revoke the old one so it doesn't leak. The promoted preview is
  // a blob: URL we own, so revoking on replacement is always safe. (quality-036)
  const setLocalAvatarUrlTracked = useCallback((url: string | null) => {
    const prev = localAvatarUrlRef.current
    if (prev && prev !== url) URL.revokeObjectURL(prev)
    localAvatarUrlRef.current = url
    setLocalAvatarUrl(url)
  }, [])
  const setLocalBannerUrlTracked = useCallback((url: string | null) => {
    const prev = localBannerUrlRef.current
    if (prev && prev !== url) URL.revokeObjectURL(prev)
    localBannerUrlRef.current = url
    setLocalBannerUrl(url)
  }, [])

  // Once the canonical avatar/banner prop catches up (the post-save
  // resolve-did refetch returned the CDN URL), the local object-URL mirror is
  // stale: it still wins in `effectiveAvatarUrl`/`effectiveBannerUrl` and the
  // promoted blob: URL would otherwise leak for the page lifetime. Clear the
  // mirror (revoking the held blob URL) when the prop changes. (quality-036)
  useEffect(() => {
    if (localAvatarUrlRef.current) setLocalAvatarUrlTracked(null)
  }, [avatarUrl, setLocalAvatarUrlTracked])
  useEffect(() => {
    if (localBannerUrlRef.current) setLocalBannerUrlTracked(null)
  }, [bannerUrl, setLocalBannerUrlTracked])

  // Revoke any still-held promoted blob URL on unmount so it doesn't leak
  // when the page tears down before the canonical prop catches up. (quality-036)
  useEffect(() => {
    return () => {
      if (localAvatarUrlRef.current) {
        URL.revokeObjectURL(localAvatarUrlRef.current)
        localAvatarUrlRef.current = null
      }
      if (localBannerUrlRef.current) {
        URL.revokeObjectURL(localBannerUrlRef.current)
        localBannerUrlRef.current = null
      }
    }
  }, [])

  // -------------------------------------------------------------------
  // Effective values
  // -------------------------------------------------------------------
  const effectiveProfile = localProfile ?? profile
  const effectiveAvatarUrl =
    pendingAvatarPreviewUrl ?? localAvatarUrl ?? avatarUrl
  const effectiveBannerUrl =
    pendingBannerPreviewUrl !== null
      ? pendingBannerPreviewUrl
      : pendingBannerRemoved || bannerCleared
        ? null
        : (localBannerUrl ?? bannerUrl)
  const effectiveOrgMarker = localOrgMarker ?? orgMarker

  const displayOrgTypeTags = readableOrgTypeTags(
    effectiveOrgMarker?.organizationType,
  )
  const inlineLocation = parseLocation(effectiveOrgMarker?.location)

  // -------------------------------------------------------------------
  // Async strongRef resolve for the location field
  // -------------------------------------------------------------------
  const [resolvedLocationRef, setResolvedLocationRef] = useState<{
    uri: string
    name: string | null
    coords: { lat: number; lng: number } | null
  } | null>(null)
  useEffect(() => {
    const uri = inlineLocation.refUri
    if (!uri) {
      setResolvedLocationRef(null)
      return
    }
    let cancelled = false
    readLocationStrongRef({ uri, cid: "" }).then((res) => {
      if (cancelled) return
      if (!res) {
        setResolvedLocationRef({ uri, name: null, coords: null })
        return
      }
      setResolvedLocationRef({ uri, name: res.name, coords: res.coords })
    })
    return () => {
      cancelled = true
    }
  }, [inlineLocation.refUri])

  const displayLocation: ParsedLocation = inlineLocation.refUri
    ? {
        name: resolvedLocationRef?.name ?? null,
        coords: resolvedLocationRef?.coords ?? null,
        refUri: inlineLocation.refUri,
      }
    : inlineLocation
  const displayFoundedDate = readableFoundedDate(
    effectiveOrgMarker?.foundedDate,
  )
  const displayLongDescription = isEmptyLongDescription(
    effectiveOrgMarker?.longDescription,
  )
    ? null
    : (effectiveOrgMarker?.longDescription ?? null)

  // Memoised so the array reference is stable when no inputs changed —
  // otherwise the `handleEditClick` useCallback below would invalidate
  // on every render (each `??` falls back to a freshly-allocated `[]`).
  const effectiveOrgUrls: OrgUrlItem[] = useMemo(
    () => localOrgMarker?.urls ?? orgUrls ?? [],
    [localOrgMarker, orgUrls],
  )
  const effectiveAdditionalUrls = localOrgMarker
    ? effectiveOrgUrls.map((u) => u.url)
    : additionalUrls

  // -------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------
  const handleEditClick = useCallback(() => {
    if (!effectiveProfile) return
    const parsedLoc = parseLocation(effectiveOrgMarker?.location)
    const seedName =
      parsedLoc.refUri && resolvedLocationRef?.name
        ? resolvedLocationRef.name
        : parsedLoc.name
    const seedCoords =
      parsedLoc.refUri && resolvedLocationRef?.coords
        ? resolvedLocationRef.coords
        : parsedLoc.coords
    const parsedTypes = parseOrgTypes(effectiveOrgMarker?.organizationType)
    setDrafts({
      displayName: effectiveProfile.displayName ?? "",
      description: effectiveProfile.description ?? "",
      website: effectiveProfile.website ?? "",
      locationName: seedName ?? "",
      locationLat: seedCoords?.lat ?? null,
      locationLng: seedCoords?.lng ?? null,
      foundedDate: toDateInputValue(effectiveOrgMarker?.foundedDate),
      organizationTypes: parsedTypes.presets,
      organizationTypeOther: parsedTypes.other,
      longDescription:
        asLinearDocument(effectiveOrgMarker?.longDescription) ??
        (typeof effectiveOrgMarker?.longDescription === "string"
          ? {
              $type: "pub.leaflet.pages.linearDocument",
              blocks: [
                {
                  block: {
                    $type: "pub.leaflet.blocks.text",
                    plaintext: effectiveOrgMarker.longDescription,
                  },
                },
              ],
            }
          : null),
      additionalUrls:
        effectiveOrgUrls.length > 0
          ? effectiveOrgUrls.map((u) =>
              newDraftUrlRow({ url: u.url, label: u.label }),
            )
          : [],
    })
    setPendingAvatarBlob(null)
    setPendingBannerBlob(null)
    avatarUploadRef.current = null
    bannerUploadRef.current = null
    mintedLocationRkeyRef.current = null
    // Snapshot the record CID at edit-start as the swap precondition.
    profileSwapCidRef.current = profileCid ?? null
    setPendingBannerRemoved(false)
    setSaveError(null)
    setHasInteracted(false)
    setIsEditing(true)
  }, [
    effectiveProfile,
    effectiveOrgMarker,
    effectiveOrgUrls,
    resolvedLocationRef,
    profileCid,
  ])

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false)
    setPendingAvatarBlob(null)
    setPendingBannerBlob(null)
    avatarUploadRef.current = null
    bannerUploadRef.current = null
    mintedLocationRkeyRef.current = null
    profileSwapCidRef.current = null
    if (pendingAvatarPreviewUrl) URL.revokeObjectURL(pendingAvatarPreviewUrl)
    if (pendingBannerPreviewUrl) URL.revokeObjectURL(pendingBannerPreviewUrl)
    setPendingAvatarPreviewUrl(null)
    setPendingBannerPreviewUrl(null)
    setPendingBannerRemoved(false)
    setSaveError(null)
    setHasInteracted(false)
  }, [pendingAvatarPreviewUrl, pendingBannerPreviewUrl])

  const handleDraftChange = useCallback(
    <K extends keyof ProfileDrafts>(key: K, value: ProfileDrafts[K]) => {
      setDrafts((prev) => ({ ...prev, [key]: value }))
      setHasInteracted(true)
    },
    [],
  )

  const handleAvatarFile = useCallback(
    async (file: File) => {
      const previewUrl = URL.createObjectURL(file)
      setPendingAvatarPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return previewUrl
      })
      setHasInteracted(true)
      const uploadPromise = uploadAvatar(
        file,
        editTargetDid ? { targetDid: editTargetDid } : undefined,
      )
      avatarUploadRef.current = uploadPromise
      const blob = await uploadPromise
      // Only clear the ref if this is still the latest upload — a newer
      // file-pick may have replaced it while this one was in flight.
      if (avatarUploadRef.current === uploadPromise) {
        avatarUploadRef.current = null
      }
      setPendingAvatarBlob(blob)
    },
    [editTargetDid],
  )

  const handleBannerFile = useCallback(
    async (file: File) => {
      const previewUrl = URL.createObjectURL(file)
      setPendingBannerPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return previewUrl
      })
      setPendingBannerRemoved(false)
      setHasInteracted(true)
      const uploadPromise = uploadBanner(
        file,
        editTargetDid ? { targetDid: editTargetDid } : undefined,
      )
      bannerUploadRef.current = uploadPromise
      const blob = await uploadPromise
      if (bannerUploadRef.current === uploadPromise) {
        bannerUploadRef.current = null
      }
      setPendingBannerBlob(blob)
    },
    [editTargetDid],
  )

  const handleLongDescImageUpload = useCallback(
    async (file: File) => {
      return await uploadBlob(
        file,
        editTargetDid ? { targetDid: editTargetDid } : undefined,
      )
    },
    [editTargetDid],
  )

  const handleRemoveBanner = useCallback(() => {
    setPendingBannerPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setPendingBannerBlob(null)
    bannerUploadRef.current = null
    setPendingBannerRemoved(true)
    setHasInteracted(true)
  }, [])

  const handleSave = useCallback(async () => {
    if (!did || !isAuthenticated || !sessionDid) {
      setSaveError("Not authenticated")
      return
    }
    const base = effectiveProfile ?? null

    // Await any in-flight avatar/banner upload before composing the
    // record. The object-URL preview is set synchronously on file-pick
    // but the resolved blob lands only after the network upload finishes;
    // without this await a Save fired mid-upload would read the still-null
    // `pendingAvatarBlob` and silently re-persist the stale `base.avatar`
    // while the UI shows the new preview as saved. Prefer the freshly
    // resolved blob over the closed-over state (which may be stale within
    // this handler's render snapshot).
    let resolvedAvatarBlob: UploadedBlob | null = pendingAvatarBlob
    let resolvedBannerBlob: UploadedBlob | null = pendingBannerBlob
    try {
      setIsSaving(true)
      setSaveError(null)
      if (avatarUploadRef.current) {
        resolvedAvatarBlob = await avatarUploadRef.current
      }
      if (bannerUploadRef.current) {
        resolvedBannerBlob = await bannerUploadRef.current
      }
    } catch (err) {
      console.error("Failed to upload image:", err)
      setSaveError(
        err instanceof Error ? err.message : "Failed to upload image",
      )
      setIsSaving(false)
      return
    }

    const next: CertifiedProfile = {
      createdAt: base?.createdAt || new Date().toISOString(),
      ...(drafts.displayName.trim() && {
        displayName: drafts.displayName.trim(),
      }),
      ...(base?.pronouns && { pronouns: base.pronouns }),
      ...(drafts.description.trim() && {
        description: drafts.description.trim(),
      }),
      ...(drafts.website.trim() && { website: drafts.website.trim() }),
    }

    if (resolvedAvatarBlob) {
      const avatarImage: HypercertsSmallImage = {
        $type: "org.hypercerts.defs#smallImage",
        image: resolvedAvatarBlob as unknown as BlobRef,
      }
      next.avatar = avatarImage
    } else if (base?.avatar) {
      next.avatar = base.avatar
    }

    if (resolvedBannerBlob) {
      const bannerImage: HypercertsLargeImage = {
        $type: "org.hypercerts.defs#largeImage",
        image: resolvedBannerBlob as unknown as BlobRef,
      }
      next.banner = bannerImage
    } else if (pendingBannerRemoved) {
      // Explicit removal — don't carry over `base.banner`.
    } else if (base?.banner) {
      next.banner = base.banner
    }

    try {
      // `isSaving` / `saveError` were already set before awaiting the
      // in-flight uploads above; the record-write phase continues under
      // the same flags.
      // Thread the mount-time profile CID as `swapRecord` so the PDS
      // rejects the write with InvalidSwap when the record moved
      // underneath us since edit-start (another tab / device). The
      // generic catch below surfaces that as `saveError`. When there's
      // no snapshot CID (brand-new user / unreadable CID) the write
      // proceeds unconditioned. The org-marker + location writes below
      // are still unconditioned — only the profile record (the avatar/
      // banner carrier, i.e. the data-loss surface) is guarded here.
      // (judgment-006 / #71)
      const profileSwapCid = profileSwapCidRef.current
      await putProfile(sessionDid, next, {
        ...(editTargetDid ? { targetDid: editTargetDid } : {}),
        ...(profileSwapCid ? { swapRecord: profileSwapCid } : {}),
      })

      let nextMarker: GroupMetadata | null = null
      if (sidebarIsOrg) {
        const markerBase =
          effectiveOrgMarker ?? { createdAt: new Date().toISOString() }
        const urls = drafts.additionalUrls
          .map<OrgUrlItem | null>((row) => {
            const url = row.url.trim()
            if (url === "") return null
            const label = row.label.trim()
            return label ? { url, label } : { url }
          })
          .filter((u): u is OrgUrlItem => u !== null)

        const otherTokens = drafts.organizationTypeOther
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
        const orgTypeArray = Array.from(
          new Set<string>([...drafts.organizationTypes, ...otherTokens]),
        )

        let locationValue: GroupMetadata["location"] | undefined
        const trimmedName = drafts.locationName.trim()
        const hasCoords =
          drafts.locationLat !== null && drafts.locationLng !== null
        if (hasCoords) {
          // Prefer the marker's persisted strongRef rkey. If there's
          // none yet (first-time add), fall back to any rkey minted on
          // a prior attempt in this edit session so a retry overwrites
          // that record instead of orphaning a fresh one (risk-003).
          const existingRkey = inlineLocation.refUri
            ? (rkeyFromStrongRefUri(inlineLocation.refUri) ?? undefined)
            : (mintedLocationRkeyRef.current ?? undefined)
          const ref: StrongRef = await putLocationRecord(
            sessionDid,
            editTargetDid ?? sessionDid,
            {
              lat: drafts.locationLat as number,
              lng: drafts.locationLng as number,
            },
            trimmedName || null,
            { rkey: existingRkey },
          )
          // Remember the rkey we just wrote so a retry after a later
          // failure in this same save (e.g. putOrgMarker) reuses it.
          mintedLocationRkeyRef.current =
            rkeyFromStrongRefUri(ref.uri) ?? mintedLocationRkeyRef.current
          locationValue = ref
        } else if (trimmedName) {
          locationValue = trimmedName
        } else {
          locationValue = undefined
        }

        nextMarker = {
          ...markerBase,
          organizationType:
            orgTypeArray.length > 0 ? orgTypeArray : undefined,
          location: locationValue,
          foundedDate: fromDateInputValue(drafts.foundedDate),
          longDescription: isEmptyLongDescription(drafts.longDescription)
            ? undefined
            : (drafts.longDescription ?? undefined),
          urls: urls.length > 0 ? urls : undefined,
        }

        await putOrgMarker(sessionDid, editTargetDid ?? sessionDid, nextMarker)
      }

      // Defensive: evict any cached resolve-did response so navigation
      // back through the app sees the new record. Best-effort.
      fetch(`/api/resolve-did?did=${encodeURIComponent(did)}`, {
        cache: "reload",
        credentials: "include",
      }).catch(() => undefined)

      setLocalProfile(next)
      if (nextMarker) {
        setLocalOrgMarker(nextMarker)
        refreshOrgMarker()
      }
      if (pendingAvatarPreviewUrl) {
        setLocalAvatarUrlTracked(pendingAvatarPreviewUrl)
      } else if (pendingAvatarBlob) {
        setLocalAvatarUrlTracked(null)
      }
      if (pendingBannerPreviewUrl) {
        setLocalBannerUrlTracked(pendingBannerPreviewUrl)
        setBannerCleared(false)
      } else if (pendingBannerRemoved) {
        setLocalBannerUrlTracked(null)
        setBannerCleared(true)
      } else if (pendingBannerBlob) {
        setLocalBannerUrlTracked(null)
        setBannerCleared(false)
      }

      setPendingAvatarPreviewUrl(null)
      setPendingBannerPreviewUrl(null)
      setPendingAvatarBlob(null)
      setPendingBannerBlob(null)
      avatarUploadRef.current = null
      bannerUploadRef.current = null
      mintedLocationRkeyRef.current = null
      profileSwapCidRef.current = null
      setPendingBannerRemoved(false)
      setHasInteracted(false)
      setIsEditing(false)
    } catch (err) {
      console.error("Failed to save profile:", err)
      setSaveError(
        err instanceof Error ? err.message : "Failed to save profile",
      )
    } finally {
      setIsSaving(false)
    }
  }, [
    did,
    sessionDid,
    isAuthenticated,
    effectiveProfile,
    drafts,
    pendingAvatarBlob,
    pendingBannerBlob,
    pendingAvatarPreviewUrl,
    pendingBannerPreviewUrl,
    pendingBannerRemoved,
    editTargetDid,
    sidebarIsOrg,
    effectiveOrgMarker,
    refreshOrgMarker,
    inlineLocation.refUri,
    setLocalAvatarUrlTracked,
    setLocalBannerUrlTracked,
  ])

  // -------------------------------------------------------------------
  // Unsaved-changes guard
  // -------------------------------------------------------------------
  // Warn before the viewer leaves the page mid-edit. Covers:
  //   1. Browser refresh / tab close — native `beforeunload`.
  //   2. In-app navigation (top-bar tabs, sidebar links, brand logo)
  //      — anchor-capture handler that pops `window.confirm()`.
  //      Save / Cancel inside the edit banner is exempted.
  // We don't guard the App Router navigation API directly because it
  // doesn't expose a stable guard hook; anchor capture covers every
  // realistic in-app navigation path.
  const isDirty = isEditing && hasInteracted && canEditInline
  useEffect(() => {
    if (!isDirty) return

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ""
    }

    const onClickCapture = (e: MouseEvent) => {
      if (
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey ||
        e.defaultPrevented
      ) {
        return
      }
      const target =
        e.target instanceof Element
          ? (e.target.closest("a[href]") as HTMLAnchorElement | null)
          : null
      if (!target) return
      if (target.closest(".edit-banner")) return
      if (target.closest(".profile-sidebar__avatar-edit-btn")) return
      if (target.closest(".profile-banner-upload__btn")) return
      if (target.target && target.target !== "_self") return

      const proceed = window.confirm(
        "You have unsaved changes. Leave and discard them?",
      )
      if (!proceed) {
        e.preventDefault()
        e.stopImmediatePropagation()
      }
    }

    window.addEventListener("beforeunload", onBeforeUnload)
    document.addEventListener("click", onClickCapture, true)
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload)
      document.removeEventListener("click", onClickCapture, true)
    }
  }, [isDirty])

  return {
    isEditing,
    drafts,
    isSaving,
    saveError,
    hasInteracted,
    isDirty,
    hasPendingAvatar: pendingAvatarBlob !== null,
    hasPendingBanner: pendingBannerBlob !== null,
    effectiveProfile,
    effectiveAvatarUrl,
    effectiveBannerUrl,
    effectiveOrgMarker,
    effectiveOrgUrls,
    effectiveAdditionalUrls,
    displayOrgTypeTags,
    displayLocation,
    displayFoundedDate,
    displayLongDescription,
    inlineLocation,
    resolvedLocationRef,
    handleEditClick,
    handleCancelEdit,
    handleDraftChange,
    handleAvatarFile,
    handleBannerFile,
    handleRemoveBanner,
    handleLongDescImageUpload,
    handleSave,
  }
}
