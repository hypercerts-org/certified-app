"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { ArrowUpDown, Building2, Check, Plus, Search } from "lucide-react"
import Avatar from "@/components/ui/avatar"
import Button from "@/components/ui/button"
import EmptyState from "@/components/ui/empty-state"
import LoadingSpinner from "@/components/ui/loading-spinner"
import { useCgsMemberships, type UserGroup } from "@/hooks/use-cgs-memberships"
import { useAuth } from "@/lib/auth/auth-context"
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

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "joined-desc", label: "Recently joined" },
  { key: "joined-asc", label: "Earliest joined" },
  { key: "alpha-asc", label: "Name A → Z" },
  { key: "alpha-desc", label: "Name Z → A" },
]

/**
 * Groups tab on the signed-in user's own profile. Single source of
 * truth: the Certified Group Service (CGS) — no public/private split,
 * no PDS-membership lexicon. The parent page gates rendering so this
 * component only mounts on the viewer's own profile; the CGS endpoint
 * is session-authed and would return [] for any other DID anyway.
 */
export default function ProfileGroups({ did }: ProfileGroupsProps) {
  const { did: viewerDid } = useAuth()
  const isOwnProfile = !!did && !!viewerDid && did === viewerDid

  const { groups, isLoading, error } = useCgsMemberships(did)

  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<SortKey>("joined-desc")
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

  const visible = useMemo(
    () => filterAndSort(groups, query, sort),
    [groups, query, sort],
  )

  const count = groups.length

  return (
    <div className="profile-groups">
      <div className="profile-groups__toolbar">
        <h2 className="profile-groups__title">
          Groups
          {count > 0 ? (
            <span className="profile-groups__count">{count}</span>
          ) : null}
        </h2>

        <div className="profile-groups__controls">
          {isOwnProfile ? (
            <Link href="/groups/create">
              <Button variant="primary" size="sm">
                <Plus size={14} strokeWidth={1.75} aria-hidden />
                New group
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
          title={query ? "No groups match" : "No groups yet"}
          description={
            query
              ? "Try a different search term."
              : "When you join a group, it'll appear here."
          }
        />
      ) : (
        <ul className="profile-groups__list">
          {visible.map((g) => (
            <GroupRow key={g.groupDid} group={g} />
          ))}
        </ul>
      )}
    </div>
  )
}

interface GroupRowProps {
  group: UserGroup
}

function GroupRow({ group }: GroupRowProps) {
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
