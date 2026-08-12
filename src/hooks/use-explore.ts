"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import type { FundingReceipt } from "@/lib/atproto/indexer"
import {
  subscribeClosureCacheVersion,
  getClosureCacheVersionSnapshot,
} from "@/lib/atproto/endorsement-closure-cache"
import type { NetworkActor } from "@/lib/atproto/workspace"
import type { ActivityRecord } from "@/lib/atproto/activity-types"
import type { CollectionRecord } from "@/lib/atproto/collection"
import { useAuth } from "@/lib/auth/auth-context"
import { useOrg } from "@/lib/groups/org-context"
import { managedAuthorDids as computeManagedAuthorDids } from "@/lib/groups/managed"
import { useFollowing } from "@/hooks/use-following"
import type { ExploreKind } from "@/components/explore-page/explore-types"
import { loadPage, PAGE_SIZE } from "@/hooks/use-explore-loaders"
import type { EndorsementClosureMeta } from "@/hooks/use-explore-loaders"

interface ExploreData {
  users: NetworkActor[]
  projects: CollectionRecord[]
  certs: ActivityRecord[]
  certDids: Map<string, string>
  /** Funding receipts (the "funding" kind), already gated to those with
   *  at least one account side. Empty for every other kind. */
  fundingReceipts: FundingReceipt[]
  isLoading: boolean
  isLoadingMore: boolean
  hasMore: boolean
  loadMore: () => void
  /** Non-null only when the active filter is endorsement-based. */
  endorsementClosure: EndorsementClosureMeta | null
}

interface InternalState {
  users: NetworkActor[]
  projects: CollectionRecord[]
  certs: ActivityRecord[]
  certDids: Map<string, string>
  fundingReceipts: FundingReceipt[]
  isLoading: boolean
  isLoadingMore: boolean
  hasMore: boolean
  cursor: string | null
  endorsementClosure: EndorsementClosureMeta | null
}

const EMPTY: InternalState = {
  users: [],
  projects: [],
  certs: [],
  certDids: new Map(),
  fundingReceipts: [],
  isLoading: false,
  isLoadingMore: false,
  hasMore: false,
  cursor: null,
  endorsementClosure: null,
}

/**
 * Resolves (kind, filter, sub, search) into the right fetcher and
 * exposes cursor-based pagination via `loadMore`.
 *
 * Pagination model:
 *   - Initial load resets `cursor` and `items` whenever any of
 *     (kind, filter, sub, search, viewerDid, followedDids) change.
 *   - `loadMore()` fetches the next page from the server using the
 *     stored cursor and APPENDS to the current items array.
 *   - `hasMore` reflects the indexer's `pageInfo.hasNextPage`. The
 *     view renders a sentinel + explicit "Load more" button while
 *     `hasMore` is true; the sentinel auto-triggers via
 *     IntersectionObserver, the button is the keyboard fallback.
 *
 * Caveats:
 *   - Client-side filters (recently-viewed, endorsed) don't have
 *     server cursors; they return all matches up-front and
 *     `hasMore` stays false.
 *   - Sort order: the indexer's natural order is sort_at DESC.
 *     Switching to alphabetical / oldest applies only to the
 *     already-loaded set — subsequent pages append at the tail of
 *     the server's order regardless. Acceptable for the early
 *     state; a server-side sort arg is the long-term fix.
 */
export function useExploreData(opts: {
  kind: ExploreKind
  filter: string
  sub: string
  search: string
  /** Endorsement-graph depth, ∈ {1, 2, 3}. Only consulted when the
   *  active filter is endorsement-based (Accounts/"endorsed",
   *  Projects/"by-endorsed", Certs/"by-endorsed"). Defaults to 1. */
  degree?: 1 | 2 | 3
  /** Hyperlabel tier labels to exclude on the certs query. Used when
   *  the "Not labeled yet" option is INCLUDED — `excludeLabels`
   *  filters out specific labels while letting unlabeled records
   *  pass through. */
  excludeCertLabels?: readonly string[]
  /** Hyperlabel tier labels to require on the certs query. Used when
   *  the "Not labeled yet" option is EXCLUDED — `labels` limits the
   *  result set to records carrying one of these labels, which
   *  naturally drops unlabeled records. Mutually exclusive with
   *  `excludeCertLabels` at the call site. */
  includeCertLabels?: readonly string[]
  /** Orglabeler tier labels to exclude. On the accounts kind these
   *  filter the actor list directly; on certs they would filter the
   *  cert's author org (best-effort — actual server-side filtering
   *  depends on indexer support for label-on-author joins). */
  excludeOrgLabels?: readonly string[]
  /** Orglabeler tier labels to require (analog of
   *  includeCertLabels). */
  includeOrgLabels?: readonly string[]
  /** Set by the explore page when the active filter consumes the
   *  endorsement-graph closure and the user has deselected every
   *  ring (degrees set is empty). The hook short-circuits to an
   *  empty result list instead of defaulting back to degree=1. */
  noEndorsementRings?: boolean
  /** Funding kind only — restrict to payments confirmed by this
   *  third-party attestor DID (magic-indexer `confirmedBy`). Null /
   *  omit for "no filter". Changing it resets + refetches. */
  confirmedBy?: string | null
  /** Page size for the server-paginated branches. Defaults to
   *  PAGE_SIZE (50). The All view's capped blocks pass a small size
   *  so painting a handful of rows doesn't fetch a full page per
   *  kind. Client-side-filtered and URI-keyed branches keep their
   *  own fixed windows regardless (see LoadArgs.pageSize). */
  pageSize?: number
}): ExploreData {
  const {
    kind,
    filter,
    sub,
    search,
    excludeCertLabels,
    includeCertLabels,
    excludeOrgLabels,
    includeOrgLabels,
  } = opts
  const degree: 1 | 2 | 3 = opts.degree ?? 1
  const noEndorsementRings: boolean = opts.noEndorsementRings ?? false
  const confirmedBy: string | null = opts.confirmedBy ?? null
  const pageSize: number = opts.pageSize ?? PAGE_SIZE
  // Stable key so the load effect can refetch when the exclude list
  // changes without retriggering when an identical-content array
  // arrives by reference.
  const excludeKey = useMemo(
    () => (excludeCertLabels ? [...excludeCertLabels].sort().join(",") : ""),
    [excludeCertLabels],
  )
  const includeKey = useMemo(
    () => (includeCertLabels ? `+${[...includeCertLabels].sort().join(",")}` : ""),
    [includeCertLabels],
  )
  const excludeOrgKey = useMemo(
    () => (excludeOrgLabels ? [...excludeOrgLabels].sort().join(",") : ""),
    [excludeOrgLabels],
  )
  const includeOrgKey = useMemo(
    () => (includeOrgLabels ? `+${[...includeOrgLabels].sort().join(",")}` : ""),
    [includeOrgLabels],
  )
  const { did: personalDid } = useAuth()
  const { activeOrg, groups } = useOrg()
  // "My X" — records OWNED by the current identity. Switches with the
  // org context: a group admin browsing while acting as the group
  // should see the group's records here.
  const viewerDid = activeOrg?.groupDid ?? personalDid
  // "Accounts I follow" — the human's social graph. Stays anchored on
  // the personal DID even when acting as a group, because follows are
  // a per-human relationship (mirrors bsky/twitter semantics) and
  // groups typically don't maintain their own follow lists. If we read
  // the group's follows when acting-as, the filter goes empty for
  // most admins.
  const { subjects: followedDids } = useFollowing(personalDid)
  // "My organizations" — DIDs of every group the human belongs to.
  // Always personal-scoped (membership is a human relationship).
  // Memoized on the groups array reference so the effect below
  // doesn't re-fire on every org-context render.
  const myGroupDids = useMemo(
    () => new Set(groups.map((g) => g.groupDid)),
    [groups],
  )
  // Minimal group metadata threaded to the "My organizations" loader so it
  // can stub-render every group (not just indexed actor profiles). Mapped to
  // a stable, narrow shape so its reference tracks the `groups` content.
  const myGroups = useMemo(
    () =>
      groups.map((g) => ({
        groupDid: g.groupDid,
        displayName: g.displayName,
        avatarUrl: g.avatarUrl,
      })),
    [groups],
  )
  // Author set for the "My projects" / "My activities" filters. Acting-as
  // a group keeps the current behaviour (just that group's records). In the
  // personal context it aggregates the viewer's own records PLUS every
  // group they own or admin, so group-owned records surface under "My X"
  // attributed to the group (the row's author column shows the owning DID).
  const managedAuthorDids = useMemo<string[]>(
    () => computeManagedAuthorDids(activeOrg, personalDid, groups),
    [activeOrg, personalDid, groups],
  )

  // Subscribe to the closure-cache invalidation token. When an
  // endorsement mutation calls invalidateEndorsementClosure() the
  // version bumps; we put it in the effect deps so the closure
  // refetches without anyone having to drill an explicit prop down
  // through the explore page. Mirrors the pattern in
  // use-profile-responses.
  const closureVersion = useSyncExternalStore(
    subscribeClosureCacheVersion,
    getClosureCacheVersionSnapshot,
    getClosureCacheVersionSnapshot,
  )

  const [state, setState] = useState<InternalState>(EMPTY)
  // Track the latest controller so loadMore can short-circuit if a
  // fresh filter-change has superseded it mid-fetch.
  const generationRef = useRef(0)
  // The AbortController owned by the current generation's initial
  // fetch. loadMore reuses its signal so a filter change (which aborts
  // this controller in the effect cleanup) also cancels an in-flight
  // page instead of fetching-then-discarding it.
  const controllerRef = useRef<AbortController | null>(null)

  // Initial fetch — runs on every state-resetting input change.
  useEffect(() => {
    const generation = ++generationRef.current
    const controller = new AbortController()
    controllerRef.current = controller
    // eslint-disable-next-line react-hooks/set-state-in-effect -- generation-ref-guarded multi-input fetch pipeline; this sync setState is the keyed loading flip and a compare-prev key would have to composite ~15 filter inputs, duplicating the dep list for no behavior change
    setState({ ...EMPTY, isLoading: true })

    async function run() {
      try {
        const page = await loadPage({
          kind,
          filter,
          sub,
          search,
          viewerDid,
          followedDids,
          myGroupDids,
          myGroups,
          managedAuthorDids,
          cursor: null,
          signal: controller.signal,
          pageSize,
          degree,
          noEndorsementRings,
          excludeCertLabels: excludeCertLabels ?? null,
          includeCertLabels: includeCertLabels ?? null,
          excludeOrgLabels: excludeOrgLabels ?? null,
          includeOrgLabels: includeOrgLabels ?? null,
          confirmedBy,
        })
        if (controller.signal.aborted) return
        if (generation !== generationRef.current) return
        setState({
          ...EMPTY,
          ...page,
          // Don't offer "load more" when the indexer claims more pages but
          // gave no cursor to fetch them with.
          hasMore: page.hasMore && page.cursor !== null,
          isLoading: false,
        })
      } catch (err) {
        if (controller.signal.aborted) return
        console.warn("[explore] fetch failed:", err)
        if (generation !== generationRef.current) return
        setState({ ...EMPTY, isLoading: false })
      }
    }
    run()
    return () => controller.abort()
    // The `*Key` strings drive refetch on content-change while the
    // raw `*Labels` arrays are listed for closure-capture correctness:
    // the effect body reads the arrays, not the keys, so React 19's
    // exhaustive-deps lint (and the React Compiler) needs them in the
    // dep list. Memoized in the parent so reference identity tracks
    // content, which makes the doubling harmless — both fire iff the
    // labels actually changed.
  }, [
    kind,
    filter,
    sub,
    search,
    viewerDid,
    followedDids,
    myGroupDids,
    myGroups,
    managedAuthorDids,
    pageSize,
    degree,
    noEndorsementRings,
    closureVersion,
    excludeKey,
    includeKey,
    excludeOrgKey,
    includeOrgKey,
    excludeCertLabels,
    includeCertLabels,
    excludeOrgLabels,
    includeOrgLabels,
    confirmedBy,
  ])

  const loadMore = useCallback(() => {
    setState((prev) => {
      if (prev.isLoading || prev.isLoadingMore || !prev.hasMore) return prev
      if (prev.cursor === null) return prev
      const generation = generationRef.current
      const cursor = prev.cursor
      // Tie the page fetch to the current generation's controller so a
      // filter change (which aborts it via the effect cleanup) cancels
      // the in-flight page rather than fetching-then-discarding it. The
      // generation guard still protects state if the abort races.
      const signal = controllerRef.current?.signal ?? null

      void (async () => {
        try {
          const page = await loadPage({
            kind,
            filter,
            sub,
            search,
            viewerDid,
            followedDids,
            myGroupDids,
            myGroups,
            managedAuthorDids,
            cursor,
            signal,
            pageSize,
            degree,
            noEndorsementRings,
            excludeCertLabels: excludeCertLabels ?? null,
            includeCertLabels: includeCertLabels ?? null,
            excludeOrgLabels: excludeOrgLabels ?? null,
            includeOrgLabels: includeOrgLabels ?? null,
            confirmedBy,
          })
          if (generation !== generationRef.current) return
          setState((current) => {
            // Append new items to the existing arrays without
            // re-introducing duplicates that may have shifted on a
            // server-side concurrent insert.
            const seenCerts = new Set(current.certs.map((c) => c.uri))
            const certs = [
              ...current.certs,
              ...page.certs.filter((c) => !seenCerts.has(c.uri)),
            ]
            const certDids = new Map(current.certDids)
            for (const [uri, did] of page.certDids) certDids.set(uri, did)

            const seenProjects = new Set(current.projects.map((p) => p.uri))
            const projects = [
              ...current.projects,
              ...page.projects.filter((p) => !seenProjects.has(p.uri)),
            ]

            const seenUsers = new Set(current.users.map((u) => u.did))
            const users = [
              ...current.users,
              ...page.users.filter((u) => !seenUsers.has(u.did)),
            ]

            const seenFunding = new Set(
              current.fundingReceipts.map((f) => f.uri),
            )
            const fundingReceipts = [
              ...current.fundingReceipts,
              ...page.fundingReceipts.filter((f) => !seenFunding.has(f.uri)),
            ]

            // The indexer can report hasNextPage=true on the last page —
            // with no usable cursor, or a next page that yields nothing.
            // Stop paginating when there's no cursor to advance with or the
            // page added no new items, so the load-more sentinel doesn't
            // linger (and the auto-trigger doesn't loop on empty pages).
            const addedAny =
              certs.length > current.certs.length ||
              projects.length > current.projects.length ||
              users.length > current.users.length ||
              fundingReceipts.length > current.fundingReceipts.length
            return {
              ...current,
              users,
              projects,
              certs,
              certDids,
              fundingReceipts,
              cursor: page.cursor,
              hasMore: page.hasMore && page.cursor !== null && addedAny,
              isLoadingMore: false,
            }
          })
        } catch (err) {
          if (generation !== generationRef.current) return
          console.warn("[explore] loadMore failed:", err)
          setState((current) => ({ ...current, isLoadingMore: false }))
        }
      })()

      return { ...prev, isLoadingMore: true }
    })
  }, [
    kind,
    filter,
    sub,
    search,
    viewerDid,
    followedDids,
    myGroupDids,
    myGroups,
    managedAuthorDids,
    pageSize,
    degree,
    noEndorsementRings,
    excludeCertLabels,
    includeCertLabels,
    excludeOrgLabels,
    includeOrgLabels,
    confirmedBy,
  ])

  return {
    users: state.users,
    projects: state.projects,
    certs: state.certs,
    certDids: state.certDids,
    fundingReceipts: state.fundingReceipts,
    isLoading: state.isLoading,
    isLoadingMore: state.isLoadingMore,
    hasMore: state.hasMore,
    loadMore,
    endorsementClosure: state.endorsementClosure,
  }
}
