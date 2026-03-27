"use client"

import React, { useState, useEffect, useCallback } from "react"
import { UserPlus, Trash2, ChevronDown, Pencil } from "lucide-react"
import { useAuth } from "@/lib/auth/auth-context"
import {
  listOrgMembers,
  addOrgMember,
  removeOrgMember,
  setOrgMemberRole,
  queryOrgAuditLog,
} from "@/lib/organizations/api"
import type { Organization, OrgMember, AuditEntry, OrgRole } from "@/lib/organizations/types"
import { authFetch } from "@/lib/auth/fetch"
import Button from "@/components/ui/button"
import Input from "@/components/ui/input"
import HandleSearch from "@/components/organizations/handle-search"

interface ResolvedMember extends OrgMember {
  handle?: string
  displayName?: string
}
import ErrorMessage from "@/components/ui/error-message"
import LoadingSpinner from "@/components/ui/loading-spinner"

interface OrgSettingsProps {
  groupDid: string
  org: Organization
}

export default function OrgSettings({ groupDid, org }: OrgSettingsProps) {
  const { did } = useAuth()
  const isOwner = org.role === "owner"
  const isAdmin = org.role === "admin" || isOwner

  // Handle editing — split into editable prefix and fixed suffix
  const handleSuffix = org.handle.includes(".")
    ? org.handle.slice(org.handle.indexOf("."))
    : ""
  const handlePrefix = org.handle.includes(".")
    ? org.handle.slice(0, org.handle.indexOf("."))
    : org.handle
  const [isEditingHandle, setIsEditingHandle] = useState(false)
  const [newHandlePrefix, setNewHandlePrefix] = useState("")
  const [isSavingHandle, setIsSavingHandle] = useState(false)
  const [handleError, setHandleError] = useState<string | null>(null)

  // Members state
  const [members, setMembers] = useState<ResolvedMember[]>([])
  const [membersLoading, setMembersLoading] = useState(true)
  const [memberError, setMemberError] = useState<string | null>(null)
  const [membersPage, setMembersPage] = useState(0)
  const MEMBERS_PER_PAGE = 5

  // Add member form
  const [pendingMembers, setPendingMembers] = useState<{ did: string; handle: string }[]>([])
  const [newMemberRole, setNewMemberRole] = useState<OrgRole>("member")
  const [isAdding, setIsAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  // Audit log
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditPage, setAuditPage] = useState(0)
  const AUDIT_PER_PAGE = 20

  const fetchMembers = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setMembersLoading(true)
        const m = await listOrgMembers(groupDid, signal)
        if (signal?.aborted) return

        // Resolve handles and display names for each member
        const resolved: ResolvedMember[] = await Promise.all(
          m.map(async (member) => {
            try {
              const res = await authFetch(
                `/api/resolve-did?did=${encodeURIComponent(member.did)}`,
                { signal }
              )
              if (res.ok) {
                const data = await res.json()
                return {
                  ...member,
                  handle: data.handle || undefined,
                  displayName: data.displayName || undefined,
                }
              }
            } catch {
              // ignore
            }
            return { ...member }
          })
        )

        if (!signal?.aborted) setMembers(resolved)
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

  const handleAddMembers = async () => {
    if (pendingMembers.length === 0) return
    setIsAdding(true)
    setAddError(null)
    try {
      for (const m of pendingMembers) {
        await addOrgMember(groupDid, m.did, newMemberRole)
      }
      setPendingMembers([])
      setNewMemberRole("member")
      await fetchMembers()
      await fetchAudit()
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to add member")
    } finally {
      setIsAdding(false)
    }
  }

  const removePendingMember = (did: string) => {
    setPendingMembers((prev) => prev.filter((m) => m.did !== did))
  }

  const handleSaveHandle = async () => {
    const trimmed = newHandlePrefix.trim()
    if (!trimmed) {
      setHandleError("Handle cannot be empty")
      return
    }
    const fullHandle = trimmed + handleSuffix
    setIsSavingHandle(true)
    setHandleError(null)
    try {
      // Use the group service proxy to update the handle via identity.updateHandle
      const res = await authFetch(
        `/api/organizations/${encodeURIComponent(groupDid)}/handle`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ handle: fullHandle }),
        }
      )
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error || "Failed to update handle")
      }
      setIsEditingHandle(false)
      window.location.reload()
    } catch (err) {
      setHandleError(err instanceof Error ? err.message : "Failed to update handle")
    } finally {
      setIsSavingHandle(false)
    }
  }

  const handleRemoveMember = async (memberDid: string) => {
    if (!confirm("Remove this member?")) return
    try {
      await removeOrgMember(groupDid, memberDid)
      await fetchMembers()
      await fetchAudit()
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
      await fetchAudit()
    } catch (err) {
      setMemberError(
        err instanceof Error ? err.message : "Failed to change role"
      )
    }
  }

  return (
    <div className="dashboard">
      <div className="dashboard__topbar">
        <h1 className="dashboard__page-title">Settings</h1>
      </div>

      <div className="dashboard__body dashboard__body--single">
        <div className="dashboard__main">
          {/* Handle section */}
          <div className="dash-card">
            <div className="username-card__header">
              <h2 className="dash-card__title" style={{ marginBottom: 0 }}>Handle</h2>
              {isAdmin && !isEditingHandle && (
                <Button variant="ghost" size="sm" onClick={() => { setNewHandlePrefix(handlePrefix); setIsEditingHandle(true); setHandleError(null); }}>
                  <Pencil size={14} />
                  Edit
                </Button>
              )}
            </div>
            {isEditingHandle ? (
              <div className="username-card__form">
                <div className="handle-edit__row">
                  <Input
                    label="Handle prefix"
                    value={newHandlePrefix}
                    onChange={(e) => setNewHandlePrefix(e.target.value)}
                    placeholder="my-group"
                    error={handleError ?? undefined}
                  />
                  <span className="handle-edit__suffix">{handleSuffix}</span>
                </div>
                <div className="username-card__actions">
                  <Button variant="ghost" size="sm" onClick={() => setIsEditingHandle(false)} disabled={isSavingHandle}>
                    Cancel
                  </Button>
                  <Button variant="primary" size="sm" onClick={handleSaveHandle} loading={isSavingHandle} disabled={isSavingHandle}>
                    Save
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <p className="dash-card__desc">
                  The organization&apos;s handle on the network.
                </p>
                <p className="username-card__value">@{org.handle}</p>
              </>
            )}
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
                  {members
                    .slice(membersPage * MEMBERS_PER_PAGE, (membersPage + 1) * MEMBERS_PER_PAGE)
                    .map((member) => (
                    <div key={member.did} className="org-members__item">
                      <div className="org-members__item-info">
                        <p className="org-members__item-handle">
                          @{member.handle && member.handle !== member.did ? member.handle : member.did}
                        </p>
                        <p className="org-members__item-did">{member.did}</p>
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
                {members.length > MEMBERS_PER_PAGE && (
                  <div className="pagination">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setMembersPage((p) => p - 1)}
                      disabled={membersPage === 0}
                    >
                      Previous
                    </Button>
                    <span className="pagination__info">
                      {membersPage + 1} / {Math.ceil(members.length / MEMBERS_PER_PAGE)}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setMembersPage((p) => p + 1)}
                      disabled={(membersPage + 1) * MEMBERS_PER_PAGE >= members.length}
                    >
                      Next
                    </Button>
                  </div>
                )}

                {/* Add member form */}
                {isAdmin && (
                  <div className="org-members__add">
                    <h3 className="org-members__add-title">Add member</h3>
                    <div className="org-members__add-form">
                      <HandleSearch
                        label=""
                        placeholder="DID or username"
                        onSelect={(selectedDid, selectedHandle) => {
                          if (!pendingMembers.some((m) => m.did === selectedDid)) {
                            setPendingMembers((prev) => [...prev, { did: selectedDid, handle: selectedHandle }])
                          }
                        }}
                      />
                      {pendingMembers.length > 0 && (
                        <div className="org-members__selected">
                          <span className="org-members__selected-label">Selected:</span>
                          {pendingMembers.map((m, i) => (
                            <span key={m.did} className="org-members__selected-tag">
                              {i > 0 && ", "}
                              @{m.handle}
                              <button
                                type="button"
                                className="org-members__selected-remove"
                                onClick={() => removePendingMember(m.did)}
                                aria-label={`Remove ${m.handle}`}
                              >
                                &times;
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="org-members__add-role">
                        <label className="org-members__add-role-label">Role</label>
                        <select
                          value={newMemberRole}
                          onChange={(e) => setNewMemberRole(e.target.value as OrgRole)}
                          className="org-members__role-dropdown"
                        >
                          <option value="member">Member</option>
                          <option value="admin">Admin</option>
                          <option value="owner">Owner</option>
                        </select>
                      </div>
                      {addError && <ErrorMessage message={addError} />}
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={handleAddMembers}
                        loading={isAdding}
                        disabled={pendingMembers.length === 0 || isAdding}
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
          <div className="dash-card">
            <h2 className="dash-card__title">Activity Log</h2>
            <p className="dash-card__desc">
              Recent actions performed within this organization.
            </p>

            {!isAdmin ? (
              <p className="settings__note">Only admins and owners can view the activity log.</p>
            ) : auditLoading ? (
              <div className="org-audit__loading">
                <LoadingSpinner size="sm" />
              </div>
            ) : auditEntries.length === 0 ? (
              <p className="settings__note">No activity recorded yet.</p>
            ) : (
                <>
                  <div className="org-audit__list">
                    {auditEntries
                      .slice(auditPage * AUDIT_PER_PAGE, (auditPage + 1) * AUDIT_PER_PAGE)
                      .map((entry) => (
                      <div key={entry.id} className="org-audit__item">
                        <div className="org-audit__item-main">
                          <span className="org-audit__action">{entry.action}</span>
                          <span
                            className={`org-audit__result org-audit__result--${entry.result}`}
                          >
                            {entry.result}
                          </span>
                        </div>
                        <div className="org-audit__item-meta">
                          <span className="org-audit__actor">
                            {entry.actorDid}
                          </span>
                          <span className="org-audit__time">
                            {new Date(entry.createdAt).toLocaleString()}
                          </span>
                        </div>
                        {(entry.collection || entry.rkey || (entry.detail && Object.keys(entry.detail).length > 0)) && (
                          <div className="org-audit__detail">
                            {entry.collection && (
                              <span className="org-audit__detail-item">
                                collection: {entry.collection}
                              </span>
                            )}
                            {entry.rkey && (
                              <span className="org-audit__detail-item">
                                rkey: {entry.rkey}
                              </span>
                            )}
                            {entry.detail && Object.entries(entry.detail).map(([key, value]) => (
                              <span key={key} className="org-audit__detail-item">
                                {key}: {typeof value === "object" ? JSON.stringify(value) : String(value)}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  {auditEntries.length > AUDIT_PER_PAGE && (
                    <div className="pagination">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setAuditPage((p) => p - 1)}
                        disabled={auditPage === 0}
                      >
                        Previous
                      </Button>
                      <span className="pagination__info">
                        {auditPage + 1} / {Math.ceil(auditEntries.length / AUDIT_PER_PAGE)}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setAuditPage((p) => p + 1)}
                        disabled={(auditPage + 1) * AUDIT_PER_PAGE >= auditEntries.length}
                      >
                        Next
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
        </div>
      </div>
    </div>
  )
}
