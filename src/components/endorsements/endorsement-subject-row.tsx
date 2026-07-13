"use client"

import Link from "next/link"
import Avatar from "@/components/ui/avatar"
import Skeleton from "@/components/ui/skeleton"
import { deriveIdentity } from "@/lib/utils/identity"
import { formatShortDate } from "@/lib/utils/format-date"
import type { AuthorInfo } from "@/hooks/use-author-info"

/** Per-surface BEM class hooks. Each endorsement surface keeps its
 *  existing stylesheet; the shared row only owns the markup shape. */
export interface EndorsementSubjectRowClasses {
  /** The `<Link>` (or href-less `<div>`) wrapping avatar + text. */
  main: string
  /** The name / handle / note column next to the avatar. */
  meta: string
  name: string
  handle: string
  note: string
  date: string
}

export interface EndorsementSubjectRowProps {
  /** Subject (or issuer) DID. Null renders an unlinked "Unknown" row. */
  did: string | null
  /** Resolved profile info. Hydration stays in the caller — the
   *  Received tab prefers indexer-embedded issuer data over a fresh
   *  PDS resolve, so the row must never fetch on its own. */
  info: AuthorInfo | null
  /** True while `info` is still resolving — gates the avatar skeleton. */
  isLoading?: boolean
  /** ISO timestamp of when the endorsement was created. */
  createdAt: string
  /** Optional issuer-provided note (badge.award.note). */
  note?: string
  /** @default "md" */
  avatarSize?: "sm" | "md"
  /** Card surfaces stack the date inside the meta column; list
   *  surfaces right-align it as a sibling of the link. */
  dateInMeta?: boolean
  classes: EndorsementSubjectRowClasses
  /** Trailing control (revoke button / response menu), rendered last. */
  trailing?: React.ReactNode
}

const skeletonPx = { sm: 32, md: 48 } as const

/**
 * Canonical endorsement subject row: avatar + display name + @handle +
 * optional note + created date, linking through to the subject's
 * profile. One markup shape for the standalone /endorsements page, the
 * profile lists panel, and the profile endorsements list view — so the
 * identity fallbacks (`deriveIdentity`), the avatar-skeleton gate, and
 * the `<time>` semantics stay in lockstep across all three. The date
 * renders outside the profile link (it isn't link content); callers own
 * the surrounding `<li>` so checkboxes / data-attributes stay local.
 */
export default function EndorsementSubjectRow({
  did,
  info,
  isLoading = false,
  createdAt,
  note,
  avatarSize = "md",
  dateInMeta = false,
  classes,
  trailing,
}: EndorsementSubjectRowProps) {
  const identity = deriveIdentity(
    info,
    did ?? "",
    did ? undefined : { fallbackLabel: "Unknown" },
  )
  const href = did ? identity.profileHref : null

  const time = (
    <time
      className={classes.date}
      dateTime={createdAt}
      title={new Date(createdAt).toLocaleString()}
    >
      {formatShortDate(createdAt)}
    </time>
  )

  const body = (
    <>
      {isLoading && !info ? (
        <Skeleton
          circle
          animate={false}
          width={skeletonPx[avatarSize]}
          height={skeletonPx[avatarSize]}
        />
      ) : (
        <Avatar
          size={avatarSize}
          src={identity.avatarUrl ?? undefined}
          alt=""
          fallbackInitials={identity.initials}
        />
      )}
      <span className={classes.meta}>
        <span className={classes.name}>{identity.displayName}</span>
        {identity.handle ? (
          <span className={classes.handle}>@{identity.handle}</span>
        ) : null}
        {dateInMeta ? time : null}
        {note ? <span className={classes.note}>{note}</span> : null}
      </span>
    </>
  )

  return (
    <>
      {href ? (
        <Link href={href} className={classes.main}>
          {body}
        </Link>
      ) : (
        <div className={classes.main}>{body}</div>
      )}
      {dateInMeta ? null : time}
      {trailing ?? null}
    </>
  )
}
