"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowUpDown, Check, Inbox, Search } from "lucide-react"
import { useUserIndexerActivities } from "@/hooks/use-user-indexer-activities"
import FeedLayout from "@/components/feed/feed-layout"
import EmptyState from "@/components/ui/empty-state"
import type { ActivityRecord } from "@/lib/atproto/activity-types"

interface ProfileCertsProps {
  /** DID of the profile being viewed. */
  did: string | null
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
export default function ProfileCerts({ did }: ProfileCertsProps) {
  const {
    activities,
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

  const { created, contributed } = useMemo(() => {
    const created: ActivityRecord[] = []
    const contributed: ActivityRecord[] = []
    if (!did) return { created, contributed }
    for (const record of activities) {
      const authorDid = dids.get(record.uri)
      if (authorDid === did) {
        created.push(record)
      } else if (authorDid) {
        contributed.push(record)
      }
    }
    return { created, contributed }
  }, [activities, dids, did])

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
        description="Certs on other users' repos that list this user as a contributor will appear here."
      />
    ) : undefined

  return (
    <div className="profile-certs">
      <div className="profile-certs__toolbar">
        <nav
          className="profile-certs__subtabs"
          role="tablist"
          aria-label="Certs sections"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === "created"}
            className={`profile-certs__subtab ${
              tab === "created" ? "profile-certs__subtab--active" : ""
            }`}
            onClick={() => setTab("created")}
          >
            Created
            {createdCountLabel ? (
              <span className="profile-certs__subtab-count">
                {createdCountLabel}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "contributed"}
            className={`profile-certs__subtab ${
              tab === "contributed" ? "profile-certs__subtab--active" : ""
            }`}
            onClick={() => setTab("contributed")}
          >
            Contributed to
            {contributedCountLabel ? (
              <span className="profile-certs__subtab-count">
                {contributedCountLabel}
              </span>
            ) : null}
          </button>
        </nav>

        <div className="profile-certs__controls">
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
              placeholder="Search certs"
              aria-label="Search certs"
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
              aria-label="Sort certs"
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
    </div>
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
