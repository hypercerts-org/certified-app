"use client"

import { useCallback, useMemo, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Inbox, SearchX, UserPlus, Users, X } from "lucide-react"
import { useFollowers, type FollowerEntry } from "@/hooks/use-followers"
import { useFollowing } from "@/hooks/use-following"
import { useAuthorInfo } from "@/hooks/use-author-info"
import { useAuthorNamesMap } from "@/hooks/use-author-names-map"
import { deriveIdentity } from "@/lib/utils/identity"
import { useAuth } from "@/lib/auth/auth-context"
import { useOrg } from "@/lib/groups/org-context"
import { deleteFollow, type FollowRecord } from "@/lib/atproto/follow"
import ConfirmDialog from "@/components/ui/confirm-dialog"
import EmptyState from "@/components/ui/empty-state"
import Button from "@/components/ui/button"
import { Tabs, TabList, Tab, TabPanel } from "@/components/ui/tabs"
import ProfilePersonRow from "@/components/profile/profile-person-row"
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
  // Only the profile's own account can unfollow from its Following list.
  const { did: viewerDid } = useAuth()
  // Acting as a group: unfollows route to the group's repo via the BFF.
  const { activeOrg } = useOrg()
  const isOwnProfile = !!viewerDid && viewerDid === did

  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const tab: SubTab = searchParams?.get("sub") === "following" ? "following" : "followers"
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
      <h2 className="sr-only">Followers and following</h2>
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
          canUnfollow={isOwnProfile}
          viewerDid={viewerDid}
          targetDid={activeOrg?.groupDid}
          onAfterUnfollow={() => following.refetch()}
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
      title="Nothing matches"
      description={`No accounts match "${query.trim()}".`}
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

function FollowingList({
  records,
  isLoading,
  error,
  onRetry,
  query,
  onClearSearch,
  sort,
  names,
  canUnfollow,
  viewerDid,
  targetDid,
  onAfterUnfollow,
}: {
  records: FollowRecord[]
  isLoading: boolean
  error: string | null
  onRetry: () => void
  query: string
  onClearSearch: () => void
  sort: SortKey
  names: Map<string, string>
  /** The profile's own account is viewing: each row can be unfollowed. */
  canUnfollow: boolean
  viewerDid: string | null
  /** When set (acting as a group), unfollows write to the group's repo. */
  targetDid?: string
  onAfterUnfollow: () => void | Promise<void>
}) {
  const visible = useMemo(
    () => filterAndSortFollowing(records, query, sort, names),
    [records, query, sort, names],
  )

  if (isLoading && records.length === 0) {
    return <ProfileRowsSkeleton rows={4} shape="circle" />
  }
  if (error) return <LoadError what="follows" onRetry={onRetry} />
  if (records.length === 0) {
    return (
      <EmptyState
        icon={UserPlus}
        title="Not following anyone yet"
        description={
          canUnfollow
            ? "Accounts you follow show here."
            : "Accounts this one follows show here."
        }
      >
        {canUnfollow ? (
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
      {visible.map((r) => (
        <FollowingRow
          key={r.uri}
          record={r}
          canUnfollow={canUnfollow && !!viewerDid}
          viewerDid={viewerDid}
          targetDid={targetDid}
          onAfterUnfollow={onAfterUnfollow}
        />
      ))}
    </ul>
  )
}

function FollowingRow({
  record,
  canUnfollow,
  viewerDid,
  targetDid,
  onAfterUnfollow,
}: {
  record: FollowRecord
  canUnfollow: boolean
  viewerDid: string | null
  targetDid?: string
  onAfterUnfollow: () => void | Promise<void>
}) {
  const subject = record.value.subject
  return (
    <ProfilePersonRow
      did={subject}
      since={record.value.createdAt}
      trailing={
        canUnfollow && viewerDid ? (
          <UnfollowButton
            viewerDid={viewerDid}
            rkey={record.rkey}
            targetDid={targetDid}
            subjectDid={subject}
            onAfterUnfollow={onAfterUnfollow}
          />
        ) : null
      }
    />
  )
}

/**
 * The unfollow control on the account's own Following rows: an icon
 * button, a confirm dialog, then `deleteFollow` and a refetch so the row
 * drops.
 */
function UnfollowButton({
  viewerDid,
  rkey,
  targetDid,
  subjectDid,
  onAfterUnfollow,
}: {
  viewerDid: string
  rkey: string
  targetDid?: string
  subjectDid: string
  onAfterUnfollow: () => void | Promise<void>
}) {
  const { info } = useAuthorInfo(subjectDid)
  const { displayName: subjectDisplay } = deriveIdentity(info, subjectDid)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [isRevoking, setIsRevoking] = useState(false)

  const handleConfirm = async () => {
    if (isRevoking) return
    setIsRevoking(true)
    try {
      await deleteFollow(viewerDid, rkey, { targetDid })
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
      <Button
        variant="ghost"
        size="icon-sm"
        className="profile-person__action"
        onClick={() => setConfirmOpen(true)}
        aria-label={`Unfollow ${subjectDisplay}`}
      >
        <X size={16} strokeWidth={1.75} aria-hidden />
      </Button>
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
