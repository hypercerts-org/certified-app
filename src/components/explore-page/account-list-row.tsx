"use client"

import { memo } from "react"
import Link from "next/link"
import { profileUrl } from "@/lib/urls"
import { User } from "lucide-react"
import Avatar from "@/components/ui/avatar"
import { useAuthorInfo } from "@/hooks/use-author-info"
import { getInitials } from "@/lib/utils/initials"
import { formatShortDate } from "@/lib/utils/format-date"
import { truncateDid } from "@/lib/utils/did"
import type { NetworkActor } from "@/lib/atproto/workspace"
import type { EndorsementClosureAccount } from "@/lib/atproto/indexer"
import EndorsementRowBadge from "./endorsement-row-badge"

/**
 * Dense single-row representation of an account for the /explore list
 * view. Three columns:
 *
 *   ┌─────────────────────────────────────────────────────────┐
 *   │ [AV] Display name             [endorsement]  Joined Mar │
 *   │      @handle                                     5, 2025│
 *   └─────────────────────────────────────────────────────────┘
 *
 * Identity block (avatar + name + @handle stacked) on the left, the
 * endorsement-degree badge (when present) in the middle, and the
 * profile's `createdAt` formatted as a "Joined …" date anchored
 * right. The createdAt comes from the `app.certified.actor.profile`
 * record — null on legacy profiles indexed before the field was
 * emitted, in which case the column collapses.
 */
function AccountListRow({
  actor,
  endorsementMeta,
}: {
  actor: NetworkActor
  endorsementMeta?: EndorsementClosureAccount
}) {
  const { info } = useAuthorInfo(actor.did)
  const displayName =
    actor.displayName ||
    info?.displayName ||
    info?.handle ||
    truncateDid(actor.did)
  const handle = info?.handle ?? null
  const avatarUrl = actor.avatarUrl || info?.avatarUrl || null
  const initials = getInitials(displayName, handle)
  const profileHref = profileUrl(handle || actor.did)

  return (
    <article className="account-list-row">
      <Link href={profileHref} className="account-list-row__link">
        <Avatar
          size="md"
          src={avatarUrl ?? undefined}
          alt=""
          fallbackInitials={initials}
          seed={actor.did}
          className="account-list-row__avatar"
        />
        <div className="account-list-row__body">
          <span className="account-list-row__name">{displayName}</span>
          {handle ? (
            <span className="account-list-row__handle">@{handle}</span>
          ) : (
            <span className="account-list-row__handle account-list-row__handle--did">
              <User size={11} strokeWidth={1.75} aria-hidden />
              {truncateDid(actor.did)}
            </span>
          )}
        </div>
      </Link>
      {endorsementMeta ? (
        <div className="account-list-row__badge">
          <EndorsementRowBadge meta={endorsementMeta} />
        </div>
      ) : null}
      {actor.createdAt ? (
        <time
          className="account-list-row__joined"
          dateTime={actor.createdAt}
          title={`Joined ${actor.createdAt}`}
        >
          Joined {formatShortDate(actor.createdAt)}
        </time>
      ) : null}
    </article>
  )
}

export default memo(AccountListRow)
