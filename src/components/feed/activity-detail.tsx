"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { Award, Calendar, Camera, FileText, Pencil, Target } from "lucide-react"
import { useAuth } from "@/lib/auth/auth-context"
import { useOrg } from "@/lib/groups/org-context"
import {
  resolveActivityImageUrl,
  evaluateWorkScope,
} from "@/lib/atproto/activity"
import {
  useContributorInfo,
  isAtprotoIdentity,
} from "@/hooks/use-contributor-info"
import { useContributorInformation } from "@/hooks/use-contributor-information"
import { useRights } from "@/hooks/use-rights"
import { getInitials } from "@/lib/utils/initials"
import Avatar from "@/components/ui/avatar"
import LoadingSpinner from "@/components/ui/loading-spinner"
import CertHeadlineByline from "./cert-headline-byline"
import CertProjects from "./cert-projects"
import LeafletDocument, {
  isRenderableDescription,
} from "@/components/leaflet/leaflet-document"
import LeafletEditor from "@/components/leaflet/leaflet-editor"
import CertLocationsMap from "./cert-locations-map"
import {
  uploadBlob,
  type UploadedBlob,
} from "@/lib/atproto/profile"
import { putCertRecord } from "@/lib/atproto/cert"
import { asLinearDocument } from "@/lib/leaflet/guards"
import { isEmptyLongDescription } from "@/lib/leaflet/guards"
import type { LinearDocument } from "@/lib/leaflet/types"
import type {
  ActivityContributor as ActivityContributorType,
  ClaimActivity,
} from "@/lib/atproto/activity-types"
import type { HypercertsSmallImage } from "@/lib/atproto/types"
import type { BlobRef } from "@atproto/api"

interface ActivityDetailProps {
  did: string
  value: ClaimActivity
}

/**
 * Stable React key for a contributor row. Contributors carry no id of
 * their own, so we use the strong-ref URI / inline identity plus the
 * position to disambiguate duplicates — avoids the `key={i}` antipattern.
 */
function contributorKey(c: ActivityContributorType, index: number): string {
  const id = c.contributorIdentity as unknown
  if (id && typeof id === "object") {
    const obj = id as Record<string, unknown>
    if (typeof obj.uri === "string") return `${obj.uri}#${index}`
    if (typeof obj.identity === "string") return `${obj.identity}#${index}`
  }
  if (typeof id === "string") return `${id}#${index}`
  return `contributor-${index}`
}

/**
 * Extract role text defensively. The lexicon types this as an object
 * but some records store it as a bare string. `"role" in details`
 * throws when `details` is a primitive, so we type-check at runtime.
 */
function contributionRoleText(details: unknown): string | null {
  if (typeof details === "string") return details
  if (!details || typeof details !== "object") return null
  const obj = details as Record<string, unknown>
  return typeof obj.role === "string" ? obj.role : null
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  } catch {
    return iso
  }
}

/**
 * Detail view of a single activity claim.
 *
 * Layout:
 *   - Left aside: square cert image, optional "Project" section, then
 *     a small Created / Time period / Work scope / Rights meta list.
 *   - Main pane: title, then a date+author byline, then the full
 *     `shortDescription`, an optional disclosure to reveal the rich
 *     `description`, contributors, and a single map for all locations.
 *
 * The `.cert-detail--wide` modifier on the root opts this page's
 * `.app-shell__content` parent into a wider max-width via a `:has()`
 * rule in `cert-detail.css` — scoped, so every other page keeps the
 * 600px reading cap.
 */
export default function ActivityDetail({ did, value }: ActivityDetailProps) {
  const baseImageUrl = value.image
    ? resolveActivityImageUrl(value.image, did)
    : null

  const [imageFailed, setImageFailed] = useState(false)
  useEffect(() => {
    setImageFailed(false)
  }, [baseImageUrl])

  const workScopeLabel = evaluateWorkScope(value.workScope)

  // Time period rendering:
  //   - both set    → "Jan 1, 2026 – Mar 15, 2026"
  //   - only start  → "Jan 1, 2026 (ongoing)"
  //   - only end    → "Until Mar 15, 2026"
  //   - neither     → "Unspecified"
  const startDate = value.startDate ? formatDate(value.startDate) : null
  const endDate = value.endDate ? formatDate(value.endDate) : null
  let timePeriodLabel: string
  if (startDate && endDate) {
    timePeriodLabel = `${startDate} – ${endDate}`
  } else if (startDate) {
    timePeriodLabel = `${startDate} (ongoing)`
  } else if (endDate) {
    timePeriodLabel = `Until ${endDate}`
  } else {
    timePeriodLabel = "Unspecified"
  }

  const createdAbsolute = formatDate(value.createdAt)

  const contributors = value.contributors ?? []
  const contributorCount = contributors.length
  const locations = value.locations ?? []
  const showFullDescription = isRenderableDescription(value.description)

  // ClaimActivity doesn't carry its own rkey. The page route at
  // /activity/[did]/[rkey] does, and we want to pass it to the
  // Projects section. Rather than threading another prop from the
  // page (the page file is carved out beyond the breadcrumb wiring),
  // we read the last pathname segment client-side — same value the
  // page already decoded via `useParams`.
  const rkey = useRouteRkey()

  const { name: rightsName, isLoading: rightsLoading } = useRights(
    value.rights?.uri ?? null,
  )

  // Tab strip on the top bar (back-row) drives which slice of the
  // record renders in the right pane. Keep the left aside identical
  // across all tabs.
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const tabParam = searchParams?.get("tab") ?? "overview"
  const activeTab: "overview" | "description" | "contributors" =
    tabParam === "description" || tabParam === "contributors"
      ? tabParam
      : "overview"

  // Edit affordance — the viewer can act on the cert when they're
  // signed in as the cert's creator. Two paths:
  //   - Personal session DID === cert.did (own cert), OR
  //   - Acting-as-group on the group's own cert, AND the role is
  //     owner or admin. Members of a group can switch into it via
  //     the account switcher but the BFF rejects writes from them,
  //     so we hide the affordance rather than land them on a
  //     write-rejected edit page.
  const { did: sessionDid, isAuthenticated } = useAuth()
  const { activeOrg } = useOrg()
  const canEditAsActiveOrg =
    !!activeOrg &&
    activeOrg.groupDid === did &&
    (activeOrg.role === "owner" || activeOrg.role === "admin")
  const isCreator =
    (!!sessionDid && sessionDid === did) || canEditAsActiveOrg
  // When the creator is acting as the group, writes route through
  // the BFF (target ≠ session); otherwise straight XRPC.
  const editTargetDid = canEditAsActiveOrg ? did : undefined
  const descriptionHref = pathname
    ? `${pathname}?tab=description`
    : null

  // -------------------------------------------------------------------
  // Inline edit state — same pattern as the profile page. Drafts are
  // seeded from `value` when the user enters edit mode; on save we
  // PUT the record and update local mirrors so the read-only view
  // immediately reflects the change.
  // -------------------------------------------------------------------
  const [isEditing, setIsEditing] = useState(false)
  const [drafts, setDrafts] = useState({
    title: "",
    shortDescription: "",
    description: null as LinearDocument | null,
  })
  const [localValue, setLocalValue] = useState<ClaimActivity | null>(null)
  const [pendingImageBlob, setPendingImageBlob] =
    useState<UploadedBlob | null>(null)
  const [pendingImagePreviewUrl, setPendingImagePreviewUrl] =
    useState<string | null>(null)
  const [localImageUrl, setLocalImageUrl] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Read values used everywhere a tab renders the cert: prefer the
  // local mirror (set after save) over the server-supplied `value`.
  const effectiveValue = localValue ?? value
  const editing = isEditing && isCreator

  const handleEditClick = useCallback(() => {
    setDrafts({
      title: effectiveValue.title ?? "",
      shortDescription: effectiveValue.shortDescription ?? "",
      description:
        asLinearDocument(effectiveValue.description) ??
        (typeof effectiveValue.description === "string" &&
        effectiveValue.description.trim().length > 0
          ? {
              $type: "pub.leaflet.pages.linearDocument" as const,
              blocks: [
                {
                  block: {
                    $type: "pub.leaflet.blocks.text" as const,
                    plaintext: effectiveValue.description,
                  },
                },
              ],
            }
          : null),
    })
    setPendingImageBlob(null)
    setPendingImagePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setSaveError(null)
    setIsEditing(true)
  }, [effectiveValue])

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false)
    setPendingImageBlob(null)
    setPendingImagePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setSaveError(null)
  }, [])

  const handleImageFile = useCallback(
    async (file: File) => {
      const previewUrl = URL.createObjectURL(file)
      setPendingImagePreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return previewUrl
      })
      const blob = await uploadBlob(
        file,
        editTargetDid ? { targetDid: editTargetDid } : undefined,
      )
      setPendingImageBlob(blob)
    },
    [editTargetDid],
  )

  const handleSave = useCallback(async () => {
    if (!rkey || !sessionDid || !isAuthenticated) {
      setSaveError("Not authenticated")
      return
    }
    setIsSaving(true)
    setSaveError(null)
    try {
      // Start from the server-supplied record so unedited fields
      // (dates, contributors, work scope, rights, locations, etc.)
      // round-trip verbatim — only the surfaces the editor exposes
      // are mutated.
      // `title` and `shortDescription` are required by the lexicon —
      // keep the trimmed value (or fall back to the existing one if
      // the user blanked the input by accident). Strip empty
      // description so the PDS doesn't store an empty doc.
      const trimmedTitle =
        drafts.title.trim() || effectiveValue.title || ""
      const trimmedShort =
        drafts.shortDescription.trim() ||
        effectiveValue.shortDescription ||
        ""
      const next: ClaimActivity = {
        ...effectiveValue,
        title: trimmedTitle,
        shortDescription: trimmedShort,
      }
      if (isEmptyLongDescription(drafts.description)) {
        delete (next as { description?: unknown }).description
      } else if (drafts.description) {
        next.description = drafts.description
      }
      if (pendingImageBlob) {
        const imageValue: HypercertsSmallImage = {
          $type: "org.hypercerts.defs#smallImage",
          image: pendingImageBlob as unknown as BlobRef,
        }
        next.image = imageValue
      }

      await putCertRecord(sessionDid, editTargetDid ?? sessionDid, rkey, next)
      setLocalValue(next)
      if (pendingImagePreviewUrl) {
        setLocalImageUrl(pendingImagePreviewUrl)
      }
      setPendingImagePreviewUrl(null)
      setPendingImageBlob(null)
      setIsEditing(false)
    } catch (err) {
      console.error("Failed to save cert:", err)
      setSaveError(err instanceof Error ? err.message : "Failed to save cert")
    } finally {
      setIsSaving(false)
    }
  }, [
    rkey,
    sessionDid,
    isAuthenticated,
    drafts,
    effectiveValue,
    pendingImageBlob,
    pendingImagePreviewUrl,
    editTargetDid,
  ])

  // Resolution order for the displayed cert image:
  //   1. In-flight preview (object URL created the instant the user
  //      picked a new image — atproto PDSes don't serve a blob via
  //      getBlob until the record references it, so we bridge with
  //      the local file).
  //   2. Post-save local mirror.
  //   3. Re-resolve from the local mirror's record if it exists.
  //   4. Original server value.
  const effectiveImageUrl =
    pendingImagePreviewUrl ??
    localImageUrl ??
    (localValue?.image
      ? resolveActivityImageUrl(localValue.image, did)
      : baseImageUrl)

  // Shared headline for every tab — title + date+author byline. The
  // shortDescription stays inside the Overview header (it's the
  // teaser that gives readers a reason to click into Description),
  // but Description and Contributors hide it to avoid duplication.
  const headline = (
    <header className="cert-detail__headline">
      <div className="cert-detail__title-row">
        {editing ? (
          <input
            type="text"
            className="cert-detail__title-input"
            value={drafts.title}
            maxLength={256}
            placeholder="Cert title"
            aria-label="Cert title"
            onChange={(e) =>
              setDrafts((d) => ({ ...d, title: e.target.value }))
            }
          />
        ) : (
          <h1 className="cert-detail__title">{effectiveValue.title}</h1>
        )}
        {!editing && isCreator ? (
          <button
            type="button"
            className="cert-detail__edit-btn"
            aria-label="Edit cert"
            title="Edit cert"
            onClick={handleEditClick}
          >
            <Pencil size={14} strokeWidth={1.75} aria-hidden />
            Edit
          </button>
        ) : null}
      </div>
      <CertHeadlineByline
        did={did}
        createdAt={effectiveValue.createdAt}
        formattedDate={createdAbsolute}
      />
      {editing && activeTab === "overview" ? (
        <textarea
          className="cert-detail__short-desc-input"
          value={drafts.shortDescription}
          maxLength={512}
          placeholder="A short description (one or two lines)…"
          aria-label="Short description"
          onChange={(e) =>
            setDrafts((d) => ({ ...d, shortDescription: e.target.value }))
          }
          rows={3}
        />
      ) : activeTab === "overview" && effectiveValue.shortDescription ? (
        <p className="cert-detail__short-desc">
          {effectiveValue.shortDescription}
          {showFullDescription && descriptionHref ? (
            <>
              {" "}
              <Link
                href={descriptionHref}
                scroll={false}
                replace
                className="cert-detail__more-link"
              >
                more
              </Link>
            </>
          ) : null}
        </p>
      ) : activeTab === "overview" && showFullDescription && descriptionHref ? (
        /* No shortDescription but there's a rich description — surface
           the "more" link as a standalone affordance so readers can
           still jump to the Description tab. */
        <p className="cert-detail__short-desc">
          <Link
            href={descriptionHref}
            scroll={false}
            className="cert-detail__more-link"
          >
            Read description
          </Link>
        </p>
      ) : null}
    </header>
  )

  return (
    <>
      {/* Editing banner sits ABOVE the cert-detail grid so it spans
          the full content width. Placing it inside the article made
          it a grid child of the 2-column layout and squashed it into
          the left rail. */}
      {editing ? (
        <div
          className="profile-edit-banner"
          role="region"
          aria-label="Edit cert"
        >
          <span className="profile-edit-banner__label">Editing cert</span>
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

      <article className="cert-detail cert-detail--wide">
      <aside className="cert-detail__aside" aria-label="Cert details">
        <div
          className={
            editing
              ? "cert-detail__image cert-detail__image--editing"
              : "cert-detail__image"
          }
        >
          {effectiveImageUrl && !imageFailed ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={effectiveImageUrl}
              alt=""
              className="cert-detail__image-img"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <Award
              size={56}
              strokeWidth={1.25}
              className="cert-detail__image-placeholder-icon"
              aria-hidden
            />
          )}
          {editing ? (
            <CertImageEditOverlay
              onFile={handleImageFile}
              hasPending={!!pendingImageBlob}
            />
          ) : null}
        </div>

        <dl className="cert-detail__meta">
          {/* "Created" lives in the headline byline now — no need to
              repeat it in the aside meta list. */}
          <div className="cert-detail__meta-row">
            <dt className="cert-detail__meta-label">
              <Calendar size={11} strokeWidth={2} aria-hidden />
              Time period
            </dt>
            <dd className="cert-detail__meta-value">{timePeriodLabel}</dd>
          </div>

          {workScopeLabel ? (
            <div className="cert-detail__meta-row">
              <dt className="cert-detail__meta-label">
                <Target size={11} strokeWidth={2} aria-hidden />
                Work scope
              </dt>
              <dd className="cert-detail__meta-value">{workScopeLabel}</dd>
            </div>
          ) : null}

          {value.rights ? (
            <div className="cert-detail__meta-row">
              <dt className="cert-detail__meta-label">
                <FileText size={11} strokeWidth={2} aria-hidden />
                Rights
              </dt>
              <dd className="cert-detail__meta-value">
                {rightsName ? (
                  rightsName
                ) : rightsLoading ? (
                  <span className="cert-detail__meta-aux">Loading…</span>
                ) : (
                  <span className="cert-detail__uri">{value.rights.uri}</span>
                )}
              </dd>
            </div>
          ) : null}
        </dl>
      </aside>

      <div className="cert-detail__main">
        {headline}

        {activeTab === "overview" ? (
          <>
            {contributorCount > 0 ? (
              (() => {
                // Overview preview — cap at 5 rows. When the cert has
                // more, the section header gains a "See all" link
                // into the dedicated Contributors tab so readers can
                // jump to the full list without scrolling the
                // overview.
                const OVERVIEW_CONTRIB_PREVIEW = 5
                const previewContributors = contributors.slice(
                  0,
                  OVERVIEW_CONTRIB_PREVIEW,
                )
                const hasMore = contributorCount > OVERVIEW_CONTRIB_PREVIEW
                const contributorsHref = pathname
                  ? `${pathname}?tab=contributors`
                  : null
                return (
                  <section className="cert-detail__section">
                    <div className="cert-detail__section-header">
                      <h2 className="cert-detail__section-title">
                        Contributors
                      </h2>
                      <span className="cert-detail__section-count">
                        {contributorCount}
                      </span>
                      {hasMore && contributorsHref ? (
                        <Link
                          href={contributorsHref}
                          scroll={false}
                          replace
                          className="cert-detail__section-see-all"
                        >
                          See all
                        </Link>
                      ) : null}
                    </div>
                    <ul className="cert-detail__contributors">
                      {previewContributors.map((c, i) => {
                        const roleText = contributionRoleText(c.contributionDetails)
                        return (
                          <ContributorRow
                            key={contributorKey(c, i)}
                            contributor={c}
                            role={roleText}
                            weight={c.contributionWeight ?? null}
                          />
                        )
                      })}
                    </ul>
                  </section>
                )
              })()
            ) : null}

            {rkey ? <CertProjects did={did} rkey={rkey} /> : null}

            {locations.length > 0 ? (
              <section className="cert-detail__section">
                <div className="cert-detail__section-header">
                  <h2 className="cert-detail__section-title">Locations</h2>
                  <span className="cert-detail__section-count">
                    {locations.length}
                  </span>
                </div>
                <CertLocationsMap locations={locations} />
              </section>
            ) : null}
          </>
        ) : activeTab === "description" ? (
          <section className="cert-detail__section">
            {editing ? (
              <LeafletEditor
                value={drafts.description}
                onChange={(next) =>
                  setDrafts((d) => ({ ...d, description: next }))
                }
                placeholder="Full description of this cert."
                ariaLabel="Cert description"
                did={did}
                onImageUpload={(file) =>
                  uploadBlob(
                    file,
                    editTargetDid ? { targetDid: editTargetDid } : undefined,
                  )
                }
              />
            ) : showFullDescription ? (
              <LeafletDocument value={effectiveValue.description} did={did} />
            ) : (
              <p className="cert-detail__short-desc">
                {effectiveValue.shortDescription || "No description yet."}
              </p>
            )}
          </section>
        ) : activeTab === "contributors" ? (
          <section className="cert-detail__section">
            <div className="cert-detail__section-header">
              <h2 className="cert-detail__section-title">Contributors</h2>
              <span className="cert-detail__section-count">
                {contributorCount}
              </span>
            </div>
            {contributorCount > 0 ? (
              <ul className="cert-detail__contributors">
                {contributors.map((c, i) => {
                  const roleText = contributionRoleText(c.contributionDetails)
                  return (
                    <ContributorRow
                      key={contributorKey(c, i)}
                      contributor={c}
                      role={roleText}
                      weight={c.contributionWeight ?? null}
                    />
                  )
                })}
              </ul>
            ) : (
              <p className="cert-detail__short-desc">No contributors listed.</p>
            )}
          </section>
        ) : null}
      </div>
    </article>
    </>
  )
}

/**
 * Read the trailing rkey segment off the current URL. The cert detail
 * page sits at `/activity/[did]/[rkey]`, so we slice the last
 * pathname segment — decoded so it matches what the page already
 * normalised through `decodeURIComponent`. Returns null until the
 * window object is available (SSR pass).
 */
function useRouteRkey(): string | null {
  const [rkey, setRkey] = useState<string | null>(null)
  useEffect(() => {
    if (typeof window === "undefined") return
    const segments = window.location.pathname.split("/").filter(Boolean)
    const last = segments[segments.length - 1]
    if (!last) {
      setRkey(null)
      return
    }
    try {
      setRkey(decodeURIComponent(last))
    } catch {
      setRkey(last)
    }
  }, [])
  return rkey
}

/* ---------- Image edit overlay ----------
 *
 * Floating Camera pill anchored to the bottom-right of the cert
 * image. Same visual treatment as the avatar / banner upload
 * pills on the profile page (semi-transparent dark surface,
 * Camera icon + label). Triggers a hidden file input on click.
 */
interface CertImageEditOverlayProps {
  onFile: (file: File) => Promise<void>
  hasPending: boolean
}

function CertImageEditOverlay({
  onFile,
  hasPending,
}: CertImageEditOverlayProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [isUploading, setIsUploading] = useState(false)

  const handleClick = () => inputRef.current?.click()
  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (inputRef.current) inputRef.current.value = ""
    if (!file) return
    setIsUploading(true)
    try {
      await onFile(file)
    } finally {
      setIsUploading(false)
    }
  }
  return (
    <>
      <button
        type="button"
        className="cert-detail__image-edit-btn"
        onClick={handleClick}
        aria-label={isUploading ? "Uploading image" : "Change image"}
        title="Change image"
        disabled={isUploading}
      >
        {isUploading ? (
          <LoadingSpinner size="sm" />
        ) : (
          <>
            <Camera size={14} strokeWidth={1.75} aria-hidden />
            <span>{hasPending ? "Replace image" : "Change image"}</span>
          </>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleChange}
        style={{ position: "absolute", width: 1, height: 1, opacity: 0 }}
      />
    </>
  )
}

/* ---------- Contributor row ----------
 *
 * Compact row for the cert detail contributors grid. Resolves the
 * contributor identity the same way `ActivityContributor` does — see
 * `useContributorInfo` / `useContributorInformation` — but renders with
 * the `cert-detail__contributor-*` class set so it inherits the new
 * pill-hover styling rather than the older `activity-detail__contributor-*`
 * rules in feed.css.
 */

interface ContributorRowProps {
  readonly contributor: ActivityContributorType
  readonly role: string | null
  readonly weight: string | null
}

function classifyContributorIdentity(id: unknown): {
  inlineIdentity: string | null
  strongRefUri: string | null
} {
  if (id == null) return { inlineIdentity: null, strongRefUri: null }
  if (typeof id === "string") {
    return { inlineIdentity: id, strongRefUri: null }
  }
  if (typeof id !== "object") {
    return { inlineIdentity: null, strongRefUri: null }
  }
  const obj = id as Record<string, unknown>
  if (typeof obj.identity === "string") {
    return { inlineIdentity: obj.identity, strongRefUri: null }
  }
  if (typeof obj.uri === "string" && obj.uri.startsWith("at://")) {
    return { inlineIdentity: null, strongRefUri: obj.uri }
  }
  return { inlineIdentity: null, strongRefUri: null }
}

function ContributorRow({ contributor, role, weight }: ContributorRowProps) {
  const { inlineIdentity, strongRefUri } = classifyContributorIdentity(
    contributor.contributorIdentity,
  )

  const { record: contribInfo, isLoading: contribInfoLoading } =
    useContributorInformation(strongRefUri)

  const atprotoCandidate =
    inlineIdentity ??
    (contribInfo?.identifier && isAtprotoIdentity(contribInfo.identifier)
      ? contribInfo.identifier
      : null)

  const { info, isLoading: atprotoLoading } =
    useContributorInfo(atprotoCandidate)

  const isLoading = contribInfoLoading || atprotoLoading

  const fallbackLabel = strongRefUri ? "Unknown contributor" : "Anonymous"
  const displayName =
    info?.displayName ||
    contribInfo?.displayName ||
    (inlineIdentity && !isAtprotoIdentity(inlineIdentity)
      ? inlineIdentity
      : null) ||
    fallbackLabel

  const handle = info?.handle && info.handle !== info.did ? info.handle : null
  const avatarUrl = info?.avatarUrl || contribInfo?.image?.uri || null
  const profileHref = info?.did
    ? `/profile/${encodeURIComponent(info.handle || info.did)}`
    : null
  const initials = getInitials(
    info?.displayName || contribInfo?.displayName || null,
    info?.did || null,
  )

  const hasAnyHydratedField =
    !!info?.did ||
    !!contribInfo?.displayName ||
    !!contribInfo?.image?.uri ||
    !!inlineIdentity

  if (isLoading && !hasAnyHydratedField) {
    return (
      <li
        className="cert-detail__contributor cert-detail__contributor--skeleton"
        aria-hidden="true"
      >
        <div className="cert-detail__contributor-avatar-skel" />
        <div className="cert-detail__contributor-meta">
          <div className="cert-detail__contributor-name-skel" />
          <div className="cert-detail__contributor-handle-skel" />
        </div>
        {weight ? (
          <span className="cert-detail__contributor-weight">{weight}</span>
        ) : null}
      </li>
    )
  }

  const body = (
    <>
      <Avatar
        size="sm"
        src={avatarUrl || undefined}
        alt=""
        fallbackInitials={initials}
      />
      <span className="cert-detail__contributor-meta">
        <span className="cert-detail__contributor-name">
          {displayName}
          {role ? (
            <span className="cert-detail__contributor-role"> · {role}</span>
          ) : null}
        </span>
        {handle ? (
          <span className="cert-detail__contributor-handle">@{handle}</span>
        ) : null}
      </span>
    </>
  )

  return (
    <li className="cert-detail__contributor">
      {profileHref ? (
        <Link
          href={profileHref}
          className="cert-detail__contributor-link"
          aria-label={`View ${displayName}'s profile`}
        >
          {body}
        </Link>
      ) : (
        <span className="cert-detail__contributor-link cert-detail__contributor-link--static">
          {body}
        </span>
      )}
      {weight ? (
        <span className="cert-detail__contributor-weight">{weight}</span>
      ) : null}
    </li>
  )
}

