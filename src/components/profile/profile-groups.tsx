"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import {
  ArrowUpDown,
  Building2,
  Check,
  Eye,
  EyeOff,
  Plus,
  Search,
} from "lucide-react"
import Avatar from "@/components/ui/avatar"
import Button from "@/components/ui/button"
import EmptyState from "@/components/ui/empty-state"
import LoadingSpinner from "@/components/ui/loading-spinner"
import { useUserGroups, type UserGroup } from "@/hooks/use-user-groups"
import { useCgsPrivateMemberships } from "@/hooks/use-private-memberships"
import { useAuth } from "@/lib/auth/auth-context"
import { deleteMembership, putMembership } from "@/lib/groups/api"
import { formatRelativeTime } from "@/lib/atproto/activity"
import { getInitials } from "@/lib/utils/initials"
import type { OrgRole } from "@/lib/groups/types"

interface ProfileGroupsProps {
  did: string | null
}

type SubTab = "public" | "private"

type SortKey =
  | "joined-desc"
  | "joined-asc"
  | "alpha-asc"
  | "alpha-desc"

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "joined-desc", label: "Recently joined" },
  { key: "joined-asc", label: "Earliest joined" },
  { key: "alpha-asc", label: "Name A → Z" },
  { key: "alpha-desc", label: "Name Z → A" },
]

/**
 * Groups tab on a user's profile. Two sub-tabs:
 *
 *   - Public — `app.certified.actor.membership` records on the profile's
 *     PDS (visible to anyone). Sourced from <useUserGroups>.
 *   - Private — groups the signed-in viewer belongs to on the Certified
 *     Group Service (CGS) but which are NOT mirrored to a public PDS
 *     membership record. Only rendered on the viewer's own profile.
 *
 * On the viewer's own profile, each Public row exposes "Make private"
 * (delete the PDS membership record); each Private row exposes
 * "Make public" (create the PDS membership record).
 */
export default function ProfileGroups({ did }: ProfileGroupsProps) {
  const { did: viewerDid } = useAuth()
  const isOwnProfile = !!did && !!viewerDid && did === viewerDid

  const {
    groups: publicGroups,
    isLoading: publicLoading,
    error: publicError,
    refresh: refreshPublic,
  } = useUserGroups(did)

  // Only run the CGS fetch on the viewer's own profile — for foreign
  // profiles the endpoint would return [] anyway (it's session-scoped)
  // but skipping the call avoids an unnecessary network hop.
  const privateTargetDid = isOwnProfile ? did : null
  const {
    groups: privateGroups,
    isLoading: privateLoading,
    error: privateError,
    refresh: refreshPrivate,
  } = useCgsPrivateMemberships(privateTargetDid)

  const [tab, setTab] = useState<SubTab>("public")
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<SortKey>("joined-desc")
  const [sortOpen, setSortOpen] = useState(false)

  // Pending writes — keyed by groupDid so individual rows show a spinner
  // / disabled state independently while the network round-trip is in
  // flight. Errors surface as a toast-style inline banner above the row.
  const [pendingDid, setPendingDid] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

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

  const visibleSource = tab === "public" ? publicGroups : privateGroups
  const isLoading = tab === "public" ? publicLoading : privateLoading
  const error = tab === "public" ? publicError : privateError

  const visible = useMemo(
    () => filterAndSort(visibleSource, query, sort),
    [visibleSource, query, sort],
  )

  const publicCount = publicGroups.length
  const privateCount = privateGroups.length

  // Force-switch back to Public if Private becomes unavailable (e.g.
  // viewer signs out while the tab is mounted).
  useEffect(() => {
    if (!isOwnProfile && tab === "private") setTab("public")
  }, [isOwnProfile, tab])

  async function handleMakePrivate(group: UserGroup) {
    if (!did) return
    setPendingDid(group.groupDid)
    setActionError(null)
    try {
      await deleteMembership(did, group.groupDid)
      // Refetch both sources. Order: refresh public first so the row
      // disappears, then refresh private so it reappears there.
      refreshPublic()
      refreshPrivate()
    } catch (err) {
      console.error("Failed to make group private:", err)
      setActionError(
        err instanceof Error ? err.message : "Couldn't make group private",
      )
    } finally {
      setPendingDid(null)
    }
  }

  async function handleMakePublic(group: UserGroup) {
    if (!did) return
    setPendingDid(group.groupDid)
    setActionError(null)
    try {
      const role: OrgRole = (group.role as OrgRole) || "member"
      await putMembership(did, group.groupDid, role)
      refreshPublic()
      refreshPrivate()
    } catch (err) {
      console.error("Failed to make group public:", err)
      setActionError(
        err instanceof Error ? err.message : "Couldn't make group public",
      )
    } finally {
      setPendingDid(null)
    }
  }

  return (
    <div className="profile-groups">
      <div className="profile-groups__toolbar">
        {isOwnProfile ? (
          <nav
            className="profile-groups__subtabs"
            role="tablist"
            aria-label="Groups sections"
          >
            <button
              type="button"
              role="tab"
              aria-selected={tab === "public"}
              className={`profile-groups__subtab ${
                tab === "public" ? "profile-groups__subtab--active" : ""
              }`}
              onClick={() => setTab("public")}
            >
              Public
              {publicCount > 0 ? (
                <span className="profile-groups__subtab-count">
                  {publicCount}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "private"}
              className={`profile-groups__subtab ${
                tab === "private" ? "profile-groups__subtab--active" : ""
              }`}
              onClick={() => setTab("private")}
            >
              Private
              {privateCount > 0 ? (
                <span className="profile-groups__subtab-count">
                  {privateCount}
                </span>
              ) : null}
            </button>
          </nav>
        ) : (
          <h2 className="profile-groups__title">
            Groups
            {publicCount > 0 ? (
              <span className="profile-groups__count">{publicCount}</span>
            ) : null}
          </h2>
        )}

        <div className="profile-groups__controls">
          {isOwnProfile ? (
            <Link href="/groups/create">
              <Button variant="primary" size="sm">
                <Plus size={14} strokeWidth={1.75} aria-hidden />
                Create new group
              </Button>
            </Link>
          ) : null}
          <label className="profile-groups__search">
            <Search
              size={16}
              strokeWidth={1.75}
              className="profile-groups__search-icon"
              aria-hidden
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search groups"
              aria-label="Search groups"
              className="profile-groups__search-input"
            />
          </label>

          <div className="profile-groups__sort-wrap">
            <button
              ref={sortBtnRef}
              type="button"
              className="profile-groups__sort-btn"
              onClick={() => setSortOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={sortOpen}
              aria-label="Sort groups"
              title="Sort"
            >
              <ArrowUpDown size={16} strokeWidth={1.75} aria-hidden />
            </button>
            {sortOpen ? (
              <div
                ref={sortMenuRef}
                className="profile-groups__sort-menu"
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
                      className="profile-groups__sort-item"
                      onClick={() => {
                        setSort(opt.key)
                        setSortOpen(false)
                      }}
                    >
                      <span className="profile-groups__sort-item-check">
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

      {actionError ? (
        <div className="profile-groups__error" role="alert">
          {actionError}
        </div>
      ) : null}

      {isLoading ? (
        <div className="profile-groups__loading">
          <LoadingSpinner size="md" />
        </div>
      ) : error ? (
        <EmptyState
          icon={Building2}
          title="Couldn't load groups"
          description={error}
        />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={
            query
              ? "No groups match"
              : tab === "private"
                ? "No private groups"
                : "No groups yet"
          }
          description={
            query
              ? "Try a different search term."
              : tab === "private"
                ? "Groups you belong to that aren't published on your PDS will appear here."
                : "When this user joins a group, it'll appear here."
          }
        />
      ) : (
        <ul className="profile-groups__list">
          {visible.map((g) => (
            <GroupRow
              key={g.groupDid}
              group={g}
              showActions={isOwnProfile}
              actionKind={tab === "public" ? "make-private" : "make-public"}
              isPending={pendingDid === g.groupDid}
              onAction={
                tab === "public"
                  ? () => handleMakePrivate(g)
                  : () => handleMakePublic(g)
              }
            />
          ))}
        </ul>
      )}
    </div>
  )
}

interface GroupRowProps {
  group: UserGroup
  showActions: boolean
  actionKind: "make-public" | "make-private"
  isPending: boolean
  onAction: () => void
}

function GroupRow({
  group,
  showActions,
  actionKind,
  isPending,
  onAction,
}: GroupRowProps) {
  const name = group.displayName || group.handle
  const initials = getInitials(name, group.groupDid)
  const joinedLabel = group.joinedAt
    ? `Joined ${formatRelativeTime(group.joinedAt)}`
    : null
  return (
    <li className="profile-groups__item">
      <div className="profile-groups__row">
        <Link
          href={`/profile/${encodeURIComponent(group.handle)}`}
          className="profile-groups__row-link"
          title={`${name} (@${group.handle})`}
        >
          <Avatar
            size="md"
            src={group.avatarUrl}
            fallbackInitials={initials}
            alt=""
          />
          <div className="profile-groups__meta">
            <div className="profile-groups__identity">
              <span className="profile-groups__name">{name}</span>
              <span className="profile-groups__handle">@{group.handle}</span>
            </div>
            {group.description ? (
              <p className="profile-groups__description">{group.description}</p>
            ) : null}
            {joinedLabel ? (
              <span className="profile-groups__joined">{joinedLabel}</span>
            ) : null}
          </div>
        </Link>

        <div className="profile-groups__row-actions">
          {group.role ? (
            <span className="profile-groups__role">{group.role}</span>
          ) : null}
          {showActions ? (
            <button
              type="button"
              className="profile-groups__action-btn"
              onClick={onAction}
              disabled={isPending}
              aria-label={
                actionKind === "make-private" ? "Make group private" : "Make group public"
              }
              title={
                actionKind === "make-private" ? "Make private" : "Make public"
              }
            >
              {actionKind === "make-private" ? (
                <EyeOff size={14} strokeWidth={1.75} aria-hidden />
              ) : (
                <Eye size={14} strokeWidth={1.75} aria-hidden />
              )}
              <span>
                {isPending
                  ? "Saving…"
                  : actionKind === "make-private"
                    ? "Make private"
                    : "Make public"}
              </span>
            </button>
          ) : null}
        </div>
      </div>
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
