"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  fetchEndorsements,
  fetchIndexerActivities,
  fetchProjects,
} from "@/lib/atproto/indexer"
import type { ActivityRecord } from "@/lib/atproto/activity-types"
import type { CollectionRecord } from "@/lib/atproto/collection"

/**
 * Discriminated union of the timeline event kinds we can construct
 * from the current indexer surface (Activities / Endorsements /
 * Collections). Each variant carries the author DID, the createdAt
 * timestamp used for merging, and enough record-specific payload for
 * the renderer to compose the verb sentence + permalink.
 *
 * The magic-indexer would need a unified events endpoint to support
 * edit events ("alice updated a cert"), badge issuance, etc. — see
 * the open tracking issue. For now we stick to "create" verbs
 * because that's all the current ops emit.
 */
export type HomeFeedEvent =
  | {
      kind: "cert.create"
      uri: string
      actor: string
      createdAt: string
      record: ActivityRecord
    }
  | {
      kind: "project.create"
      uri: string
      actor: string
      createdAt: string
      record: CollectionRecord
    }
  | {
      kind: "endorsement.create"
      uri: string
      actor: string
      createdAt: string
      subjectDid: string
    }

const PER_SOURCE_LIMIT = 25
const DISPLAY_CAP = 60

interface State {
  events: HomeFeedEvent[]
  isLoading: boolean
  error: string | null
}

const EMPTY_STATE: State = { events: [], isLoading: true, error: null }

/**
 * Aggregator hook that powers the GitHub-style activity feed on the
 * home page. Given a set of followed DIDs (union of Bluesky +
 * Certified follow graphs from `useFollowedDids`), it fans out across
 * the three existing indexer ops the home feed cares about — cert
 * creations, project creations, and endorsement awards — merges the
 * payloads into a single timestamp-sorted stream, and exposes it as
 * a flat `HomeFeedEvent[]` for the renderer.
 *
 * Pagination is intentionally absent in this first cut: the indexer
 * doesn't yet expose a unified events endpoint, so client-side
 * "load more" would have to maintain three independent cursors and
 * re-sort on every page. The MVP fetches `PER_SOURCE_LIMIT` rows
 * from each source, merges, and caps the displayed total at
 * `DISPLAY_CAP`. Once the indexer ships a unified op (see the open
 * tracking issue) this hook collapses to a single fetch with a
 * stable cursor.
 */
export function useHomeFeed(followedDids: Set<string>) {
  const [state, setState] = useState<State>(EMPTY_STATE)

  // Stable string key so the effect doesn't refetch on every render
  // when the parent recreates the Set instance (it does — useMemo
  // returns a new Set whenever the union recomputes).
  const followedKey = useMemo(() => {
    if (followedDids.size === 0) return "[]"
    return Array.from(followedDids).sort().join(",")
  }, [followedDids])

  // Carry the latest set into the effect closure without re-running.
  const followedRef = useRef(followedDids)
  followedRef.current = followedDids

  const load = useCallback(async (signal: AbortSignal) => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }))
    const authors = Array.from(followedRef.current)
    if (authors.length === 0) {
      setState({ events: [], isLoading: false, error: null })
      return
    }
    try {
      const [activities, projects, endorsements] = await Promise.all([
        fetchIndexerActivities({
          first: PER_SOURCE_LIMIT,
          authors,
          signal,
        }).catch((err) => {
          console.warn("[home-feed] activities fetch failed:", err)
          return { records: [] as ActivityRecord[] }
        }),
        fetchProjects({ first: PER_SOURCE_LIMIT, authors, signal }).catch(
          (err) => {
            console.warn("[home-feed] projects fetch failed:", err)
            return { records: [] as CollectionRecord[] }
          },
        ),
        fetchEndorsements({ authors, signal }).catch((err) => {
          console.warn("[home-feed] endorsements fetch failed:", err)
          return []
        }),
      ])

      if (signal.aborted) return

      const events: HomeFeedEvent[] = []

      for (const rec of activities.records) {
        const createdAt =
          typeof rec.value.createdAt === "string" ? rec.value.createdAt : ""
        if (!createdAt) continue
        const actor = parseDidFromAtUri(rec.uri)
        if (!actor) continue
        events.push({
          kind: "cert.create",
          uri: rec.uri,
          actor,
          createdAt,
          record: rec,
        })
      }

      for (const rec of projects.records) {
        const createdAt =
          typeof rec.value.createdAt === "string" ? rec.value.createdAt : ""
        if (!createdAt) continue
        // Drop endorsement-list collections — they're a separate
        // surface (Lists tab) and shouldn't read as "created a
        // project" in the timeline.
        const collectionType = typeof rec.value.type === "string"
          ? rec.value.type.toLowerCase()
          : ""
        if (collectionType && collectionType !== "project") continue
        const actor = parseDidFromAtUri(rec.uri)
        if (!actor) continue
        events.push({
          kind: "project.create",
          uri: rec.uri,
          actor,
          createdAt,
          record: rec,
        })
      }

      for (const endorsement of endorsements.slice(0, PER_SOURCE_LIMIT)) {
        if (!endorsement.createdAt) continue
        events.push({
          kind: "endorsement.create",
          uri: endorsement.uri,
          actor: endorsement.author,
          createdAt: endorsement.createdAt,
          subjectDid: endorsement.subject,
        })
      }

      events.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      setState({
        events: events.slice(0, DISPLAY_CAP),
        isLoading: false,
        error: null,
      })
    } catch (err) {
      if (signal.aborted) return
      console.error("[home-feed] aggregate fetch failed:", err)
      setState({
        events: [],
        isLoading: false,
        error: err instanceof Error ? err.message : "Failed to load feed",
      })
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
    // The followedKey dep covers contents-change; load is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followedKey])

  return state
}

function parseDidFromAtUri(uri: string): string | null {
  if (!uri.startsWith("at://")) return null
  const slash = uri.indexOf("/", 5)
  if (slash === -1) return null
  const did = uri.slice(5, slash)
  return did.startsWith("did:") ? did : null
}
