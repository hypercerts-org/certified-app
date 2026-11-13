"use client"

import { useId } from "react"
import { Pencil } from "lucide-react"
import Avatar from "@/components/ui/avatar"
import Button from "@/components/ui/button"
import Card from "@/components/ui/card"
import PageHeader from "@/components/ui/page-header"
import SectionHeader from "@/components/ui/section-header"
import Skeleton from "@/components/ui/skeleton"
import SmartLink from "@/components/ui/smart-link"
import CopyPill from "@/components/account/copy-pill"
import type { CertifiedProfile } from "@/lib/atproto/types"
import type { Group } from "@/lib/groups/types"
import { getInitials } from "@/lib/utils/initials"
import { profileUrl } from "@/lib/urls"

/** The account Home describes, as `useUserProfile` resolved it. */
export interface HomeIdentity {
  did: string
  profile: CertifiedProfile | null
  avatarUrl: string | null
  handle: string | null
  isLoading: boolean
}

/** The first non-empty line of a bio, so the header stays one line. */
export function bioFirstLine(text: string | undefined | null): string | null {
  if (!text) return null
  return (
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) ?? null
  )
}

/**
 * Home's page header is the identity strip: the account's avatar, its name
 * as the page's h1, the bio's first line (or the @handle when there is no
 * bio) with the website under it, and "Edit profile" / "View profile". It
 * describes whichever account the viewer is acting as, so a group admin
 * who switched into a group sees the group.
 */
export function HomeIdentityHeader({
  identity,
  activeGroup,
}: {
  identity: HomeIdentity
  /** Set when the viewer is acting as a group; null for the personal account. */
  activeGroup: Group | null
}) {
  const { did, profile, avatarUrl, handle, isLoading } = identity

  if (isLoading && !profile) return <HomeIdentityHeaderSkeleton />

  const isGroup = !!activeGroup
  const canManageGroup =
    isGroup && (activeGroup.role === "owner" || activeGroup.role === "admin")

  // Personal accounts edit on the settings form; a group is edited by its
  // owners and admins on the group's own form. A plain member acting as the
  // group gets no edit link.
  const editHref = !isGroup
    ? "/settings/edit-profile"
    : canManageGroup
      ? `/groups/${encodeURIComponent(did)}/edit-profile`
      : null

  const name = profile?.displayName?.trim() || activeGroup?.displayName?.trim() || null
  const title = name || (handle ? `@${handle}` : "Your account")
  // The @handle stands in for a missing bio, unless the title already is it.
  const tagline = bioFirstLine(profile?.description) ?? (name && handle ? `@${handle}` : null)
  const website = profile?.website?.trim() || null

  const description =
    tagline || website ? (
      <>
        {tagline ? (
          <span className="line-clamp-2" dir="auto">
            {tagline}
          </span>
        ) : null}
        {website ? (
          // SmartLink renders the site's icon and the link as siblings.
          <span className="mt-1 flex min-w-0 items-center gap-2 text-[var(--fg-muted)] [&>svg]:shrink-0">
            <SmartLink
              url={website}
              className="min-w-0 truncate text-[var(--fg-secondary)] no-underline underline-offset-4 hover:underline"
            />
          </span>
        ) : null}
      </>
    ) : undefined

  return (
    <PageHeader
      visual={
        <Avatar
          size="lg"
          src={avatarUrl || activeGroup?.avatarUrl || undefined}
          fallbackInitials={getInitials(name, handle ?? did)}
          seed={did}
          shape={isGroup ? "square" : "circle"}
        />
      }
      title={<span dir="auto">{title}</span>}
      description={description}
      actions={
        <>
          {editHref ? (
            <Button href={editHref} variant="secondary" size="sm">
              <Pencil size={14} aria-hidden />
              Edit profile
            </Button>
          ) : null}
          <Button href={profileUrl(handle || did)} variant="secondary" size="sm">
            View profile
          </Button>
        </>
      }
    />
  )
}

/** The header's shape while the profile loads: avatar, name, one line. */
function HomeIdentityHeaderSkeleton() {
  return (
    <div className="mb-4 flex items-center gap-3" aria-hidden>
      <Skeleton variant="circle" width={64} />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Skeleton variant="line" width="min(240px, 60%)" height={28} />
        <Skeleton variant="line" width="min(360px, 80%)" height={14} />
      </div>
    </div>
  )
}

/**
 * The ID card: the account's handle and permanent ID (DID), each
 * click-to-copy, with the note that apps use it to identify the account.
 */
export function HomeIdCard({
  identity,
  isGroup,
}: {
  identity: HomeIdentity
  isGroup: boolean
}) {
  const { did, handle, isLoading } = identity
  const titleId = useId()

  return (
    <Card
      as="section"
      unpadded
      className="flex flex-col gap-4 p-5"
      aria-labelledby={titleId}
      data-tour="home-account"
    >
      <SectionHeader
        id={titleId}
        title="ID"
        description={
          isGroup
            ? "Identifies this group's account in every app."
            : "Identifies your account in every app."
        }
      />
      {/* Side by side while the card spans the one column (800-1099px);
          stacked on phones and in the 320px side column. */}
      <dl className="m-0 grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-x-6 lg:grid-cols-1">
        {handle || isLoading ? (
          <div className="flex min-w-0 flex-col gap-1.5">
            <dt className="text-ui font-medium text-[var(--fg-secondary)]">Handle</dt>
            <dd className="m-0 min-w-0">
              {handle ? (
                <CopyPill value={handle} display={`@${handle}`} label="handle" />
              ) : (
                <Skeleton variant="line" height={36} aria-hidden />
              )}
            </dd>
          </div>
        ) : null}
        <div className="flex min-w-0 flex-col gap-1.5">
          <dt className="text-ui font-medium text-[var(--fg-secondary)]">Permanent ID</dt>
          <dd className="m-0 min-w-0">
            <CopyPill value={did} label="permanent ID" />
          </dd>
        </div>
      </dl>
    </Card>
  )
}
