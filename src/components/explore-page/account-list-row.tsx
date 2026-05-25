"use client"

import Link from "next/link"
import { User } from "lucide-react"
import Avatar from "@/components/ui/avatar"
import { useAuthorInfo } from "@/hooks/use-author-info"
import { getInitials } from "@/lib/utils/initials"
import type { NetworkActor } from "@/lib/atproto/workspace"
import type { EndorsementClosureAccount } from "@/lib/atproto/indexer"
import EndorsementRowBadge from "./endorsement-row-badge"

/**
 * Dense single-row representation of an account for the /explore list
 * view. Uses its own `.account-list-row` chrome — separate from the
 * cert/project list rows because the columnar shape is different: the
 * identity block (avatar + display name + @handle) leads, with the
 * description occupying the wide middle, and the endorsement-degree
 * pill (when present) anchored right.
 *
 *   ┌─────────────────────────────────────────────────────────┐
 *   │ [AV] Display name @handle    Description text…    [1st] │
 *   └─────────────────────────────────────────────────────────┘
 */
export default function AccountListRow({
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
  const description = actor.description ?? null
  const initials = getInitials(displayName, actor.did)
  const profileHref = `/profile/${encodeURIComponent(handle || actor.did)}`

  return (
    <article className="account-list-row">
      <Link href={profileHref} className="account-list-row__link">
        <Avatar
          size="md"
          src={avatarUrl ?? undefined}
          alt=""
          fallbackInitials={initials}
          className="account-list-row__avatar"
        />
        <div className="account-list-row__body">
          <div className="account-list-row__id">
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
          {description ? (
            <p className="account-list-row__desc">{description}</p>
          ) : null}
        </div>
      </Link>
      {endorsementMeta ? (
        <div className="account-list-row__badge">
          <EndorsementRowBadge meta={endorsementMeta} />
        </div>
      ) : null}
    </article>
  )
}

function truncateDid(did: string): string {
  return did.length > 24 ? `${did.slice(0, 16)}…${did.slice(-6)}` : did
}
