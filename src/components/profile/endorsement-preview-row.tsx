"use client"

import { useEffect, useRef } from "react"
import Link from "next/link"
import Avatar from "@/components/ui/avatar"
import type { ReceivedEndorsement } from "@/hooks/use-received-endorsements"
import { formatRelativeDate } from "@/lib/utils/format-date"
import { KindPendingAvatar, useAccountKind } from "@/components/feed/account-kind"
import { useEndorserIdentity } from "@/components/profile/use-endorser-identity"

/**
 * One received endorsement as a compact row (32px avatar, 14px name, 12px
 * date), drawn like the Overview's "Latest" records: the endorser's avatar
 * (in the shape of its kind: an organization square, a person round, a
 * neutral block while that isn't known), then their name over the date,
 * and their note under them, linking to the endorser's profile. The one
 * endorsement row, used by the Workspace Overview's "Endorsements and
 * followers" and the profile Overview's "Endorsed by"; styles are the
 * `profile-overview__endorse-*` classes (layout.css).
 *
 * With `onFailedChange`, a row whose endorser couldn't be looked up (and
 * that the indexer named no one for) leaves itself out and says so to the
 * section, which shows one "Couldn't load these accounts." line for all
 * of them; bumping `retryTick` looks them up again.
 */
interface EndorsementPreviewRowProps {
  readonly endorsement: ReceivedEndorsement
  /** Told whether this row's endorser failed to load (keyed by the award
   *  URI); the row then renders nothing. */
  readonly onFailedChange?: (key: string, failed: boolean) => void
  /** Bumped by the section's "Try again". */
  readonly retryTick?: number
}

export function EndorsementPreviewRow({
  endorsement,
  onFailedChange,
  retryTick = 0,
}: EndorsementPreviewRowProps) {
  const { displayName, avatarSrc, initials, href, failed, retry } =
    useEndorserIdentity(endorsement)
  const account = useAccountKind(endorsement.issuerDid, { autoRetry: false })

  const key = endorsement.uri
  useEffect(() => {
    if (!onFailedChange) return
    onFailedChange(key, failed)
    return () => onFailedChange(key, false)
  }, [onFailedChange, key, failed])

  // "Try again" from the section: look up again what failed.
  const latest = useRef({ failed, retry, account })
  useEffect(() => {
    latest.current = { failed, retry, account }
  })
  useEffect(() => {
    if (retryTick === 0) return
    const { failed: f, retry: r, account: a } = latest.current
    if (f) r()
    if (a.failed) a.retry()
  }, [retryTick])

  if (failed && onFailedChange) return null

  return (
    // An endorsement: a centerpiece every style can redraw (looks.css),
    // its parts marked with data-part.
    <li className="profile-overview__endorse-item" data-centerpiece="endorsement">
      <Link href={href} className="profile-overview__endorse-link hover-tint hover-tint--bleed">
        {account.kind === "unknown" ? (
          <KindPendingAvatar size={32} animate={account.pending} />
        ) : (
          <Avatar
            size="sm"
            shape={account.kind === "org" ? "square" : "circle"}
            src={avatarSrc}
            fallbackInitials={initials}
            seed={endorsement.issuerDid}
          />
        )}
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
