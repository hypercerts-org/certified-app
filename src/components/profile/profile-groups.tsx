"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Building2, Check, Plus, SearchX } from "lucide-react"
import { profileUrl } from "@/lib/urls"
import Avatar from "@/components/ui/avatar"
import Button from "@/components/ui/button"
import EmptyState from "@/components/ui/empty-state"
import SectionHeader from "@/components/ui/section-header"
import {
  PANEL_SEARCH_MIN,
  PanelCount,
  PanelTools,
  ProfileRowsSkeleton,
  type SortOption,
} from "@/components/profile/profile-panel"
import { useCgsMemberships, type UserGroup } from "@/hooks/use-cgs-memberships"
import { useAuth } from "@/lib/auth/auth-context"
import { useOrg } from "@/lib/groups/org-context"
import type { OrgRole } from "@/lib/groups/types"
import { formatRelativeTime } from "@/lib/atproto/activity"
import { getInitials } from "@/lib/utils/initials"

interface ProfileGroupsProps {
  did: string | null
}

type SortKey =
  | "joined-desc"
  | "joined-asc"
  | "alpha-asc"
  | "alpha-desc"

const SORT_OPTIONS: SortOption<SortKey>[] = [
  { key: "joined-desc", label: "Recently joined" },
  { key: "joined-asc", label: "Earliest joined" },
  { key: "alpha-asc", label: "Name A to Z" },
  { key: "alpha-desc", label: "Name Z to A" },
]

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
}

/**
 * Groups tab on the signed-in account's own profile, as rows: each group
 * with its role and when you joined, and "Act as" to act for it. The
 * Certified Group Service is the one source; the page only mounts this
 * while the viewer's active identity is this profile.
 */
export default function ProfileGroups({ did }: ProfileGroupsProps) {
  const { did: viewerDid } = useAuth()
  const isOwnProfile = !!did && !!viewerDid && did === viewerDid

  const { groups, isLoading, error, refresh } = useCgsMemberships(did)

  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<SortKey>("joined-desc")

  const visible = useMemo(
    () => filterAndSort(groups, query, sort),
    [groups, query, sort],
  )
  const showTools = groups.length > PANEL_SEARCH_MIN || query.trim() !== ""
  const loading = isLoading && groups.length === 0

  const body = loading ? (
    <ProfileRowsSkeleton rows={3} shape="circle" />
  ) : error ? (
    <EmptyState
      icon={Building2}
      title="Couldn't load groups"
      description="Something went wrong on our side. Try again in a moment."
    >
      <Button variant="secondary" size="sm" onClick={refresh}>
        Try again
      </Button>
    </EmptyState>
  ) : groups.length === 0 ? (
    <EmptyState
      icon={Building2}
      title="No groups yet"
      description={
        isOwnProfile
          ? "Groups you create or join show here."
          : "Groups this account belongs to show here."
      }
    >
      {isOwnProfile ? (
        <Button href="/groups/create" variant="secondary" size="sm">
          New group
        </Button>
      ) : null}
    </EmptyState>
  ) : visible.length === 0 ? (
    <EmptyState
      icon={SearchX}
      title="Nothing matches"
      description={`No groups match "${query.trim()}".`}
    >
      <Button variant="secondary" size="sm" onClick={() => setQuery("")}>
        Clear search
      </Button>
    </EmptyState>
  ) : (
    <ul className="profile-rows">
      {visible.map((g) => (
        <GroupRow key={g.groupDid} group={g} />
      ))}
    </ul>
  )

  return (
    <section className="profile-panel" aria-labelledby="profile-groups-heading">
      <SectionHeader
        id="profile-groups-heading"
        title={
          <>
            Groups <PanelCount n={loading || error ? null : groups.length} />
          </>
        }
        action={
          // The empty state carries "New group" when there are none.
          isOwnProfile && (loading || !!error || groups.length > 0) ? (
            <Button href="/groups/create" variant="secondary" size="sm">
              <Plus size={16} strokeWidth={1.75} aria-hidden />
              New group
            </Button>
          ) : null
        }
      />
      {showTools ? (
        <PanelTools
          query={query}
          onQueryChange={setQuery}
          searchLabel="Search groups"
          sort={sort}
          sortOptions={SORT_OPTIONS}
          onSortChange={setSort}
          sortLabel="Sort groups"
        />
      ) : null}
      {body}
    </section>
  )
}

function GroupRow({ group }: { group: UserGroup }) {
  const router = useRouter()
  const { groups: orgGroups, activeOrg, switchOrg } = useOrg()
  const name = group.displayName || group.handle
  const initials = getInitials(name, group.handle ?? group.groupDid)
  const role = group.role ? (ROLE_LABEL[group.role] ?? group.role) : null
  const joined = group.joinedAt ? `Joined ${formatRelativeTime(group.joinedAt)}` : null
  const isActing = activeOrg?.groupDid === group.groupDid

  // "Act as" switches the identity to this group; the row link only opens
  // the group's profile. Prefer the org context's Group so the active-org
  // reconciliation keeps it; fall back to one built from the membership.
  const handleActAs = () => {
    const org =
      orgGroups.find((g) => g.groupDid === group.groupDid) ?? {
        groupDid: group.groupDid,
        handle: group.handle,
        displayName: group.displayName,
        role: (group.role as OrgRole) ?? "member",
        accepted: true,
        avatarUrl: group.avatarUrl,
      }
    switchOrg(org)
    router.push("/home")
  }

  return (
    <li className="profile-row profile-group-row">
      <Link
        href={profileUrl(group.handle)}
        className="profile-group-row__main hover-tint hover-tint--bleed"
        title={`${name} (@${group.handle})`}
      >
        <Avatar
          size="sm"
          shape="square"
          src={group.avatarUrl}
          fallbackInitials={initials}
          seed={group.groupDid}
          alt=""
        />
        <span className="profile-row__text">
          <span className="profile-row__title" dir="auto">
            {name}
          </span>
          {group.description ? (
            <span className="profile-row__desc" dir="auto">
              {group.description}
            </span>
          ) : null}
          <span className="profile-row__meta">
            {[role, `@${group.handle}`, joined].filter(Boolean).join(" · ")}
          </span>
        </span>
      </Link>
      {isActing ? (
        <span className="profile-group-row__acting">
          <Check size={16} strokeWidth={1.75} aria-hidden />
          Acting as
        </span>
      ) : (
        <Button
          variant="secondary"
          size="sm"
          onClick={handleActAs}
          aria-label={`Act as ${name}`}
        >
          Act as
        </Button>
      )}
    </li>
  )
}

function filterAndSort(
  groups: UserGroup[],
  query: string,
  sort: SortKey,
): UserGroup[] {
  const q = query.trim().toLowerCase()
  const matches = q
    ? groups.filter((g) => {
        const n = (g.displayName ?? "").toLowerCase()
        const h = (g.handle ?? "").toLowerCase()
        const d = (g.description ?? "").toLowerCase()
        return n.includes(q) || h.includes(q) || d.includes(q)
      })
    : groups

  const sorted = matches.slice()
  sorted.sort((a, b) => {
    switch (sort) {
      case "joined-desc":
        return compareDate(b.joinedAt ?? "", a.joinedAt ?? "")
      case "joined-asc":
        return compareDate(a.joinedAt ?? "", b.joinedAt ?? "")
      case "alpha-asc":
        return (a.displayName || a.handle).localeCompare(b.displayName || b.handle)
      case "alpha-desc":
        return (b.displayName || b.handle).localeCompare(a.displayName || a.handle)
    }
  })
  return sorted
}

function compareDate(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}
