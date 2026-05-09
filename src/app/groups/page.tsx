"use client"

import React, { useState, useMemo } from "react"
import Link from "next/link"
import { Building2, Plus, LogOut, ArrowUpDown } from "lucide-react"
import { useOrg } from "@/lib/groups/org-context"
import { useAuth } from "@/lib/auth/auth-context"
import { deleteMembership, removeOrgMember } from "@/lib/groups/api"
import Avatar from "@/components/ui/avatar"
import LoadingSpinner from "@/components/ui/loading-spinner"
import Button from "@/components/ui/button"

const JOINED_DATE_FORMAT: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "numeric",
}

function formatJoinedDate(iso?: string): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString(undefined, JOINED_DATE_FORMAT)
}

type SortMode = "joined-asc" | "joined-desc" | "name-asc" | "name-desc"

const SORT_OPTIONS: ReadonlyArray<{ value: SortMode; label: string }> = [
  { value: "joined-asc", label: "Joined (oldest first)" },
  { value: "joined-desc", label: "Joined (newest first)" },
  { value: "name-asc", label: "Name (A → Z)" },
  { value: "name-desc", label: "Name (Z → A)" },
]

const SORT_VALUES: ReadonlySet<string> = new Set(SORT_OPTIONS.map((o) => o.value))

function isSortMode(v: string): v is SortMode {
  return SORT_VALUES.has(v)
}

export default function GroupsPage() {
  const { groups, isLoading, refetchOrgs } = useOrg()
  const { did } = useAuth()
  const [leaveOrg, setLeaveOrg] = useState<{ groupDid: string; name: string } | null>(null)
  const [isLeaving, setIsLeaving] = useState(false)
  const [sortMode, setSortMode] = useState<SortMode>("joined-asc")

  const sortedOrgs = useMemo(() => {
    // Decorate-sort-undecorate: parse joinedAt once per group rather than per
    // comparison, and cache the display label for case/accent-insensitive
    // name comparisons. Array.prototype.sort is stable as of ES2019, so equal
    // keys preserve input order without needing an explicit tiebreak.
    type Decorated = {
      org: (typeof groups)[number]
      ts: number | null
      label: string
    }
    const decorated: Decorated[] = groups.map((org) => {
      const t = org.joinedAt ? new Date(org.joinedAt).getTime() : NaN
      return {
        org,
        ts: Number.isNaN(t) ? null : t,
        label: org.displayName || org.handle,
      }
    })
    decorated.sort((a, b) => {
      if (sortMode === "joined-asc" || sortMode === "joined-desc") {
        // Missing joinedAt always sorts to the end, regardless of direction.
        if (a.ts === null && b.ts === null) return 0
        if (a.ts === null) return 1
        if (b.ts === null) return -1
        return sortMode === "joined-asc" ? a.ts - b.ts : b.ts - a.ts
      }
      const diff = a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
      return sortMode === "name-asc" ? diff : -diff
    })
    return decorated.map((d) => d.org)
  }, [groups, sortMode])

  const currentSortLabel =
    SORT_OPTIONS.find((o) => o.value === sortMode)?.label ?? ""

  // Owners can never leave — grey out the button. Non-owners can always leave.
  const canLeaveMap = useMemo(() => {
    const map: Record<string, boolean> = {}
    for (const org of groups) {
      map[org.groupDid] = org.role !== "owner"
    }
    return map
  }, [groups])

  const renderOrgItem = (org: (typeof sortedOrgs)[number]) => {
    const displayLabel = org.displayName || org.handle
    const joinedLabel = formatJoinedDate(org.joinedAt)
    const canLeave = canLeaveMap[org.groupDid]
    return (
      <div key={org.groupDid} className="org-list__item">
        <div className="org-list__item-avatar">
          <Avatar
            src={org.avatarUrl}
            alt={displayLabel}
            size="sm"
            fallbackInitials={displayLabel.slice(0, 2)}
          />
        </div>
        <div className="org-list__item-info">
          <p className="org-list__item-name">{displayLabel}</p>
          <p className="org-list__item-handle">{org.handle}</p>
          {joinedLabel && (
            <p className="org-list__item-meta">
              Joined {joinedLabel}
            </p>
          )}
        </div>
        <span className="org-list__item-role">{org.role}</span>
        <div className="org-list__item-actions">
          <button
            className="org-list__leave-btn"
            onClick={() => setLeaveOrg({ groupDid: org.groupDid, name: displayLabel })}
            disabled={!canLeave}
            title={
              canLeave
                ? "Leave group"
                : "Owners can't leave — transfer ownership in group settings first"
            }
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
    )
  }

  const handleLeaveOrg = async () => {
    if (!did || !leaveOrg) return
    setIsLeaving(true)
    try {
      // Remove from group service (actual access removal)
      await removeOrgMember(leaveOrg.groupDid, did)
      // Also clean up local PDS record if it exists
      await deleteMembership(did, leaveOrg.groupDid).catch(() => {})
      await refetchOrgs()
      setLeaveOrg(null)
    } catch (err) {
      console.error("Failed to leave group:", err)
    } finally {
      setIsLeaving(false)
    }
  }

  return (
    <div className="dashboard">
      <div className="dashboard__topbar">
        <h1 className="dashboard__page-title">Groups</h1>
        <div className="dashboard__topbar-right">
          <Link href="/groups/create">
            <Button variant="primary" size="sm">
              <Plus size={16} />
              Create
            </Button>
          </Link>
        </div>
      </div>

      <div className="dashboard__body dashboard__body--single">
        <div className="dashboard__main">
          {isLoading ? (
            <div className="org-list__loading">
              <LoadingSpinner size="md" />
            </div>
          ) : groups.length === 0 ? (
            <div className="org-list__empty">
              <Building2 size={48} className="org-list__empty-icon" />
              <h3 className="org-list__empty-title">No groups yet</h3>
              <p className="org-list__empty-desc">
                Create a new group or wait for an invite to appear here automatically.
              </p>
              <div className="org-list__empty-actions">
                <Link href="/groups/create">
                  <Button variant="primary">
                    <Plus size={16} />
                    Create Group
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <div className="dash-card">
              <div className="org-list__header">
                <h2 className="dash-card__title">Your groups</h2>
                <div className="org-list__header-right">
                  <span className="org-list__count">{groups.length}</span>
                  {groups.length > 1 && (
                    <div className="org-list__sort-icon-btn">
                      <ArrowUpDown size={14} aria-hidden="true" />
                      <select
                        aria-label="Sort groups"
                        title={`Sort: ${currentSortLabel}`}
                        value={sortMode}
                        onChange={(e) => {
                          const next = e.target.value
                          if (isSortMode(next)) setSortMode(next)
                        }}
                        className="org-list__sort-icon-select"
                      >
                        {SORT_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>
              <p className="dash-card__desc">
                Groups you belong to. Switch your profile in the top right to act as a group.
              </p>
              <div className="org-list__items">
                {sortedOrgs.map(renderOrgItem)}
              </div>
            </div>
          )}
        </div>
      </div>

      {leaveOrg && (
        <div className="signin-modal__backdrop" role="presentation" onClick={() => setLeaveOrg(null)}>
          <div className="signin-modal" role="dialog" aria-modal="true" aria-label="Leave Group" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="signin-modal__header">
              <span className="signin-modal__title">Leave Group</span>
              <button className="signin-modal__close" onClick={() => setLeaveOrg(null)} aria-label="Close">
                <LogOut size={18} />
              </button>
            </div>
            <div className="signin-modal__body">
              <p className="dash-card__desc" style={{ marginBottom: 20 }}>
                Are you sure you want to leave <strong>{leaveOrg.name}</strong>? You will lose access to this group. An admin will need to re-invite you if you want to rejoin.
              </p>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <Button variant="ghost" onClick={() => setLeaveOrg(null)} disabled={isLeaving}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={handleLeaveOrg} loading={isLeaving} disabled={isLeaving}>
                  Leave
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
