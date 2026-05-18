"use client"

import { useCallback, useEffect, useState } from "react"
import {
  listAwards,
  listDefinitions,
  ENDORSEMENT_BADGE_TITLE,
  ENDORSEMENT_BADGE_TYPE,
  type BadgeAwardRecord,
  type BadgeDefinitionValue,
} from "@/lib/atproto/badges"

/**
 * A user's endorsement award, with the subject DID pre-extracted
 * from the (string-or-strongRef) `subject` union and the note
 * surfaced for display. Shape is intentionally close to the previous
 * `EndorsementRecord` so callers don't all need rewriting.
 */
export interface GivenEndorsement {
  uri: string
  cid: string
  rkey: string
  subjectDid: string
  createdAt: string
  note?: string
  /** Title of the list this endorsement was awarded under, when it
   *  belongs to a user-created list rather than the default
   *  "Endorsement" definition. `undefined` for default endorsements. */
  listTitle?: string
}

/**
 * Fetch and track the endorsement awards **given** by a user — read
 * from their own PDS via two listRecords calls:
 *
 *   1. `app.certified.badge.definition` to find every definition the
 *      user owns
 *   2. `app.certified.badge.award` to list all awards they've issued
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

        // Build a URI → title map of endorsement-typed definitions
        // owned by this user. The default endorsement def keeps the
        // reserved title "Endorsement"; anything else with this
        // badgeType is a user-created list. Attaching the title to
        // each award lets the UI surface the list name when
        // rendering Given cards on the endorsements tab.
        const endorsementDefs = new Map<string, string>()
        for (const d of defs) {
          if (isEndorsementDefinition(d.value)) {
            endorsementDefs.set(d.uri, d.value.title)
          }
        }

        const mapped = awards
          .filter((a) => endorsementDefs.has(a.value.badge?.uri ?? ""))
          .map((award) => {
            const defTitle = endorsementDefs.get(award.value.badge?.uri ?? "")
            return toGiven(award, defTitle)
          })
          .filter((e): e is GivenEndorsement => e !== null)

        // Newest first by createdAt — matches the Received view and
        // shields against PDS ordering quirks (listAwards passes
        // `reverse: true`, which surfaces records in ascending TID
        // order on most implementations).
        mapped.sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))

        setEndorsements(mapped)
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

function isEndorsementDefinition(v: BadgeDefinitionValue): boolean {
  return v?.badgeType === ENDORSEMENT_BADGE_TYPE
}

function toGiven(
  award: BadgeAwardRecord,
  defTitle: string | undefined,
): GivenEndorsement | null {
  const subjectDid = extractSubjectDid(award.value.subject)
  if (!subjectDid) return null
  // Only attach `listTitle` for awards under a user-created list —
  // the default "Endorsement" def is the implicit fallback, so its
  // title would be noise on the card.
  const isList = !!defTitle && defTitle !== ENDORSEMENT_BADGE_TITLE
  return {
    uri: award.uri,
    cid: award.cid,
    rkey: award.rkey,
    subjectDid,
    createdAt: award.value.createdAt,
    note: award.value.note,
    listTitle: isList ? defTitle : undefined,
  }
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
