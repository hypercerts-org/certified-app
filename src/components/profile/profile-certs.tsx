"use client"

import { useMemo, useState } from "react"
import { Inbox, Plus, SearchX } from "lucide-react"
import { useUserIndexerActivities } from "@/hooks/use-user-indexer-activities"
import { useManagedAuthors } from "@/hooks/use-managed-authors"
import EmptyState from "@/components/ui/empty-state"
import Button from "@/components/ui/button"
import LoadMoreSentinel from "@/components/ui/load-more-sentinel"
import { Tabs, TabList, Tab, TabPanel } from "@/components/ui/tabs"
import {
  PANEL_SEARCH_MIN,
  PanelTools,
  ProfileActivityRow,
  ProfileRowsSkeleton,
  type SortOption,
} from "@/components/profile/profile-panel"
import type { ActivityRecord } from "@/lib/atproto/activity-types"

interface ProfileCertsProps {
  /** DID of the profile being viewed. */
  did: string | null
  /** The viewer's current identity is this account: adds "New activity". */
  viewerIsOwner?: boolean
  /** True only on the viewer's OWN personal profile (not acting-as a
   *  group). When set, the Created bucket aggregates activities authored
   *  by the groups the viewer owns/admins; each row names the group. */
  aggregateOwned?: boolean
}

type SubTab = "created" | "contributed"

type SortKey =
  | "created-desc"
  | "created-asc"
  | "alpha-asc"
  | "alpha-desc"

const SORT_OPTIONS: SortOption<SortKey>[] = [
  { key: "created-desc", label: "Newest first" },
  { key: "created-asc", label: "Oldest first" },
  { key: "alpha-asc", label: "Title A to Z" },
  { key: "alpha-desc", label: "Title Z to A" },
]

/**
 * Activities tab on a profile, as rows like the Overview. Two sub-tabs:
 *
 *   - Created: activities this account published.
 *   - Contributed to: activities in someone else's repo that list this
 *     account as a contributor.
 *
 * Both come from the indexer (one query per bucket, so an activity where
 * the account is both author and contributor appears in both); scrolling
 * to the end loads the next page of both. A search field and a sort menu
 * appear once a list is long.
 *
 * Records that stored a contributor as a handle (not a DID) won't match
 * the indexer's contributor filter and are missing here.
 */
export default function ProfileCerts({
  did,
  viewerIsOwner,
  aggregateOwned = false,
}: ProfileCertsProps) {
  const { authors } = useManagedAuthors()
  const {
    created,
    contributed,
    dids,
    isLoading,
    isLoadingMore,
    error,
    hasMore,
    loadMore,
    refetch,
  } = useUserIndexerActivities(did, {
    authoredAuthors: aggregateOwned ? authors : undefined,
  })

  const [tab, setTab] = useState<SubTab>("created")
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<SortKey>("created-desc")

  const source = tab === "created" ? created : contributed
  const visible = useMemo(
    () => filterAndSort(source, query, sort),
    [source, query, sort],
  )
  const showTools = source.length > PANEL_SEARCH_MIN || query.trim() !== ""

  const body = (() => {
    if (isLoading && source.length === 0) return <ProfileRowsSkeleton rows={4} />
    if (error) {
      return (
        <EmptyState
          icon={Inbox}
          title="Couldn't load activities"
          description="Something went wrong on our side. Try again in a moment."
        >
          <Button variant="secondary" size="sm" onClick={() => void refetch()}>
            Try again
          </Button>
        </EmptyState>
      )
    }
    if (source.length === 0) {
      return tab === "contributed" ? (
        <EmptyState
          icon={Inbox}
          title="No contributions yet"
          description={
            viewerIsOwner
              ? "Activities that list you as a contributor show here."
              : "Activities that list this account as a contributor show here."
          }
        />
      ) : (
        <EmptyState
          icon={Inbox}
          title="No activities yet"
          description={
            viewerIsOwner
              ? "Activities you publish show here."
              : "Activities this account publishes show here."
          }
        >
          {viewerIsOwner ? (
            <Button href="/create" variant="secondary" size="sm">
              New activity
            </Button>
          ) : null}
        </EmptyState>
      )
    }
    if (visible.length === 0) {
      return (
        <EmptyState
          icon={SearchX}
          title="Nothing matches"
          description={`No activities match "${query.trim()}".`}
        >
          <Button variant="secondary" size="sm" onClick={() => setQuery("")}>
            Clear search
          </Button>
        </EmptyState>
      )
    }
    return (
      <>
        <ul className="profile-rows">
          {visible.map((a) => {
            const author = dids.get(a.uri) ?? did ?? ""
            return (
              <ProfileActivityRow
                key={a.uri}
                activity={a}
                authorDid={author}
                showAuthor={author !== did}
              />
            )
          })}
        </ul>
        {hasMore && !query.trim() ? (
          <LoadMoreSentinel
            onLoadMore={() => void loadMore()}
            isLoading={isLoadingMore}
            className="profile-panel__more"
          />
        ) : null}
      </>
    )
  })()

  return (
    <Tabs
      value={tab}
      onChange={(v) => setTab(v as SubTab)}
      // Segments, so the sub-tabs don't read as a second row of the
      // profile's section tabs.
      variant="segmented"
      className="profile-panel"
    >
      <h2 className="sr-only">Activities</h2>
      <div className="profile-panel__head">
        <TabList aria-label="Activities sections">
          <Tab value="created" count={countLabel(created.length, isLoading, hasMore)}>
            Created
          </Tab>
          <Tab
            value="contributed"
            count={countLabel(contributed.length, isLoading, hasMore)}
          >
            Contributed to
          </Tab>
        </TabList>
        {/* The empty Created list carries "New activity" itself. */}
        {viewerIsOwner &&
        !(tab === "created" && created.length === 0 && !isLoading && !error) ? (
          <Button href="/create" variant="secondary" size="sm">
            <Plus size={16} strokeWidth={1.75} aria-hidden />
            New activity
          </Button>
        ) : null}
      </div>

      {showTools ? (
        <PanelTools
          query={query}
          onQueryChange={setQuery}
          searchLabel="Search activities"
          sort={sort}
          sortOptions={SORT_OPTIONS}
          onSortChange={setSort}
          sortLabel="Sort activities"
        />
      ) : null}

      {/* `body` already follows the active sub-tab; two panels keep both
          tabs' aria-controls resolvable, only the active one mounts. */}
      <TabPanel value="created">{body}</TabPanel>
      <TabPanel value="contributed">{body}</TabPanel>
    </Tabs>
  )
}

/** The tab's count: nothing while loading, "40+" while more pages exist. */
function countLabel(n: number, isLoading: boolean, hasMore: boolean): string | undefined {
  if (isLoading && n === 0) return undefined
  return `${n.toLocaleString()}${hasMore && n > 0 ? "+" : ""}`
}

function filterAndSort(
  records: ActivityRecord[],
  query: string,
  sort: SortKey,
): ActivityRecord[] {
  const q = query.trim().toLowerCase()
  const matches = q
    ? records.filter((r) => {
        const t = (r.value.title ?? "").toLowerCase()
        const d = (r.value.shortDescription ?? "").toLowerCase()
        return t.includes(q) || d.includes(q)
      })
    : records

  const sorted = matches.slice()
  sorted.sort((a, b) => {
    switch (sort) {
      case "created-desc":
        return compareDate(b.value.createdAt, a.value.createdAt)
      case "created-asc":
        return compareDate(a.value.createdAt, b.value.createdAt)
      case "alpha-asc":
        return (a.value.title ?? "").localeCompare(b.value.title ?? "")
      case "alpha-desc":
        return (b.value.title ?? "").localeCompare(a.value.title ?? "")
    }
  })
  return sorted
}

function compareDate(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}
