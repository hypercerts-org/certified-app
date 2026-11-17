"use client"

import { useState } from "react"
import { Heart } from "lucide-react"
import Button from "@/components/ui/button"
import { useAuth } from "@/lib/auth/auth-context"
import { useOrg } from "@/lib/groups/org-context"
import { useLike } from "@/hooks/use-likes"

export type LikeSubjectKind = "activity" | "project" | "update"

/**
 * The account likes are made as: the one you act as (the account control),
 * everywhere, the feed included; the same start as a comment's author.
 * "Seen as" only changes what the feed shows.
 */
export function useLikeActor(): {
  ownDid: string | null
  actor: string | null
  actorName: string | null
} {
  const { did } = useAuth()
  const { activeOrg: group } = useOrg()
  return {
    ownDid: did ?? null,
    actor: did ? (group?.groupDid ?? did) : null,
    actorName: group ? group.displayName || `@${group.handle}` : null,
  }
}

/**
 * Like (`app.certified.feed.like`) an activity, project or update.
 *
 *   - `bar`: in a comment thread's bar, a ghost "Like" beside "Comment";
 *     the count is in the bar's summary ("12 likes · 3 comments").
 *   - `header`: in a record page's actions, a secondary button with the
 *     heart and the count ("Like" while there is none).
 *
 * The heart fills and the label reads "Liked" when the acting account
 * likes it (`aria-pressed`); pressing again takes the like back. Liked as
 * the account you act as ("Like as <group>" in the tooltip). Signed out it
 * opens sign-in.
 */
export default function LikeButton({
  subject,
  subjectKind,
  variant = "bar",
}: {
  subject: { uri: string; cid: string }
  subjectKind: LikeSubjectKind
  variant?: "bar" | "header"
}) {
  const { openSignInModal } = useAuth()
  const { ownDid, actor, actorName } = useLikeActor()
  const like = useLike(subject, actor, ownDid)
  const [error, setError] = useState<string | null>(null)

  const onClick = async () => {
    if (!actor) {
      openSignInModal()
      return
    }
    setError(null)
    try {
      await like.toggle()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the like.")
    }
  }

  const icon = (
    <Heart
      size={16}
      strokeWidth={1.75}
      aria-hidden
      className={like.liked ? "like-button__heart is-liked" : "like-button__heart"}
    />
  )
  const tooltip = actorName ? `Like as ${actorName}` : undefined
  const countText = like.count !== null && like.count > 0 ? like.count.toLocaleString() : null

  return (
    <span className={`like-button like-button--${variant}`}>
      {variant === "header" ? (
        <Button
          variant="secondary"
          size="sm"
          onClick={onClick}
          aria-pressed={like.liked}
          aria-label={`Like this ${subjectKind}${countText ? `, ${countText} ${like.count === 1 ? "like" : "likes"}` : ""}`}
          tooltip={tooltip}
        >
          {icon}
          {countText ?? "Like"}
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="comment-thread__action"
          onClick={onClick}
          aria-pressed={like.liked}
          // The name stays "Like"; pressed says whether it's on.
          aria-label="Like"
          tooltip={tooltip}
        >
          {icon}
          {like.liked ? "Liked" : "Like"}
        </Button>
      )}
      {error ? (
        <span className="like-button__error" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  )
}
