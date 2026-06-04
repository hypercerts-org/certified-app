"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ArrowUpDown, Inbox, Plus, Search } from "lucide-react"
import { useUserIndexerActivities } from "@/hooks/use-user-indexer-activities"
import { useManagedAuthors } from "@/hooks/use-managed-authors"
import FeedLayout from "@/components/feed/feed-layout"
import EmptyState from "@/components/ui/empty-state"
import Button from "@/components/ui/button"
import Badge from "@/components/ui/badge"
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverItem,
} from "@/components/ui/popover"
import { Tabs, TabList, Tab, TabPanel } from "@/components/ui/tabs"
import type { ActivityRecord } from "@/lib/atproto/activity-types"

interface ProfileCertsProps {
  /** DID of the profile being viewed. */
  did: string | null
  /** When true the viewer is looking at their own profile — surface a
   *  Create-cert CTA in the toolbar that links to the /create flow. */
  viewerIsOwner?: boolean
  /** True only on the viewer's OWN personal profile (not acting-as a
   *  group). When set, the Created bucket aggregates activities authored
   *  by the groups the viewer owns/admins — each card shows the owning
   *  group as its author. */
  aggregateOwned?: boolean
}

type SubTab = "created" | "contributed"

type SortKey =
  | "created-desc"
  | "created-asc"
  | "alpha-asc"
  | "alpha-desc"

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "created-desc", label: "Newest first" },
  { key: "created-asc", label: "Oldest first" },
  { key: "alpha-asc", label: "Title A → Z" },
  { key: "alpha-desc", label: "Title Z → A" },
]

/**
 * Certs tab on a user's profile. Two sub-tabs:
 *
 *   - Created — certs whose author DID is this profile.
 *   - Contributed to — certs on someone else's repo where this user
 *     appears in `contributors[*].contributorIdentity`.
 *
 * Both are sourced from one indexer query (`where: { _or: [...] }`)
 * and split locally by author DID. Pagination is shared — scrolling
 * the bottom sentinel fetches the next combined page regardless of
 * which sub-tab is active.
 *
 * Records that stored a contributor as a handle (not a DID) won't
 * match the indexer's contributor filter and will be missing here —
 * see the indexer notes on producer-side handle storage.
 */
export default function ProfileCerts({
  did,
  viewerIsOwner,
  aggregateOwned = false,
}: ProfileCertsProps) {
  // On the viewer's own personal profile, the Created bucket aggregates
  // activities authored by the viewer + every group they own/admin; the
  // Contributed bucket stays the viewer's personal contributions. The
  // owning DID per card comes from the hook's `dids` map, so a
  // group-authored card shows the group as its author.
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
  } = useUserIndexerActivities(did, {
    authoredAuthors: aggregateOwned ? authors : undefined,
  })

  const [tab, setTab] = useState<SubTab>("created")
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<SortKey>("created-desc")
  const [sortOpen, setSortOpen] = useState(false)

  // `created` and `contributed` come directly from the hook now —
  // the previous `_or` + client-side split is replaced by two
  // parallel queries (one per bucket) so a cert where the user is
  // BOTH author and contributor appears in both lists.

  const visibleSource = tab === "created" ? created : contributed
  const visible = useMemo(
    () => filterAndSort(visibleSource, query, sort),
    [visibleSource, query, sort],
  )

  const createdCountLabel = formatCount(created.length, hasMore)
  const contributedCountLabel = formatCount(contributed.length, hasMore)

  const emptyState =
    tab === "contributed" ? (
      <EmptyState
        icon={Inbox}
        title="No contributions yet"
        description="Activities on other users' repos that list this user as a contributor will appear here."
      />
    ) : undefined

  const feed = (
    <FeedLayout
      activities={visible}
      getDid={(uri) => dids.get(uri) ?? did ?? ""}
      isLoading={isLoading}
      isLoadingMore={isLoadingMore}
      error={error}
      hasMore={hasMore}
      loadMore={loadMore}
      emptyState={emptyState}
    />
  )

  return (
    <Tabs
      value={tab}
      onChange={(v) => setTab(v as SubTab)}
      className="profile-certs"
    >
      <div className="profile-certs__toolbar">
        {/* The .profile-certs__toolbar (layout.css, cross-track) already
            draws the strip's shared bottom border, so drop TabList's own
            and pin it to the toolbar's bottom edge. Count chips render via
            the neutral Badge (muted grey, not the attention red). */}
        <TabList
          aria-label="Activities sections"
          className="border-0 self-end"
        >
          <Tab value="created">
            Created
            {createdCountLabel ? (
              <Badge variant="count" tone="neutral" compact>
                {createdCountLabel}
              </Badge>
            ) : null}
          </Tab>
          <Tab value="contributed">
            Contributed to
            {contributedCountLabel ? (
              <Badge variant="count" tone="neutral" compact>
                {contributedCountLabel}
              </Badge>
            ) : null}
          </Tab>
        </TabList>

        <div className="profile-certs__controls">
          {viewerIsOwner ? (
            <Link href="/create">
              <Button variant="primary" size="sm">
                <Plus size={14} strokeWidth={1.75} aria-hidden />
                New activity
              </Button>
            </Link>
          ) : null}
          <label className="profile-certs__search">
            <Search
              size={16}
              strokeWidth={1.75}
              className="profile-certs__search-icon"
              aria-hidden
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search activities"
              aria-label="Search activities"
              className="profile-certs__search-input"
            />
          </label>

          <div className="profile-certs__sort-wrap">
            <Popover open={sortOpen} onOpenChange={setSortOpen}>
              <PopoverTrigger>
                <button
                  type="button"
                  className="profile-certs__sort-btn"
                  aria-label="Sort activities"
                  title="Sort"
                >
                  <ArrowUpDown size={16} strokeWidth={1.75} aria-hidden />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end">
                {SORT_OPTIONS.map((opt) => (
                  <PopoverItem
                    key={opt.key}
                    selected={opt.key === sort}
                    onClick={() => {
                      setSort(opt.key)
                      setSortOpen(false)
                    }}
                  >
                    {opt.label}
                  </PopoverItem>
                ))}
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>

      {/* `visible` + `emptyState` are already keyed off the active sub-tab,
          so the feed body is identical in either panel; only the active
          one mounts. Two panels keep both tabs' aria-controls resolvable. */}
      <TabPanel value="created">{feed}</TabPanel>
      <TabPanel value="contributed">{feed}</TabPanel>
    </Tabs>
  )
}

function formatCount(n: number, hasMore: boolean): string | null {
  if (n === 0) return hasMore ? "…" : null
  return `${n}${hasMore ? "+" : ""}`
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
