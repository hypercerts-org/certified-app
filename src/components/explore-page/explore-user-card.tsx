"use client"

import Link from "next/link"
import { profileUrl } from "@/lib/urls"
import { User } from "lucide-react"
import Avatar from "@/components/ui/avatar"
import { useAuthorInfo } from "@/hooks/use-author-info"
import { getInitials } from "@/lib/utils/initials"
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
export default function ExploreUserCard({
  actor,
}: {
  actor: NetworkActor
}) {
  const { info } = useAuthorInfo(actor.did)
  // Prefer the Certified-record display name, fall back to the
  // Bluesky profile name, fall back to the handle, fall back to a
  // truncated DID.
  const displayName =
    actor.displayName || info?.displayName || info?.handle || truncateDid(actor.did)
  const handle = info?.handle ?? null
  const avatarUrl = actor.avatarUrl || info?.avatarUrl || null
  const description = actor.description ?? null
  const initials = getInitials(displayName, actor.did)
  // Profile route accepts either a handle or a DID in the [handle]
  // slot — prefer the handle so the URL is readable.
  const profileHref = profileUrl(handle || actor.did)

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

function truncateDid(did: string): string {
  return did.length > 24 ? `${did.slice(0, 16)}…${did.slice(-6)}` : did
}
