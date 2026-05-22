"use client"

import Link from "next/link"
import type { NetworkActor } from "@/lib/atproto/workspace"

/**
 * Compact actor card for the /explore Users grid.
 *
 * Mirrors the visual density of the existing ActivityCard (used in
 * the certs grid) so the three explore kinds read as one family of
 * cards. Click takes the viewer to the actor's profile.
 */
export default function ExploreUserCard({
  actor,
}: {
  actor: NetworkActor
}) {
  const initial = (actor.displayName ?? actor.did.slice(8))
    .charAt(0)
    .toUpperCase()
  return (
    <Link
      href={`/profile/${encodeURIComponent(actor.did)}`}
      className="explore-user-card"
    >
      <div className="explore-user-card__avatar-wrap">
        {actor.avatarUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={actor.avatarUrl}
            alt=""
            className="explore-user-card__avatar"
            loading="lazy"
          />
        ) : (
          <span className="explore-user-card__initial">{initial}</span>
        )}
      </div>
      <div className="explore-user-card__body">
        <span className="explore-user-card__name">
          {actor.displayName ?? truncateDid(actor.did)}
        </span>
        {actor.description ? (
          <span className="explore-user-card__desc">{actor.description}</span>
        ) : null}
      </div>
    </Link>
  )
}

function truncateDid(did: string): string {
  return did.length > 24 ? `${did.slice(0, 16)}…${did.slice(-6)}` : did
}
