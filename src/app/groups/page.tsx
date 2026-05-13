"use client"

import React, { useState, useMemo } from "react"
import Link from "next/link"
import { Plus, LogOut } from "lucide-react"
import { useOrg } from "@/lib/groups/org-context"
import { useAuth } from "@/lib/auth/auth-context"
import { usePageTitle } from "@/lib/navbar-context"
import {
  putMembership,
  deleteMembership,
  removeOrgMember,
} from "@/lib/groups/api"
import type { OrgRole } from "@/lib/groups/types"
import Avatar from "@/components/ui/avatar"
import LoadingSpinner from "@/components/ui/loading-spinner"
import Button from "@/components/ui/button"

type TabKey = "public" | "private"

const TABS: { key: TabKey; label: string }[] = [
  { key: "public", label: "Public" },
  { key: "private", label: "Private" },
]

const ROLE_ORDER: Record<string, number> = { owner: 0, admin: 1, member: 2 }

export default function GroupsPage() {
  usePageTitle("Groups")
  const { groups, isLoading, refetchOrgs } = useOrg()
  const { did } = useAuth()
  const [activeTab, setActiveTab] = useState<TabKey>("public")
  const [leaveOrg, setLeaveOrg] = useState<{ groupDid: string; name: string } | null>(null)
  const [isLeaving, setIsLeaving] = useState(false)
  const [acceptingOrg, setAcceptingOrg] = useState<string | null>(null)
  const [removingPublic, setRemovingPublic] = useState<string | null>(null)

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
      <Link
        href={`/groups/${encodeURIComponent(org.groupDid)}/settings`}
        className="org-list__item-main"
      >
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
      </Link>
      <div className="org-list__item-actions">
        {org.accepted ? (
          <button
            className="org-list__action-btn"
            onClick={() => handleRemovePublicMembership(org.groupDid)}
            disabled={removingPublic === org.groupDid}
          >
            Make private
          </button>
        ) : (
          <button
            className="org-list__action-btn org-list__action-btn--primary"
            onClick={() => handleAcceptMembership(org.groupDid, org.role)}
            disabled={acceptingOrg === org.groupDid}
          >
            Make public
          </button>
        )}
        {canLeaveMap[org.groupDid] && (
          <button
            className="org-list__action-btn org-list__action-btn--danger"
            onClick={() => setLeaveOrg({ groupDid: org.groupDid, name: org.displayName || org.handle })}
          >
            Leave
          </button>
        )}
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

  const visibleOrgs = activeTab === "public" ? acceptedOrgs : pendingOrgs

  return (
    <div className="dashboard">
      <div className="dashboard__body dashboard__body--single">
        <div className="dashboard__main">
          <h1 className="page-section-heading">Membership</h1>

          <div className="page-tabs-bar">
            <div className="page-tabs" role="tablist" aria-label="Membership">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  id={`tab-${tab.key}`}
                  aria-selected={activeTab === tab.key}
                  aria-controls={`tabpanel-${tab.key}`}
                  className={`page-tabs__tab ${
                    activeTab === tab.key ? "page-tabs__tab--active" : ""
                  }`}
                  onClick={() => setActiveTab(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <Link
              href="/groups/create"
              className="page-tabs-bar__new"
              aria-label="New group"
            >
              <Plus size={16} aria-hidden="true" />
              <span>New group</span>
            </Link>
          </div>

          <div
            role="tabpanel"
            id={`tabpanel-${activeTab}`}
            aria-labelledby={`tab-${activeTab}`}
          >
            {isLoading ? (
              <div className="org-list__loading">
                <LoadingSpinner size="md" />
              </div>
            ) : visibleOrgs.length === 0 ? (
              <p className="org-list__empty">
                {activeTab === "public"
                  ? "No public memberships yet. Make a private membership public from this list to share it on your profile."
                  : "No private memberships. Pending invites and memberships you've removed from public view appear here."}
              </p>
            ) : (
              <div className="org-list__items">
                {visibleOrgs.map(renderOrgItem)}
              </div>
            )}
          </div>
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
