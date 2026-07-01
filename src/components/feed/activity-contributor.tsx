"use client"

import Link from "next/link"
import { profileUrl } from "@/lib/urls"
import Avatar from "@/components/ui/avatar"
import Skeleton from "@/components/ui/skeleton"
import {
  useContributorInfo,
  isAtprotoIdentity,
} from "@/hooks/use-contributor-info"
import { useContributorInformationRecord } from "@/hooks/use-contributor-information-record"
import { getInitials } from "@/lib/utils/initials"
import type { ActivityContributor as ActivityContributorType } from "@/lib/atproto/activity-types"

interface ActivityContributorProps {
  /** The raw contributor entry as it appears in the claim record. */
  readonly contributor: ActivityContributorType
  /** Optional role label rendered next to the identity. */
  readonly role?: string | null
  /** Optional contribution weight rendered next to the identity. */
  readonly weight?: string | null
}

interface ContributorDisplay {
  displayName: string
  handle: string | null
  avatarUrl: string | null
  profileHref: string | null
  initials: string
  hasAnyHydratedField: boolean
  fallbackLabel: string
}

/**
 * Derive the best display values for a contributor from the resolved
 * atproto info and contributorInformation record.
 */
function deriveContributorDisplay(
  info: { displayName?: string | null; handle?: string | null; did?: string | null; avatarUrl?: string | null } | null | undefined,
  contribInfo: { displayName?: string | null; image?: { uri?: string } | null; identifier?: string | null } | null | undefined,
  inlineIdentity: string | null,
  strongRefUri: string | null,
): ContributorDisplay {
  const fallbackLabel = strongRefUri ? "Unknown contributor" : "Anonymous"

  const displayName =
    info?.displayName ||
    contribInfo?.displayName ||
    (inlineIdentity && !isAtprotoIdentity(inlineIdentity)
      ? inlineIdentity
      : null) ||
    fallbackLabel

  const handle = info?.handle && info.handle !== info.did ? info.handle : null
  const avatarUrl = info?.avatarUrl || contribInfo?.image?.uri || null

  const profileHref = info?.did
    ? profileUrl(info.handle || info.did)
    : null

  const initials = getInitials(
    info?.displayName || contribInfo?.displayName || null,
    handle,
  )

  const hasAnyHydratedField =
    !!info?.did ||
    !!contribInfo?.displayName ||
    !!contribInfo?.image?.uri ||
    !!inlineIdentity

  return { displayName, handle, avatarUrl, profileHref, initials, hasAnyHydratedField, fallbackLabel }
}

/**
 * Single contributor row in the activity detail view.
 *
 * Contributors come in several shapes in real records:
 *
 *   1. Inline identity: `{ contributorIdentity: { identity: "alice.bsky.social" } }`
 *      — may be a DID, a handle, or plain text.
 *   2. Strong ref:      `{ contributorIdentity: { uri: "at://.../contributorInformation/<rkey>", cid } }`
 *      — points at a separate `org.hypercerts.claim.contributorInformation`
 *      record carrying `displayName`, `image`, and an `identifier`
 *      (which is *sometimes* an atproto handle and sometimes not).
 *
 * Resolution priority:
 *
 *   a. Figure out the best candidate atproto identity — the inline
 *      string for case 1, or the `identifier` field of the referenced
 *      record for case 2.
 *   b. If the candidate looks like a DID or handle, hydrate via
 *      `/api/resolve-did` which prefers `app.certified.actor.profile`
 *      with per-field fallback to `app.bsky.actor.profile`, and
 *      render a clickable row linking to `/profile/[handle]`.
 *   c. Otherwise fall back to whatever the record already carries —
 *      `contributorInformation`'s own `displayName` + `image` for
 *      case 2, or the raw identity string for case 1.
 */
export default function ActivityContributor({
  contributor,
  role,
  weight,
}: ActivityContributorProps) {
  const { inlineIdentity, strongRefUri } = classifyContributorIdentity(
    contributor.contributorIdentity
  )

  // For strong-ref contributors, fetch the referenced record so we
  // can both (a) extract its `identifier` to use as the atproto
  // candidate and (b) fall back to its own displayName + image if
  // the identifier isn't an atproto handle/DID.
  const { record: contribInfo, isLoading: contribInfoLoading } =
    useContributorInformationRecord(strongRefUri)

  const atprotoCandidate =
    inlineIdentity ??
    (contribInfo?.identifier && isAtprotoIdentity(contribInfo.identifier)
      ? contribInfo.identifier
      : null)

  const { info, isLoading: atprotoLoading } =
    useContributorInfo(atprotoCandidate)

  // A contributor is still resolving if we're fetching its
  // contributorInformation record OR its atproto profile.
  const isLoading = contribInfoLoading || atprotoLoading

  const {
    displayName,
    handle,
    avatarUrl,
    profileHref,
    initials,
    hasAnyHydratedField,
  } = deriveContributorDisplay(info, contribInfo, inlineIdentity, strongRefUri)

  if (isLoading && !hasAnyHydratedField) {
    return (
      <li
        className="activity-detail__contributor activity-detail__contributor--skeleton"
        aria-hidden="true"
      >
        <Skeleton circle width={32} />
        <div className="activity-detail__contributor-meta">
          <Skeleton variant="line" width={120} height={12} className="mb-1" />
          <Skeleton variant="line" width={80} height={10} />
        </div>
        {role ? (
          <span className="activity-detail__contributor-role">{role}</span>
        ) : null}
        {weight ? (
          <span className="activity-detail__contributor-weight">{weight}</span>
        ) : null}
      </li>
    )
  }

  const body = (
    <>
      <Avatar
        size="sm"
        src={avatarUrl || undefined}
        alt=""
        fallbackInitials={initials}
      />
      <span className="activity-detail__contributor-meta">
        <span className="activity-detail__contributor-name">{displayName}</span>
        {handle ? (
          <span className="activity-detail__contributor-handle">@{handle}</span>
        ) : null}
      </span>
    </>
  )

  return (
    <li className="activity-detail__contributor">
      {profileHref ? (
        <Link
          href={profileHref}
          className="activity-detail__contributor-link"
          aria-label={`View ${displayName}'s profile`}
        >
          {body}
        </Link>
      ) : (
        <span className="activity-detail__contributor-link activity-detail__contributor-link--static">
          {body}
        </span>
      )}
      {role ? (
        <span className="activity-detail__contributor-role">{role}</span>
      ) : null}
      {weight ? (
        <span className="activity-detail__contributor-weight">{weight}</span>
      ) : null}
    </li>
  )
}

/**
 * Classify a `contributorIdentity` field into one of two buckets:
 *
 *   - inlineIdentity: a plain string lifted out of `{ identity }` (may
 *                     be a DID, a handle, or arbitrary plain text).
 *   - strongRefUri:   an `at://…` URI lifted out of `{ uri, cid }`,
 *                     pointing at a separate contributorInformation
 *                     record.
 *
 * At most one is non-null. Both null = unrecognized shape, handled
 * by the caller via a generic fallback label.
 */
function classifyContributorIdentity(id: unknown): {
  inlineIdentity: string | null
  strongRefUri: string | null
} {
  if (id == null) return { inlineIdentity: null, strongRefUri: null }
  // Non-conforming records sometimes store contributorIdentity as a
  // bare string instead of an object wrapper.
  if (typeof id === "string") {
    return { inlineIdentity: id, strongRefUri: null }
  }
  if (typeof id !== "object") {
    return { inlineIdentity: null, strongRefUri: null }
  }
  const obj = id as Record<string, unknown>
  if (typeof obj.identity === "string") {
    return { inlineIdentity: obj.identity, strongRefUri: null }
  }
  if (typeof obj.uri === "string" && obj.uri.startsWith("at://")) {
    return { inlineIdentity: null, strongRefUri: obj.uri }
  }
  return { inlineIdentity: null, strongRefUri: null }
}
