"use client"

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react"
import Link from "next/link"
import { MessageCircle } from "lucide-react"
import Avatar from "@/components/ui/avatar"
import Button from "@/components/ui/button"
import ClampedText from "@/components/ui/clamped-text"
import ConfirmDialog from "@/components/ui/confirm-dialog"
import LinkedText from "@/components/ui/linked-text"
import SectionHeader from "@/components/ui/section-header"
import { SectionTitleCount } from "@/components/create/form-action-bar"
import AccountPicker from "@/components/layout/account-picker"
import LikeButton, { useLikeActor } from "@/components/comments/like-button"
import { useLike } from "@/hooks/use-likes"
import { useAuth } from "@/lib/auth/auth-context"
import { useOrg } from "@/lib/groups/org-context"
import type { Group } from "@/lib/groups/types"
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
import { caughtErrorMessage } from "@/lib/utils/user-error"

export type CommentSubjectKind = "activity" | "project" | "update"

/** Comments a feed card or an update shows before "View earlier comments". */
export const COMMENT_PREVIEW_COUNT = 2
/** Comments the record pages' Comments section shows at first. */
export const SECTION_PREVIEW_COUNT = 10
/** How many more each "View earlier comments" reveals. */
const COMMENT_STEP = 10
/** The character count shows once a draft is this close to the limit. */
const COUNT_FROM = MAX_COMMENT_LENGTH - 100

/**
 * The comment thread of an activity, a project or an update, laid out the
 * way social feeds do it: the latest comments under the thing (oldest of
 * them on top, so the thread reads down to the newest), "View earlier
 * comments" above them for the rest, and the field to write one at the
 * bottom. Links in comments are clickable.
 *
 * Two layouts:
 *   - `card` (feed cards, updates): Like and Comment buttons with the
 *     counts at the right ("12 likes · 3 comments"); Comment opens and
 *     closes the field (the draft is kept).
 *   - `section` (the record pages' Overview): a "Comments" heading with
 *     the count, more comments at first, and the field always open. (The
 *     page's Like is in its header actions.)
 *
 * Signed out, Comment (or "Sign in to comment") opens sign-in.
 *
 * Who a comment is posted as: the avatar beside the field switches between
 * you and your groups. It starts on the account you act as (the account
 * control), on every page, the feed included. Authors (and the members of
 * a group that wrote one) can delete comments.
 */
export default function CommentThread({
  subject,
  subjectTitle,
  subjectKind,
  layout = "card",
}: {
  subject: { uri: string; cid: string }
  subjectTitle: string
  subjectKind: CommentSubjectKind
  layout?: "card" | "section"
}) {
  const { did: ownDid, openSignInModal } = useAuth()
  const { activeOrg, groups } = useOrg()
  const thread = useComments(subject.uri)
  const isSection = layout === "section"
  // The card's bar also likes; its count joins the summary on the right.
  const likeActor = useLikeActor()
  const likes = useLike(subject, likeActor.actor, likeActor.ownDid)
  const [shown, setShown] = useState(isSection ? SECTION_PREVIEW_COUNT : COMMENT_PREVIEW_COUNT)
  const [composing, setComposing] = useState(false)
  const [draft, setDraft] = useState("")
  // undefined: not picked yet, so the default applies (and follows it).
  const [picked, setPicked] = useState<Group | null | undefined>(undefined)
  const [toDelete, setToDelete] = useState<FeedComment | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const composerId = useId()
  const listId = useId()
  const headingId = useId()
  const fieldRef = useRef<HTMLTextAreaElement>(null)

  // The latest `shown`, read top-down from the oldest of them.
  const visible = thread.comments.slice(0, shown).reverse()
  const earlier = Math.max(0, thread.total - visible.length)
  const author: Group | null = picked !== undefined ? picked : activeOrg
  const authorDid = author?.groupDid ?? ownDid ?? null
  const fieldOpen = !!ownDid && (isSection || composing)

  const toggleComposer = () => {
    if (!ownDid) {
      openSignInModal()
      return
    }
    setComposing((open) => !open)
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
      setNotice(caughtErrorMessage(err, "Couldn't delete the comment. Try again in a moment"))
    } finally {
      setDeleting(false)
    }
  }

  const summary = [
    likes.count ? (likes.count === 1 ? "1 like" : `${likes.count.toLocaleString()} likes`) : null,
    thread.total > 0
      ? thread.total === 1
        ? "1 comment"
        : `${thread.total.toLocaleString()} comments`
      : null,
  ]
    .filter(Boolean)
    .join(" \u00b7 ")

  const body = (
    <>
      {earlier > 0 && visible.length > 0 ? (
        <button
          type="button"
          className="comment-thread__more"
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
        <ol id={listId} className="comment-thread__list" aria-label={`Comments on ${subjectTitle}`}>
          {visible.map((c) => (
            <CommentItem
              key={c.uri}
              comment={c}
              onDelete={canDelete(c) ? () => setToDelete(c) : undefined}
            />
          ))}
        </ol>
      ) : null}

      {/* A failed read stays quiet on a feed card; it speaks up where the
          missing thread matters: a section, or a field someone opened. */}
      {(isSection || composing) && thread.status === "error" && thread.comments.length === 0 ? (
        <p className="comment-thread__notice">
          Couldn&apos;t load the comments.{" "}
          <button type="button" className="comment-thread__link" onClick={thread.retry}>
            Try again
          </button>
        </p>
      ) : null}
      {notice ? (
        <p className="comment-thread__notice" role="alert">
          {notice}
        </p>
      ) : null}

      {fieldOpen && ownDid && authorDid ? (
        <CommentComposer
          id={composerId}
          fieldRef={fieldRef}
          ownDid={ownDid}
          author={author}
          authorDid={authorDid}
          onAuthorChange={setPicked}
          draft={draft}
          onDraftChange={setDraft}
          autoFocus={!isSection}
          subject={subject}
          subjectTitle={subjectTitle}
          onPosted={(c) => {
            thread.add(c)
            // Keep the comments already on screen there.
            setShown((n) => n + 1)
          }}
          onClose={isSection ? undefined : () => setComposing(false)}
        />
      ) : null}

      {isSection && !ownDid ? (
        <Button
          variant="secondary"
          size="sm"
          className="comment-thread__signin"
          onClick={() => openSignInModal()}
        >
          Sign in to comment
        </Button>
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
    </>
  )

  if (isSection) {
    return (
      <section
        className="record-section comment-thread comment-thread--section"
        aria-labelledby={headingId}
      >
        <SectionHeader
          id={headingId}
          title={<SectionTitleCount label="Comments" count={thread.total} />}
        />
        {body}
      </section>
    )
  }

  return (
    <div className="comment-thread">
      <div className="comment-thread__bar">
        <LikeButton subject={subject} subjectKind={subjectKind} />
        <Button
          variant="ghost"
          size="sm"
          className="comment-thread__action"
          onClick={toggleComposer}
          aria-expanded={ownDid ? composing : undefined}
          aria-controls={ownDid && composing ? composerId : undefined}
        >
          <MessageCircle size={16} strokeWidth={1.75} aria-hidden />
          Comment
        </Button>
        {summary ? <span className="comment-thread__count">{summary}</span> : null}
      </div>
      {body}
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
    <li className="comment-item">
      <Link href={href} className="comment-item__avatar" aria-label={`${name}'s profile`} tabIndex={-1}>
        <Avatar
          size="sm"
          src={info?.avatarUrl ?? undefined}
          alt=""
          fallbackInitials={getInitials(info?.displayName ?? null, info?.handle ?? null)}
        />
      </Link>
      <div className="comment-item__main">
        <div className="comment-item__bubble">
          <Link href={href} className="comment-item__name" dir="auto">
            {name}
          </Link>
          <ClampedText lines={6} moreLabel="See more" lessLabel="See less">
            <p className="comment-item__text" dir="auto">
              <LinkedText text={comment.text} />
            </p>
          </ClampedText>
        </div>
        <p className="comment-item__meta">
          {comment.createdAt ? (
            <time dateTime={comment.createdAt} title={formatAbsoluteDateTime(comment.createdAt)}>
              {formatRelativeTime(comment.createdAt)}
            </time>
          ) : null}
          {onDelete ? (
            <button type="button" className="comment-thread__link" onClick={onDelete}>
              Delete
            </button>
          ) : null}
        </p>
      </div>
    </li>
  )
}

function groupName(g: Group): string {
  return g.displayName || `@${g.handle}`
}

function CommentComposer({
  id,
  fieldRef,
  ownDid,
  author,
  authorDid,
  onAuthorChange,
  draft,
  onDraftChange,
  autoFocus,
  subject,
  subjectTitle,
  onPosted,
  onClose,
}: {
  id: string
  fieldRef: React.RefObject<HTMLTextAreaElement | null>
  ownDid: string
  author: Group | null
  authorDid: string
  onAuthorChange: (next: Group | null) => void
  draft: string
  onDraftChange: (text: string) => void
  autoFocus: boolean
  subject: { uri: string; cid: string }
  subjectTitle: string
  onPosted: (c: FeedComment) => void
  /** Closes the field (feed cards and updates); Escape does it when the
   *  field is empty. */
  onClose?: () => void
}) {
  const { groups, selfGroup } = useOrg()
  const { info } = useAuthorInfo(ownDid)
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const problem = commentDraftProblem(draft)
  const length = countGraphemes(draft.trim())
  // With groups to choose from, the avatar picks who the comment is from.
  const canSwitch = !selfGroup && groups.length > 0

  useEffect(() => {
    if (autoFocus) fieldRef.current?.focus()
  }, [autoFocus, fieldRef])

  // Grow with the text, up to the cap the stylesheet sets.
  useEffect(() => {
    const el = fieldRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight}px`
  }, [draft, fieldRef])

  const submit = async (e?: FormEvent) => {
    e?.preventDefault()
    if (problem || posting) return
    setPosting(true)
    setError(null)
    try {
      const comment = await postComment(ownDid, authorDid, subject, draft)
      onPosted(comment)
      onDraftChange("")
      fieldRef.current?.focus()
    } catch (err) {
      setError(caughtErrorMessage(err, "Couldn't post the comment. Try again in a moment"))
    } finally {
      setPosting(false)
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      void submit()
    } else if (e.key === "Escape" && onClose && !draft.trim() && !posting) {
      e.preventDefault()
      onClose()
    }
  }

  return (
    <form id={id} className="comment-composer" onSubmit={submit}>
      <span className="comment-item__avatar">
        {canSwitch ? (
          <AccountPicker
            trigger="avatar"
            prefix="Comment as"
            label="Comment as"
            current={author}
            onSelect={onAuthorChange}
            note="Who this comment is posted as."
          />
        ) : (
          <Avatar
            size="sm"
            src={info?.avatarUrl ?? undefined}
            alt=""
            fallbackInitials={getInitials(info?.displayName ?? null, info?.handle ?? null)}
          />
        )}
      </span>
      <div className="comment-composer__box">
        <textarea
          ref={fieldRef}
          className="comment-composer__field"
          rows={1}
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Write a comment"
          aria-label={`Write a comment on ${subjectTitle}`}
          aria-keyshortcuts="Control+Enter Meta+Enter"
          aria-invalid={problem === "too-long" || undefined}
          disabled={posting}
          dir="auto"
        />
        <div className="comment-composer__footer">
          <span className="comment-composer__as">
            {author ? <>Commenting as {groupName(author)}</> : null}
          </span>
          {length >= COUNT_FROM ? (
            <span
              className={`comment-composer__count${problem === "too-long" ? " is-over" : ""}`}
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
        <p className="comment-thread__notice comment-composer__error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  )
}
