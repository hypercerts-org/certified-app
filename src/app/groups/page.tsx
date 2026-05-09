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
  return date.toLocaleDateString("en-US", JOINED_DATE_FORMAT)
}

type SortMode = "joined-asc" | "joined-desc" | "name-asc" | "name-desc"

const SORT_OPTIONS: ReadonlyArray<{ value: SortMode; label: string }> = [
  { value: "joined-asc", label: "Joined (oldest first)" },
  { value: "joined-desc", label: "Joined (newest first)" },
  { value: "name-asc", label: "Name (A → Z)" },
  { value: "name-desc", label: "Name (Z → A)" },
]

export default function GroupsPage() {
  const { groups, isLoading, refetchOrgs } = useOrg()
  const { did } = useAuth()
  const [leaveOrg, setLeaveOrg] = useState<{ groupDid: string; name: string } | null>(null)
  const [isLeaving, setIsLeaving] = useState(false)
  const [sortMode, setSortMode] = useState<SortMode>("joined-asc")

  const sortedOrgs = useMemo(() => {
    const arr = [...groups]
    arr.sort((a, b) => {
      if (sortMode === "joined-asc" || sortMode === "joined-desc") {
        // Missing joinedAt always sorts to the end, regardless of direction.
        const ta = a.joinedAt ? new Date(a.joinedAt).getTime() : null
        const tb = b.joinedAt ? new Date(b.joinedAt).getTime() : null
        if (ta === null && tb === null) return 0
        if (ta === null) return 1
        if (tb === null) return -1
        return sortMode === "joined-asc" ? ta - tb : tb - ta
      }
      const nameA = (a.displayName || a.handle).toLowerCase()
      const nameB = (b.displayName || b.handle).toLowerCase()
      const diff = nameA.localeCompare(nameB)
      return sortMode === "name-asc" ? diff : -diff
    })
    return arr
  }, [groups, sortMode])

  // Owners can never leave — grey out the button. Non-owners can always leave.
  const canLeaveMap = useMemo(() => {
    const map: Record<string, boolean> = {}
    for (const org of groups) {
      map[org.groupDid] = org.role !== "owner"
    }
    return map
  }, [groups])

  const renderOrgItem = (org: (typeof sortedOrgs)[number]) => {
    const joinedLabel = formatJoinedDate(org.joinedAt)
    return (
      <div key={org.groupDid} className="org-list__item">
        <div className="org-list__item-avatar">
          <Avatar
            src={org.avatarUrl}
            alt={org.displayName || org.handle}
            size="sm"
            fallbackInitials={(org.displayName || org.handle).slice(0, 2)}
          />
        </div>
        <div className="org-list__item-info">
          <p className="org-list__item-name">
            {org.displayName || org.handle}
          </p>
          <p className="org-list__item-handle">
            {org.handle}
          </p>
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
            onClick={() => setLeaveOrg({ groupDid: org.groupDid, name: org.displayName || org.handle })}
            disabled={!canLeaveMap[org.groupDid]}
            title={!canLeaveMap[org.groupDid] ? "Owners can't leave the group" : "Leave group"}
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
                    <div
                      className="org-list__sort-icon-btn"
                      title={`Sort: ${SORT_OPTIONS.find((o) => o.value === sortMode)?.label}`}
                    >
                      <ArrowUpDown size={14} aria-hidden />
                      <select
                        aria-label="Sort groups"
                        value={sortMode}
                        onChange={(e) => setSortMode(e.target.value as SortMode)}
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
