"use client"

import { useEffect, useState } from "react"
import {
  fetchIndexerActivities,
  fetchProjects,
  fetchUserIndexerActivities,
} from "@/lib/atproto/indexer"
import {
  fetchNetworkActors,
  fetchOrganizationDids,
} from "@/lib/atproto/workspace"
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

// Module-cached org-DID set — small, doesn't change often.
//
// NOTE on signal handling: we deliberately do NOT thread the caller's
// AbortSignal into the shared fetch. The promise is shared across
// every concurrent caller; if the first caller aborts, the underlying
// request would be canceled and every subsequent awaiter would
// resolve to an empty / errored set. Better: let the fetch run to
// completion regardless of any one caller's abort, and have each
// caller short-circuit on their own signal after the awaited result
// lands.
let orgDidsCache: Set<string> | null = null
let orgDidsInflight: Promise<Set<string>> | null = null
function getOrgDids(): Promise<Set<string>> {
  if (orgDidsCache) return Promise.resolve(orgDidsCache)
  if (!orgDidsInflight) {
    orgDidsInflight = fetchOrganizationDids(200)
      .then((set) => {
        orgDidsCache = set
        return set
      })
      .catch((err) => {
        console.warn("[explore] org-dids fetch failed:", err)
        return new Set<string>()
      })
      .finally(() => {
        orgDidsInflight = null
      })
  }
  return orgDidsInflight
}

/**
 * Resolves (kind, filter, sub, search) into the right fetcher.
 *
 * The sub-category is a viewer-relation refinement that composes with
 * the filter list:
 *   - Users · individuals  → exclude orgs from the resolved actor list
 *   - Users · groups       → keep only orgs
 *   - Certs · created      → AND with author = viewer (overrides
 *                            the filter's author scope)
 *   - Certs · contributed  → AND with contributor = viewer
 *
 * "Created"/"Contributed" require a signed-in viewer; otherwise the
 * UI disables those options.
 */
export function useExploreData(opts: {
  kind: ExploreKind
  filter: string
  sub: string
  search: string
}): ExploreData {
  const { kind, filter, sub, search } = opts
  const { did: viewerDid } = useAuth()
  const { subjects: followedDids } = useFollowing(viewerDid)

  const [data, setData] = useState<ExploreData>(EMPTY)

  useEffect(() => {
    const controller = new AbortController()
    const signal = controller.signal

    async function run() {
      setData((prev) => ({ ...prev, isLoading: true }))
      try {
        if (kind === "accounts") {
          const next = await loadUsers({
            filter,
            sub,
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
            sub,
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
  }, [kind, filter, sub, search, viewerDid, followedDids])

  return data
}

// ----------------------------- Users -----------------------------------

async function loadUsers(args: {
  filter: string
  sub: string
  search: string
  viewerDid: string | null
  followedDids: Set<string>
  signal: AbortSignal
}): Promise<NetworkActor[]> {
  const { filter, sub, search, viewerDid, followedDids, signal } = args
  const [all, orgDids] = await Promise.all([
    fetchNetworkActors(60, signal),
    sub !== "all" ? getOrgDids() : Promise.resolve(new Set<string>()),
  ])

  let scoped = all
  if (filter === "follows") {
    if (!viewerDid) return []
    scoped = all.filter((a) => followedDids.has(a.did))
  } else if (filter === "endorsed") {
    if (!viewerDid) return []
    return []
  } else if (filter === "recent") {
    const recent = getRecentlyViewed("user")
    const recentSet = new Set(recent)
    scoped = all
      .filter((a) => recentSet.has(a.did))
      .sort((a, b) => recent.indexOf(a.did) - recent.indexOf(b.did))
  } else if (filter === "new") {
    scoped = all.slice(0, 12)
  }

  // Sub-category: split people vs organizations via the org-DID set.
  if (sub === "people") {
    scoped = scoped.filter((a) => !orgDids.has(a.did))
  } else if (sub === "organizations") {
    scoped = scoped.filter((a) => orgDids.has(a.did))
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
    const all = await fetchProjects({ first: 100, signal })
    const recentSet = new Set(recent)
    const filtered = all.records
      .filter((p) => recentSet.has(p.uri))
      .sort((a, b) => recent.indexOf(a.uri) - recent.indexOf(b.uri))
    return { projects: filtered, certDids }
  }
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
  sub: string
  search: string
  viewerDid: string | null
  followedDids: Set<string>
  signal: AbortSignal
}): Promise<{
  certs: ActivityRecord[]
  certDids: Map<string, string>
}> {
  const { filter, sub, search, viewerDid, followedDids, signal } = args

  // Sub-category override: "created" / "contributed" pin the viewer
  // relation regardless of the filter list. Requires a signed-in
  // viewer; otherwise we fall through to the filter-only path with
  // sub treated as "all".
  if (sub === "created" && viewerDid) {
    const r = await fetchUserIndexerActivities(viewerDid, {
      mode: "authored",
      search: search || undefined,
      first: 50,
      signal,
    })
    return { certs: r.records, certDids: r.dids }
  }
  if (sub === "contributed" && viewerDid) {
    const r = await fetchUserIndexerActivities(viewerDid, {
      mode: "contributed",
      search: search || undefined,
      first: 50,
      signal,
    })
    return { certs: r.records, certDids: r.dids }
  }

  // sub === "all" (or signed out with sub != all — same fallback)
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
  const r = await fetchIndexerActivities({
    search: search || undefined,
    first: 50,
    signal,
  })
  return { certs: r.records, certDids: r.dids }
}
