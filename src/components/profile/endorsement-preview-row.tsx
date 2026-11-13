"use client"

import Link from "next/link"
import Avatar from "@/components/ui/avatar"
import type { ReceivedEndorsement } from "@/hooks/use-received-endorsements"
import { formatShortDate } from "@/lib/utils/format-date"
import { useEndorserIdentity } from "@/components/profile/use-endorser-identity"

/**
 * One received endorsement as a compact row: issuer avatar, name, date and
 * note, linking to the issuer's profile. Used by the signed-in home's "From
 * others" section; styles are the `profile-overview__endorse-*` classes.
 * The public profile's Overview renders the same data as a statement
 * (`EndorsementStatement` in profile-overview.tsx).
 */
interface EndorsementPreviewRowProps {
  readonly endorsement: ReceivedEndorsement
}

export function EndorsementPreviewRow({ endorsement }: EndorsementPreviewRowProps) {
  const { displayName, avatarSrc, initials, href } =
    useEndorserIdentity(endorsement)

  return (
    // An endorsement: a centerpiece every style can redraw (looks.css),
    // its parts marked with data-part.
    <li className="profile-overview__endorse-item" data-centerpiece="endorsement">
      <Link href={href} className="profile-overview__endorse-link">
        <Avatar size="sm" src={avatarSrc} fallbackInitials={initials} />
        <span className="profile-overview__endorse-meta">
          <span className="profile-overview__endorse-name" dir="auto" data-part="who">
            {displayName}
          </span>
          <span className="profile-overview__endorse-when" data-part="when">
            {formatShortDate(endorsement.createdAt)}
          </span>
        </span>
        {endorsement.note ? (
          <span className="profile-overview__endorse-note" data-part="note">
            {endorsement.note}
          </span>
        ) : null}
      </Link>
    </li>
  )
}
