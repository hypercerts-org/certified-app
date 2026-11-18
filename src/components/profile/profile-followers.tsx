"use client"

import { useCallback, useMemo, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Inbox, SearchX, UserPlus, Users } from "lucide-react"
import { useFollowers, type FollowerEntry } from "@/hooks/use-followers"
import { useFollowing } from "@/hooks/use-following"
import { useAuthorInfo } from "@/hooks/use-author-info"
import { useAuthorNamesMap } from "@/hooks/use-author-names-map"
import { deriveIdentity } from "@/lib/utils/identity"
import { useAuth } from "@/lib/auth/auth-context"
import { useOrg } from "@/lib/groups/org-context"
import type { FollowRecord } from "@/lib/atproto/follow"
import EmptyState from "@/components/ui/empty-state"
import SectionHeader from "@/components/ui/section-header"
import Button from "@/components/ui/button"
import { Tabs, TabList, Tab, TabPanel } from "@/components/ui/tabs"
import ProfilePersonRow from "@/components/profile/profile-person-row"
import { FollowButton } from "@/components/profile/profile-follow-endorse"
import {
  PANEL_SEARCH_MIN,
  PanelTools,
  ProfileRowsSkeleton,
  type SortOption,
} from "@/components/profile/profile-panel"

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

const SORT_OPTIONS: SortOption<SortKey>[] = [
  { key: "created-desc", label: "Newest first" },
  { key: "created-asc", label: "Oldest first" },
  { key: "alpha-asc", label: "Name A to Z" },
  { key: "alpha-desc", label: "Name Z to A" },
]

/**
 * Followers tab on a profile, as rows: Followers and Following sub-tabs
 * (counts in the tabs), a search field and a sort menu once a list is
 * long, and one row per account.
 *
 * Read paths:
 *   - Followers: indexer query for `app.certified.graph.follow` records
 *     with `subject == profileDid`.
 *   - Following: direct PDS listRecords on the profile's own repo.
 *
 * The sub-tab lives in `?sub=` so the header's follower / following
 * counts open the right list; switching `router.replace`s the URL.
 */
export default function ProfileFollowers({ did }: ProfileFollowersProps) {
  const followers = useFollowers(did)
  const following = useFollowing(did)
  const { did: viewerDid } = useAuth()
  const { activeOrg } = useOrg()
  const isOwnProfile = !!viewerDid && viewerDid === did
  // Only the account you act as can unfollow from its own Following list;
  // acting as a group, the writes go to the group's repo.
  const canManageFollows = !!viewerDid && (activeOrg?.groupDid ?? viewerDid) === did
  const isThisAccount = isOwnProfile || (!!activeOrg && activeOrg.groupDid === did)

  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const urlTab: SubTab = searchParams?.get("sub") === "following" ? "following" : "followers"
  // A visitor isn't shown a list known to be empty ("Following 0"): its
  // segment goes, and with one list left there are no segments at all;
  // that list then says what it is in a visible heading. A list that
  // failed to load isn't known to be empty: it keeps its segment and says
  // it couldn't load, with "Try again".
  const followersZero =
    !followers.error &&
    !(followers.isLoading && followers.entries.length === 0) &&
    (followers.count ?? followers.entries.length) === 0
  const followingZero =
    !following.error &&
    !(following.isLoading && following.count === 0) &&
    following.count === 0
  const showFollowersSegment = isThisAccount || !followersZero
  const showFollowingSegment = isThisAccount || !followingZero
  const segmented = showFollowersSegment && showFollowingSegment
  const tab: SubTab =
    urlTab === "followers" && !showFollowersSegment && showFollowingSegment
      ? "following"
      : urlTab === "following" && !showFollowingSegment && showFollowersSegment
        ? "followers"
        : urlTab
  const setTab = useCallback(
    (next: SubTab) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "")
      // Keep the outer `tab=followers`; "followers" stays implicit.
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

  // Names to search and sort by: followers, or the accounts followed.
  const dids = useMemo(() => {
    if (tab === "followers") {
      return Array.from(new Set(followers.entries.map((e) => e.followerDid)))
    }
    return Array.from(new Set(following.records.map((r) => r.value.subject)))
  }, [tab, followers.entries, following.records])
  const names = useAuthorNamesMap(dids)

  const followerCount = followers.count ?? followers.entries.length
  const sourceLength =
    tab === "followers" ? followers.entries.length : following.records.length
  const showTools = sourceLength > PANEL_SEARCH_MIN || query.trim() !== ""
  const clearSearch = () => setQuery("")

  return (
    <Tabs
      value={tab}
      onChange={(v) => setTab(v as SubTab)}
      variant="segmented"
      className="profile-panel"
    >
      {/* The tab names the panel; the heading is for screen readers. With
          only the follows left (no segments), it says what they are. */}
      {!segmented && tab === "following" ? (
        <SectionHeader title="Following" />
      ) : (
        <SectionHeader title="Followers" titleHidden />
      )}
      {segmented ? (
        <div className="profile-panel__head">
          <TabList aria-label="Followers sections">
            <Tab
              value="followers"
              count={
                followers.isLoading && followers.entries.length === 0
                  ? undefined
                  : followerCount
              }
            >
              Followers
            </Tab>
            <Tab
              value="following"
              count={
                following.isLoading && following.count === 0 ? undefined : following.count
              }
            >
              Following
            </Tab>
          </TabList>
        </div>
      ) : null}

      {showTools ? (
        <PanelTools
          query={query}
          onQueryChange={setQuery}
          searchLabel="Search accounts"
          sort={sort}
          sortOptions={SORT_OPTIONS}
          onSortChange={setSort}
          sortLabel="Sort accounts"
        />
      ) : null}

      <TabPanel value="followers">
        <FollowersList
          entries={followers.entries}
          isLoading={followers.isLoading}
          error={followers.error}
          onRetry={() => void followers.refetch()}
          query={query}
          onClearSearch={clearSearch}
          sort={sort}
          names={names}
          isOwnProfile={isOwnProfile}
        />
      </TabPanel>
      <TabPanel value="following">
        <FollowingList
          records={following.records}
          isLoading={following.isLoading}
          error={following.error}
          onRetry={() => void following.refetch()}
          query={query}
          onClearSearch={clearSearch}
          sort={sort}
          names={names}
          manage={
            canManageFollows && viewerDid
              ? {
                  viewerDid,
                  targetDid: activeOrg?.groupDid,
                  subjects: following.subjects,
                  onFollowed: following.addFollow,
                  onUnfollowed: following.removeFollow,
                }
              : null
          }
        />
      </TabPanel>
    </Tabs>
  )
}

function LoadError({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <EmptyState
      icon={Inbox}
      title={`Couldn't load ${what}`}
      description="Something went wrong on our side. Try again in a moment."
    >
      <Button variant="secondary" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </EmptyState>
  )
}

function NoMatches({ query, onClearSearch }: { query: string; onClearSearch: () => void }) {
  return (
    <EmptyState
      icon={SearchX}
      title={`Nothing matches "${query.trim()}".`}
      description="No accounts match this search. Try another word."
    >
      <Button variant="secondary" size="sm" onClick={onClearSearch}>
        Clear search
      </Button>
    </EmptyState>
  )
}

// ----------------------------- Followers -----------------------------

function FollowersList({
  entries,
  isLoading,
  error,
  onRetry,
  query,
  onClearSearch,
  sort,
  names,
  isOwnProfile,
}: {
  entries: FollowerEntry[]
  isLoading: boolean
  error: string | null
  onRetry: () => void
  query: string
  onClearSearch: () => void
  sort: SortKey
  names: Map<string, string>
  isOwnProfile: boolean
}) {
  const visible = useMemo(
    () => filterAndSortFollowers(entries, query, sort, names),
    [entries, query, sort, names],
  )

  if (isLoading && entries.length === 0) {
    return <ProfileRowsSkeleton rows={4} shape="circle" />
  }
  if (error) return <LoadError what="followers" onRetry={onRetry} />
  if (entries.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No followers yet"
        description={
          isOwnProfile
            ? "Accounts that follow you show here."
            : "Accounts that follow this one show here."
        }
      />
    )
  }
  if (visible.length === 0) return <NoMatches query={query} onClearSearch={onClearSearch} />
  return (
    <ul className="profile-people">
      {visible.map((e) => (
        <ProfilePersonRow key={e.uri} did={e.followerDid} since={e.createdAt} />
      ))}
    </ul>
  )
}

// ----------------------------- Following -----------------------------

/** What the account you act as needs to follow and unfollow from its own
 *  Following list. */
interface ManageFollows {
  viewerDid: string
  /** Acting as a group: the writes go to the group's repo. */
  targetDid?: string
  /** The accounts followed now. */
  subjects: ReadonlySet<string>
  onFollowed: (subjectDid: string, uri: string, cid: string) => void
  onUnfollowed: (subjectDid: string) => void
}

function FollowingList({
  records,
  isLoading,
  error,
  onRetry,
  query,
  onClearSearch,
  sort,
  names,
  manage,
}: {
  records: FollowRecord[]
  isLoading: boolean
  error: string | null
  onRetry: () => void
  query: string
  onClearSearch: () => void
  sort: SortKey
  names: Map<string, string>
  /** The account you act as is viewing its own list: each row has
   *  Following / Follow. */
  manage: ManageFollows | null
}) {
  // Accounts unfollowed here keep their row (with Follow) until you leave
  // the page, so an accidental unfollow is undone with one tap, as in the
  // Workspace's Following.
  const [unfollowed, setUnfollowed] = useState<ReadonlyMap<string, FollowRecord>>(new Map())
  const rows = useMemo(() => {
    if (unfollowed.size === 0) return records
    const kept = new Set(records.map((r) => r.value.subject))
    return [...records, ...[...unfollowed.values()].filter((r) => !kept.has(r.value.subject))]
  }, [records, unfollowed])
  const visible = useMemo(
    () => filterAndSortFollowing(rows, query, sort, names),
    [rows, query, sort, names],
  )

  if (isLoading && rows.length === 0) {
    return <ProfileRowsSkeleton rows={4} shape="circle" />
  }
  if (error) return <LoadError what="follows" onRetry={onRetry} />
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={UserPlus}
        title="Not following anyone yet"
        description={
          manage
            ? "Accounts you follow show here."
            : "Accounts this one follows show here."
        }
      >
        {manage ? (
          <Button href="/explore" variant="secondary" size="sm">
            Find accounts
          </Button>
        ) : null}
      </EmptyState>
    )
  }
  if (visible.length === 0) return <NoMatches query={query} onClearSearch={onClearSearch} />
  return (
    <ul className="profile-people">
      {visible.map((r) => {
        const subject = r.value.subject
        return (
          <ProfilePersonRow
            key={subject}
            did={subject}
            since={r.value.createdAt}
            trailing={
              manage ? (
                <FollowingToggle
                  manage={manage}
                  subjectDid={subject}
                  onFollowed={(uri, cid) => {
                    manage.onFollowed(subject, uri, cid)
                    setUnfollowed((prev) => {
                      const next = new Map(prev)
                      next.delete(subject)
                      return next
                    })
                  }}
                  onUnfollowed={() => {
                    manage.onUnfollowed(subject)
                    setUnfollowed((prev) => new Map(prev).set(subject, r))
                  }}
                />
              ) : null
            }
          />
        )
      })}
    </ul>
  )
}

/**
 * Following / Follow on the account's own Following rows: one tap
 * unfollows (no confirm) and the row stays with Follow, which undoes it.
 * The same toggle as on a profile's header and in the Workspace.
 */
function FollowingToggle({
  manage,
  subjectDid,
  onFollowed,
  onUnfollowed,
}: {
  manage: ManageFollows
  subjectDid: string
  onFollowed: (uri: string, cid: string) => void
  onUnfollowed: () => void
}) {
  const { info } = useAuthorInfo(subjectDid)
  const { displayName } = deriveIdentity(info, subjectDid)
  return (
    <span className="profile-person__follow">
      <FollowButton
        viewerDid={manage.viewerDid}
        targetDid={manage.targetDid}
        subjectDid={subjectDid}
        subjectName={displayName}
        isFollowing={manage.subjects.has(subjectDid)}
        isLoading={false}
        onFollowed={onFollowed}
        onUnfollowed={onUnfollowed}
      />
    </span>
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
