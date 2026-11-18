"use client"

import { useAuthorInfo } from "@/hooks/use-author-info"
import type { ReceivedEndorsement } from "@/hooks/use-received-endorsements"
import { buildAvatarUrlFromCid } from "@/lib/atproto/profile"
import { profileUrl } from "@/lib/urls"
import { getInitials } from "@/lib/utils/initials"

export interface EndorserIdentity {
  displayName: string
  handle: string | null
  avatarSrc: string | undefined
  initials: string
  /** The endorser's profile. */
  href: string
  /** Looking the endorser up failed and the indexer named nobody: what is
   *  shown would be a DID, so say it couldn't load instead. */
  failed: boolean
  /** Look the endorser up again (after `failed`). */
  retry: () => void
}

/**
 * Who issued a received endorsement: name, handle, avatar and profile link.
 *
 * Prefers the indexer's denormalised issuer block (magic-indexer #96), but
 * only trusts it wholesale when it is complete. The award `issuer` block can
 * carry a handle without a display name or avatar (certified-only org
 * accounts have no bsky-profile join), so gating the fetch on the handle
 * alone left those rows with no avatar and a DID-slice placeholder. The
 * per-endorser `useAuthorInfo` fetch is skipped only when the indexer block
 * is complete; otherwise it resolves and fills the gaps.
 */
export function useEndorserIdentity(
  endorsement: ReceivedEndorsement,
): EndorserIdentity {
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
  const { info, failed: lookupFailed, retry } = useAuthorInfo(
    indexerComplete ? null : endorsement.issuerDid,
  )

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

  const failed = lookupFailed && !idxIssuer?.displayName && !idxIssuer?.handle

  return { displayName, handle, avatarSrc, initials, href, failed, retry }
}
