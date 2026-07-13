"use client"

import { memo } from "react"
import Link from "next/link"
import { User } from "lucide-react"
import Avatar from "@/components/ui/avatar"
import { useAuthorInfo } from "@/hooks/use-author-info"
import { deriveIdentity } from "@/lib/utils/identity"
import { truncateDid } from "@/lib/utils/did"
import type { NetworkActor } from "@/lib/atproto/workspace"

/**
 * Gallery-view actor card for the /explore Accounts tab.
 *
 * Layout (top-aligned, vertical):
 *
 *   ┌──────────────────────────────┐
 *   │  [avatar] Display name       │
 *   │           @handle            │
 *   │                              │
 *   │  Description text, clamped   │
 *   │  to three lines when long.   │
 *   └──────────────────────────────┘
 *
 * The card uses `useAuthorInfo` to resolve the real Bluesky handle
 * (the `NetworkActor` carries only the DID + a display name from the
 * Certified actor record, which is sparse).
 */
function ExploreUserCard({
  actor,
}: {
  actor: NetworkActor
}) {
  const { info } = useAuthorInfo(actor.did)
  // Record-level name/avatar (from the Certified actor record) outrank
  // the resolved Bluesky profile; unresolved DIDs fall back to the
  // truncated form. The profile href prefers the handle so the URL is
  // readable.
  const { displayName, handle, initials, profileHref, avatarUrl } =
    deriveIdentity(info, actor.did, {
      preferredName: actor.displayName,
      preferredAvatarUrl: actor.avatarUrl,
    })
  const description = actor.description ?? null

  return (
    <Link href={profileHref} className="explore-user-card">
      <header className="explore-user-card__head">
        <Avatar
          size="lg"
          src={avatarUrl ?? undefined}
          alt=""
          fallbackInitials={initials}
          className="explore-user-card__avatar"
        />
        <div className="explore-user-card__id">
          <h3 className="explore-user-card__name">{displayName}</h3>
          {handle ? (
            <p className="explore-user-card__handle">@{handle}</p>
          ) : (
            <p className="explore-user-card__handle explore-user-card__handle--did">
              <User size={11} strokeWidth={1.75} aria-hidden />
              {truncateDid(actor.did)}
            </p>
          )}
        </div>
      </header>
      {description ? (
        <p className="explore-user-card__desc">{description}</p>
      ) : null}
    </Link>
  )
}

export default memo(ExploreUserCard)
