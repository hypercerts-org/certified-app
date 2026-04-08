"use client"

import React, { useState, useMemo, useEffect, useCallback } from "react"
import Link from "next/link"
import { Building2, Plus, LogOut, UserCheck, UserX } from "lucide-react"
import { useOrg } from "@/lib/organizations/org-context"
import { useAuth } from "@/lib/auth/auth-context"
import {
  putMembership,
  deleteMembership,
  removeOrgMember,
  listOrgMembers,
} from "@/lib/organizations/api"
import type { OrgRole } from "@/lib/organizations/types"
import Avatar from "@/components/ui/avatar"
import LoadingSpinner from "@/components/ui/loading-spinner"
import Button from "@/components/ui/button"

export default function OrganizationsPage() {
  const { organizations, isLoading, refetchOrgs } = useOrg()
  const { did } = useAuth()
  const [leaveOrg, setLeaveOrg] = useState<{ groupDid: string; name: string } | null>(null)
  const [isLeaving, setIsLeaving] = useState(false)
  const [acceptingOrg, setAcceptingOrg] = useState<string | null>(null)
  const [canLeaveMap, setCanLeaveMap] = useState<Record<string, boolean>>({})
  const [removingPublic, setRemovingPublic] = useState<string | null>(null)

  const ROLE_ORDER: Record<string, number> = { owner: 0, admin: 1, member: 2 }

  const sortedOrgs = useMemo(() => {
    return [...organizations].sort((a, b) => {
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
  }, [organizations])

  const acceptedOrgs = sortedOrgs.filter((o) => o.accepted)
  const pendingOrgs = sortedOrgs.filter((o) => !o.accepted)

  const checkCanLeave = useCallback(async () => {
    if (!organizations.length || !did) return
    const entries = await Promise.all(
      organizations.map(async (org) => {
        if (org.role !== "owner") return [org.groupDid, true] as const
        try {
          const members = await listOrgMembers(org.groupDid)
          const ownerCount = members.filter((m) => m.role === "owner").length
          return [org.groupDid, ownerCount > 1] as const
        } catch {
          return [org.groupDid, false] as const
        }
      })
    )
    setCanLeaveMap(Object.fromEntries(entries))
  }, [organizations, did])

  useEffect(() => {
    checkCanLeave()
  }, [checkCanLeave])

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
          title={canLeaveMap[org.groupDid] === false ? "Transfer ownership before leaving" : "Leave group"}
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
      console.error("Failed to leave organization:", err)
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
          <Link href="/organizations/create">
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
          ) : organizations.length === 0 ? (
            <div className="org-list__empty">
              <Building2 size={48} className="org-list__empty-icon" />
              <h3 className="org-list__empty-title">No groups yet</h3>
              <p className="org-list__empty-desc">
                Create a new group or wait for an invite to appear here automatically.
              </p>
              <div className="org-list__empty-actions">
                <Link href="/organizations/create">
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
                <span className="org-list__count">{organizations.length}</span>
              </div>
              <p className="dash-card__desc">
                Groups you belong to. Use the profile switcher to act on behalf of a group.
              </p>
              <div className="org-list__items">
                {acceptedOrgs.map(renderOrgItem)}
                {pendingOrgs.length > 0 && (
                  <div className="org-list__divider">
                    <span className="org-list__divider-text">
                      Groups without public membership — you can still interact with these groups
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
