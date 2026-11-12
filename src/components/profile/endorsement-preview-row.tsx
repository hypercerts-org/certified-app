"use client"

import Link from "next/link"
import Avatar from "@/components/ui/avatar"
import { useAuthorInfo } from "@/hooks/use-author-info"
import type { ReceivedEndorsement } from "@/hooks/use-received-endorsements"
import { buildAvatarUrlFromCid } from "@/lib/atproto/profile"
import { profileUrl } from "@/lib/urls"
import { formatShortDate } from "@/lib/utils/format-date"
import { getInitials } from "@/lib/utils/initials"

/**
 * One received endorsement as a compact row: issuer avatar, name, date and
 * note, linking to the issuer's profile. Used by the profile Overview's
 * "Recent endorsements" and the signed-in home's "From others" section;
 * styles are the `profile-overview__endorse-*` classes.
 */
interface EndorsementPreviewRowProps {
  readonly endorsement: ReceivedEndorsement
}

export function EndorsementPreviewRow({ endorsement }: EndorsementPreviewRowProps) {
  // Prefer the indexer's denormalised issuer block (magic-indexer
  // #96 — single-query received-endorsements), but only TRUST it
  // wholesale when it's complete. The award `issuer` denormalisation
  // can carry a handle WITHOUT a displayName or avatar (certified-only
  // org accounts have no bsky-profile join), so gating the fetch on
  // handle-presence alone left those rows with no avatar and a
  // DID-slice initials placeholder. Skip the per-row useAuthorInfo
  // fetch only when the indexer block is complete; otherwise resolve
  // and fill the gaps. (null → useAuthorInfo short-circuits its fetch.)
  const idxIssuer = endorsement.issuer
  const indexerAvatar = buildAvatarUrlFromCid(
    idxIssuer?.did ?? endorsement.issuerDid,
    idxIssuer?.avatarCid,
  )
  const indexerComplete = !!(
    idxIssuer?.handle &&
    idxIssuer.displayName &&
    indexerAvatar
  )
  const { info } = useAuthorInfo(indexerComplete ? null : endorsement.issuerDid)

  const displayName =
    idxIssuer?.displayName ||
    info?.displayName ||
    idxIssuer?.handle ||
    info?.handle ||
    endorsement.issuerDid
  const handle = idxIssuer?.handle ?? info?.handle ?? null
  const initials = getInitials(
    idxIssuer?.displayName ?? info?.displayName,
    handle ?? endorsement.issuerDid,
  )
  const avatarSrc = indexerAvatar || info?.avatarUrl || undefined
  const href = profileUrl(handle || endorsement.issuerDid)

  return (
    <li className="profile-overview__endorse-item">
      <Link href={href} className="profile-overview__endorse-link">
        <Avatar size="sm" src={avatarSrc} fallbackInitials={initials} />
        <span className="profile-overview__endorse-meta">
          <span className="profile-overview__endorse-name" dir="auto">{displayName}</span>
          <span className="profile-overview__endorse-when">
            {formatShortDate(endorsement.createdAt)}
          </span>
        </span>
        {endorsement.note ? (
          <span className="profile-overview__endorse-note">{endorsement.note}</span>
        ) : null}
      </Link>
    </li>
  )
}
