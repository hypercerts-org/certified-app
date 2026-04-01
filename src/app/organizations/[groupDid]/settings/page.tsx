"use client"

import React, { useState, useEffect, useCallback } from "react"
import { useRouter, useParams } from "next/navigation"
import { ArrowLeft, UserPlus, Trash2, ChevronDown } from "lucide-react"
import { useAuth } from "@/lib/auth/auth-context"
import { useOrg } from "@/lib/organizations/org-context"
import {
  listOrgMembers,
  addOrgMember,
  removeOrgMember,
  setOrgMemberRole,
  queryOrgAuditLog,
} from "@/lib/organizations/api"
import type { OrgMember, AuditEntry, OrgRole } from "@/lib/organizations/types"
import Button from "@/components/ui/button"
import Input from "@/components/ui/input"
import ErrorMessage from "@/components/ui/error-message"
import LoadingSpinner from "@/components/ui/loading-spinner"

export default function OrgSettingsPage() {
  const router = useRouter()
  const params = useParams()
  const groupDid = decodeURIComponent(params.groupDid as string)
  const { did } = useAuth()
  const { organizations } = useOrg()

  const org = organizations.find((o) => o.groupDid === groupDid)
  const isOwner = org?.role === "owner"
  const isAdmin = org?.role === "admin" || isOwner

  // Members state
  const [members, setMembers] = useState<OrgMember[]>([])
  const [membersLoading, setMembersLoading] = useState(true)
  const [memberError, setMemberError] = useState<string | null>(null)

  // Add member form
  const [newMemberDid, setNewMemberDid] = useState("")
  const [newMemberRole, setNewMemberRole] = useState<OrgRole>("member")
  const [isAdding, setIsAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  // Audit log
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([])
  const [auditLoading, setAuditLoading] = useState(false)

  const fetchMembers = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setMembersLoading(true)
        const m = await listOrgMembers(groupDid, signal)
        if (!signal?.aborted) setMembers(m)
      } catch (err) {
        if (!signal?.aborted) {
          setMemberError(
            err instanceof Error ? err.message : "Failed to load members"
          )
        }
      } finally {
        if (!signal?.aborted) setMembersLoading(false)
      }
    },
    [groupDid]
  )

  const fetchAudit = useCallback(
    async (signal?: AbortSignal) => {
      if (!isAdmin) return
      try {
        setAuditLoading(true)
        const entries = await queryOrgAuditLog(groupDid, {}, signal)
        if (!signal?.aborted) setAuditEntries(entries)
      } catch {
        // ignore
      } finally {
        if (!signal?.aborted) setAuditLoading(false)
      }
    },
    [groupDid, isAdmin]
  )

  useEffect(() => {
    const controller = new AbortController()
    fetchMembers(controller.signal)
    fetchAudit(controller.signal)
    return () => controller.abort()
  }, [fetchMembers, fetchAudit])

  const handleAddMember = async () => {
    if (!newMemberDid.trim()) return
    setIsAdding(true)
    setAddError(null)
    try {
      await addOrgMember(groupDid, newMemberDid.trim(), newMemberRole)
      setNewMemberDid("")
      setNewMemberRole("member")
      await fetchMembers()
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to add member")
    } finally {
      setIsAdding(false)
    }
  }

  const handleRemoveMember = async (memberDid: string) => {
    if (!confirm("Remove this member?")) return
    try {
      await removeOrgMember(groupDid, memberDid)
      await fetchMembers()
    } catch (err) {
      setMemberError(
        err instanceof Error ? err.message : "Failed to remove member"
      )
    }
  }

  const handleRoleChange = async (memberDid: string, role: OrgRole) => {
    try {
      await setOrgMemberRole(groupDid, memberDid, role)
      await fetchMembers()
    } catch (err) {
      setMemberError(
        err instanceof Error ? err.message : "Failed to change role"
      )
    }
  }

  const backUrl = `/organizations/${encodeURIComponent(groupDid)}`

  return (
    <div className="dashboard">
      <div className="dashboard__topbar">
        <h1 className="dashboard__page-title">Organization Settings</h1>
        <div className="dashboard__topbar-right">
          <button className="dashboard__back-btn" onClick={() => router.push(backUrl)}>
            <ArrowLeft size={16} />
            Back
          </button>
        </div>
      </div>

      <div className="dashboard__body dashboard__body--single">
        <div className="dashboard__main">
          {/* Handle section */}
          <div className="dash-card">
            <h2 className="dash-card__title">Handle</h2>
            <p className="dash-card__desc">
              The organization&apos;s handle on the network.
            </p>
            <p className="username-card__value">{org?.handle || groupDid}</p>
          </div>

          {/* Members section */}
          <div className="dash-card">
            <h2 className="dash-card__title">Members &amp; Roles</h2>
            <p className="dash-card__desc">
              Manage who can access and act on behalf of this organization.
            </p>

            {membersLoading ? (
              <div className="org-members__loading">
                <LoadingSpinner size="sm" />
              </div>
            ) : (
              <>
                {memberError && <ErrorMessage message={memberError} />}

                <div className="org-members__list">
                  {members.map((member) => (
                    <div key={member.did} className="org-members__item">
                      <div className="org-members__item-info">
                        <p className="org-members__item-did">{member.did}</p>
                        <p className="org-members__item-meta">
                          Added by {member.addedBy} on{" "}
                          {new Date(member.addedAt).toLocaleDateString()}
                        </p>
                      </div>

                      {isOwner ? (
                        <div className="org-members__item-role-select">
                          <select
                            value={member.role}
                            onChange={(e) =>
                              handleRoleChange(member.did, e.target.value as OrgRole)
                            }
                            className="org-members__role-dropdown"
                          >
                            <option value="member">Member</option>
                            <option value="admin">Admin</option>
                            <option value="owner">Owner</option>
                          </select>
                          <ChevronDown size={14} className="org-members__role-icon" />
                        </div>
                      ) : (
                        <span className="org-members__item-role-badge">
                          {member.role}
                        </span>
                      )}

                      {isAdmin && member.did !== did && (
                        <button
                          className="org-members__remove-btn"
                          onClick={() => handleRemoveMember(member.did)}
                          title="Remove member"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Add member form */}
                {isAdmin && (
                  <div className="org-members__add">
                    <h3 className="org-members__add-title">Add member</h3>
                    <div className="org-members__add-form">
                      <Input
                        label="DID or Handle"
                        value={newMemberDid}
                        onChange={(e) => setNewMemberDid(e.target.value)}
                        placeholder="did:plc:... or handle.example.com"
                      />
                      <div className="org-members__add-role">
                        <label className="org-members__add-role-label">Role</label>
                        <select
                          value={newMemberRole}
                          onChange={(e) => setNewMemberRole(e.target.value as OrgRole)}
                          className="org-members__role-dropdown"
                        >
                          <option value="member">Member</option>
                          <option value="admin">Admin</option>
                        </select>
                      </div>
                      {addError && <ErrorMessage message={addError} />}
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={handleAddMember}
                        loading={isAdding}
                        disabled={!newMemberDid.trim() || isAdding}
                      >
                        <UserPlus size={14} />
                        Add Member
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Activity Log */}
          {isAdmin && (
            <div className="dash-card">
              <h2 className="dash-card__title">Activity Log</h2>
              <p className="dash-card__desc">
                Recent actions performed within this organization.
              </p>

              {auditLoading ? (
                <div className="org-audit__loading">
                  <LoadingSpinner size="sm" />
                </div>
              ) : auditEntries.length === 0 ? (
                <p className="settings__note">No activity recorded yet.</p>
              ) : (
                <div className="org-audit__list">
                  {auditEntries.map((entry) => (
                    <div key={entry.id} className="org-audit__item">
                      <div className="org-audit__item-main">
                        <span className="org-audit__action">{entry.action}</span>
                        {entry.collection && (
                          <span className="org-audit__collection">
                            {entry.collection}
                          </span>
                        )}
                      </div>
                      <div className="org-audit__item-meta">
                        <span className="org-audit__actor">
                          {entry.actorDid.slice(0, 20)}...
                        </span>
                        <span className="org-audit__time">
                          {new Date(entry.createdAt).toLocaleString()}
                        </span>
                        <span
                          className={`org-audit__result org-audit__result--${entry.result}`}
                        >
                          {entry.result}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
