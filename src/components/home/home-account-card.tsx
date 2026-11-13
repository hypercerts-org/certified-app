"use client"

import { useId } from "react"
import Link from "next/link"
import { Pencil } from "lucide-react"
import Avatar from "@/components/ui/avatar"
import Button from "@/components/ui/button"
import Tooltip from "@/components/ui/tooltip"
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

/** The name and @handle in the header link to the profile. */
const PROFILE_LINK_CLASS =
  "rounded text-inherit no-underline decoration-[var(--fg-muted)] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-2"

/**
 * Home's page header is the identity strip: the account's avatar, its name
 * as the page's h1, the bio's first line (or the @handle when there is no
 * bio) with the website under it. No buttons: the name (and the @handle)
 * open the profile, which has its own Edit button. It describes whichever
 * account the viewer is acting as, so a group admin who switched into a
 * group sees the group.
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
  const profileHref = profileUrl(handle || did)

  const name = profile?.displayName?.trim() || activeGroup?.displayName?.trim() || null
  const title = name || (handle ? `@${handle}` : "Your account")
  const bio = bioFirstLine(profile?.description)
  // The @handle stands in for a missing bio, unless the title already is it.
  const handleLine = !bio && name && handle ? `@${handle}` : null
  const website = profile?.website?.trim() || null

  const description =
    bio || handleLine || website ? (
      <>
        {bio ? (
          <span className="line-clamp-2" dir="auto">
            {bio}
          </span>
        ) : handleLine ? (
          <span className="block min-w-0 truncate">
            <Link href={profileHref} className={PROFILE_LINK_CLASS}>
              {handleLine}
            </Link>
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
      title={
        <Link href={profileHref} className={PROFILE_LINK_CLASS} dir="auto">
          {title}
        </Link>
      }
      description={description}
      className="!mb-0"
    />
  )
}

/** The header's shape while the profile loads: avatar, name, one line. */
function HomeIdentityHeaderSkeleton() {
  return (
    <div className="flex items-center gap-3" aria-hidden>
      <Skeleton variant="circle" width={64} />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Skeleton variant="line" width="min(240px, 60%)" height={28} />
        <Skeleton variant="line" width="min(360px, 80%)" height={14} />
      </div>
    </div>
  )
}

/**
 * The ID section: the account's handle and permanent ID (DID), each
 * click-to-copy, with the note that apps use it to identify the account.
 * Home puts it in a white box above Your groups: a section header, then
 * the two values between hairlines (home.css).
 */
export function HomeIdSection({
  identity,
  isGroup,
  canEditHandle,
}: {
  identity: HomeIdentity
  isGroup: boolean
  /** Show the pencil that leads to the handle in Settings: your own
   *  account, or a group you own or admin. */
  canEditHandle: boolean
}) {
  const { did, handle, isLoading } = identity
  const titleId = useId()

  return (
    <section
      className="flex min-w-0 flex-col gap-3"
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
      {/* Side by side while the section spans the one column
          (800-1099px); stacked on phones and in the 320px side column. */}
      <dl className="home-id">
        {handle || isLoading ? (
          <div className="home-id__item">
            <dt className="text-ui font-medium text-[var(--fg-secondary)]">Handle</dt>
            <dd className="m-0 min-w-0">
              {handle ? (
                // The pencil sits inside the copy box, left of the copy
                // icon, but is its own control (home.css).
                <div className={canEditHandle ? "home-id__handle" : undefined}>
                  <CopyPill value={handle} display={`@${handle}`} label="handle" />
                  {canEditHandle ? (
                    <Tooltip label="Change handle" className="home-id__edit">
                      <Button
                        href={
                          isGroup
                            ? `/groups/${encodeURIComponent(did)}/settings#account`
                            : "/settings#account"
                        }
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Change handle in Settings"
                      >
                        <Pencil size={14} strokeWidth={1.75} aria-hidden />
                      </Button>
                    </Tooltip>
                  ) : null}
                </div>
              ) : (
                <Skeleton variant="line" height={36} aria-hidden />
              )}
            </dd>
          </div>
        ) : null}
        <div className="home-id__item">
          <dt className="text-ui font-medium text-[var(--fg-secondary)]">Permanent ID</dt>
          <dd className="m-0 min-w-0">
            <CopyPill value={did} label="permanent ID" />
          </dd>
        </div>
      </dl>
    </section>
  )
}
