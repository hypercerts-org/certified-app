"use client"

import React, { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Building2, Plus, LogOut, UserCheck } from "lucide-react"
import { useOrg } from "@/lib/organizations/org-context"
import { useAuth } from "@/lib/auth/auth-context"
import {
  putMembership,
  deleteMembership,
} from "@/lib/organizations/api"
import type { OrgRole } from "@/lib/organizations/types"
import LoadingSpinner from "@/components/ui/loading-spinner"
import Button from "@/components/ui/button"

export default function OrganizationsPage() {
  const router = useRouter()
  const { organizations, isLoading, switchOrg, refetchOrgs } = useOrg()
  const { did } = useAuth()
  const [leaveOrg, setLeaveOrg] = useState<{ groupDid: string; name: string } | null>(null)
  const [isLeaving, setIsLeaving] = useState(false)
  const [acceptingOrg, setAcceptingOrg] = useState<string | null>(null)

  const handleLeaveOrg = async () => {
    if (!did || !leaveOrg) return
    setIsLeaving(true)
    try {
      await deleteMembership(did, leaveOrg.groupDid)
      await refetchOrgs()
      setLeaveOrg(null)
    } catch {
      // ignore
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
    } catch {
      // ignore
    } finally {
      setAcceptingOrg(null)
    }
  }

  return (
    <div className="dashboard">
      <div className="dashboard__topbar">
        <h1 className="dashboard__page-title">Organizations</h1>
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
              <h3 className="org-list__empty-title">No organizations yet</h3>
              <p className="org-list__empty-desc">
                Create a new organization or wait for an invite to appear here automatically.
              </p>
              <div className="org-list__empty-actions">
                <Link href="/organizations/create">
                  <Button variant="primary">
                    <Plus size={16} />
                    Create Organization
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <div className="dash-card">
              <div className="org-list__header">
                <h2 className="dash-card__title">Your organizations</h2>
                <span className="org-list__count">{organizations.length}</span>
              </div>
              <p className="dash-card__desc">
                Select an organization to manage it, or switch into it to act on its behalf.
              </p>
              <div className="org-list__items">
                {organizations.map((org) => (
                  <div key={org.groupDid} className="org-list__item">
                    <div className="org-list__item-avatar">
                      <Building2 size={20} />
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
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => {
                          switchOrg(org)
                          router.push("/")
                        }}
                      >
                        Switch
                      </Button>
                      {org.accepted ? (
                        <button
                          className="org-members__remove-btn"
                          onClick={() => setLeaveOrg({ groupDid: org.groupDid, name: org.displayName || org.handle })}
                          title="Leave organization"
                        >
                          <LogOut size={14} />
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
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {leaveOrg && (
        <div className="signin-modal__backdrop" onClick={() => setLeaveOrg(null)}>
          <div className="signin-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="signin-modal__header">
              <span className="signin-modal__title">Leave Organization</span>
              <button className="signin-modal__close" onClick={() => setLeaveOrg(null)}>
                <LogOut size={18} />
              </button>
            </div>
            <div className="signin-modal__body">
              <p className="dash-card__desc" style={{ marginBottom: 20 }}>
                Are you sure you want to leave <strong>{leaveOrg.name}</strong>? This will remove the organization from your account.
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
