"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { ArrowLeftRight, Image as ImageIcon, Users } from "lucide-react"
import { useAuth } from "@/lib/auth/auth-context"
import { useOrg } from "@/lib/groups/org-context"
import { useOrgCreationLimit } from "@/lib/groups/use-org-limit"
import { usePageTitle } from "@/lib/navbar-context"
import { MAX_SELF_CREATED_ORGS } from "@/lib/groups/constants"
import {
  registerGroup,
  RegisterGroupError,
  putOrgProfile,
  putOrgMetadata,
  createBskyProfile,
  uploadOrgBlob,
} from "@/lib/groups/api"
import Button from "@/components/ui/button"
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard"
import ConfirmDialog from "@/components/ui/confirm-dialog"
import EmptyState from "@/components/ui/empty-state"
import Input from "@/components/ui/input"
import LoadingSpinner from "@/components/ui/loading-spinner"
import Textarea from "@/components/ui/textarea"
import PageContainer from "@/components/ui/page-container"
import PageHeader from "@/components/ui/page-header"
import FormActionBar from "@/components/create/form-action-bar"
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
 * website, founded date, organization type). The fields are the
 * `Input` / `Textarea` primitives at their default size, as on New
 * activity and in Settings (44px; 14px text from 800px, 16px below);
 * the display name is New activity's title field (serif h3 role).
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
  // Required sign-in email for the group account — its recovery anchor (you
  // can't set it later without the password, nor reset the password without
  // it). Must be unique on the PDS; there's no availability check (it would
  // leak registered emails), so a duplicate is rejected at registration.
  const [email, setEmail] = useState("")

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
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nameError, setNameError] = useState("")
  const [handleError, setHandleError] = useState("")
  const [emailError, setEmailError] = useState("")

  const isDirty =
    !isCreating &&
    ([
      displayName,
      handle,
      shortDescription,
      website,
      email,
      organizationType,
      foundedDate,
    ].some((v) => v.trim() !== "") ||
      !!avatarFile ||
      !!bannerFile)
  const { confirmDiscard } = useUnsavedChangesGuard(isDirty)

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

  // Email is required: it's the group account's recovery anchor (you can't set
  // it later without the password, and can't reset the password without it).
  const validateEmail = (value: string) => {
    const v = value.trim()
    if (!v) {
      setEmailError("Email is required")
      return false
    }
    if (v.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
      setEmailError("Enter a valid email address")
      return false
    }
    setEmailError("")
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

  // Clicking "Create group" validates, then opens a confirmation modal so the
  // user can verify the (permanent, recovery-critical) email before we create.
  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!did) return

    const nameValid = validateName(displayName)
    const handleValid = validateHandle(handle)
    const emailValid = validateEmail(email)
    if (!nameValid || !handleValid || !emailValid) {
      // Submit stays enabled; the validators above paint the inline
      // errors, so move focus to the first field that needs attention.
      const firstInvalid = !nameValid
        ? "create-group-name"
        : !handleValid
          ? "create-group-handle"
          : "create-group-email"
      document.getElementById(firstInvalid)?.focus()
      return
    }

    setConfirmOpen(true)
  }

  const doCreate = async () => {
    if (!did) return

    setIsCreating(true)
    setError(null)

    try {
      // 1. Mint the group DID
      const result = await registerGroup(handle, did, email.trim())
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

      await refetchOrgs()
      router.push("/home")
    } catch (err) {
      console.error("[groups/create] failed", err)
      const message =
        err instanceof Error ? err.message : "Failed to create group"
      if (
        err instanceof RegisterGroupError &&
        err.code === "HandleNotAvailable"
      ) {
        setHandleError(
          "This handle is already taken. Please choose another.",
        )
      } else if (
        /email/i.test(message) &&
        /(taken|in use|already|exist|registered)/i.test(message)
      ) {
        // The PDS rejects a duplicate email at registration — surface it on
        // the field rather than as a generic error.
        setEmailError("That email is already in use. Try another.")
      } else {
        setError(message)
      }
    } finally {
      setIsCreating(false)
      setConfirmOpen(false)
    }
  }

  // The page's one header (DESIGN.md §9.13), shared by every state below so
  // the page keeps its frame while auth and the group count resolve.
  const pageHeader = (
    <PageHeader
      back={{ href: "/home", label: "Workspace" }}
      title="New group"
      description="A shared account your team can publish records as."
    />
  )

  // Still resolving auth or the self-created-org count.
  if (authLoading || isChecking) {
    return (
      <PageContainer>
        {pageHeader}
        <div className="flex justify-center py-16">
          <LoadingSpinner size="md" />
        </div>
      </PageContainer>
    )
  }

  // Auth has settled but there's no signed-in account. Previously the
  // limit hook stayed in its "checking" state forever when `did` was
  // null, leaving this page stuck on an infinite spinner with no way
  // out. Render a recoverable state with a clear primary action instead.
  if (!did) {
    return (
      <PageContainer>
        {pageHeader}
        <EmptyState
          icon={Users}
          title="Sign in to create a group"
          description="You need to be signed in to start a new group."
          headingLevel={2}
        >
          <Button variant="primary" onClick={() => openSignIn()}>
            Sign in
          </Button>
        </EmptyState>
      </PageContainer>
    )
  }

  if (limitReached) {
    return (
      <PageContainer>
        {pageHeader}
        <EmptyState
          icon={Users}
          title="Group limit reached"
          description={`You've reached the limit of ${MAX_SELF_CREATED_ORGS} self-created groups. Leave or delete one to make room for a new group.`}
          headingLevel={2}
        >
          <Button variant="secondary" href="/home">
            Back to Workspace
          </Button>
        </EmptyState>
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      {pageHeader}
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
                <span className="project-detail__meta-label">Avatar</span>
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
                <span className="project-detail__meta-label">Banner</span>
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
                {/* The title-style field, as New activity's title: the
                    Input primitive in the record title's serif role. */}
                <Input
                  flush
                  type="text"
                  id="create-group-name"
                  className="font-headline !text-h3"
                  aria-label="Display name"
                  aria-describedby={
                    nameError ? "create-group-name-error" : "create-group-name-counter"
                  }
                  aria-invalid={!!nameError || undefined}
                  placeholder="Display name for your group"
                  value={displayName}
                  maxLength={64}
                  onChange={(e) => {
                    setDisplayName(e.target.value)
                    if (nameError) validateName(e.target.value)
                  }}
                  autoFocus
                />
                <p className="create-cert__counter" id="create-group-name-counter">
                  {displayName.length}/64 · required
                </p>
                {nameError ? (
                  <p
                    id="create-group-name-error"
                    className="create-cert__counter create-cert__counter--over"
                    role="alert"
                  >
                    {nameError}
                  </p>
                ) : null}
              </div>
            </header>

            <section className="cert-detail__section create-group__about">
              <label htmlFor="create-group-about" className="project-detail__meta-label">
                About
              </label>
              <div className="create-cert__input-with-counter">
                <Textarea
                  flush
                  id="create-group-about"
                  value={shortDescription}
                  placeholder="A short description of your group (optional)"
                  aria-describedby="create-group-desc-counter"
                  onChange={(e) => setShortDescription(e.target.value)}
                  rows={3}
                  maxLength={3000}
                />
                <p className="create-cert__counter" id="create-group-desc-counter">
                  {shortDescription.length}/3000
                </p>
              </div>
            </section>

            <section className="project-detail__meta create-project__meta create-group__account">
              <Input
                type="text"
                id="create-group-handle"
                label="Handle"
                helperText="How people find this group on Certified."
                error={handleError || undefined}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
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

              <Input
                type="email"
                id="create-group-email"
                label="Email"
                helperText="Sign-in and recovery — use an address you control."
                error={emailError || undefined}
                autoCapitalize="none"
                spellCheck={false}
                placeholder="group@example.com"
                value={email}
                maxLength={254}
                autoComplete="off"
                onChange={(e) => {
                  setEmail(e.target.value)
                  if (emailError) validateEmail(e.target.value)
                }}
                onBlur={(e) => validateEmail(e.target.value)}
              />
            </section>

            <section className="project-detail__meta create-project__meta">
              <Input
                type="url"
                label="Website"
                placeholder="https://your-group.org"
                value={website}
                maxLength={2048}
                onChange={(e) => setWebsite(e.target.value)}
                autoComplete="off"
              />

              <Input
                type="date"
                label="Founded"
                value={foundedDate}
                onChange={(e) => setFoundedDate(e.target.value)}
              />

              <Input
                type="text"
                label="Organization type"
                placeholder="e.g. non-profit, cooperative, DAO (comma-separated)"
                value={organizationType}
                onChange={(e) => setOrganizationType(e.target.value)}
              />
            </section>

            <aside className="create-group__convert">
              <ArrowLeftRight
                size={16}
                strokeWidth={2}
                aria-hidden
                className="create-group__convert-icon"
              />
              <div className="create-group__convert-body">
                <p className="create-group__convert-title">
                  Already have an account for this group?
                </p>
                <p className="create-group__convert-text">
                  Log in as that account, then open{" "}
                  <span className="create-group__convert-path">
                    Settings → Group account
                  </span>{" "}
                  to convert it.
                </p>
              </div>
            </aside>
          </div>
        </article>

        {/* No "Publishing as" line: a new group is its own account, created
            from your personal one. */}
        <FormActionBar
          submitLabel="Create group"
          submittingLabel="Creating…"
          isSubmitting={isCreating}
          error={error}
          identityLabel={null}
          onCancel={() => {
            if (confirmDiscard()) router.push("/home")
          }}
        />

        {confirmOpen ? (
          <ConfirmDialog
            title="Confirm the group's email"
            message={`This group will sign in and recover with ${email.trim()}. You'll need access to this inbox to reset its password or manage the account later, so make sure it's correct. Re-enter it below to confirm.`}
            confirmPhrase={email.trim()}
            confirmLabel="Create group"
            cancelLabel="Back"
            confirmVariant="primary"
            onCancel={() => setConfirmOpen(false)}
            onConfirm={doCreate}
          />
        ) : null}
      </form>
    </PageContainer>
  )
}
