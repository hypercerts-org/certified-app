"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import {
  AtSign,
  Building2,
  Calendar,
  FileText,
  Globe,
  Image as ImageIcon,
  Users,
} from "lucide-react"
import { useAuth } from "@/lib/auth/auth-context"
import { useOrg } from "@/lib/groups/org-context"
import { useOrgCreationLimit } from "@/lib/groups/use-org-limit"
import { usePageTitle } from "@/lib/navbar-context"
import { MAX_SELF_CREATED_ORGS } from "@/lib/groups/constants"
import {
  registerGroup,
  RegisterGroupError,
  putMembership,
  putOrgProfile,
  putOrgMetadata,
  createBskyProfile,
  uploadOrgBlob,
} from "@/lib/groups/api"
import Button from "@/components/ui/button"
import EmptyState from "@/components/ui/empty-state"
import LoadingSpinner from "@/components/ui/loading-spinner"
import ImageEditOverlay from "@/components/feed/image-edit-overlay"
import type { UploadedBlob } from "@/lib/atproto/profile"
import type {
  HypercertsLargeImage,
  HypercertsSmallImage,
} from "@/lib/atproto/types"
import type { BlobRef } from "@atproto/api"
import type { OrgProfile, GroupMetadata } from "@/lib/groups/types"

/**
 * `/groups/create` — new group. Visual shell + form-field rhythm
 * mirror `/project/new`: full-width hero banner at the top,
 * title-style display-name input below, then short description,
 * then a meta strip with the lexicon-backed extras (handle,
 * website, founded date, organization type). Inputs reuse the
 * `cert-detail__*` and `create-cert__*` classes so the three
 * create pages read as one form family.
 *
 * Wire format: the create flow writes FIVE records on the way out —
 *   1. registerGroup           → mints the group DID
 *   2. createBskyProfile       → empty app.bsky.actor.profile
 *   3. uploadOrgBlob (avatar)  → optional, returns a BlobRef
 *   4. uploadOrgBlob (banner)  → optional, returns a BlobRef
 *   5. putOrgProfile           → app.certified.actor.profile
 *      (displayName, description, website, avatar, banner)
 *   6. putOrgMetadata          → app.certified.actor.organization
 *      (organizationType[], foundedDate, createdAt)
 *   7. putMembership           → adds the creator as owner
 *
 * Blob uploads happen AFTER registerGroup because the group's DID
 * (and therefore its repo) doesn't exist until then.
 */

export default function CreateGroupPage() {
  usePageTitle("New group")
  const router = useRouter()
  const { did, isLoading: authLoading, openSignIn } = useAuth()
  const { refetchOrgs } = useOrg()
  const { isChecking, limitReached } = useOrgCreationLimit()

  // Profile fields
  const [displayName, setDisplayName] = useState("")
  const [handle, setHandle] = useState("")
  const [shortDescription, setShortDescription] = useState("")
  const [website, setWebsite] = useState("")

  // Metadata fields
  const [organizationType, setOrganizationType] = useState("")
  const [foundedDate, setFoundedDate] = useState("")

  // Staged image files — uploaded AFTER registerGroup mints the
  // group DID (we can't write a blob to a repo that doesn't exist
  // yet). Stored as Files + preview object-URLs until then.
  const [bannerFile, setBannerFile] = useState<File | null>(null)
  const [bannerPreviewUrl, setBannerPreviewUrl] = useState<string | null>(null)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null)

  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nameError, setNameError] = useState("")
  const [handleError, setHandleError] = useState("")

  useEffect(() => {
    return () => {
      if (bannerPreviewUrl) URL.revokeObjectURL(bannerPreviewUrl)
      if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl)
    }
  }, [bannerPreviewUrl, avatarPreviewUrl])

  const validateName = (value: string) => {
    if (!value.trim()) {
      setNameError("Name is required")
      return false
    }
    if (value.trim().length < 5) {
      setNameError("Name must be at least 5 characters")
      return false
    }
    if (value.length > 64) {
      setNameError("Name must be 64 characters or fewer")
      return false
    }
    setNameError("")
    return true
  }

  const validateHandle = (value: string) => {
    if (!value.trim()) {
      setHandleError("Handle is required")
      return false
    }
    if (value.length < 5) {
      setHandleError("Handle must be at least 5 characters")
      return false
    }
    if (value.length > 32) {
      setHandleError("Handle must be 32 characters or fewer")
      return false
    }
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(value)) {
      setHandleError(
        "Handle must be lowercase alphanumeric with hyphens",
      )
      return false
    }
    setHandleError("")
    return true
  }

  // Banner / avatar pickers — we just stage the File locally; the
  // actual blob upload runs after registerGroup mints the repo.
  const handleBannerFile = useCallback(async (file: File) => {
    setBannerPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(file)
    })
    setBannerFile(file)
  }, [])

  const handleBannerRemove = useCallback(() => {
    setBannerFile(null)
    setBannerPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
  }, [])

  const handleAvatarFile = useCallback(async (file: File) => {
    setAvatarPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(file)
    })
    setAvatarFile(file)
  }, [])

  const handleAvatarRemove = useCallback(() => {
    setAvatarFile(null)
    setAvatarPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
  }, [])

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!did) return

    const nameValid = validateName(displayName)
    const handleValid = validateHandle(handle)
    if (!nameValid || !handleValid) return

    setIsCreating(true)
    setError(null)

    try {
      // 1. Mint the group DID
      const result = await registerGroup(handle, did)
      const groupDid = result.groupDid

      // 2. Empty bsky profile so the group is discoverable on
      // bsky-side surfaces. Best-effort — failure logs and
      // continues.
      try {
        await createBskyProfile(groupDid)
      } catch {
        console.error(
          "[groups/create] createBskyProfile failed; continuing",
        )
      }

      // 3 + 4. Avatar + banner uploads. Each is independent; if one
      // fails we don't block the whole create.
      let avatarBlob: UploadedBlob | null = null
      let bannerBlob: UploadedBlob | null = null
      if (avatarFile) {
        try {
          avatarBlob = await uploadOrgBlob(groupDid, avatarFile)
        } catch (err) {
          console.error("[groups/create] avatar upload failed", err)
        }
      }
      if (bannerFile) {
        try {
          bannerBlob = await uploadOrgBlob(groupDid, bannerFile)
        } catch (err) {
          console.error("[groups/create] banner upload failed", err)
        }
      }

      // 5. Profile record — fold every non-empty field in.
      const profile: OrgProfile = {
        createdAt: new Date().toISOString(),
        displayName: displayName.trim(),
        ...(shortDescription.trim() && {
          description: shortDescription.trim(),
        }),
        ...(website.trim() && { website: website.trim() }),
      }
      if (avatarBlob) {
        const small: HypercertsSmallImage = {
          $type: "org.hypercerts.defs#smallImage",
          image: avatarBlob as unknown as BlobRef,
        }
        profile.avatar = small
      }
      if (bannerBlob) {
        const large: HypercertsLargeImage = {
          $type: "org.hypercerts.defs#largeImage",
          image: bannerBlob as unknown as BlobRef,
        }
        profile.banner = large
      }
      try {
        await putOrgProfile(groupDid, profile)
      } catch (err) {
        console.error("[groups/create] putOrgProfile failed", err)
      }

      // 6. Metadata — organizationType is comma-separated in the
      // form, split + trim into an array. foundedDate is upcast to
      // ISO if present.
      const orgTypes = organizationType
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
      const metadata: GroupMetadata = {
        createdAt: new Date().toISOString(),
        ...(orgTypes.length > 0 && { organizationType: orgTypes }),
        ...(foundedDate && {
          foundedDate: new Date(
            `${foundedDate}T00:00:00.000Z`,
          ).toISOString(),
        }),
      }
      try {
        await putOrgMetadata(groupDid, metadata)
      } catch (err) {
        console.error("[groups/create] putOrgMetadata failed", err)
      }

      // 7. Stitch the membership so the creator shows up as owner
      // in the account switcher + group list.
      await putMembership(did, groupDid, "owner")
      await refetchOrgs()
      router.push("/home")
    } catch (err) {
      console.error("[groups/create] failed", err)
      if (
        err instanceof RegisterGroupError &&
        err.code === "HandleNotAvailable"
      ) {
        setHandleError(
          "This handle is already taken. Please choose another.",
        )
      } else {
        setError(
          err instanceof Error ? err.message : "Failed to create group",
        )
      }
    } finally {
      setIsCreating(false)
    }
  }

  // Still resolving auth or the self-created-org count.
  if (authLoading || isChecking) {
    return (
      <div className="dashboard">
        <div className="dashboard__body">
          <div className="dashboard__main create-cert__auth-loading">
            <LoadingSpinner size="md" />
          </div>
        </div>
      </div>
    )
  }

  // Auth has settled but there's no signed-in account. Previously the
  // limit hook stayed in its "checking" state forever when `did` was
  // null, leaving this page stuck on an infinite spinner with no way
  // out. Render a recoverable state with a clear primary action instead.
  if (!did) {
    return (
      <div className="dashboard">
        <div className="dashboard__body">
          <div className="dashboard__main">
            <EmptyState
              icon={Users}
              title="Sign in to create a group"
              description="You need to be signed in to start a new group."
            >
              <Button variant="primary" onClick={() => openSignIn()}>
                Sign in
              </Button>
            </EmptyState>
          </div>
        </div>
      </div>
    )
  }

  if (limitReached) {
    return (
      <div className="dashboard">
        <div className="dashboard__body">
          <div className="dashboard__main">
            <EmptyState
              icon={Users}
              title="Group limit reached"
              description={`You've reached the limit of ${MAX_SELF_CREATED_ORGS} self-created groups. Leave or delete one to make room for a new group.`}
            >
              <Button
                variant="secondary"
                onClick={() => router.push("/home")}
              >
                Back to home
              </Button>
            </EmptyState>
          </div>
        </div>
      </div>
    )
  }

  const canSubmit =
    !!displayName.trim() &&
    !!handle.trim() &&
    !nameError &&
    !handleError &&
    !isCreating

  return (
    <form onSubmit={handleSubmit}>
      <article className="project-detail-page project-detail--wide create-project create-group">
        <div className="project-detail">
          {/* Avatar (circular) on the left, banner image on the
              right — both pickers sit on a single header row so the
              identity inputs are introduced before the text fields.
              The avatar is square-aspect inside its tile and given
              `border-radius: 50%` so the preview reads as a circle
              that matches how the avatar will render everywhere else
              in the app. The banner keeps the project-form hero
              aspect via `flex: 1`. */}
          <div className="create-group__identity-row">
            <div className="create-group__identity-col">
              <span className="project-detail__meta-label">
                <Users size={11} strokeWidth={2} aria-hidden />
                Avatar
              </span>
              <div
                className={
                  avatarPreviewUrl
                    ? "create-group__avatar-tile"
                    : "create-group__avatar-tile create-group__avatar-tile--placeholder"
                }
              >
                {avatarPreviewUrl ? (
                  <Image
                    src={avatarPreviewUrl}
                    alt=""
                    fill
                    className="create-group__avatar-img"
                    unoptimized
                  />
                ) : (
                  <Users
                    size={36}
                    strokeWidth={1.25}
                    aria-hidden
                    className="create-group__avatar-placeholder-icon"
                  />
                )}
                <ImageEditOverlay
                  onFile={handleAvatarFile}
                  hasPending={!!avatarFile}
                  variant="with-remove"
                  onRemove={handleAvatarRemove}
                  hasImage={!!avatarFile}
                />
              </div>
            </div>

            <div className="create-group__identity-col">
              <span className="project-detail__meta-label">
                <ImageIcon size={11} strokeWidth={2} aria-hidden />
                Banner
              </span>
              <div
                className={
                  bannerPreviewUrl
                    ? "project-detail__hero create-project__hero create-group__banner-tile"
                    : "project-detail__hero project-detail__hero--placeholder create-project__hero create-group__banner-tile"
                }
              >
                {bannerPreviewUrl ? (
                  <Image
                    src={bannerPreviewUrl}
                    alt=""
                    fill
                    className="project-detail__hero-img"
                    unoptimized
                  />
                ) : (
                  <ImageIcon
                    size={48}
                    strokeWidth={1.25}
                    aria-hidden
                    className="project-detail__hero-placeholder-icon"
                  />
                )}
                <ImageEditOverlay
                  onFile={handleBannerFile}
                  hasPending={!!bannerFile}
                  variant="with-remove"
                  onRemove={handleBannerRemove}
                  hasImage={!!bannerFile}
                />
              </div>
            </div>
          </div>

          <header className="cert-detail__headline">
            <div className="create-cert__input-with-counter">
              <input
                type="text"
                className="cert-detail__title-input"
                aria-label="Display name"
                placeholder="Display name for your group"
                value={displayName}
                maxLength={64}
                onChange={(e) => {
                  setDisplayName(e.target.value)
                  if (nameError) validateName(e.target.value)
                }}
                autoFocus
              />
              <p className="create-cert__counter" aria-live="polite">
                {displayName.length}/64 · required
              </p>
              {nameError ? (
                <p
                  className="create-cert__counter create-cert__counter--over"
                  role="alert"
                >
                  {nameError}
                </p>
              ) : null}
            </div>
          </header>

          <section className="cert-detail__section create-group__about">
            <span className="project-detail__meta-label">
              <FileText size={11} strokeWidth={2} aria-hidden />
              About
            </span>
            <div className="create-cert__input-with-counter">
              <textarea
                className="cert-detail__short-desc-input"
                value={shortDescription}
                placeholder="A short description of your group (optional)"
                aria-label="Short description"
                onChange={(e) => setShortDescription(e.target.value)}
                rows={3}
                maxLength={3000}
              />
              <p className="create-cert__counter" aria-live="polite">
                {shortDescription.length}/3000
              </p>
            </div>
          </section>

          <section className="project-detail__meta create-project__meta">
            <div className="project-detail__meta-row">
              <span className="project-detail__meta-label">
                <AtSign size={11} strokeWidth={2} aria-hidden />
                Handle
              </span>
              <input
                type="text"
                className="cert-detail__meta-input create-cert__field--full"
                aria-label="Handle"
                placeholder="my-group"
                value={handle}
                maxLength={32}
                onChange={(e) => {
                  // Force lowercase + strip spaces so the rule the
                  // validator enforces is visible as the user types.
                  const cleaned = e.target.value
                    .toLowerCase()
                    .replace(/\s+/g, "")
                  setHandle(cleaned)
                  if (handleError) validateHandle(cleaned)
                }}
              />
              {handleError ? (
                <p
                  className="create-cert__contrib-error"
                  role="alert"
                  style={{ marginTop: 4 }}
                >
                  {handleError}
                </p>
              ) : null}
            </div>

            <div className="project-detail__meta-row">
              <span className="project-detail__meta-label">
                <Globe size={11} strokeWidth={2} aria-hidden />
                Website
              </span>
              <input
                type="url"
                className="cert-detail__meta-input create-cert__field--full"
                aria-label="Website"
                placeholder="https://your-group.org"
                value={website}
                maxLength={2048}
                onChange={(e) => setWebsite(e.target.value)}
                autoComplete="off"
              />
            </div>

            <div className="project-detail__meta-row">
              <span className="project-detail__meta-label">
                <Calendar size={11} strokeWidth={2} aria-hidden />
                Founded
              </span>
              <input
                type="date"
                className="cert-detail__meta-input"
                aria-label="Founded date"
                value={foundedDate}
                onChange={(e) => setFoundedDate(e.target.value)}
              />
            </div>

            <div className="project-detail__meta-row project-detail__meta-row--wide">
              <span className="project-detail__meta-label">
                <Building2 size={11} strokeWidth={2} aria-hidden />
                Organization type
              </span>
              <input
                type="text"
                className="cert-detail__meta-input create-cert__field--full"
                aria-label="Organization type"
                placeholder="e.g. non-profit, cooperative, DAO (comma-separated)"
                value={organizationType}
                onChange={(e) => setOrganizationType(e.target.value)}
              />
            </div>
          </section>

          {error ? (
            <p className="cert-detail__error-desc" role="alert">
              {error}
            </p>
          ) : null}

          <div className="create-cert__actions">
            <Button
              type="button"
              variant="ghost"
              onClick={() => router.push("/home")}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={isCreating}
              disabled={!canSubmit}
            >
              {isCreating ? "Creating…" : "Create group"}
            </Button>
          </div>

          <p className="settings__note">
            Already have an account you want to use as a group?{" "}
            <button
              type="button"
              className="cursor-pointer border-0 bg-transparent p-0 text-[var(--fg-primary)] underline disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => router.push("/groups/import")}
              disabled={isCreating}
            >
              Import an existing account
            </button>
          </p>
        </div>
      </article>
    </form>
  )
}
