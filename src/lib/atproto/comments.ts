import { postIndexer } from "@/lib/atproto/indexer-client"
import { parseAtUri } from "@/lib/atproto/activity-uri"
import {
  deleteContextUpdate,
  writeContextUpdate,
  type ContextAttachmentSubject,
  type ContextAttachmentValue,
} from "@/lib/atproto/context-attachment"
import {
  longDescriptionPlainText,
  longDescriptionToLinearDocument,
} from "@/lib/leaflet/guards"
import { FEATURE_LINK } from "@/lib/leaflet/types"
import { countGraphemes } from "@/lib/utils/graphemes"
import { linkFacetRanges } from "@/lib/utils/linkify"

/**
 * Comments on activities and projects. A comment is an
 * `org.hypercerts.context.attachment` record with `contentType: "comment"`
 * whose `subjects` point at the record it is about, written to the
 * commenter's own repository (or a group's, when they act as one). The
 * lexicon names "comment" among its content types for this.
 *
 * Shape, matching the comments other clients already write:
 *   - `title`: the text on one line, cut to the lexicon's 256 bytes. The
 *     lexicon requires a title; a reader that shows only titles still
 *     shows the comment.
 *   - `description`: the full text as a Leaflet document, one text block
 *     per paragraph, its web addresses as link facets.
 *
 * Reading accepts any of the shapes the lexicon allows (a Leaflet
 * document, a plain description string, a short description, or only a
 * title), so comments from other clients show too.
 *
 * Comments live in each commenter's repository, so a subject's thread is
 * found through the indexer, which filters attachments by subject.
 */

export const COMMENT_CONTENT_TYPE = "comment"

/** Longest comment, in characters as people count them (graphemes). */
export const MAX_COMMENT_LENGTH = 1000

/** The lexicon's cap on `title`, in UTF-8 bytes. */
const MAX_TITLE_BYTES = 256

export interface FeedComment {
  uri: string
  cid: string
  /** The account that wrote it: the repository it lives in. */
  did: string
  createdAt: string
  text: string
}

/** A comment's text from any of the shapes the lexicon allows. */
export function commentText(value: {
  title?: unknown
  shortDescription?: unknown
  description?: unknown
}): string {
  const long = longDescriptionPlainText(value.description)
  if (long) return long
  if (typeof value.shortDescription === "string" && value.shortDescription.trim()) {
    return value.shortDescription.trim()
  }
  return typeof value.title === "string" ? value.title.trim() : ""
}

/**
 * The text on one line, cut on a character boundary to fit the lexicon's
 * 256-byte title, with an ellipsis when cut.
 */
export function commentTitle(text: string): string {
  const line = text.replace(/\s+/g, " ").trim()
  const encoder = new TextEncoder()
  if (encoder.encode(line).length <= MAX_TITLE_BYTES) return line
  const ellipsis = "…"
  const budget = MAX_TITLE_BYTES - encoder.encode(ellipsis).length
  let out = ""
  let used = 0
  for (const part of graphemes(line)) {
    const size = encoder.encode(part).length
    if (used + size > budget) break
    out += part
    used += size
  }
  return out.trimEnd() + ellipsis
}

function graphemes(s: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" })
    return Array.from(seg.segment(s), (x) => x.segment)
  }
  return Array.from(s)
}

/** Why a draft can't be posted yet, or null when it can. */
export function commentDraftProblem(text: string): "empty" | "too-long" | null {
  const trimmed = text.trim()
  if (!trimmed) return "empty"
  if (countGraphemes(trimmed) > MAX_COMMENT_LENGTH) return "too-long"
  return null
}

/** The record for a new comment on `subject`. */
export function buildCommentRecord(
  text: string,
  subject: ContextAttachmentSubject,
  createdAt: string = new Date().toISOString(),
): ContextAttachmentValue {
  const trimmed = text.trim()
  const doc = longDescriptionToLinearDocument(trimmed)
  // Links as Leaflet link facets, so other clients show them as links too.
  if (doc) {
    for (const entry of doc.blocks) {
      const block = entry.block as { plaintext?: unknown; facets?: unknown }
      if (typeof block.plaintext !== "string") continue
      const ranges = linkFacetRanges(block.plaintext)
      if (ranges.length > 0) {
        block.facets = ranges.map((r) => ({
          index: { byteStart: r.byteStart, byteEnd: r.byteEnd },
          features: [{ $type: FEATURE_LINK, uri: r.uri }],
        }))
      }
    }
  }
  return {
    contentType: COMMENT_CONTENT_TYPE,
    title: commentTitle(trimmed),
    description: doc ?? undefined,
    subjects: [{ uri: subject.uri, cid: subject.cid }],
    createdAt,
  }
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

interface CommentNode {
  uri: string
  cid: string
  did: string
  createdAt: string | null
  title: string | null
  shortDescription: string | null
  subjects: ({ __typename?: string; uri?: string | null } | null)[] | null
  description: unknown
}

interface CommentConnection {
  totalCount: number | null
  edges: { cursor: string; node: CommentNode | null }[]
  pageInfo?: { hasNextPage: boolean; endCursor: string | null } | null
}

interface CommentsData {
  orgHypercertsContextAttachment: CommentConnection | null
}

function toComment(node: CommentNode): FeedComment | null {
  if (!node.uri || !node.cid) return null
  const did = node.did || parseAtUri(node.uri)?.did
  if (!did) return null
  const text = commentText(node)
  if (!text) return null
  return { uri: node.uri, cid: node.cid, did, createdAt: node.createdAt ?? "", text }
}

function subjectUrisOf(node: CommentNode): string[] {
  return (node.subjects ?? [])
    .map((s) => (typeof s?.uri === "string" ? s.uri : null))
    .filter((u): u is string => !!u)
}

/** Most of the batch the proxy serves in one page. */
export const COMMENTS_BATCH_FIRST = 100
/** Most subjects asked about in one batch (the proxy's URI-list cap). */
export const COMMENTS_BATCH_SUBJECTS = 50

export interface CommentsBatch {
  /** Each subject's comments, newest first. Every asked-for subject has
   *  an entry, empty when it has no comments. */
  bySubject: Map<string, FeedComment[]>
  /** False when the batch had more comments than one page holds, so a
   *  subject's list (and count) may be short. */
  complete: boolean
}

/**
 * The comments on several subjects in one round-trip: the activities and
 * projects on a page of the feed. Throws on a failed request.
 */
export async function fetchCommentsForSubjects(
  subjectUris: readonly string[],
  signal?: AbortSignal,
): Promise<CommentsBatch> {
  const bySubject = new Map<string, FeedComment[]>(subjectUris.map((u) => [u, []]))
  if (subjectUris.length === 0) return { bySubject, complete: true }
  const res = await postIndexer<CommentsData>(
    "CommentsForSubjects",
    { subjectUris, first: COMMENTS_BATCH_FIRST },
    { signal },
  )
  const conn = res.data?.orgHypercertsContextAttachment
  if (!res.ok || !conn) {
    throw new Error(res.errors[0]?.message ?? `Couldn't load comments (${res.status})`)
  }
  for (const edge of conn.edges) {
    if (!edge.node) continue
    const comment = toComment(edge.node)
    if (!comment) continue
    for (const uri of subjectUrisOf(edge.node)) {
      bySubject.get(uri)?.push(comment)
    }
  }
  for (const list of bySubject.values()) list.sort(newestFirst)
  const total = conn.totalCount ?? conn.edges.length
  return { bySubject, complete: total <= conn.edges.length }
}

export interface CommentsPage {
  /** Newest first. */
  comments: FeedComment[]
  totalCount: number | null
  /** Cursor for the next (older) page, or null at the end. */
  next: string | null
}

/** One page of a single subject's comments, newest first. */
export async function fetchCommentsForSubject(
  subjectUri: string,
  options: { first?: number; after?: string | null; signal?: AbortSignal } = {},
): Promise<CommentsPage> {
  const { first = 50, after = null, signal } = options
  const res = await postIndexer<CommentsData>(
    "CommentsForSubject",
    { subjectUri, first, after },
    { signal },
  )
  const conn = res.data?.orgHypercertsContextAttachment
  if (!res.ok || !conn) {
    throw new Error(res.errors[0]?.message ?? `Couldn't load comments (${res.status})`)
  }
  const comments = conn.edges
    .map((e) => (e.node ? toComment(e.node) : null))
    .filter((c): c is FeedComment => !!c)
    .sort(newestFirst)
  const hasNext = conn.pageInfo?.hasNextPage ?? false
  return {
    comments,
    totalCount: conn.totalCount ?? null,
    next: hasNext ? (conn.pageInfo?.endCursor ?? null) : null,
  }
}

export function newestFirst(a: FeedComment, b: FeedComment): number {
  return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

/**
 * Post a comment on `subject` as `authorDid`: the viewer's own account, or
 * a group they act for (written through the group service). Returns the
 * comment as the thread shows it.
 */
export async function postComment(
  ownDid: string,
  authorDid: string,
  subject: ContextAttachmentSubject,
  text: string,
): Promise<FeedComment> {
  const record = buildCommentRecord(text, subject)
  const ref = await writeContextUpdate(ownDid, authorDid, record)
  return {
    uri: ref.uri,
    cid: ref.cid,
    did: authorDid,
    createdAt: record.createdAt as string,
    text: text.trim(),
  }
}

/** Delete a comment. Only its author (or a member of the group that wrote
 *  it) can; the write goes to the repository it lives in. */
export async function deleteComment(ownDid: string, comment: FeedComment): Promise<void> {
  const rkey = parseAtUri(comment.uri)?.rkey
  if (!rkey) throw new Error("Couldn't read the comment's address")
  await deleteContextUpdate(ownDid, comment.did, rkey)
}
