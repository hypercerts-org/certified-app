import { authFetch } from "@/lib/auth/fetch"
import { parseAtUri } from "@/lib/atproto/activity-uri"

/**
 * Universal "what records point at this cert / project" model.
 *
 * For the Explore page we aggregate every lexicon that strong-refs
 * the subject (a cert or project at:// URI) and normalize into a
 * single CertContextItem[] shape. Each view renders these items
 * differently — feed, faceted sidebar, accordion, tag-intersection,
 * file-tree, hybrid — without needing per-lexicon knowledge beyond
 * the lexicon NSID + subtype discriminator carried on each item.
 *
 * The list is type-agnostic in spirit: the four lexicons enumerated
 * below are concrete because each has its own subject-pointer field
 * shape; adding a new lexicon = registering its NSID + subject path
 * here without touching the views.
 *
 * Creator-only contract: same as `fetchContextUpdates`. We list
 * records on the subject author's PDS only — foreign authors are
 * intentionally invisible until an indexer-backed cross-author
 * query exists.
 */

// ----------------------------- Types ---------------------------------

export type ContextLexicon =
  | "attachment"
  | "evaluation"
  | "measurement"
  | "collection"

/** Display metadata about each lexicon for the views. Keep the
 *  ordering stable — it doubles as a column order / hierarchy. */
export const CONTEXT_LEXICON_META: Record<
  ContextLexicon,
  { nsid: string; label: string; plural: string; icon: string }
> = {
  collection: {
    nsid: "org.hypercerts.collection",
    label: "Collection",
    plural: "Collections",
    icon: "folder",
  },
  attachment: {
    nsid: "org.hypercerts.context.attachment",
    label: "Attachment",
    plural: "Attachments",
    icon: "paperclip",
  },
  evaluation: {
    nsid: "org.hypercerts.context.evaluation",
    label: "Evaluation",
    plural: "Evaluations",
    icon: "star",
  },
  measurement: {
    nsid: "org.hypercerts.context.measurement",
    label: "Measurement",
    plural: "Measurements",
    icon: "ruler",
  },
}

export interface CertContextItem {
  /** Strong identifier — the record's at:// URI. */
  uri: string
  /** Lexicon family this item belongs to. Drives icon + grouping. */
  lexicon: ContextLexicon
  /** Free-form subtype within the lexicon — `contentType` for
   *  attachments, `type` for collections, `metric` for measurements,
   *  null for evaluations (no canonical discriminator). */
  subtype: string | null
  /** Human-readable headline. Falls back through several record
   *  fields per lexicon (title / metric / summary) so views can
   *  always render something. */
  title: string
  /** Short body text — first paragraph of description, summary,
   *  formatted value, etc. May be empty. */
  summary: string | null
  /** ISO-8601 timestamp the record carries internally. */
  createdAt: string | null
  /** DID of the actor who authored this related record. Equal to
   *  the subject's author DID — the creator-only filter is applied
   *  at fetch time, not here. */
  authorDid: string
  /** Original record value (untyped — view-side renderers narrow
   *  per-lexicon when they need to surface extra detail). */
  raw: Record<string, unknown>
}

interface PdsListRecord {
  uri: string
  cid: string
  value: Record<string, unknown>
}

// ------------------------- Subject extraction -----------------------------

/**
 * Walk a record's known subject-pointer paths and return true if any
 * resolves to `subjectUri`. Each lexicon has a slightly different
 * shape — encoded here per-lexicon rather than via a generic deep
 * walk to avoid false matches on unrelated `uri:` fields the
 * lexicons happen to carry.
 */
function recordPointsToSubject(
  lexicon: ContextLexicon,
  value: Record<string, unknown>,
  subjectUri: string,
): boolean {
  if (lexicon === "attachment" || lexicon === "measurement") {
    const subjects = value.subjects
    if (!Array.isArray(subjects)) return false
    return subjects.some(
      (s) =>
        s &&
        typeof s === "object" &&
        typeof (s as Record<string, unknown>).uri === "string" &&
        (s as Record<string, unknown>).uri === subjectUri,
    )
  }
  if (lexicon === "evaluation") {
    const subject = value.subject
    if (!subject || typeof subject !== "object") return false
    return (
      typeof (subject as Record<string, unknown>).uri === "string" &&
      (subject as Record<string, unknown>).uri === subjectUri
    )
  }
  if (lexicon === "collection") {
    const items = value.items
    if (!Array.isArray(items)) return false
    return items.some((it) => {
      if (!it || typeof it !== "object") return false
      const id = (it as Record<string, unknown>).itemIdentifier
      if (!id || typeof id !== "object") return false
      return (
        typeof (id as Record<string, unknown>).uri === "string" &&
        (id as Record<string, unknown>).uri === subjectUri
      )
    })
  }
  return false
}

// ------------------------- Per-lexicon normalize --------------------------

function pickString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null
}

/** Walk a leaflet linearDocument and concatenate the first block's
 *  plaintext into a short summary. Used by attachment / evaluation
 *  cards when the dedicated `summary` field is empty. */
function firstParagraphText(doc: unknown): string | null {
  if (!doc || typeof doc !== "object") return null
  const blocks = (doc as Record<string, unknown>).blocks
  if (!Array.isArray(blocks)) return null
  for (const entry of blocks) {
    const block = (entry as Record<string, unknown>)?.block
    if (!block || typeof block !== "object") continue
    const text = (block as Record<string, unknown>).plaintext
    if (typeof text === "string" && text.trim().length > 0) {
      return text.length > 280 ? `${text.slice(0, 280)}…` : text
    }
  }
  return null
}

function normalize(
  lexicon: ContextLexicon,
  record: PdsListRecord,
): CertContextItem {
  const value = record.value
  const parsed = parseAtUri(record.uri)
  const authorDid = parsed?.did ?? ""

  const createdAt = pickString(value.createdAt)
  let subtype: string | null = null
  let title = ""
  let summary: string | null = null

  if (lexicon === "attachment") {
    subtype = pickString(value.contentType)
    title = pickString(value.title) ?? "Untitled attachment"
    summary = firstParagraphText(value.description)
  } else if (lexicon === "evaluation") {
    title = pickString(value.summary)?.slice(0, 120) ?? "Evaluation"
    summary = pickString(value.summary)
    // No canonical subtype in the lexicon; expose the score's scale
    // when present so views can group evaluations by scoring rubric.
    const score = value.score as Record<string, unknown> | undefined
    if (score && typeof score === "object") {
      const max = score.max
      subtype = typeof max === "number" ? `0–${max}` : null
    }
  } else if (lexicon === "measurement") {
    const metric = pickString(value.metric) ?? "Measurement"
    const unit = pickString(value.unit) ?? ""
    const valStr = pickString(value.value) ?? ""
    title = `${metric}: ${valStr}${unit ? ` ${unit}` : ""}`.trim()
    summary = null
    subtype = metric
  } else if (lexicon === "collection") {
    subtype = pickString(value.type)
    title =
      pickString(value.title) ?? pickString(value.name) ?? "Untitled collection"
    summary = pickString(value.shortDescription)
  }

  return {
    uri: record.uri,
    lexicon,
    subtype,
    title,
    summary,
    createdAt,
    authorDid,
    raw: value,
  }
}

// ------------------------- Fetch + aggregate ----------------------------

async function listAndFilter(
  authorDid: string,
  lexicon: ContextLexicon,
  subjectUri: string,
  signal?: AbortSignal,
): Promise<CertContextItem[]> {
  const meta = CONTEXT_LEXICON_META[lexicon]
  const params = new URLSearchParams({
    repo: authorDid,
    collection: meta.nsid,
    limit: "50",
    reverse: "true",
  })

  const res = await authFetch(
    `/api/xrpc/com/atproto/repo/listRecords?${params.toString()}`,
    signal ? { signal } : undefined,
  )

  if (!res.ok) {
    // 400/404 = the repo has never written one of these. Empty list,
    // not an error.
    if (res.status === 400 || res.status === 404) return []
    throw new Error(
      `Failed to list ${meta.nsid} for ${authorDid}: ${res.status}`,
    )
  }

  const data = (await res.json()) as { records?: PdsListRecord[] }
  const records = data.records ?? []
  const matches = records.filter((r) =>
    recordPointsToSubject(lexicon, r.value, subjectUri),
  )

  return matches.map((r) => normalize(lexicon, r))
}

/**
 * Aggregate every CertContextItem that points at `subjectUri`,
 * across all four supported lexicons, from the subject author's PDS.
 *
 * Returns the items in `createdAt` DESC order with empty / missing
 * timestamps sorted last. Per-lexicon failures are swallowed so a
 * single empty-collection fetch doesn't take down the whole page.
 */
export async function fetchAllCertContext(
  subjectUri: string,
  signal?: AbortSignal,
): Promise<CertContextItem[]> {
  const authorDid = parseAtUri(subjectUri)?.did
  if (!authorDid) return []

  const lexicons: ContextLexicon[] = [
    "attachment",
    "evaluation",
    "measurement",
    "collection",
  ]

  const results = await Promise.all(
    lexicons.map((lex) =>
      listAndFilter(authorDid, lex, subjectUri, signal).catch((err) => {
        console.warn(`[cert-context] ${lex} fetch failed:`, err)
        return [] as CertContextItem[]
      }),
    ),
  )

  const merged = results.flat()
  merged.sort((a, b) => {
    const ac = a.createdAt ?? ""
    const bc = b.createdAt ?? ""
    if (!ac && !bc) return 0
    if (!ac) return 1
    if (!bc) return -1
    return ac < bc ? 1 : ac > bc ? -1 : 0
  })
  return merged
}
