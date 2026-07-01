"use client"

import Link from "next/link"
import { profileUrl } from "@/lib/urls"
import type { AuthorInfo } from "@/hooks/use-author-info"
import Avatar from "@/components/ui/avatar"
import { formatShortDate } from "@/lib/utils/format-date"
import { getInitials } from "@/lib/utils/initials"

/**
 * Shared person row used by the profile Endorsements and Followers
 * tabs. Both surfaces previously defined an identical card locally
 * (the followers copy was a strict subset of the endorsements copy);
 * this is the superset — `note` and `listTitle` are optional and only
 * render when supplied, so the followers surface (which passes
 * neither) renders byte-identically to its former local copy.
 *
 * Layout: avatar + a vertical stack — name (row 1), @handle (row 2),
 * date (row 3), list name (row 4 when present), note (when present).
 * `menu` is an optional top-right action slot (revoke / unfollow).
 */
export default function PersonCard({
  did,
  info,
  isLoadingInfo,
  createdAt,
  note,
  listTitle,
  menu,
}: {
  did: string
  info: AuthorInfo | null
  isLoadingInfo: boolean
  createdAt: string
  /** Optional endorsement note rendered below the date row. */
  note?: string
  /** Optional name of the list this endorsement was awarded under.
   *  When set, renders as a 4th row in the card. Omitted for default
   *  "Endorsement" awards (and for surfaces that ARE a list view,
   *  where the context is implicit). */
  listTitle?: string
  /** Top-right action slot — used by the Given / Following grids to
   *  plug in the per-card revoke / unfollow affordance. */
  menu?: React.ReactNode
}) {
  const displayName = info?.displayName || info?.handle || did
  const handle = info?.handle && info.handle !== info.did ? info.handle : null
  const initials = getInitials(info?.displayName, info?.handle ?? did)
  const href = profileUrl(info?.handle || did)

  return (
    <li className="profile-endorsements-v2__card">
      <Link href={href} className="profile-endorsements-v2__card-link">
        {isLoadingInfo && !info ? (
          <div
            className="profile-endorsements-v2__card-avatar-skel"
            aria-hidden="true"
          />
        ) : (
          <Avatar
            size="md"
            src={info?.avatarUrl || undefined}
            alt=""
            fallbackInitials={initials}
            seed={did}
          />
        )}
        {/* Vertical stack — name (row 1), @handle (row 2), date
            (row 3), list name (row 4 when present). The previous
            layout pinned the date to the right of the name; lifting
            it into its own row keeps the card visually scannable
            even when the list-name row appears below it. */}
        <div className="profile-endorsements-v2__card-body">
          <span className="profile-endorsements-v2__card-name">
            {displayName}
          </span>
          {handle ? (
            <span className="profile-endorsements-v2__card-handle">
              @{handle}
            </span>
          ) : null}
          <time
            dateTime={createdAt}
            className="profile-endorsements-v2__card-date"
            title={new Date(createdAt).toLocaleString()}
          >
            {formatShortDate(createdAt)}
          </time>
          {listTitle ? (
            <span
              className="profile-endorsements-v2__card-list"
              title={`From list: ${listTitle}`}
            >
              {listTitle}
            </span>
          ) : null}
          {note ? (
            <p className="profile-endorsements-v2__card-note">{note}</p>
          ) : null}
        </div>
      </Link>
      {menu ? (
        <div className="profile-endorsements-v2__card-menu">{menu}</div>
      ) : null}
    </li>
  )
}
