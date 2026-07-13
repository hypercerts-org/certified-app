"use client"

import { useEffect, useState } from "react"
import type { CollectionRecord, CollectionValue } from "@/lib/atproto/collection"
import { INDEXER_PROXY_URL } from "@/lib/atproto/indexer"

/**
 * Given a cert (did + rkey), find every `org.hypercerts.collection`
 * record of type "project" whose `items[]` contains a strongRef to
 * this cert — across every DID, not just the cert author's own PDS.
 *
 * Powered by the indexer's `itemUri` promoted filter
 * (magic-indexer #110, certified-app #82). Previously this hook
 * scanned the cert author's own PDS via `listRecords` and silently
 * missed projects curated by other actors; the single GraphQL call
 * below replaces that stopgap and picks up cross-DID curation for
 * free.
 */
interface ProjectsContainingCertResponse {
  data?: {
    orgHypercertsCollection?: {
      edges: {
        node:
          | (Pick<CollectionRecord, "uri" | "cid"> & {
              did: string
              createdAt: string | null
              title: string | null
              shortDescription: string | null
              items: { itemIdentifier?: { uri?: string; cid?: string } }[] | null
              banner: unknown | null
            })
          | null
      }[]
    } | null
  } | null
  errors?: { message: string }[]
}

export function useCertProjects(did: string | null, rkey: string | null) {
  const [projects, setProjects] = useState<CollectionRecord[]>([])
  const [isLoading, setIsLoading] = useState(!!did && !!rkey)
  const [error, setError] = useState<string | null>(null)

  // Adjust state during render when the cert identity changes, so the
  // effect holds only the fetch lifecycle.
  const certKey = `${did}|${rkey}`
  const [prevCertKey, setPrevCertKey] = useState(certKey)
  if (prevCertKey !== certKey) {
    setPrevCertKey(certKey)
    setProjects([])
    setIsLoading(!!did && !!rkey)
    setError(null)
  }

  useEffect(() => {
    if (!did || !rkey) return

    const certUri = `at://${did}/org.hypercerts.claim.activity/${rkey}`
    const controller = new AbortController()
    const signal = controller.signal

    fetch(INDEXER_PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operationName: "ProjectsContainingCert",
        variables: { certUri, first: 50 },
      }),
      signal,
    })
      .then(async (res) => {
        if (signal.aborted) return
        if (!res.ok) throw new Error(`Indexer returned ${res.status}`)
        const json = (await res.json()) as ProjectsContainingCertResponse
        if (signal.aborted) return
        const edges = json.data?.orgHypercertsCollection?.edges ?? []
        const out: CollectionRecord[] = []
        for (const edge of edges) {
          if (!edge.node) continue
          const node = edge.node
          // Reconstruct the loose `CollectionRecord` shape the
          // downstream renderers expect. Items are normalised to
          // the same `{ itemIdentifier: { uri, cid } }` shape the
          // PDS path produced so the consumer doesn't have to
          // branch.
          const items = (node.items ?? [])
            .map((it) =>
              it?.itemIdentifier?.uri && it?.itemIdentifier?.cid
                ? {
                    itemIdentifier: {
                      uri: it.itemIdentifier.uri,
                      cid: it.itemIdentifier.cid,
                    },
                  }
                : null,
            )
            .filter((x): x is { itemIdentifier: { uri: string; cid: string } } => !!x)
          const value: CollectionValue = {
            $type: "org.hypercerts.collection",
            type: "project",
            title: node.title ?? undefined,
            shortDescription: node.shortDescription ?? undefined,
            createdAt: node.createdAt ?? undefined,
            items,
          }
          if (node.banner) {
            ;(value as Record<string, unknown>).banner = node.banner
          }
          out.push({ uri: node.uri, cid: node.cid, value })
        }
        setProjects(out)
      })
      .catch((err) => {
        if (signal.aborted) return
        console.error("[useCertProjects] indexer fetch failed:", err)
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load projects containing this activity",
        )
        setProjects([])
      })
      .finally(() => {
        if (!signal.aborted) setIsLoading(false)
      })

    return () => controller.abort()
  }, [did, rkey])

  return { projects, isLoading, error }
}
