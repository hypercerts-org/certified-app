"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { usePathname, useParams, useSearchParams } from "next/navigation"
import {
  useProfileNavbar,
  usePageTitle,
  usePageTitleBreadcrumb,
  useProfileAboutAvailable,
  useProfileGroupsAvailable,
} from "@/lib/navbar-context"
import { useUserGroups } from "@/hooks/use-user-groups"
import { useUserProfile } from "@/hooks/use-user-profile"
import { useUserActivities } from "@/hooks/use-user-activities"
import { useOrgMarker } from "@/hooks/use-org-marker"
import { useOrg } from "@/lib/groups/org-context"
import { useAuth } from "@/lib/auth/auth-context"
import {
  putProfile,
  uploadAvatar,
  uploadBanner,
  uploadBlob,
  type UploadedBlob,
} from "@/lib/atproto/profile"
import { putOrgMarker } from "@/lib/groups/org-marker"
import type {
  CertifiedProfile,
  HypercertsSmallImage,
  HypercertsLargeImage,
} from "@/lib/atproto/types"
import type { BlobRef } from "@atproto/api"
import type { GroupMetadata, OrgUrlItem } from "@/lib/groups/types"
import ProfileHeader from "@/components/profile/profile-header"
import ProfileSidebar from "@/components/profile/profile-sidebar"
import ProfileOverview from "@/components/profile/profile-overview"
import ProfileEndorsements from "@/components/profile/profile-endorsements"
import ProfileProjects from "@/components/profile/profile-projects"
import ProfileCerts from "@/components/profile/profile-certs"
import ProfileGroups from "@/components/profile/profile-groups"
import SettingsPanel from "@/components/settings/settings-panel"
import LeafletDocument from "@/components/leaflet/leaflet-document"
import LeafletEditor from "@/components/leaflet/leaflet-editor"
import type { LinearDocument } from "@/lib/leaflet/types"
import LoadingSpinner from "@/components/ui/loading-spinner"
import EmptyState from "@/components/ui/empty-state"
import { UserX } from "lucide-react"
import {
  newDraftUrlRow,
  type ProfileDrafts,
} from "@/components/profile/profile-inline-edit-types"
import { ORG_TYPE_PRESETS } from "@/lib/groups/org-types"
import { asLinearDocument, isEmptyLongDescription } from "@/lib/leaflet/guards"

type TabKey =
  | "overview"
  | "about"
  | "certs"
  | "projects"
  | "groups"
  | "endorsements"
  | "settings"

// Tab strip order — keep in sync with PROFILE_TABS in
// desktop-top-bar.tsx, which is the single source the user clicks on
// desktop. About sits right after Overview and only renders when the
// viewed profile carries a non-empty `longDescription`; Settings is
// own-profile only.
const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "certs", label: "Certs" },
  { key: "projects", label: "Projects" },
  { key: "groups", label: "Groups" },
  { key: "endorsements", label: "Endorsements" },
  { key: "about", label: "About" },
  { key: "settings", label: "Settings" },
]

// `ProfileDrafts` lives in `profile-inline-edit-types` so the sidebar and
// overview can import it without creating a cycle with this page module.

// --- Read helpers for org-marker fields with looser legacy shapes -----

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
function readableOrgTypeTags(v: unknown): string[] {
  const { presets, other } = parseOrgTypes(v)
  const otherTags = other ? other.split(",").map((s) => s.trim()).filter(Boolean) : []
  // Re-order presets to match the canonical preset order.
  const orderedPresets = ORG_TYPE_PRESETS.filter((p) => presets.includes(p))
  return [...orderedPresets, ...otherTags]
}

export interface ParsedLocation {
  name: string | null
  coords: { lat: number; lng: number } | null
}

/**
 * Coerce the record's `location` (any of the three accepted shapes — see
 * `GroupMetadata.location`) into the editor / display shape.
 */
function parseLocation(v: unknown): ParsedLocation {
  if (typeof v === "string" && v.trim().length > 0) {
    return { name: v.trim(), coords: null }
  }
  if (v && typeof v === "object") {
    const obj = v as Record<string, unknown>
    if (typeof obj.lat === "number" && typeof obj.lng === "number") {
      const name = typeof obj.name === "string" && obj.name.trim().length > 0
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
 * Format `foundedDate` for display. Accepts the full ISO datetime the
 * record stores, a plain `yyyy-mm-dd` string, or just a 4-digit year.
 * Returns `null` for missing / unparseable values.
 */
function readableFoundedDate(v: unknown): string | null {
  if (typeof v !== "string" || v.trim().length === 0) return null
  const s = v.trim()
  // Year-only form: render as-is.
  if (/^\d{4}$/.test(s)) return s
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  // Render as "Mon yyyy" for ISO datetimes / yyyy-mm-dd values to
  // avoid showing a noisy day-precision date when we only need year/month.
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" })
}

/** Build the form a `<input type="date">` expects from a stored value. */
function toDateInputValue(v: unknown): string {
  if (typeof v !== "string") return ""
  const s = v.trim()
  if (s === "") return ""
  // Year-only: pad to Jan 1 so the date input has something to display.
  if (/^\d{4}$/.test(s)) return `${s}-01-01`
  // yyyy-mm-dd or ISO datetime — strip to the date portion.
  return s.slice(0, 10)
}

/** Normalise a `<input type="date">` value (yyyy-mm-dd) to an ISO
 *  datetime at UTC midnight so the record stores a stable value. Empty
 *  input yields `undefined` (the field is cleared). */
function fromDateInputValue(s: string): string | undefined {
  const v = s.trim()
  if (v === "") return undefined
  // The input element guarantees the yyyy-mm-dd shape on supporting
  // browsers; fall back to a Date() round-trip otherwise.
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString()
}

export default function UserProfilePage() {
  useProfileNavbar()

  const params = useParams()
  const rawHandle = params.handle as string | undefined
  const handleOrDid = useMemo(
    () => (rawHandle ? decodeURIComponent(rawHandle) : null),
    [rawHandle]
  )

  const {
    profile,
    avatarUrl,
    bannerUrl,
    did,
    handle: resolvedHandle,
    isOwnProfile,
    isLoading: isProfileLoading,
    error: profileError,
  } = useUserProfile(handleOrDid)

  const { isAuthenticated, did: sessionDid } = useAuth()

  const titleForTopBar =
    profile?.displayName || resolvedHandle || "Profile"
  usePageTitle(titleForTopBar)
  // Single-part breadcrumb: the handle (without the `@` sigil) is the
  // only segment, but it's clickable. Matches the cert-page pattern
  // (which uses two parts).
  usePageTitleBreadcrumb(
    resolvedHandle
      ? {
          left: {
            text: resolvedHandle,
            href: `/profile/${encodeURIComponent(resolvedHandle)}`,
          },
        }
      : null,
  )

  // Detect the org marker on the viewed DID so the sidebar can switch into
  // org-mode (extra URL list). While loading we pass isOrg=false to keep
  // the sidebar in non-org mode; the hook caches per-DID so subsequent
  // visits hydrate synchronously.
  const {
    isOrg,
    additionalUrls,
    urls: orgUrls,
    marker: orgMarker,
    isLoading: isOrgMarkerLoading,
    refresh: refreshOrgMarker,
  } = useOrgMarker(did)
  const sidebarIsOrg = isOrgMarkerLoading ? false : isOrg

  const { activeOrg, groups, isLoading: orgGroupsLoading } = useOrg()
  const memberOrg = did ? groups.find((g) => g.groupDid === did) : undefined
  const isAdminOfThisGroup =
    !!memberOrg && (memberOrg.role === "owner" || memberOrg.role === "admin")

  // Inline-edit is gated on the *active session identity* exactly
  // matching the viewed profile — being an admin of a group is not
  // enough; the user must be currently acting as that group (or as
  // themselves on their own profile). This means:
  //   - Own profile: only when no org is currently active.
  //   - Group profile: only when activeOrg.groupDid === viewed DID.
  // Group admins who want to edit a group switch into it from the
  // account switcher.
  const isActingAsThisGroup =
    !!activeOrg && !!did && activeOrg.groupDid === did
  const canEditInline =
    (isOwnProfile && !activeOrg) || isActingAsThisGroup
  // The save/upload `targetDid` for inline edit. `undefined` keeps the
  // helpers on the personal session-DID path; setting it routes through
  // the group BFF endpoints instead.
  const editTargetDid = isActingAsThisGroup ? did : undefined

  // -------------------------------------------------------------------
  // Inline edit state
  // -------------------------------------------------------------------
  // We keep edit state local to the page so the sidebar and overview
  // can both swap into input mode in lockstep. Drafts are seeded from
  // `profile` when the user enters edit mode; on save we PUT the
  // profile record, update local profile/URL state, and exit edit mode.
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
  // Local mirror of the org marker so post-save renders show the new
  // values immediately. Cleared on cancel / next edit-click.
  const [localOrgMarker, setLocalOrgMarker] = useState<GroupMetadata | null>(
    null,
  )
  const [localAvatarUrl, setLocalAvatarUrl] = useState<string | null>(null)
  const [localBannerUrl, setLocalBannerUrl] = useState<string | null>(null)
  const [pendingAvatarBlob, setPendingAvatarBlob] =
    useState<UploadedBlob | null>(null)
  const [pendingBannerBlob, setPendingBannerBlob] =
    useState<UploadedBlob | null>(null)
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
  // Tracks whether the viewer has touched anything in edit mode (typed
  // into an input, picked a new avatar / banner, edited an URL row,
  // etc.). Drives the unsaved-changes guard below — without it we'd
  // warn even when the user opened edit mode and immediately tried to
  // navigate away.
  const [hasInteracted, setHasInteracted] = useState(false)

  // Effective values used everywhere the UI renders read-only content:
  // preview (in-flight upload) wins, then post-save mirror, then the
  // hook-supplied snapshot.
  const effectiveProfile = localProfile ?? profile
  const effectiveAvatarUrl =
    pendingAvatarPreviewUrl ?? localAvatarUrl ?? avatarUrl
  // Banner resolution honours the explicit-remove intent — both in
  // flight (pendingBannerRemoved) and post-save (bannerCleared) — by
  // collapsing to `null` so the banner box renders empty.
  const effectiveBannerUrl =
    pendingBannerPreviewUrl !== null
      ? pendingBannerPreviewUrl
      : pendingBannerRemoved || bannerCleared
        ? null
        : (localBannerUrl ?? bannerUrl)
  const effectiveOrgMarker = localOrgMarker ?? orgMarker
  // Read-only displayable forms of the org-only marker fields. Each
  // returns `null` when the field is absent so the sidebar / overview
  // can skip rendering the row entirely (no "Not specified" placeholders).
  const displayOrgTypeTags = readableOrgTypeTags(effectiveOrgMarker?.organizationType)
  const displayLocation = parseLocation(effectiveOrgMarker?.location)
  const displayFoundedDate = readableFoundedDate(effectiveOrgMarker?.foundedDate)
  // `longDescription` can be a string, an inline leaflet linearDocument,
  // or a strong-ref to a separate record. The renderer (LeafletDocument)
  // handles all three; we pass the raw value through. Empty values
  // collapse to `null` so the overview can skip the section entirely.
  const displayLongDescription = isEmptyLongDescription(
    effectiveOrgMarker?.longDescription,
  )
    ? null
    : (effectiveOrgMarker?.longDescription ?? null)
  // Publish "this profile has a long description" to the navbar
  // context so the top-bar can render the About tab. Three reasons
  // to show the tab:
  //   1. The profile actually carries a long description.
  //   2. The viewer is currently signed in as this entity (own
  //      personal profile, or acting-as this group) — they need the
  //      tab in order to write their first one, even when empty.
  //   3. Edit mode is open for an org admin — kept for parity with
  //      the active-edit flow.
  // Always reset when navigating away (the hook returns `false` on
  // unmount).
  const aboutEditingForOrg = isEditing && canEditInline && sidebarIsOrg
  const isViewerThisEntity = isOwnProfile || isActingAsThisGroup
  useProfileAboutAvailable(
    !!displayLongDescription || isViewerThisEntity || aboutEditingForOrg,
  )
  // Gate the Groups tab: visible whenever the viewer is currently
  // signed in as this entity (own profile, or acting-as this group),
  // OR when the profile carries at least one public membership.
  // Foreign empty profiles hide the tab entirely.
  const viewedPublicGroups = useUserGroups(did)
  const hasGroupTab =
    isViewerThisEntity || (viewedPublicGroups.groups?.length ?? 0) > 0
  useProfileGroupsAvailable(hasGroupTab)
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

  const handleEditClick = useCallback(() => {
    if (!effectiveProfile) return
    const parsedLoc = parseLocation(effectiveOrgMarker?.location)
    const parsedTypes = parseOrgTypes(effectiveOrgMarker?.organizationType)
    setDrafts({
      displayName: effectiveProfile.displayName ?? "",
      description: effectiveProfile.description ?? "",
      website: effectiveProfile.website ?? "",
      // Org-only seeds. When the marker is missing these are empty
      // strings / an empty array, which the editor renders as blank
      // inputs. The save handler skips writing the marker entirely
      // when `isOrg` is false (see handleSave below).
      locationName: parsedLoc.name ?? "",
      locationLat: parsedLoc.coords?.lat ?? null,
      locationLng: parsedLoc.coords?.lng ?? null,
      foundedDate: toDateInputValue(effectiveOrgMarker?.foundedDate),
      organizationTypes: parsedTypes.presets,
      organizationTypeOther: parsedTypes.other,
      // Seed the editor with the stored linearDocument when present;
      // legacy plain-string values are hydrated as a single paragraph
      // by `<LeafletEditor>`'s own coercion path so we pass them
      // through unchanged here.
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
          ? effectiveOrgUrls.map((u) => newDraftUrlRow({ url: u.url, label: u.label }))
          : [],
    })
    setPendingAvatarBlob(null)
    setPendingBannerBlob(null)
    setPendingBannerRemoved(false)
    setSaveError(null)
    setHasInteracted(false)
    setIsEditing(true)
  }, [effectiveProfile, effectiveOrgMarker, effectiveOrgUrls])

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false)
    setPendingAvatarBlob(null)
    setPendingBannerBlob(null)
    // Revoke in-flight object URLs to avoid leaking the bytes after
    // the user cancels (browsers GC them on unload, but earlier is
    // cheaper and matches the BannerUpload's old cleanup behaviour).
    if (pendingAvatarPreviewUrl) URL.revokeObjectURL(pendingAvatarPreviewUrl)
    if (pendingBannerPreviewUrl) URL.revokeObjectURL(pendingBannerPreviewUrl)
    setPendingAvatarPreviewUrl(null)
    setPendingBannerPreviewUrl(null)
    setPendingBannerRemoved(false)
    setSaveError(null)
    setHasInteracted(false)
    // Note: we keep `localOrgMarker` so any *previous* save still
    // reflects in the read-only render. Only the in-flight draft state
    // is discarded.
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
      // Build the object URL synchronously so the avatar shows the new
      // image the instant the user picks a file — the network upload
      // runs in the background. Revoke any prior in-flight preview to
      // avoid leaking memory across rapid re-selections.
      const previewUrl = URL.createObjectURL(file)
      setPendingAvatarPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return previewUrl
      })
      setHasInteracted(true)
      const blob = await uploadAvatar(
        file,
        editTargetDid ? { targetDid: editTargetDid } : undefined,
      )
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
      // Picking a new banner cancels any pending removal intent.
      setPendingBannerRemoved(false)
      setHasInteracted(true)
      const blob = await uploadBanner(
        file,
        editTargetDid ? { targetDid: editTargetDid } : undefined,
      )
      setPendingBannerBlob(blob)
    },
    [editTargetDid],
  )

  /** Image upload for the long-description rich-text editor. Routes
   *  through the same BFF/XRPC split that avatar + banner uploads
   *  use — `editTargetDid` is set when editing a group profile. */
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
    // Clear any in-flight preview / blob and mark the banner as
    // explicitly removed so the save step omits it from the record.
    setPendingBannerPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setPendingBannerBlob(null)
    setPendingBannerRemoved(true)
    setHasInteracted(true)
  }, [])

  const handleSave = useCallback(async () => {
    if (!did || !isAuthenticated || !sessionDid) {
      setSaveError("Not authenticated")
      return
    }
    const base = effectiveProfile ?? null
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

    if (pendingAvatarBlob) {
      const avatarImage: HypercertsSmallImage = {
        $type: "org.hypercerts.defs#smallImage",
        image: pendingAvatarBlob as unknown as BlobRef,
      }
      next.avatar = avatarImage
    } else if (base?.avatar) {
      next.avatar = base.avatar
    }

    if (pendingBannerBlob) {
      const bannerImage: HypercertsLargeImage = {
        $type: "org.hypercerts.defs#largeImage",
        image: pendingBannerBlob as unknown as BlobRef,
      }
      next.banner = bannerImage
    } else if (pendingBannerRemoved) {
      // Explicit removal — don't carry over `base.banner`. Leaving
      // `next.banner` undefined means JSON.stringify drops it and the
      // PDS overwrites the record without a banner.
    } else if (base?.banner) {
      next.banner = base.banner
    }

    try {
      setIsSaving(true)
      setSaveError(null)
      // First arg is the *session* DID (the actor doing the write).
      // When editing a group profile the viewed `did` is the group's
      // DID, not the session DID — passing `did` here would make the
      // XRPC proxy reject the write with "repo is required and must
      // match the authenticated user". The BFF route handles the
      // proxied write when the target differs from the session.
      await putProfile(
        sessionDid,
        next,
        editTargetDid ? { targetDid: editTargetDid } : undefined,
      )

      // Second write: org marker. Only attempted when we know this is an
      // org (marker already exists). We don't create a marker from
      // scratch here — that flow lives behind group registration / the
      // settings page. When `isOrg` is false, leave the marker alone.
      let nextMarker: GroupMetadata | null = null
      if (sidebarIsOrg) {
        const markerBase =
          effectiveOrgMarker ?? { createdAt: new Date().toISOString() }
        // Build the urls array from the editable rows. Empty rows
        // (no url) are dropped silently; labels are kept when present.
        const urls = drafts.additionalUrls
          .map<OrgUrlItem | null>((row) => {
            const url = row.url.trim()
            if (url === "") return null
            const label = row.label.trim()
            return label ? { url, label } : { url }
          })
          .filter((u): u is OrgUrlItem => u !== null)

        // Combine preset chips with the free-text "Other" entry into a
        // single array. The editor enforces uniqueness within each
        // bucket but not across, so we dedupe defensively here.
        const otherTokens = drafts.organizationTypeOther
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
        const orgTypeArray = Array.from(
          new Set<string>([...drafts.organizationTypes, ...otherTokens]),
        )

        // Pick the right serialised shape for `location`: object form
        // when a map pin is set (coords drive the right-column map),
        // plain string when only a free-text name was entered, and
        // `undefined` (= clear) when both are empty.
        let locationValue: GroupMetadata["location"] | undefined
        const trimmedName = drafts.locationName.trim()
        if (drafts.locationLat !== null && drafts.locationLng !== null) {
          locationValue = {
            lat: drafts.locationLat,
            lng: drafts.locationLng,
            ...(trimmedName ? { name: trimmedName } : {}),
          }
        } else if (trimmedName) {
          locationValue = trimmedName
        } else {
          locationValue = undefined
        }

        // Build the new marker. We use a fresh object so old, no-longer-
        // edited fields (e.g. fields the editor doesn't surface) are
        // preserved verbatim from the base.
        nextMarker = {
          ...markerBase,
          // Empty arrays/strings collapse to `undefined` so the BFF
          // allowlist (which only copies defined fields) clears them when
          // written. The XRPC path also drops `undefined` via JSON.stringify.
          organizationType: orgTypeArray.length > 0 ? orgTypeArray : undefined,
          location: locationValue,
          foundedDate: fromDateInputValue(drafts.foundedDate),
          longDescription: isEmptyLongDescription(drafts.longDescription)
            ? undefined
            : drafts.longDescription ?? undefined,
          urls: urls.length > 0 ? urls : undefined,
        }

        // Same session-vs-target pattern as the putProfile call above:
        // first arg is the session DID, second is the repo to write
        // to (group DID via BFF, or session DID via XRPC).
        await putOrgMarker(sessionDid, editTargetDid ?? sessionDid, nextMarker)
      }

      // Defensive: evict any cached resolve-did response so navigation
      // back through the app sees the new record. Best-effort.
      fetch(`/api/resolve-did?did=${encodeURIComponent(did)}`, {
        cache: "reload",
        credentials: "include",
      }).catch(() => undefined)

      // Mirror the saved profile locally so the read-only render
      // immediately reflects the change without a hard reload.
      setLocalProfile(next)
      // Mirror the marker locally + invalidate the module-level cache so
      // subsequent navigations re-fetch instead of showing stale data.
      if (nextMarker) {
        setLocalOrgMarker(nextMarker)
        refreshOrgMarker()
      }
      // Promote the in-flight object URLs to the read-only render
      // mirror so the new image stays visible after exiting edit mode.
      // Without this, the read-only branch falls back to the stale
      // `avatarUrl` / `bannerUrl` from useUserProfile (which doesn't
      // refetch on save) and the user only sees the new image after a
      // hard reload. We keep the same URL — the browser revokes it on
      // unload when the page navigates away.
      if (pendingAvatarPreviewUrl) {
        setLocalAvatarUrl(pendingAvatarPreviewUrl)
      } else if (pendingAvatarBlob) {
        setLocalAvatarUrl(null)
      }
      if (pendingBannerPreviewUrl) {
        setLocalBannerUrl(pendingBannerPreviewUrl)
        setBannerCleared(false)
      } else if (pendingBannerRemoved) {
        // Persist the cleared state past edit-mode exit so the
        // read-only render shows no banner until the next hook
        // refetch (which will agree).
        setLocalBannerUrl(null)
        setBannerCleared(true)
      } else if (pendingBannerBlob) {
        setLocalBannerUrl(null)
        setBannerCleared(false)
      }

      setPendingAvatarPreviewUrl(null)
      setPendingBannerPreviewUrl(null)
      setPendingAvatarBlob(null)
      setPendingBannerBlob(null)
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
  ])

  // -------------------------------------------------------------------
  // Unsaved-changes guard
  // -------------------------------------------------------------------
  // Warn before the viewer leaves the page mid-edit. Covers three exit
  // routes:
  //   1. Browser refresh / tab close — native `beforeunload` dialog.
  //   2. In-app navigation (top-bar tab clicks, sidebar group links,
  //      brand logo, etc.) — caught with a document-level capture
  //      handler on `<a>` elements that pops a `window.confirm()`.
  //      Save / Cancel inside the edit banner is intentionally
  //      exempted so the user can leave through them without a prompt.
  // We don't guard the React Router push API directly because App
  // Router doesn't expose a stable navigation-guard API; intercepting
  // anchor clicks covers every realistic in-app navigation path.
  const isDirty = isEditing && hasInteracted
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
      // Anchors inside the edit banner (Save / Cancel) or the inline-
      // edit affordances (avatar/banner upload, URL list controls)
      // mustn't trigger the guard — they're part of the edit flow.
      if (target.closest(".profile-edit-banner")) return
      if (target.closest(".profile-sidebar__avatar-edit-btn")) return
      if (target.closest(".profile-banner-upload__btn")) return
      // External `target="_blank"` links open in a new tab so the
      // current edit state is preserved — no prompt needed.
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

  // Mobile <ProfileHeader> still uses the legacy edit pages as a
  // fallback (inline edit isn't wired on the compact mobile header
  // yet). Same gate as `canEditInline` above — the signed-in identity
  // must match the viewed profile exactly.
  const mobileEditHref =
    isOwnProfile && !activeOrg
      ? "/settings/edit-profile"
      : isActingAsThisGroup && did
        ? `/groups/${encodeURIComponent(did)}/edit-profile`
        : undefined

  const settingsHref =
    isAdminOfThisGroup && did
      ? `/groups/${encodeURIComponent(did)}/settings`
      : undefined

  const eyebrow = isOwnProfile
    ? "Your profile"
    : isAdminOfThisGroup
      ? "Admin of this group"
      : undefined

  const { activities, hasMore } = useUserActivities(did)
  const activityCountLabel = hasMore
    ? `${activities.length}+`
    : `${activities.length}`

  const pathname = usePathname()
  const searchParams = useSearchParams()
  const tabFromUrl = useMemo<TabKey>(() => {
    const v = searchParams?.get("tab")
    return v && TABS.some((t) => t.key === v) ? (v as TabKey) : "overview"
  }, [searchParams])
  const [activeTab, setActiveTab] = useState<TabKey>(tabFromUrl)

  if (tabFromUrl !== activeTab && TABS.some((t) => t.key === tabFromUrl)) {
    setActiveTab(tabFromUrl)
  }

  if (isProfileLoading) {
    return (
      <div className="loading-screen">
        <div className="loading-screen__inner">
          <LoadingSpinner size="md" />
        </div>
      </div>
    )
  }

  if (profileError || !did) {
    return (
      <EmptyState
        icon={UserX}
        title="Profile not found"
        description={`We couldn't find a Certified profile for ${handleOrDid ? `@${handleOrDid}` : "this user"}.`}
        className="pt-[120px]"
      />
    )
  }

  const editing = isEditing && canEditInline

  return (
    <div className="profile-page">
      {/* Mobile-only identity block. Hidden on desktop where the sidebar
          carries the identity. The desktop top bar's row 2 is the only
          tab strip; there is no in-page tab strip. */}
      <div className="profile-page__mobile-header">
        <ProfileHeader
          profile={effectiveProfile}
          avatarUrl={effectiveAvatarUrl}
          bannerUrl={effectiveBannerUrl}
          handle={resolvedHandle || (rawHandle ?? null)}
          did={did}
          activityCountLabel={activityCountLabel}
          editHref={mobileEditHref}
          settingsHref={settingsHref}
          eyebrow={eyebrow}
        />
      </div>

      {editing ? (
        <div className="profile-edit-banner" role="region" aria-label="Edit profile">
          <span className="profile-edit-banner__label">Editing profile</span>
          {saveError ? (
            <span className="profile-edit-banner__error" role="alert">
              {saveError}
            </span>
          ) : null}
          <div className="profile-edit-banner__actions">
            <button
              type="button"
              className="profile-edit-banner__btn"
              onClick={handleCancelEdit}
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              type="button"
              className="profile-edit-banner__btn profile-edit-banner__btn--primary"
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      ) : null}

      {activeTab === "settings" && isOwnProfile ? (
        // Settings tab swaps the entire profile-page two-pane layout
        // out for the settings panel's own menu+sections two-pane
        // layout — same 296px slim rail, but the left pane carries
        // settings categories (Username / Email / Password /
        // Appearance) instead of the profile identity sidebar.
        <SettingsPanel />
      ) : (
        <div className="profile-page__layout">
          <ProfileSidebar
            profile={effectiveProfile}
            avatarUrl={effectiveAvatarUrl}
            handle={resolvedHandle || (rawHandle ?? null)}
            did={did}
            basePath={pathname || ""}
            settingsHref={settingsHref}
            isOrg={sidebarIsOrg}
            additionalUrls={effectiveAdditionalUrls}
            orgFoundedDate={displayFoundedDate}
            groupsOverride={isOwnProfile ? groups : undefined}
            groupsLoadingOverride={isOwnProfile ? orgGroupsLoading : undefined}
            canInlineEdit={canEditInline}
            isEditing={editing}
            drafts={drafts}
            onEditClick={handleEditClick}
            onCancelEdit={handleCancelEdit}
            onSaveEdit={handleSave}
            onDraftChange={handleDraftChange}
            onAvatarFile={handleAvatarFile}
            hasPendingAvatar={!!pendingAvatarBlob}
            isSaving={isSaving}
            saveError={saveError}
          />

          <div className="profile-page__main">
            {activeTab === "overview" && (
              <div role="tabpanel" id="tabpanel-overview" aria-labelledby="tab-overview">
                <ProfileOverview
                  bannerUrl={effectiveBannerUrl}
                  did={did}
                  profile={effectiveProfile}
                  basePath={pathname || ""}
                  isEditing={editing}
                  drafts={drafts}
                  onDraftChange={handleDraftChange}
                  onBannerFile={handleBannerFile}
                  onBannerRemove={handleRemoveBanner}
                  hasPendingBanner={!!pendingBannerBlob}
                  isOrg={sidebarIsOrg}
                  orgLongDescription={displayLongDescription}
                  orgTypeTags={displayOrgTypeTags}
                  orgLocationName={displayLocation.name}
                  orgLocationCoords={displayLocation.coords}
                />
              </div>
            )}
            {activeTab === "about" ? (
              <div
                role="tabpanel"
                id="tabpanel-about"
                aria-labelledby="tab-about"
                className="profile-page__about"
              >
                {editing && sidebarIsOrg ? (
                  <LeafletEditor
                    value={drafts.longDescription ?? null}
                    onChange={(next: LinearDocument) =>
                      handleDraftChange("longDescription", next)
                    }
                    placeholder="A longer, multi-line description of this organization."
                    ariaLabel="Long description"
                    did={did}
                    onImageUpload={handleLongDescImageUpload}
                  />
                ) : displayLongDescription ? (
                  <LeafletDocument
                    value={displayLongDescription}
                    did={did}
                    className="profile-page__about-doc"
                  />
                ) : null}
              </div>
            ) : null}
            {activeTab === "certs" && (
              <div
                role="tabpanel"
                id="tabpanel-certs"
                aria-labelledby="tab-certs"
              >
                <ProfileCerts did={did} />
              </div>
            )}
            {activeTab === "projects" && (
              <div
                role="tabpanel"
                id="tabpanel-projects"
                aria-labelledby="tab-projects"
              >
                <ProfileProjects did={did} />
              </div>
            )}
            {activeTab === "groups" && (
              <div
                role="tabpanel"
                id="tabpanel-groups"
                aria-labelledby="tab-groups"
              >
                <ProfileGroups did={did} />
              </div>
            )}
            {activeTab === "endorsements" && (
              <div
                role="tabpanel"
                id="tabpanel-endorsements"
                aria-labelledby="tab-endorsements"
              >
                <ProfileEndorsements did={did} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
