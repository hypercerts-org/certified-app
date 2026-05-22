"use client"

import { useEffect, useState } from "react"
import {
  fetchIndexerActivities,
  fetchProjects,
} from "@/lib/atproto/indexer"
import { fetchNetworkActors } from "@/lib/atproto/workspace"
import type { NetworkActor } from "@/lib/atproto/workspace"
import type { ActivityRecord } from "@/lib/atproto/activity-types"
import type { CollectionRecord } from "@/lib/atproto/collection"
import { useAuth } from "@/lib/auth/auth-context"
import { useFollowing } from "@/hooks/use-following"
import { getRecentlyViewed } from "@/lib/utils/recently-viewed"
import type { ExploreKind } from "@/components/explore-page/explore-types"

interface ExploreData {
  users: NetworkActor[]
  projects: CollectionRecord[]
  certs: ActivityRecord[]
  /** URI → DID map for cert nodes — ActivityCard needs the author DID
   *  but ActivityRecord doesn't carry it directly. */
  certDids: Map<string, string>
  isLoading: boolean
}

const EMPTY: ExploreData = {
  users: [],
  projects: [],
  certs: [],
  certDids: new Map(),
  isLoading: false,
}

/**
 * Resolves (kind, filter, search) into the right fetcher.
 *
 * Filters that require a list of DIDs ("by follows", "by-me") are
 * built from the auth/follow context before the indexer fetch fires.
 * When the required source is empty (unauthenticated, or no
 * follows yet) we short-circuit to an empty result rather than
 * hitting the indexer with an empty filter.
 */
export function useExploreData(opts: {
  kind: ExploreKind
  filter: string
  search: string
}): ExploreData {
  const { kind, filter, search } = opts
  const { did: viewerDid } = useAuth()
  const { subjects: followedDids } = useFollowing(viewerDid)

  const [data, setData] = useState<ExploreData>(EMPTY)

  useEffect(() => {
    const controller = new AbortController()
    const signal = controller.signal

    async function run() {
      setData((prev) => ({ ...prev, isLoading: true }))
      try {
        if (kind === "users") {
          const next = await loadUsers({
            filter,
            search,
            viewerDid,
            followedDids,
            signal,
          })
          if (signal.aborted) return
          setData({ ...EMPTY, users: next, isLoading: false })
        } else if (kind === "projects") {
          const { projects, certDids } = await loadProjects({
            filter,
            search,
            viewerDid,
            followedDids,
            signal,
          })
          if (signal.aborted) return
          setData({
            ...EMPTY,
            projects,
            certDids,
            isLoading: false,
          })
        } else {
          const { certs, certDids } = await loadCerts({
            filter,
            search,
            viewerDid,
            followedDids,
            signal,
          })
          if (signal.aborted) return
          setData({ ...EMPTY, certs, certDids, isLoading: false })
        }
      } catch (err) {
        if (signal.aborted) return
        console.warn("[explore] fetch failed:", err)
        setData({ ...EMPTY, isLoading: false })
      }
    }
    run()
    return () => controller.abort()
  }, [kind, filter, search, viewerDid, followedDids])

  return data
}

// ----------------------------- Users -----------------------------------

async function loadUsers(args: {
  filter: string
  search: string
  viewerDid: string | null
  followedDids: Set<string>
  signal: AbortSignal
}): Promise<NetworkActor[]> {
  const { filter, search, viewerDid, followedDids, signal } = args
  // Source: always the indexer's NetworkActors list. The filters
  // below intersect that list with the viewer's follows /
  // recently-viewed set client-side. For the "all" / "new" cases we
  // pass straight through.
  const all = await fetchNetworkActors(60, signal)

  let scoped = all
  if (filter === "follows") {
    if (!viewerDid) return []
    scoped = all.filter((a) => followedDids.has(a.did))
  } else if (filter === "endorsed") {
    // TODO: requires the viewer's given-endorsement set. Returning
    // empty for now — surfaces the empty-state hint instead of
    // confusingly silent results.
    if (!viewerDid) return []
    return []
  } else if (filter === "recent") {
    const recent = getRecentlyViewed("user")
    const recentSet = new Set(recent)
    scoped = all
      .filter((a) => recentSet.has(a.did))
      .sort(
        (a, b) => recent.indexOf(a.did) - recent.indexOf(b.did),
      )
  } else if (filter === "new") {
    // "New" = head of the indexer's newest-first list (top 12).
    scoped = all.slice(0, 12)
  }

  if (search.trim().length > 0) {
    const q = search.trim().toLowerCase()
    scoped = scoped.filter((a) => {
      const name = (a.displayName ?? "").toLowerCase()
      const desc = (a.description ?? "").toLowerCase()
      return name.includes(q) || desc.includes(q) || a.did.includes(q)
    })
  }
  return scoped
}

// ----------------------------- Projects --------------------------------

async function loadProjects(args: {
  filter: string
  search: string
  viewerDid: string | null
  followedDids: Set<string>
  signal: AbortSignal
}): Promise<{
  projects: CollectionRecord[]
  certDids: Map<string, string>
}> {
  const { filter, search, viewerDid, followedDids, signal } = args
  const certDids = new Map<string, string>()

  if (filter === "by-me") {
    if (!viewerDid) return { projects: [], certDids }
    const r = await fetchProjects({
      authors: [viewerDid],
      search: search || undefined,
      first: 50,
      signal,
    })
    return { projects: r.records, certDids }
  }
  if (filter === "by-follows") {
    if (!viewerDid || followedDids.size === 0) return { projects: [], certDids }
    const r = await fetchProjects({
      authors: Array.from(followedDids),
      search: search || undefined,
      first: 50,
      signal,
    })
    return { projects: r.records, certDids }
  }
  if (filter === "by-endorsed") {
    return { projects: [], certDids }
  }
  if (filter === "recent") {
    const recent = getRecentlyViewed("project")
    if (recent.length === 0) return { projects: [], certDids }
    // No bulk-fetch-by-URI for collections in the indexer yet; pull
    // the network list and intersect. Cheap on dev (<300 projects).
    const all = await fetchProjects({ first: 100, signal })
    const recentSet = new Set(recent)
    const filtered = all.records
      .filter((p) => recentSet.has(p.uri))
      .sort((a, b) => recent.indexOf(a.uri) - recent.indexOf(b.uri))
    return { projects: filtered, certDids }
  }
  // "all" + "trending" — same data today; trending could become a
  // server-side flag later (e.g. most attachments in last 30 days).
  const r = await fetchProjects({
    search: search || undefined,
    first: 50,
    signal,
  })
  return { projects: r.records, certDids }
}

// ----------------------------- Certs -----------------------------------

async function loadCerts(args: {
  filter: string
  search: string
  viewerDid: string | null
  followedDids: Set<string>
  signal: AbortSignal
}): Promise<{
  certs: ActivityRecord[]
  certDids: Map<string, string>
}> {
  const { filter, search, viewerDid, followedDids, signal } = args

  if (filter === "by-me") {
    if (!viewerDid) return { certs: [], certDids: new Map() }
    const r = await fetchIndexerActivities({
      authors: [viewerDid],
      search: search || undefined,
      first: 50,
      signal,
    })
    return { certs: r.records, certDids: r.dids }
  }
  if (filter === "by-follows") {
    if (!viewerDid || followedDids.size === 0)
      return { certs: [], certDids: new Map() }
    const r = await fetchIndexerActivities({
      authors: Array.from(followedDids),
      search: search || undefined,
      first: 50,
      signal,
    })
    return { certs: r.records, certDids: r.dids }
  }
  if (filter === "by-contributor" || filter === "by-endorsed") {
    return { certs: [], certDids: new Map() }
  }
  if (filter === "recent") {
    const recent = getRecentlyViewed("cert")
    if (recent.length === 0) return { certs: [], certDids: new Map() }
    const all = await fetchIndexerActivities({ first: 100, signal })
    const recentSet = new Set(recent)
    const filteredDids = new Map<string, string>()
    const filteredRecords = all.records
      .filter((r) => recentSet.has(r.uri))
      .sort((a, b) => recent.indexOf(a.uri) - recent.indexOf(b.uri))
    for (const r of filteredRecords) {
      const d = all.dids.get(r.uri)
      if (d) filteredDids.set(r.uri, d)
    }
    return { certs: filteredRecords, certDids: filteredDids }
  }
  // "all"
  const r = await fetchIndexerActivities({
    search: search || undefined,
    first: 50,
    signal,
  })
  return { certs: r.records, certDids: r.dids }
}
