"use client"

import { useCallback, useEffect, useState } from "react"
import {
  listAwards,
  listDefinitions,
  endorsementDefUriSet,
  type BadgeAwardRecord,
} from "@/lib/atproto/badges"

/**
 * A user's endorsement award, with the subject DID pre-extracted
 * from the (string-or-strongRef) `subject` union and the note
 * surfaced for display.
 */
export interface GivenEndorsement {
  uri: string
  cid: string
  rkey: string
  /**
   * Every award rkey issued to this recipient. The "Given" view counts
   * UNIQUE endorsed accounts (one entry per recipient) to match the
   * /endorsement-graph graph, which dedupes issuer→subject edges — so a
   * recipient endorsed more than once collapses to a single entry whose
   * `rkey`/`uri`/`cid` are the NEWEST award and whose `rkeys` lists all of
   * them. Revoking the entry removes every award in `rkeys`.
   */
  rkeys: string[]
  subjectDid: string
  createdAt: string
  note?: string
  /**
   * Vestigial — kept for `<PersonCard listTitle?: string>` prop-shape
   * continuity. Always `undefined` after the lists-as-collections
   * migration: there's only one endorsement definition per issuer
   * now, and lists are a separate curation overlay (see
   * `docs/lists-as-collections/`). Multi-list chip rendering on the
   * Given panel is deferred — when it lands, replace this field with
   * `lists: string[]` populated from the issuer's collection records.
   */
  listTitle?: string
}

/**
 * Fetch and track the endorsement awards **given** by a user — read
 * from their own PDS via two listRecords calls:
 *
 *   1. `app.certified.badge.definition` to find the issuer's
 *      endorsement-typed definition(s).
 *   2. `app.certified.badge.award` to list all awards they've issued.
 *
 * We then keep only awards whose `badge.uri` resolves to a definition
 * with `badgeType === "endorsement"`. This sidesteps the indexer
 * entirely for the Given view — fresh on every reload, no caching
 * concerns, and works for unauthenticated visitors.
 *
 * Re-fetches when `did` changes; exposes `refetch` for create/delete
 * paths to refresh the list.
 */
export function useGivenEndorsements(did: string | null): {
  endorsements: GivenEndorsement[]
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
} {
  const [endorsements, setEndorsements] = useState<GivenEndorsement[]>([])
  const [isLoading, setIsLoading] = useState(!!did)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(
    async (signal?: AbortSignal, force?: boolean) => {
      if (!did) {
        setEndorsements([])
        setIsLoading(false)
        setError(null)
        return
      }
      setIsLoading(true)
      setError(null)
      try {
        // `force` (set by refetch after a write) bypasses the proxy's
        // 5s same-session listRecords cache so the just-deleted /
        // just-created record is reflected immediately.
        const opts = force ? { noCache: true } : undefined
        const [defs, awards] = await Promise.all([
          listDefinitions(did, signal, opts),
          listAwards(did, signal, opts),
        ])
        if (signal?.aborted) return

        // Build the set of endorsement-typed definition URIs the awards
        // reference — used to filter awards to "actually endorsements"
        // (vs. some other badgeType). This spans BOTH the user's own
        // definitions AND any centrally-defined badge owned by another
        // account (e.g. a Trusted Evaluator endorsing on behalf of an
        // organisation with Ma Earth's "Organization Endorsement" badge),
        // which earlier own-repo-only filtering dropped.
        const endorsementDefUris = await endorsementDefUriSet(
          awards,
          defs,
          signal,
          opts,
        )
        if (signal?.aborted) return

        const mapped = awards
          .filter((a) => endorsementDefUris.has(a.value.badge?.uri ?? ""))
          .map(toGiven)
          .filter((e): e is GivenEndorsement => e !== null)

        // Newest first by createdAt — matches the Received view and
        // shields against PDS ordering quirks (listAwards passes
        // `reverse: true`, which surfaces records in ascending TID
        // order on most implementations).
        mapped.sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))

        // Collapse repeat endorsements of the same account into one
        // entry (sorted newest-first, so the first seen is the
        // representative). The count then reflects UNIQUE recipients,
        // matching the /endorsement-graph graph.
        setEndorsements(dedupeBySubject(mapped))
      } catch (err) {
        if (signal?.aborted) return
        setError(
          err instanceof Error ? err.message : "Failed to load endorsements",
        )
      } finally {
        if (!signal?.aborted) setIsLoading(false)
      }
    },
    [did],
  )

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  const refetch = useCallback(() => load(undefined, true), [load])

  return { endorsements, isLoading, error, refetch }
}

function toGiven(award: BadgeAwardRecord): GivenEndorsement | null {
  const subjectDid = extractSubjectDid(award.value.subject)
  if (!subjectDid) return null
  return {
    uri: award.uri,
    cid: award.cid,
    rkey: award.rkey,
    rkeys: [award.rkey],
    subjectDid,
    createdAt: award.value.createdAt,
    note: award.value.note,
    // listTitle intentionally unset — see interface JSDoc.
  }
}

/**
 * Collapse multiple awards to the same recipient into a single
 * GivenEndorsement. Input must be sorted newest-first so the first
 * occurrence becomes the representative; every award's rkey is gathered
 * into `rkeys` so a revoke can remove them all.
 */
function dedupeBySubject(records: GivenEndorsement[]): GivenEndorsement[] {
  const byDid = new Map<string, GivenEndorsement>()
  for (const r of records) {
    const existing = byDid.get(r.subjectDid)
    if (existing) {
      existing.rkeys.push(...r.rkeys)
    } else {
      byDid.set(r.subjectDid, { ...r, rkeys: [...r.rkeys] })
    }
  }
  return [...byDid.values()]
}

/**
 * Pull the target DID out of a badge.award `subject`, regardless of
 * which of the three subject shapes the producer wrote:
 *
 *   - bare DID string
 *   - {did: "did:plc:..."}                  (app.certified.defs#did)
 *   - {uri: "at://did:plc:.../...", cid}    (com.atproto.repo.strongRef)
 */
function extractSubjectDid(
  subject: BadgeAwardRecord["value"]["subject"],
): string | null {
  if (typeof subject === "string") return subject || null
  if (subject && typeof subject === "object") {
    if ("did" in subject && typeof subject.did === "string") {
      return subject.did || null
    }
    if ("uri" in subject) {
      return extractDidFromStrongRefUri(subject.uri)
    }
  }
  return null
}

/**
 * For a strong-ref subject, the DID is the first path segment after
 * `at://`. Returns null on any unexpected shape.
 */
function extractDidFromStrongRefUri(uri: string | undefined): string | null {
  if (typeof uri !== "string" || !uri.startsWith("at://")) return null
  const tail = uri.slice("at://".length)
  const slash = tail.indexOf("/")
  return slash > 0 ? tail.slice(0, slash) : tail || null
}
