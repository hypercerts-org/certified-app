"use client"

import Avatar from "@/components/ui/avatar"
import Button from "@/components/ui/button"
import Skeleton from "@/components/ui/skeleton"
import { useAuthorInfo } from "@/hooks/use-author-info"
import { useGivenEndorsements } from "@/hooks/use-endorsements"
import { useUserProfile } from "@/hooks/use-user-profile"
import { useActorWorkspaceCounts } from "@/hooks/use-workspace"
import { profileUrl } from "@/lib/urls"
import { formatGraphCount } from "@/lib/utils/format-graph-count"
import { getInitials } from "@/lib/utils/initials"

/**
 * A short profile preview for a trusted evaluator, shown in a popover from
 * the feed filters. It answers "who is this, and why would I include the
 * accounts they endorse?": name, handle, the first lines of their bio, how
 * many endorsements they have given and how many followers they have, and a
 * button to the full profile.
 *
 * Mounted only while the popover is open, so the profile and counts are
 * fetched on demand rather than for every evaluator in the list.
 */
export default function EvaluatorPreview({ did }: { did: string }) {
  const { profile, avatarUrl, handle, isLoading } = useUserProfile(did)
  // Batched and cached: already loaded for the filter row, so the name and
  // avatar show at once while the full profile resolves.
  const { info } = useAuthorInfo(did)
  const { counts, isLoading: countsLoading } = useActorWorkspaceCounts(did)
  const { endorsements: given, isLoading: givenLoading } = useGivenEndorsements(did)

  const shownHandle = handle ?? info?.handle ?? null
  const name =
    profile?.displayName ||
    info?.displayName ||
    (shownHandle ? `@${shownHandle}` : did)

  return (
    <div className="evaluator-preview">
      <div className="evaluator-preview__head">
        <Avatar
          size="md"
          src={avatarUrl || info?.avatarUrl || undefined}
          fallbackInitials={getInitials(profile?.displayName ?? info?.displayName, shownHandle ?? did)}
        />
        <div className="evaluator-preview__who">
          <p className="evaluator-preview__name font-headline" dir="auto">{name}</p>
          {shownHandle && name !== `@${shownHandle}` ? (
            <p className="evaluator-preview__handle">@{shownHandle}</p>
          ) : null}
        </div>
      </div>

      {isLoading && !profile ? (
        <Skeleton variant="text" lines={2} aria-hidden />
      ) : profile?.description ? (
        <p className="evaluator-preview__bio" dir="auto">{profile.description}</p>
      ) : null}

      <dl className="evaluator-preview__stats">
        <div className="evaluator-preview__stat">
          <dt>Endorsements given</dt>
          <dd>{givenLoading ? "…" : formatGraphCount(given.length)}</dd>
        </div>
        <div className="evaluator-preview__stat">
          <dt>Followers</dt>
          <dd>{countsLoading && counts.followers === null ? "…" : formatGraphCount(counts.followers)}</dd>
        </div>
      </dl>

      <Button href={profileUrl(shownHandle || did)} variant="secondary" size="sm">
        View profile
      </Button>
    </div>
  )
}
