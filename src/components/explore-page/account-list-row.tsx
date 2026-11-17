"use client"

import { memo } from "react"
import { User } from "lucide-react"
import Avatar from "@/components/ui/avatar"
import { useAuthorInfo } from "@/hooks/use-author-info"
import { deriveIdentity, isMachineHandle } from "@/lib/utils/identity"
import { truncateDid } from "@/lib/utils/did"
import type { NetworkActor } from "@/lib/atproto/workspace"
import type { EndorsementClosureAccount } from "@/lib/atproto/indexer"
import EndorsementRowBadge from "./endorsement-row-badge"
import ExploreListRow from "./explore-list-row"

/**
 * An account in an /explore list. The same row as an activity or a
 * project (`<ExploreListRow>`), so every Explore section has one
 * geometry:
 *
 *   [avatar] [ Display name     ] [ @handle [2nd] ] [ date ]
 *            [ description …    ]
 *
 * The avatar fills the 40px lead slot (`<Avatar size="row">`, the
 * people size); the account's own @handle sits where the other rows
 * show their author, with the endorsement-degree badge after it when
 * the list is endorsement-based; the date column is when the account
 * joined (the profile's `createdAt`, null on legacy profiles, which
 * leaves it empty). Phones drop the author column and the description
 * line, so the handle (and badge) move under the name there.
 *
 * A handle the PDS made up ("12gkq0.certified.one") names nobody: it
 * shows muted, as an ID, never as the name. An account with neither a
 * name nor a chosen handle is "Unnamed account" in muted type, with a
 * plain avatar (no "?" initials).
 */
function AccountListRow({
  actor,
  endorsementMeta,
}: {
  actor: NetworkActor
  endorsementMeta?: EndorsementClosureAccount
}) {
  const { info } = useAuthorInfo(actor.did)
  // Record-level name/avatar (from the Certified actor record) outrank
  // the resolved Bluesky profile — same data the search index returned.
  const { displayName, unnamed, handle, initials, profileHref, avatarUrl } =
    deriveIdentity(info, actor.did, {
      preferredName: actor.displayName,
      preferredAvatarUrl: actor.avatarUrl,
    })

  const badge = endorsementMeta ? (
    <EndorsementRowBadge meta={endorsementMeta} />
  ) : null
  const handleText = handle ? `@${handle}` : truncateDid(actor.did)
  const machine = isMachineHandle(handle)
  const description = actor.description?.trim() || null

  return (
    <ExploreListRow
      href={profileHref}
      leading={
        <Avatar
          size="row"
          src={avatarUrl ?? undefined}
          alt=""
          // Unknown name: the plain fill, not a "?".
          fallbackInitials={initials === "?" ? "" : initials}
          seed={actor.did}
        />
      }
      title={displayName}
      titleMuted={unnamed}
      subtitle={
        <>
          {handleText}
          {badge ? <> {badge}</> : null}
        </>
      }
      metaItems={description ? [description] : []}
      aside={
        <span className="cert-list-row__aside">
          <span
            className={`cert-list-row__handle${
              handle ? "" : " cert-list-row__handle--did"
            }${machine ? " cert-list-row__handle--machine" : ""}`}
          >
            {handle ? null : <User size={12} strokeWidth={2} aria-hidden />}
            {handleText}
          </span>
          {badge}
        </span>
      }
      timestampIso={actor.createdAt}
      timestampLabel="Joined"
    />
  )
}

export default memo(AccountListRow)
