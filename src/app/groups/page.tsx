"use client"

import React, { useState, useMemo } from "react"
import Link from "next/link"
import { Building2, Plus, LogOut, UserCheck, UserX } from "lucide-react"
import { useOrg } from "@/lib/groups/org-context"
import { useAuth } from "@/lib/auth/auth-context"
import {
  putMembership,
  deleteMembership,
  removeOrgMember,
} from "@/lib/groups/api"
import type { OrgRole } from "@/lib/groups/types"
import Avatar from "@/components/ui/avatar"
import LoadingSpinner from "@/components/ui/loading-spinner"
import Button from "@/components/ui/button"

export default function GroupsPage() {
  const { groups, isLoading, refetchOrgs } = useOrg()
  const { did } = useAuth()
  const [leaveOrg, setLeaveOrg] = useState<{ groupDid: string; name: string } | null>(null)
  const [isLeaving, setIsLeaving] = useState(false)
  const [acceptingOrg, setAcceptingOrg] = useState<string | null>(null)
  const [removingPublic, setRemovingPublic] = useState<string | null>(null)

  const ROLE_ORDER: Record<string, number> = { owner: 0, admin: 1, member: 2 }

  const sortedOrgs = useMemo(() => {
    return [...groups].sort((a, b) => {
      // Accepted first
      if (a.accepted !== b.accepted) return a.accepted ? -1 : 1
      // Then by role
      const roleA = ROLE_ORDER[a.role] ?? 3
      const roleB = ROLE_ORDER[b.role] ?? 3
      if (roleA !== roleB) return roleA - roleB
      // Then by name
      const nameA = (a.displayName || a.handle).toLowerCase()
      const nameB = (b.displayName || b.handle).toLowerCase()
      return nameA.localeCompare(nameB)
    })
  }, [groups])

  const acceptedOrgs = sortedOrgs.filter((o) => o.accepted)
  const pendingOrgs = sortedOrgs.filter((o) => !o.accepted)

  // Owners can never leave — grey out the button. Non-owners can always leave.
  const canLeaveMap = useMemo(() => {
    const map: Record<string, boolean> = {}
    for (const org of groups) {
      map[org.groupDid] = org.role !== "owner"
    }
    return map
  }, [groups])

  const renderOrgItem = (org: (typeof sortedOrgs)[number]) => (
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
      </div>
      <span className="org-list__item-role">{org.role}</span>
      <div className="org-list__item-actions">
        {org.accepted ? (
          <button
            className="org-list__remove-public-btn"
            onClick={() => handleRemovePublicMembership(org.groupDid)}
            disabled={removingPublic === org.groupDid}
            title="Remove public membership"
          >
            <UserX size={14} />
          </button>
        ) : (
          <button
            className="org-list__accept-btn"
            onClick={() => handleAcceptMembership(org.groupDid, org.role)}
            disabled={acceptingOrg === org.groupDid}
            title="Accept membership publicly"
          >
            <UserCheck size={14} />
          </button>
        )}
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

  const handleRemovePublicMembership = async (groupDid: string) => {
    if (!did) return
    setRemovingPublic(groupDid)
    try {
      await deleteMembership(did, groupDid)
      await refetchOrgs()
    } catch (err) {
      console.error("Failed to remove public membership:", err)
    } finally {
      setRemovingPublic(null)
    }
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

  const handleAcceptMembership = async (groupDid: string, role: OrgRole) => {
    if (!did) return
    setAcceptingOrg(groupDid)
    try {
      await putMembership(did, groupDid, role)
      await refetchOrgs()
    } catch (err) {
      console.error("Failed to accept membership:", err)
    } finally {
      setAcceptingOrg(null)
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
          <div
            style={{
              padding: "10px 14px",
              marginBottom: 16,
              borderRadius: 8,
              background: "var(--color-warning-bg)",
              border: "1px solid var(--color-warning-border)",
              color: "var(--color-warning-text)",
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            <strong>Heads up:</strong> Groups are in beta and currently run on a test server. Data may be reset or removed without notice — please don't rely on it for anything important yet.
          </div>
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
                <span className="org-list__count">{groups.length}</span>
              </div>
              <p className="dash-card__desc">
                Groups you belong to. Switch your profile in the top right to act as a group.
              </p>
              <div className="org-list__items">
                {acceptedOrgs.map(renderOrgItem)}
                {pendingOrgs.length > 0 && (
                  <div className="org-list__divider">
                    <span className="org-list__divider-text">
                      Groups where your membership is private. You can still act on behalf of these groups.
                    </span>
                  </div>
                )}
                {pendingOrgs.map(renderOrgItem)}
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
