"use client"

import { useCallback, useEffect, useState } from "react"
import {
  listAwards,
  listDefinitions,
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
    async (signal?: AbortSignal) => {
      if (!did) {
        setEndorsements([])
        setIsLoading(false)
        setError(null)
        return
      }
      setIsLoading(true)
      setError(null)
      try {
        const [defs, awards] = await Promise.all([
          listDefinitions(did, signal),
          listAwards(did, signal),
        ])
        if (signal?.aborted) return

        // Build the set of endorsement-definition URIs owned by this
        // user. Then filter their awards to only those referencing
        // one of those definitions. We expect a single endorsement
        // definition per user, but tolerate more (e.g. if they ever
        // recreate one).
        const endorsementDefUris = new Set(
          defs
            .filter((d) => isEndorsementDefinition(d.value))
            .map((d) => d.uri),
        )

        const mapped = awards
          .filter((a) => endorsementDefUris.has(a.value.badge?.uri ?? ""))
          .map(toGiven)
          .filter((e): e is GivenEndorsement => e !== null)

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

  const refetch = useCallback(() => load(), [load])

  return { endorsements, isLoading, error, refetch }
}

function isEndorsementDefinition(v: BadgeDefinitionValue): boolean {
  return v?.badgeType === ENDORSEMENT_BADGE_TYPE
}

function toGiven(award: BadgeAwardRecord): GivenEndorsement | null {
  const subject = award.value.subject
  const subjectDid =
    typeof subject === "string"
      ? subject
      : extractDidFromStrongRefUri(subject?.uri)
  if (!subjectDid) return null
  return {
    uri: award.uri,
    cid: award.cid,
    rkey: award.rkey,
    subjectDid,
    createdAt: award.value.createdAt,
    note: award.value.note,
  }
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
