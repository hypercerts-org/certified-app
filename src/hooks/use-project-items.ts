"use client"

import { useEffect, useState } from "react"
import { authFetch } from "@/lib/auth/fetch"
import { parseAtUri } from "@/lib/atproto/activity-uri"
import type { ActivityRecord, ClaimActivity } from "@/lib/atproto/activity-types"

const ACTIVITY_COLLECTION = "org.hypercerts.claim.activity"

/**
 * Shape of a single entry inside a project's `items[]` array. We only
 * narrow the fields we render with — the lexicon allows other fields
 * (e.g. `itemWeight`) that the detail view currently ignores.
 */
interface ProjectItem {
  itemIdentifier?: {
    uri?: string
    cid?: string
  }
}

export interface ProjectItemResolution {
  /** The strong-ref URI from the project record. */
  uri: string
  /** Parsed DID from the URI, for ActivityCard's author byline. */
  did: string | null
  /** The resolved activity record, or null if not yet loaded / failed. */
  record: ActivityRecord | null
  /** Per-item load error message, or null on success / still loading. */
  error: string | null
}

/**
 * Resolve a project's `items[]` strong-refs to their underlying
 * activity records via `com.atproto.repo.getRecord`. Items that point
 * at non-activity collections (e.g. nested sub-collections) are
 * skipped so callers only get cert cards.
 *
 * Each item is fetched independently and surfaced as it lands; a
 * single failed item doesn't block the rest. Returns an ordered list
 * matching the input order so the project's curated ordering is
 * preserved on screen.
 */
export function useProjectItems(items: unknown): {
  resolutions: ProjectItemResolution[]
  isLoading: boolean
} {
  const [resolutions, setResolutions] = useState<ProjectItemResolution[]>([])
  const [isLoading, setIsLoading] = useState(false)

  // Stringify the URIs into a stable key so the effect only re-runs
  // when the actual list of URIs changes (not on every re-render
  // where the parent rebuilds the array reference).
  const uriList: string[] = Array.isArray(items)
    ? items
        .map((it) => {
          if (!it || typeof it !== "object") return null
          const id = (it as ProjectItem).itemIdentifier
          if (!id || typeof id !== "object") return null
          return typeof id.uri === "string" ? id.uri : null
        })
        .filter((u): u is string => {
          if (!u) return false
          const parsed = parseAtUri(u)
          return parsed?.collection === ACTIVITY_COLLECTION
        })
    : []
  const key = uriList.join("|")

  useEffect(() => {
    if (uriList.length === 0) {
      setResolutions([])
      setIsLoading(false)
      return
    }

    const controller = new AbortController()
    const signal = controller.signal

    // Seed with placeholders so the UI can show "loading N items".
    const initial: ProjectItemResolution[] = uriList.map((uri) => {
      const parsed = parseAtUri(uri)
      return {
        uri,
        did: parsed?.did ?? null,
        record: null,
        error: null,
      }
    })
    setResolutions(initial)
    setIsLoading(true)

    async function run() {
      const next = [...initial]
      await Promise.all(
        uriList.map(async (uri, idx) => {
          const parsed = parseAtUri(uri)
          if (!parsed) {
            next[idx] = { ...next[idx], error: "Malformed item URI" }
            return
          }
          try {
            const params = new URLSearchParams({
              repo: parsed.did,
              collection: parsed.collection,
              rkey: parsed.rkey,
            })
            const res = await authFetch(
              `/api/xrpc/com/atproto/repo/getRecord?${params.toString()}`,
              { signal },
            )
            if (signal.aborted) return
            if (!res.ok) {
              throw new Error(
                res.status === 404
                  ? "Cert not found"
                  : `Failed to load cert (${res.status})`,
              )
            }
            const data = (await res.json()) as {
              uri: string
              cid: string
              value: ClaimActivity
            }
            next[idx] = {
              ...next[idx],
              record: {
                uri: data.uri,
                cid: data.cid,
                value: data.value,
              },
            }
          } catch (err) {
            if (signal.aborted) return
            next[idx] = {
              ...next[idx],
              error:
                err instanceof Error ? err.message : "Failed to load cert",
            }
          }
        }),
      )
      if (signal.aborted) return
      setResolutions(next)
      setIsLoading(false)
    }
    run()

    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return { resolutions, isLoading }
}
