"use client"

import React, { useCallback, useState, useMemo } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Plus } from "lucide-react"
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
import Badge from "@/components/ui/badge"
import Button from "@/components/ui/button"
import ConfirmDialog from "@/components/ui/confirm-dialog"
import { Tabs, TabList, Tab, TabPanel } from "@/components/ui/tabs"
import { getInitials } from "@/lib/utils/initials"

type TabKey = "public" | "private"

const TABS: { key: TabKey; label: string }[] = [
  { key: "public", label: "Public" },
  { key: "private", label: "Private" },
]

const DEFAULT_TAB: TabKey = "public"

const ROLE_ORDER: Record<string, number> = { owner: 0, admin: 1, member: 2 }

export default function GroupsPage() {
  usePageTitle("Groups")
  const { groups, isLoading, refetchOrgs } = useOrg()
  const { did } = useAuth()

  // Tab state lives in `?tab=<key>` so refresh keeps the user on the
  // same view. Public is the default and stays bare in the URL.
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const tabFromUrl = useMemo<TabKey>(() => {
    const v = searchParams?.get("tab")
    return v && TABS.some((t) => t.key === v) ? (v as TabKey) : DEFAULT_TAB
  }, [searchParams])
  const [activeTab, setActiveTab] = useState<TabKey>(tabFromUrl)
  if (tabFromUrl !== activeTab && TABS.some((t) => t.key === tabFromUrl)) {
    setActiveTab(tabFromUrl)
  }
  const changeTab = useCallback(
    (next: TabKey) => {
      setActiveTab(next)
      const params = new URLSearchParams(searchParams?.toString() ?? "")
      if (next === DEFAULT_TAB) params.delete("tab")
      else params.set("tab", next)
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [router, pathname, searchParams],
  )

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
            fallbackInitials={getInitials(org.displayName || org.handle)}
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
        <Badge variant="role">{org.role}</Badge>
      </Link>
      <div className="org-list__item-actions">
        {org.accepted ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handleRemovePublicMembership(org.groupDid)}
            disabled={removingPublic === org.groupDid}
          >
            Make private
          </Button>
        ) : (
          <Button
            variant="primary"
            size="sm"
            onClick={() => handleAcceptMembership(org.groupDid, org.role)}
            disabled={acceptingOrg === org.groupDid}
          >
            Make public
          </Button>
        )}
        {canLeaveMap[org.groupDid] && (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setLeaveOrg({ groupDid: org.groupDid, name: org.displayName || org.handle })}
          >
            Leave
          </Button>
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

  const renderPanelBody = (tab: TabKey) => {
    const visibleOrgs = tab === "public" ? acceptedOrgs : pendingOrgs
    if (isLoading) {
      return (
        <div className="org-list__loading">
          <LoadingSpinner size="md" />
        </div>
      )
    }
    if (visibleOrgs.length === 0) {
      return (
        <p className="org-list__empty">
          {tab === "public"
            ? "No public memberships yet. Make a private membership public from this list to share it on your profile."
            : "No private memberships. Pending invites and memberships you've removed from public view appear here."}
        </p>
      )
    }
    return <div className="org-list__items">{visibleOrgs.map(renderOrgItem)}</div>
  }

  return (
    <div className="dashboard">
      <div className="dashboard__body dashboard__body--single">
        <div className="dashboard__main">
          <h1 className="page-section-heading">Membership</h1>

          <Tabs value={activeTab} onChange={(v) => changeTab(v as TabKey)}>
            <div className="page-tabs-bar">
              {/* The surrounding .page-tabs-bar (feed.css, cross-track) already
                  draws the strip's bottom border, so drop TabList's own. */}
              <TabList aria-label="Membership" className="border-0 self-end">
                {TABS.map((tab) => (
                  <Tab key={tab.key} value={tab.key}>
                    {tab.label}
                  </Tab>
                ))}
              </TabList>

              <Link
                href="/groups/create"
                className="page-tabs-bar__new"
                aria-label="New group"
              >
                <Plus size={16} aria-hidden="true" />
                <span>New group</span>
              </Link>
            </div>

            {TABS.map((tab) => (
              <TabPanel key={tab.key} value={tab.key}>
                {renderPanelBody(tab.key)}
              </TabPanel>
            ))}
          </Tabs>
        </div>
      </div>

      {leaveOrg && (
        <ConfirmDialog
          title="Leave Group"
          message={`Are you sure you want to leave ${leaveOrg.name}? You will lose access to this group. An admin will need to re-invite you if you want to rejoin.`}
          confirmLabel="Leave"
          confirmVariant="destructive"
          isConfirming={isLeaving}
          onCancel={() => setLeaveOrg(null)}
          onConfirm={handleLeaveOrg}
        />
      )}
    </div>
  )
}
