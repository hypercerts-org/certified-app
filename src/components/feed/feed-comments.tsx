"use client"

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react"
import Link from "next/link"
import { MessageCircle } from "lucide-react"
import Avatar from "@/components/ui/avatar"
import Button from "@/components/ui/button"
import ClampedText from "@/components/ui/clamped-text"
import ConfirmDialog from "@/components/ui/confirm-dialog"
import { useAuth } from "@/lib/auth/auth-context"
import { useOrg } from "@/lib/groups/org-context"
import { useAuthorInfo } from "@/hooks/use-author-info"
import { useComments } from "@/hooks/use-comments"
import {
  MAX_COMMENT_LENGTH,
  commentDraftProblem,
  deleteComment,
  postComment,
  type FeedComment,
} from "@/lib/atproto/comments"
import { formatRelativeTime } from "@/lib/atproto/activity"
import { formatAbsoluteDateTime } from "@/components/explore-page/format-display"
import { profileUrl } from "@/lib/urls"
import { getInitials } from "@/lib/utils/initials"
import { countGraphemes } from "@/lib/utils/graphemes"

/** Comments a card shows before "View earlier comments". */
export const COMMENT_PREVIEW_COUNT = 2
/** How many more each "View earlier comments" reveals. */
const COMMENT_STEP = 10
/** The character count shows once a draft is this close to the limit. */
const COUNT_FROM = MAX_COMMENT_LENGTH - 100

/**
 * The comment thread under an activity or project in the feed, laid out
 * the way social feeds do it: a Comment button with the count beside it,
 * the latest comments under the card (oldest of them on top, so the
 * thread reads down to the newest), "View earlier comments" above them
 * for the rest, and a field to write one that opens from the button.
 *
 * Comments are written as the account whose workspace is open (you, or
 * the group you act for), like follows and endorsements. Their authors
 * can delete them.
 */
export default function FeedComments({
  subject,
  subjectTitle,
  subjectKind,
}: {
  subject: { uri: string; cid: string }
  subjectTitle: string
  subjectKind: "activity" | "project"
}) {
  const { did: ownDid } = useAuth()
  const { activeOrg, groups } = useOrg()
  const thread = useComments(subject.uri)
  const [shown, setShown] = useState(COMMENT_PREVIEW_COUNT)
  const [composing, setComposing] = useState(false)
  const [toDelete, setToDelete] = useState<FeedComment | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const composerId = useId()
  const listId = useId()
  const fieldRef = useRef<HTMLTextAreaElement>(null)

  // The latest `shown`, read top-down from the oldest of them.
  const visible = thread.comments.slice(0, shown).reverse()
  const earlier = Math.max(0, thread.total - visible.length)
  const authorDid = activeOrg?.groupDid ?? ownDid ?? null

  const openComposer = () => {
    setComposing(true)
    // Already open: just bring the field back into focus.
    fieldRef.current?.focus()
  }

  const showEarlier = async () => {
    const next = shown + COMMENT_STEP
    setShown(next)
    if (next > thread.comments.length && !thread.complete) {
      try {
        await thread.loadMore()
      } catch {
        setNotice("Couldn't load more comments. Try again in a moment.")
      }
    }
  }

  const canDelete = (c: FeedComment) =>
    !!ownDid && (c.did === ownDid || groups.some((g) => g.groupDid === c.did))

  const confirmDelete = async () => {
    if (!toDelete || !ownDid) return
    setDeleting(true)
    try {
      await deleteComment(ownDid, toDelete)
      thread.remove(toDelete.uri)
      setToDelete(null)
      setNotice(null)
    } catch (err) {
      setToDelete(null)
      setNotice(err instanceof Error ? `Couldn't delete the comment: ${err.message}` : "Couldn't delete the comment.")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="feed-comments">
      <div className="feed-comments__bar">
        {authorDid ? (
          <Button
            variant="ghost"
            size="sm"
            className="feed-comments__action"
            onClick={openComposer}
            aria-expanded={composing}
            aria-controls={composerId}
          >
            <MessageCircle size={16} strokeWidth={1.75} aria-hidden />
            Comment
          </Button>
        ) : null}
        {thread.total > 0 ? (
          <span className="feed-comments__count">
            {thread.total === 1 ? "1 comment" : `${thread.total.toLocaleString()} comments`}
          </span>
        ) : null}
      </div>

      {earlier > 0 && visible.length > 0 ? (
        <button
          type="button"
          className="feed-comments__more"
          onClick={showEarlier}
          disabled={thread.loadingMore}
          aria-controls={listId}
        >
          {thread.loadingMore
            ? "Loading comments…"
            : earlier === 1
              ? "View 1 earlier comment"
              : `View ${Math.min(earlier, COMMENT_STEP).toLocaleString()} earlier comments`}
        </button>
      ) : null}

      {visible.length > 0 ? (
        <ol id={listId} className="feed-comments__list" aria-label={`Comments on ${subjectTitle}`}>
          {visible.map((c) => (
            <CommentItem
              key={c.uri}
              comment={c}
              onDelete={canDelete(c) ? () => setToDelete(c) : undefined}
            />
          ))}
        </ol>
      ) : null}

      {/* A failed read stays quiet on every card; it speaks up once
          someone is writing here, where the missing thread matters. */}
      {composing && thread.status === "error" && thread.comments.length === 0 ? (
        <p className="feed-comments__notice">
          Couldn&rsquo;t load the comments.{" "}
          <button type="button" className="feed-comments__link" onClick={thread.retry}>
            Try again
          </button>
        </p>
      ) : null}
      {notice ? (
        <p className="feed-comments__notice" role="alert">
          {notice}
        </p>
      ) : null}

      {composing && ownDid && authorDid ? (
        <CommentComposer
          id={composerId}
          fieldRef={fieldRef}
          ownDid={ownDid}
          authorDid={authorDid}
          groupName={activeOrg ? activeOrg.displayName || `@${activeOrg.handle}` : null}
          groupAvatar={activeOrg?.avatarUrl ?? null}
          subject={subject}
          subjectTitle={subjectTitle}
          onPosted={(c) => {
            thread.add(c)
            // Keep the comments already on screen there.
            setShown((n) => n + 1)
          }}
          onClose={() => setComposing(false)}
        />
      ) : null}

      {toDelete ? (
        <ConfirmDialog
          title="Delete comment?"
          message={`It will no longer show on this ${subjectKind}.`}
          confirmLabel="Delete"
          isConfirming={deleting}
          onCancel={() => setToDelete(null)}
          onConfirm={confirmDelete}
        />
      ) : null}
    </div>
  )
}

function CommentItem({
  comment,
  onDelete,
}: {
  comment: FeedComment
  onDelete?: () => void
}) {
  const { info } = useAuthorInfo(comment.did)
  const name = info?.displayName || (info?.handle ? `@${info.handle}` : null) || "Unnamed account"
  const href = profileUrl(info?.handle || comment.did)
  return (
    <li className="feed-comment">
      <Link href={href} className="feed-comment__avatar" aria-label={`${name}'s profile`} tabIndex={-1}>
        <Avatar
          size="sm"
          src={info?.avatarUrl ?? undefined}
          alt=""
          fallbackInitials={getInitials(info?.displayName ?? null, info?.handle ?? null)}
        />
      </Link>
      <div className="feed-comment__main">
        <div className="feed-comment__bubble">
          <Link href={href} className="feed-comment__name" dir="auto">
            {name}
          </Link>
          <ClampedText lines={6} moreLabel="See more" lessLabel="See less">
            <p className="feed-comment__text" dir="auto">
              {comment.text}
            </p>
          </ClampedText>
        </div>
        <p className="feed-comment__meta">
          {comment.createdAt ? (
            <time dateTime={comment.createdAt} title={formatAbsoluteDateTime(comment.createdAt)}>
              {formatRelativeTime(comment.createdAt)}
            </time>
          ) : null}
          {onDelete ? (
            <button type="button" className="feed-comments__link" onClick={onDelete}>
              Delete
            </button>
          ) : null}
        </p>
      </div>
    </li>
  )
}

function CommentComposer({
  id,
  fieldRef,
  ownDid,
  authorDid,
  groupName,
  groupAvatar,
  subject,
  subjectTitle,
  onPosted,
  onClose,
}: {
  id: string
  fieldRef: React.RefObject<HTMLTextAreaElement | null>
  ownDid: string
  authorDid: string
  groupName: string | null
  groupAvatar: string | null
  subject: { uri: string; cid: string }
  subjectTitle: string
  onPosted: (c: FeedComment) => void
  onClose: () => void
}) {
  const { info } = useAuthorInfo(groupName ? null : authorDid)
  const [text, setText] = useState("")
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const problem = commentDraftProblem(text)
  const length = countGraphemes(text.trim())

  useEffect(() => {
    fieldRef.current?.focus()
  }, [fieldRef])

  // Grow with the text, up to the cap the stylesheet sets.
  useEffect(() => {
    const el = fieldRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight}px`
  }, [text, fieldRef])

  const submit = async (e?: FormEvent) => {
    e?.preventDefault()
    if (problem || posting) return
    setPosting(true)
    setError(null)
    try {
      const comment = await postComment(ownDid, authorDid, subject, text)
      onPosted(comment)
      setText("")
      fieldRef.current?.focus()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't post the comment.")
    } finally {
      setPosting(false)
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      void submit()
    } else if (e.key === "Escape" && !text.trim() && !posting) {
      e.preventDefault()
      onClose()
    }
  }

  const avatar = groupName ? groupAvatar : (info?.avatarUrl ?? null)
  const initials = groupName ? getInitials(groupName, null) : getInitials(info?.displayName ?? null, info?.handle ?? null)

  return (
    <form id={id} className="feed-comment-composer" onSubmit={submit}>
      <span className="feed-comment__avatar" aria-hidden="true">
        <Avatar size="sm" src={avatar ?? undefined} alt="" fallbackInitials={initials} />
      </span>
      <div className="feed-comment-composer__box">
        <textarea
          ref={fieldRef}
          className="feed-comment-composer__field"
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Write a comment"
          aria-label={`Write a comment on ${subjectTitle}`}
          aria-keyshortcuts="Control+Enter Meta+Enter"
          aria-invalid={problem === "too-long" || undefined}
          disabled={posting}
          dir="auto"
        />
        <div className="feed-comment-composer__footer">
          <span className="feed-comment-composer__as">
            {groupName ? <>Commenting as {groupName}</> : null}
          </span>
          {length >= COUNT_FROM ? (
            <span
              className={`feed-comment-composer__count${problem === "too-long" ? " is-over" : ""}`}
              aria-live="polite"
            >
              {length.toLocaleString()} / {MAX_COMMENT_LENGTH.toLocaleString()}
            </span>
          ) : null}
          <Button type="submit" size="sm" loading={posting} disabled={!!problem}>
            Post
          </Button>
        </div>
      </div>
      {error ? (
        <p className="feed-comments__notice feed-comment-composer__error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  )
}
