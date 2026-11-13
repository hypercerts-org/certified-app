"use client"

import Link from "next/link"
import Avatar from "@/components/ui/avatar"
import type { ReceivedEndorsement } from "@/hooks/use-received-endorsements"
import { formatRelativeDate } from "@/lib/utils/format-date"
import { useEndorserIdentity } from "@/components/profile/use-endorser-identity"

/**
 * One received endorsement as a compact row (32px avatar, 14px name, 12px
 * date): the endorser's avatar, then their name with the date beside it,
 * and their note under them, linking to the endorser's profile. The one
 * endorsement row, used by the Workspace Overview's "Endorsements and
 * followers" and the profile Overview's "Endorsements received"; styles
 * are the `profile-overview__endorse-*` classes (layout.css).
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
        <Avatar
          size="sm"
          src={avatarSrc}
          fallbackInitials={initials}
          seed={endorsement.issuerDid}
        />
        <span className="profile-overview__endorse-meta">
          <span className="profile-overview__endorse-name" dir="auto" data-part="who">
            {displayName}
          </span>
          <time
            className="profile-overview__endorse-when"
            dateTime={endorsement.createdAt}
            data-part="when"
          >
            {formatRelativeDate(endorsement.createdAt)}
          </time>
        </span>
        {endorsement.note ? (
          <span className="profile-overview__endorse-note" dir="auto" data-part="note">
            {endorsement.note}
          </span>
        ) : null}
      </Link>
    </li>
  )
}
