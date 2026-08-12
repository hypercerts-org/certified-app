"use client"

import { useEffect, useState } from "react"
import { authFetch } from "@/lib/auth/fetch"
import { parseAtUri } from "@/lib/atproto/activity-uri"
import { createBoundedCache } from "@/lib/utils/bounded-cache"

/**
 * Shape of an `org.hypercerts.claim.contributorInformation` record
 * value. Only the fields we actually render are typed — the rest of
 * the record is ignored.
 *
 * Field purposes, from observed records in the wild:
 *   - displayName: human-readable name ("s-adamantine", "sharfyae.bsky.social")
 *   - identifier:  free-form identifier — sometimes an atproto handle,
 *                  sometimes a GitHub URL, sometimes something else
 *   - image:       either a hypercerts uri-typed object (external URL)
 *                  or (less commonly) a blob — we only read the URI
 *                  variant here because it covers 100% of real records
 *                  so far.
 */
export interface ContributorInformationRecord {
  displayName?: string
  identifier?: string
  image?: {
    $type?: string
    uri?: string
  }
}

// Module-level cache so the same contributorInformation record
// referenced by multiple activities only fetches once per session.
const cache = createBoundedCache<string, Promise<ContributorInformationRecord | null>>()

function fetchByUri(
  uri: string
): Promise<ContributorInformationRecord | null> {
  const existing = cache.get(uri)
  if (existing) return existing

  const parsed = parseAtUri(uri)
  if (!parsed) return Promise.resolve(null)

  // The XRPC proxy handles foreign-repo getRecord by resolving the
  // target PDS and doing a public unauthenticated fetch, so this
  // works regardless of whether the viewer is signed in.
  const params = new URLSearchParams({
    repo: parsed.did,
    collection: parsed.collection,
    rkey: parsed.rkey,
  })

  const p = authFetch(
    `/api/xrpc/com/atproto/repo/getRecord?${params.toString()}`
  )
    .then((res) => (res.ok ? res.json() : null))
    .then(
      (data: { value?: ContributorInformationRecord } | null) =>
        data?.value ?? null
    )
    .catch(() => {
      // Invalidate on error so a later mount can retry.
      cache.delete(uri)
      return null
    })

  cache.set(uri, p)
  return p
}

/**
 * Fetch the `contributorInformation` record pointed at by a strong
 * ref URI. Returns null for non-atproto URIs or if the fetch fails.
 */
export function useContributorInformationRecord(uri: string | null | undefined): {
  record: ContributorInformationRecord | null
  isLoading: boolean
} {
  const enabled = !!uri && uri.startsWith("at://")
  const [record, setRecord] = useState<ContributorInformationRecord | null>(
    null
  )
  const [isLoading, setIsLoading] = useState(enabled)

  // Adjust state during render when the target URI changes, so the effect
  // holds only the fetch lifecycle.
  const [prevUri, setPrevUri] = useState(uri)
  if (prevUri !== uri) {
    setPrevUri(uri)
    setRecord(null)
    setIsLoading(enabled)
  }

  useEffect(() => {
    if (!enabled || !uri) return
    let cancelled = false
    fetchByUri(uri).then((r) => {
      if (cancelled) return
      setRecord(r)
      setIsLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [enabled, uri])

  return { record, isLoading }
}
