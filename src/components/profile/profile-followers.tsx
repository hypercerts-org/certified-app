"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  ArrowUpDown,
  Check,
  Inbox,
  Search,
  UserPlus,
  Users,
  X,
} from "lucide-react"
import { useFollowers, type FollowerEntry } from "@/hooks/use-followers"
import { useFollowing } from "@/hooks/use-following"
import { useAuthorInfo } from "@/hooks/use-author-info"
import { useAuthorNamesMap } from "@/hooks/use-author-names-map"
import { useAuth } from "@/lib/auth/auth-context"
import ConfirmDialog from "@/components/ui/confirm-dialog"
import { deleteFollow } from "@/lib/atproto/follow"
import PersonCard from "@/components/profile/person-card"
import EmptyState from "@/components/ui/empty-state"
import LoadingSpinner from "@/components/ui/loading-spinner"
import type { FollowRecord } from "@/lib/atproto/follow"

interface ProfileFollowersProps {
  /** DID of the profile being viewed. */
  readonly did: string
}

type SubTab = "followers" | "following"

type SortKey =
  | "created-desc"
  | "created-asc"
  | "alpha-asc"
  | "alpha-desc"

const FOLLOWERS_SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "created-desc", label: "Newest first" },
  { key: "created-asc", label: "Oldest first" },
  { key: "alpha-asc", label: "Follower A → Z" },
  { key: "alpha-desc", label: "Follower Z → A" },
]

const FOLLOWING_SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "created-desc", label: "Newest first" },
  { key: "created-asc", label: "Oldest first" },
  { key: "alpha-asc", label: "Followee A → Z" },
  { key: "alpha-desc", label: "Followee Z → A" },
]

/**
 * Followers tab on a user profile page. Mirrors `ProfileEndorsements`:
 * sub-tabs (Followers | Following) + right-aligned toolbar (search +
 * sort) + a uniform grid of person cards.
 *
 * Read paths:
 *   - Followers — indexer query for `app.certified.graph.follow`
 *     records with `subject == profileDid`.
 *   - Following — direct PDS listRecords on the profile's own repo's
 *     `app.certified.graph.follow` collection.
 *
 * Sub-tab selection is URL-driven via the `sub` query param
 * (`?tab=followers&sub=following`). The sidebar follower / following
 * counts deep-link to the matching sub-tab; switching sub-tabs
 * `router.replace`s the URL so back-button navigation skips the
 * intra-tab toggles.
 */
export default function ProfileFollowers({ did }: ProfileFollowersProps) {
  const followers = useFollowers(did)
  const following = useFollowing(did)
  // Only the profile owner can revoke their own follows. We compare
  // the signed-in viewer's DID to the profile's DID to decide
  // whether the per-card × renders on the Following sub-tab.
  const { did: viewerDid } = useAuth()
  const isOwnProfile = !!viewerDid && viewerDid === did

  // Sub-tab is read from the URL (`?sub=followers|following`) so the
  // sidebar counts can deep-link straight into the right list.
  // Defaults to "followers" — receiving / being-followed is what most
  // viewers care about when they land on the tab, same default as
  // Endorsements' "Received".
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const subParam = searchParams?.get("sub")
  const tab: SubTab = subParam === "following" ? "following" : "followers"
  const setTab = useCallback(
    (next: SubTab) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "")
      // Keep `tab=followers` (the outer profile tab) intact; only
      // toggle the inner `sub` value. Default "followers" stays
      // implicit in the URL — no `sub=followers` for the default so
      // the URL stays short.
      if (next === "followers") params.delete("sub")
      else params.set("sub", next)
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : (pathname ?? ""), {
        scroll: false,
      })
    },
    [pathname, router, searchParams],
  )

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

  // DIDs to hydrate names for — follower DIDs on the Followers tab,
  // subject DIDs (= followees) on the Following tab. Sort + search
  // both read from the resolved name map.
  const dids = useMemo(() => {
    if (tab === "followers") {
      return Array.from(new Set(followers.entries.map((e) => e.followerDid)))
    }
    return Array.from(new Set(following.records.map((r) => r.value.subject)))
  }, [tab, followers.entries, following.records])

  const names = useAuthorNamesMap(dids)

  const followersCountLabel = formatCount(followers.count ?? followers.entries.length)
  const followingCountLabel = formatCount(following.count)

  const sortOptions =
    tab === "followers" ? FOLLOWERS_SORT_OPTIONS : FOLLOWING_SORT_OPTIONS

  return (
    <div className="profile-endorsements-v2">
      <div className="profile-endorsements-v2__toolbar">
        <nav
          className="profile-endorsements-v2__subtabs"
          role="tablist"
          aria-label="Followers sections"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === "followers"}
            className={`profile-endorsements-v2__subtab ${
              tab === "followers" ? "profile-endorsements-v2__subtab--active" : ""
            }`}
            onClick={() => setTab("followers")}
          >
            Followers
            {followersCountLabel ? (
              <span className="profile-endorsements-v2__subtab-count">
                {followersCountLabel}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "following"}
            className={`profile-endorsements-v2__subtab ${
              tab === "following" ? "profile-endorsements-v2__subtab--active" : ""
            }`}
            onClick={() => setTab("following")}
          >
            Following
            {followingCountLabel ? (
              <span className="profile-endorsements-v2__subtab-count">
                {followingCountLabel}
              </span>
            ) : null}
          </button>
        </nav>

        <div className="profile-endorsements-v2__controls">
          <label className="profile-endorsements-v2__search">
            <Search
              size={16}
              strokeWidth={1.75}
              className="profile-endorsements-v2__search-icon"
              aria-hidden
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search people"
              aria-label="Search people"
              className="profile-endorsements-v2__search-input"
            />
          </label>

          <div className="profile-endorsements-v2__sort-wrap">
            <button
              ref={sortBtnRef}
              type="button"
              className="profile-endorsements-v2__sort-btn"
              onClick={() => setSortOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={sortOpen}
              aria-label="Sort people"
              title="Sort"
            >
              <ArrowUpDown size={16} strokeWidth={1.75} aria-hidden />
            </button>
            {sortOpen ? (
              <div
                ref={sortMenuRef}
                className="profile-endorsements-v2__sort-menu"
                role="menu"
              >
                {sortOptions.map((opt) => {
                  const active = opt.key === sort
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      role="menuitemradio"
                      aria-checked={active}
                      className="profile-endorsements-v2__sort-item"
                      onClick={() => {
                        setSort(opt.key)
                        setSortOpen(false)
                      }}
                    >
                      <span className="profile-endorsements-v2__sort-item-check">
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

      {tab === "followers" ? (
        <FollowersGrid
          entries={followers.entries}
          isLoading={followers.isLoading}
          error={followers.error}
          query={query}
          sort={sort}
          names={names}
        />
      ) : (
        <FollowingGrid
          records={following.records}
          isLoading={following.isLoading}
          error={following.error}
          query={query}
          sort={sort}
          names={names}
          canUnfollow={isOwnProfile}
          viewerDid={viewerDid}
          onAfterUnfollow={() => following.refetch()}
        />
      )}
    </div>
  )
}

function formatCount(n: number | null | undefined): string | null {
  if (n === null || n === undefined || n === 0) return null
  return `${n}`
}

// ----------------------------- Followers -----------------------------

interface FollowersGridProps {
  entries: FollowerEntry[]
  isLoading: boolean
  error: string | null
  query: string
  sort: SortKey
  names: Map<string, string>
}

function FollowersGrid({
  entries,
  isLoading,
  error,
  query,
  sort,
  names,
}: FollowersGridProps) {
  const visible = useMemo(
    () => filterAndSortFollowers(entries, query, sort, names),
    [entries, query, sort, names],
  )

  if (isLoading) {
    return (
      <div className="profile-endorsements-v2__loading">
        <LoadingSpinner size="md" />
      </div>
    )
  }
  if (error) {
    return (
      <div className="profile-endorsements-v2__grid">
        <EmptyState
          icon={Inbox}
          title="Couldn’t load followers"
          description={error}
        />
      </div>
    )
  }
  if (visible.length === 0) {
    return (
      <div className="profile-endorsements-v2__grid">
        <EmptyState
          icon={Users}
          title={entries.length === 0 ? "No followers yet" : "No matches"}
          description={
            entries.length === 0
              ? "People who follow this profile will appear here."
              : "No followers match your search."
          }
        />
      </div>
    )
  }
  return (
    <ul className="profile-endorsements-v2__grid">
      {visible.map((e) => (
        <FollowerCard key={e.uri} entry={e} />
      ))}
    </ul>
  )
}

function FollowerCard({ entry }: { entry: FollowerEntry }) {
  const { info, isLoading } = useAuthorInfo(entry.followerDid)
  return (
    <PersonCard
      did={entry.followerDid}
      info={info}
      isLoadingInfo={isLoading}
      createdAt={entry.createdAt}
    />
  )
}

// ----------------------------- Following -----------------------------

interface FollowingGridProps {
  records: FollowRecord[]
  isLoading: boolean
  error: string | null
  query: string
  sort: SortKey
  names: Map<string, string>
  /** True when the profile owner is viewing their own Following list
   *  — controls whether the per-card × renders. */
  canUnfollow: boolean
  viewerDid: string | null
  onAfterUnfollow: () => void | Promise<void>
}

function FollowingGrid({
  records,
  isLoading,
  error,
  query,
  sort,
  names,
  canUnfollow,
  viewerDid,
  onAfterUnfollow,
}: FollowingGridProps) {
  const visible = useMemo(
    () => filterAndSortFollowing(records, query, sort, names),
    [records, query, sort, names],
  )

  if (isLoading) {
    return (
      <div className="profile-endorsements-v2__loading">
        <LoadingSpinner size="md" />
      </div>
    )
  }
  if (error) {
    return (
      <div className="profile-endorsements-v2__grid">
        <EmptyState icon={Inbox} title="Couldn’t load follows" description={error} />
      </div>
    )
  }
  if (visible.length === 0) {
    return (
      <div className="profile-endorsements-v2__grid">
        <EmptyState
          icon={UserPlus}
          title={records.length === 0 ? "Not following anyone yet" : "No matches"}
          description={
            records.length === 0
              ? "People this profile follows will appear here."
              : "No follows match your search."
          }
        />
      </div>
    )
  }
  return (
    <ul className="profile-endorsements-v2__grid">
      {visible.map((r) => (
        <FollowingCard
          key={r.uri}
          record={r}
          canUnfollow={canUnfollow && !!viewerDid}
          viewerDid={viewerDid}
          onAfterUnfollow={onAfterUnfollow}
        />
      ))}
    </ul>
  )
}

function FollowingCard({
  record,
  canUnfollow,
  viewerDid,
  onAfterUnfollow,
}: {
  record: FollowRecord
  canUnfollow: boolean
  viewerDid: string | null
  onAfterUnfollow: () => void | Promise<void>
}) {
  const { info, isLoading } = useAuthorInfo(record.value.subject)
  return (
    <PersonCard
      did={record.value.subject}
      info={info}
      isLoadingInfo={isLoading}
      createdAt={record.value.createdAt}
      menu={
        canUnfollow && viewerDid ? (
          <UnfollowButton
            viewerDid={viewerDid}
            rkey={record.rkey}
            subjectDisplay={
              info?.displayName || info?.handle || record.value.subject
            }
            onAfterUnfollow={onAfterUnfollow}
          />
        ) : null
      }
    />
  )
}

/**
 * `×` revoke affordance shown on the owner's Following grid. Click →
 * ConfirmDialog → `deleteFollow` against the follow record's rkey,
 * then `onAfterUnfollow` re-pages the Following list so the row
 * drops.
 */
function UnfollowButton({
  viewerDid,
  rkey,
  subjectDisplay,
  onAfterUnfollow,
}: {
  viewerDid: string
  rkey: string
  subjectDisplay: string
  onAfterUnfollow: () => void | Promise<void>
}) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [isRevoking, setIsRevoking] = useState(false)

  const handleConfirm = async () => {
    if (isRevoking) return
    setIsRevoking(true)
    try {
      await deleteFollow(viewerDid, rkey)
      await onAfterUnfollow()
      setConfirmOpen(false)
    } catch (err) {
      console.error("Unfollow failed:", err)
    } finally {
      setIsRevoking(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className="profile-endorsements-v2__given-revoke"
        onClick={(e) => {
          // The card's outer Link otherwise navigates to the
          // subject's profile.
          e.preventDefault()
          e.stopPropagation()
          setConfirmOpen(true)
        }}
        aria-label={`Unfollow ${subjectDisplay}`}
        title="Unfollow"
      >
        <X size={14} strokeWidth={2} aria-hidden />
      </button>
      {confirmOpen ? (
        <ConfirmDialog
          title={`Unfollow ${subjectDisplay}?`}
          message="You can follow them again any time."
          confirmLabel="Unfollow"
          cancelLabel="Cancel"
          confirmVariant="destructive"
          isConfirming={isRevoking}
          onConfirm={handleConfirm}
          onCancel={() => !isRevoking && setConfirmOpen(false)}
        />
      ) : null}
    </>
  )
}

// ----------------------- Filter + sort helpers -----------------------

function filterAndSortFollowers(
  records: FollowerEntry[],
  query: string,
  sort: SortKey,
  names: Map<string, string>,
): FollowerEntry[] {
  const q = query.trim().toLowerCase()
  const matches = q
    ? records.filter((r) => {
        const name = names.get(r.followerDid) ?? r.followerDid.toLowerCase()
        return name.includes(q)
      })
    : records

  const sorted = matches.slice()
  sorted.sort((a, b) => {
    switch (sort) {
      case "created-desc":
        return compareString(b.createdAt, a.createdAt)
      case "created-asc":
        return compareString(a.createdAt, b.createdAt)
      case "alpha-asc":
        return (names.get(a.followerDid) ?? "").localeCompare(
          names.get(b.followerDid) ?? "",
        )
      case "alpha-desc":
        return (names.get(b.followerDid) ?? "").localeCompare(
          names.get(a.followerDid) ?? "",
        )
    }
  })
  return sorted
}

function filterAndSortFollowing(
  records: FollowRecord[],
  query: string,
  sort: SortKey,
  names: Map<string, string>,
): FollowRecord[] {
  const q = query.trim().toLowerCase()
  const matches = q
    ? records.filter((r) => {
        const name = names.get(r.value.subject) ?? r.value.subject.toLowerCase()
        return name.includes(q)
      })
    : records

  const sorted = matches.slice()
  sorted.sort((a, b) => {
    switch (sort) {
      case "created-desc":
        return compareString(b.value.createdAt, a.value.createdAt)
      case "created-asc":
        return compareString(a.value.createdAt, b.value.createdAt)
      case "alpha-asc":
        return (names.get(a.value.subject) ?? "").localeCompare(
          names.get(b.value.subject) ?? "",
        )
      case "alpha-desc":
        return (names.get(b.value.subject) ?? "").localeCompare(
          names.get(a.value.subject) ?? "",
        )
    }
  })
  return sorted
}

function compareString(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}
