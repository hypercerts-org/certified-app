"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { ArrowUpDown, Check, Inbox, Plus, Search } from "lucide-react"
import { useUserIndexerActivities } from "@/hooks/use-user-indexer-activities"
import FeedLayout from "@/components/feed/feed-layout"
import EmptyState from "@/components/ui/empty-state"
import Button from "@/components/ui/button"
import Badge from "@/components/ui/badge"
import { Tabs, TabList, Tab, TabPanel } from "@/components/ui/tabs"
import type { ActivityRecord } from "@/lib/atproto/activity-types"

interface ProfileCertsProps {
  /** DID of the profile being viewed. */
  did: string | null
  /** When true the viewer is looking at their own profile — surface a
   *  Create-cert CTA in the toolbar that links to the /create flow. */
  viewerIsOwner?: boolean
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
export default function ProfileCerts({ did, viewerIsOwner }: ProfileCertsProps) {
  const {
    created,
    contributed,
    dids,
    isLoading,
    isLoadingMore,
    error,
    hasMore,
    loadMore,
  } = useUserIndexerActivities(did)

  const [tab, setTab] = useState<SubTab>("created")
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<SortKey>("created-desc")
  const [sortOpen, setSortOpen] = useState(false)

  const sortBtnRef = useRef<HTMLButtonElement>(null)
  const sortMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!sortOpen) return
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target
      if (!(t instanceof Node)) return
      if (sortBtnRef.current?.contains(t)) return
      if (sortMenuRef.current?.contains(t)) return
      setSortOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSortOpen(false)
    }
    document.addEventListener("mousedown", onMouseDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onMouseDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [sortOpen])

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
            <button
              ref={sortBtnRef}
              type="button"
              className="profile-certs__sort-btn"
              onClick={() => setSortOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={sortOpen}
              aria-label="Sort activities"
              title="Sort"
            >
              <ArrowUpDown size={16} strokeWidth={1.75} aria-hidden />
            </button>
            {sortOpen ? (
              <div
                ref={sortMenuRef}
                className="profile-certs__sort-menu"
                role="menu"
              >
                {SORT_OPTIONS.map((opt) => {
                  const active = opt.key === sort
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      role="menuitemradio"
                      aria-checked={active}
                      className="profile-certs__sort-item"
                      onClick={() => {
                        setSort(opt.key)
                        setSortOpen(false)
                      }}
                    >
                      <span className="profile-certs__sort-item-check">
                        {active ? <Check size={14} strokeWidth={2} aria-hidden /> : null}
                      </span>
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            ) : null}
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
