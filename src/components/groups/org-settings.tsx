"use client"

import React, { useState, useEffect, useCallback } from "react"
import { UserPlus, Trash2, ChevronDown } from "lucide-react"
import { useAuth } from "@/lib/auth/auth-context"
import {
  listOrgMembers,
  addOrgMember,
  removeOrgMember,
  setOrgMemberRole,
  queryOrgAuditLog,
} from "@/lib/groups/api"
import type { Group, OrgMember, AuditEntry, OrgRole } from "@/lib/groups/types"
import { authFetch } from "@/lib/auth/fetch"
import Button from "@/components/ui/button"
import ConfirmDialog from "@/components/ui/confirm-dialog"
import HandleSearch from "@/components/groups/handle-search"
import ErrorMessage from "@/components/ui/error-message"
import LoadingSpinner from "@/components/ui/loading-spinner"

interface ResolvedMember extends OrgMember {
  handle?: string
  displayName?: string
}

interface OrgSettingsProps {
  groupDid: string
  org: Group
}

export default function OrgSettings({ groupDid, org }: OrgSettingsProps) {
  const { did } = useAuth()
  const isOwner = org.role === "owner"
  const isAdmin = org.role === "admin" || isOwner

  // Members state
  const [members, setMembers] = useState<ResolvedMember[]>([])
  const [membersLoading, setMembersLoading] = useState(true)
  const [memberError, setMemberError] = useState<string | null>(null)
  const [membersPage, setMembersPage] = useState(0)
  const MEMBERS_PER_PAGE = 5

  // Remove confirmation
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)

  // Add member form
  const [pendingMembers, setPendingMembers] = useState<{ did: string; handle: string }[]>([])
  const [newMemberRole, setNewMemberRole] = useState<OrgRole>("member")
  const [isAdding, setIsAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  // Audit log
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([])
  const [auditLoading, setAuditLoading] = useState(true)
  const [auditError, setAuditError] = useState<string | null>(null)
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
        setAuditError(null)
        const entries = await queryOrgAuditLog(groupDid, {}, signal)
        if (!signal?.aborted) setAuditEntries(entries)
      } catch (err) {
        // Surface the failure so admins notice when the log can't load,
        // instead of silently seeing "No activity recorded yet."
        if (signal?.aborted) return
        const message = err instanceof Error ? err.message : "Couldn't load activity log"
        setAuditError(message)
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
      await Promise.all([fetchMembers(), fetchAudit()])
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to add member")
    } finally {
      setIsAdding(false)
    }
  }

  const removePendingMember = (did: string) => {
    setPendingMembers((prev) => prev.filter((m) => m.did !== did))
  }

  const handleRemoveMember = async (memberDid: string) => {
    try {
      await removeOrgMember(groupDid, memberDid)
      setConfirmRemove(null)
      await Promise.all([fetchMembers(), fetchAudit()])
    } catch (err) {
      setMemberError(
        err instanceof Error ? err.message : "Failed to remove member"
      )
      setConfirmRemove(null)
    }
  }

  const handleRoleChange = async (memberDid: string, role: OrgRole) => {
    try {
      await setOrgMemberRole(groupDid, memberDid, role)
      await Promise.all([fetchMembers(), fetchAudit()])
    } catch (err) {
      setMemberError(
        err instanceof Error ? err.message : "Failed to change role"
      )
    }
  }

  return (
    <div className="dashboard">
      <div className="dashboard__body dashboard__body--single">
        <div className="dashboard__main">
          {/* Handle section (read-only — group service doesn't support handle changes after registration) */}
          <div className="dash-card">
            <h2 className="dash-card__title">Handle</h2>
            <p className="dash-card__desc">
              The group&apos;s handle on the network. Set during registration. Function to edit the handle coming soon.
            </p>
            <p className="username-card__value">@{org.handle}</p>
          </div>

          {/* Members section */}
          <div className="dash-card">
            <h2 className="dash-card__title">Members &amp; Roles</h2>
            <p className="dash-card__desc">
              Manage who can access and act on behalf of this group.
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
                      <div className="org-members__item-actions">
                        {isOwner && member.role !== "owner" ? (
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
                            </select>
                            <ChevronDown size={14} className="org-members__role-icon" />
                          </div>
                        ) : (
                          <span className="org-members__item-role-badge">
                            {member.role}
                          </span>
                        )}
                        {isAdmin && member.did !== did && member.role !== "owner" && (
                          <button
                            className="org-members__remove-btn"
                            onClick={() => setConfirmRemove(member.did)}
                            title="Remove member"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
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
                    <HandleSearch
                      label=""
                      placeholder="Search by handle or DID"
                      onSelect={(selectedDid, selectedHandle) => {
                        if (!pendingMembers.some((m) => m.did === selectedDid)) {
                          setPendingMembers((prev) => [...prev, { did: selectedDid, handle: selectedHandle }])
                        }
                      }}
                    />
                    {pendingMembers.length > 0 && (
                      <>
                        <div className="org-members__selected">
                          {pendingMembers.map((m) => (
                            <span key={m.did} className="org-members__selected-tag">
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
                        {addError && <ErrorMessage message={addError} />}
                        <div className="org-members__add-submit">
                          <span className="org-members__add-submit-label">Add as</span>
                          <select
                            value={newMemberRole}
                            onChange={(e) => setNewMemberRole(e.target.value as OrgRole)}
                            className="org-members__role-dropdown"
                          >
                            <option value="member">Member</option>
                            <option value="admin">Admin</option>
                          </select>
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={handleAddMembers}
                            loading={isAdding}
                            disabled={isAdding}
                          >
                            <UserPlus size={14} />
                            Add
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Activity Log */}
          <div className="dash-card">
            <h2 className="dash-card__title">Activity Log</h2>
            <p className="dash-card__desc">
              Recent actions performed within this group.
            </p>

            {!isAdmin ? (
              <p className="settings__note">Only admins and owners can view the activity log.</p>
            ) : auditLoading ? (
              <div className="org-audit__loading">
                <LoadingSpinner size="sm" />
              </div>
            ) : auditError ? (
              <p className="settings__error" role="alert">
                Couldn&apos;t load the activity log: {auditError}
              </p>
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
                          {(() => {
                            const safeResult = ["success", "failure", "error"].includes(entry.result) ? entry.result : "unknown"
                            return (
                              <span
                                className={`org-audit__result org-audit__result--${safeResult}`}
                              >
                                {entry.result}
                              </span>
                            )
                          })()}
                        </div>
                        <dl className="org-audit__item-meta">
                          <div className="org-audit__detail-row">
                            <dt className="org-audit__detail-label">by</dt>
                            <dd className="org-audit__detail-value">{entry.actorDid}</dd>
                          </div>
                          <div className="org-audit__detail-row">
                            <dt className="org-audit__detail-label">at</dt>
                            <dd className="org-audit__detail-value">{new Date(entry.createdAt).toLocaleString()}</dd>
                          </div>
                        </dl>
                        {(entry.collection || entry.rkey || (entry.detail && Object.keys(entry.detail).length > 0)) && (
                          <dl className="org-audit__detail">
                            {entry.collection && (
                              <div className="org-audit__detail-row">
                                <dt className="org-audit__detail-label">collection</dt>
                                <dd className="org-audit__detail-value">{entry.collection}</dd>
                              </div>
                            )}
                            {entry.rkey && (
                              <div className="org-audit__detail-row">
                                <dt className="org-audit__detail-label">rkey</dt>
                                <dd className="org-audit__detail-value">{entry.rkey}</dd>
                              </div>
                            )}
                            {entry.detail && Object.entries(entry.detail)
                              .filter(([key]) => key !== "collection" && key !== "rkey")
                              .map(([key, value]) => (
                              <div key={key} className="org-audit__detail-row">
                                <dt className="org-audit__detail-label">{key}</dt>
                                <dd className="org-audit__detail-value">
                                  {typeof value === "object" ? JSON.stringify(value) : String(value)}
                                </dd>
                              </div>
                            ))}
                          </dl>
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

      {confirmRemove ? (
        <ConfirmDialog
          title="Remove member"
          message="Are you sure you want to remove this member from the group?"
          confirmLabel="Remove"
          onCancel={() => setConfirmRemove(null)}
          onConfirm={() => handleRemoveMember(confirmRemove)}
        />
      ) : null}
    </div>
  )
}
