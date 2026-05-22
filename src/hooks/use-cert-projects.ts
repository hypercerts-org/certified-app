"use client"

import { useEffect, useState } from "react"
import { fetchCollections, type CollectionRecord } from "@/lib/atproto/collection"
import { parseAtUri } from "@/lib/atproto/activity-uri"

/**
 * Given a cert (did + rkey), find every `org.hypercerts.collection`
 * record on the same actor's PDS whose `value.type === "project"` and
 * whose `value.items[]` strong-refs this cert's URI.
 *
 * Implementation note — indexer choice:
 *   The Magic Indexer doesn't yet expose a `where` filter that can
 *   look inside `items[].itemIdentifier.uri` on a project collection,
 *   so we can't do a cross-DID "which projects contain this cert"
 *   query server-side. Tracked on hypercerts-org/magic-indexer#110.
 *
 *   As a stopgap we list the cert author's most recent
 *   `org.hypercerts.collection` records on their own PDS via
 *   `com.atproto.repo.listRecords` and filter client-side. This
 *   matches the assumption used elsewhere in the app that a project
 *   is curated by the same actor that minted the certs it contains.
 *   When the indexer ships the `containsItemUri` filter, this hook
 *   can migrate to a single GraphQL call and pick up cross-DID
 *   projects for free.
 */
export function useCertProjects(did: string | null, rkey: string | null) {
  const [projects, setProjects] = useState<CollectionRecord[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!did || !rkey) {
      setProjects([])
      setIsLoading(false)
      setError(null)
      return
    }

    const certUri = `at://${did}/org.hypercerts.claim.activity/${rkey}`
    const controller = new AbortController()
    const signal = controller.signal

    setIsLoading(true)
    setError(null)

    fetchCollections(did, undefined, 50, signal)
      .then((data) => {
        if (signal.aborted) return
        const filtered = data.records.filter((r) => {
          // Same case-insensitive match as `useUserProjects` — records
          // in the wild store the discriminator as "project", "Project",
          // or "PROJECT".
          const isProject =
            typeof r.value?.type === "string" &&
            r.value.type.toLowerCase() === "project"
          if (!isProject) return false

          const items = r.value.items
          if (!Array.isArray(items)) return false

          return items.some((it) => {
            if (!it || typeof it !== "object") return false
            const id = (it as Record<string, unknown>).itemIdentifier
            if (!id || typeof id !== "object") return false
            const uri = (id as Record<string, unknown>).uri
            if (typeof uri !== "string") return false
            // Case-sensitive equality is fine for at:// URIs — both sides
            // are constructed from canonical DID + rkey strings, so we
            // don't need the `eqi` workaround that the type filter does.
            if (uri === certUri) return true
            // Defensive: allow a parsed match in case the stored URI
            // has slightly different encoding (the AT Proto spec
            // forbids variants but indexed records sometimes do).
            const parsed = parseAtUri(uri)
            return (
              parsed?.did === did &&
              parsed.collection === "org.hypercerts.claim.activity" &&
              parsed.rkey === rkey
            )
          })
        })
        setProjects(filtered)
      })
      .catch((err) => {
        if (signal.aborted) return
        console.error("Failed to fetch cert projects:", err)
        setError(err instanceof Error ? err.message : "Failed to fetch projects")
      })
      .finally(() => {
        if (!signal.aborted) setIsLoading(false)
      })

    return () => controller.abort()
  }, [did, rkey])

  return { projects, isLoading, error }
}
