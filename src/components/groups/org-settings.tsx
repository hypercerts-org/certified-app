"use client"

import React, { useState, useEffect, useCallback, useRef } from "react"
import {
  AtSign,
  ChevronDown,
  ScrollText,
  Share2,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react"
import { useAuth } from "@/lib/auth/auth-context"
import SyncSocialGraphSection from "@/components/settings/sync-social-graph-section"
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

type CategoryKey = "handle" | "members" | "activity" | "social-graph"
type CategoryDef = {
  key: CategoryKey
  label: string
  description: string
  Icon: typeof AtSign
}
const CATEGORIES: CategoryDef[] = [
  {
    key: "handle",
    label: "Handle",
    description: "The group's handle on the network.",
    Icon: AtSign,
  },
  {
    key: "social-graph",
    label: "Sync social graph",
    description:
      "Compare this group's Certified follows with its Bluesky follows and import any that are missing.",
    Icon: Share2,
  },
  {
    key: "members",
    label: "Members & Roles",
    description: "Manage who can act on behalf of this group.",
    Icon: Users,
  },
  {
    key: "activity",
    label: "Activity Log",
    description: "Recent actions performed within this group.",
    Icon: ScrollText,
  },
]
const DEFAULT_CATEGORY: CategoryKey = CATEGORIES[0].key

function readHashCategory(): CategoryKey | null {
  if (typeof window === "undefined") return null
  const raw = window.location.hash.replace(/^#/, "").toLowerCase()
  const match = CATEGORIES.find((c) => c.key === raw)
  return match ? match.key : null
}

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

  // ----- Scroll-spy nav (mirrors <SettingsPanel> for personal accounts) -----
  const [active, setActive] = useState<CategoryKey>(DEFAULT_CATEGORY)
  const sectionRefs = useRef<Map<CategoryKey, HTMLElement>>(new Map())

  useEffect(() => {
    const initial = readHashCategory()
    if (initial) {
      setActive(initial)
      requestAnimationFrame(() => {
        const el = sectionRefs.current.get(initial)
        if (el) el.scrollIntoView({ block: "start", behavior: "auto" })
      })
    }
  }, [])

  useEffect(() => {
    const els = Array.from(sectionRefs.current.entries())
    if (els.length === 0) return
    const observer = new IntersectionObserver(
      () => {
        let best: { key: CategoryKey; top: number } | null = null
        for (const [key, el] of sectionRefs.current.entries()) {
          const rect = el.getBoundingClientRect()
          if (rect.top <= 120) {
            if (!best || rect.top > best.top) best = { key, top: rect.top }
          }
        }
        if (best) setActive(best.key)
        else setActive(CATEGORIES[0].key)
      },
      { rootMargin: "-15% 0px -60% 0px", threshold: [0, 0.1, 0.5, 1] },
    )
    for (const [, el] of els) observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const onMenuClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>, key: CategoryKey) => {
      if (
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      )
        return
      e.preventDefault()
      const el = sectionRefs.current.get(key)
      if (el) {
        el.scrollIntoView({ block: "start", behavior: "smooth" })
        el.classList.remove("sx-section--flash")
        void el.offsetWidth
        el.classList.add("sx-section--flash")
        window.setTimeout(() => el.classList.remove("sx-section--flash"), 1500)
      }
      if (typeof window !== "undefined") {
        const next = `#${key}`
        if (window.location.hash !== next) {
          window.history.replaceState(null, "", next)
        }
      }
      setActive(key)
    },
    [],
  )

  const setSectionRef = useCallback(
    (key: CategoryKey) => (el: HTMLElement | null) => {
      if (el) sectionRefs.current.set(key, el)
      else sectionRefs.current.delete(key)
    },
    [],
  )

  return (
    <div className="sx sx--wide">
      <h1 className="sx__heading sr-only">Group settings</h1>

      <div className="sx__layout">
        <aside className="sx__menu">
          <nav aria-label="Group settings sections">
            <ul className="sx-menu">
              {CATEGORIES.map((cat) => {
                const isActive = cat.key === active
                const Icon = cat.Icon
                return (
                  <li key={cat.key}>
                    <a
                      href={`#${cat.key}`}
                      aria-current={isActive ? "true" : undefined}
                      className={`sx-menu__item${isActive ? " sx-menu__item--active" : ""}`}
                      onClick={(e) => onMenuClick(e, cat.key)}
                    >
                      <span className="sx-menu__icon" aria-hidden>
                        <Icon size={16} strokeWidth={1.75} />
                      </span>
                      <span className="sx-menu__label">{cat.label}</span>
                    </a>
                  </li>
                )
              })}
            </ul>
          </nav>
        </aside>

        <div className="sx__panel">
          {/* Handle — read-only; group service doesn't support
              handle changes after registration. */}
          <section
            id="handle"
            ref={setSectionRef("handle")}
            className="sx-section"
            aria-labelledby="sx-section-handle-title"
          >
            <header className="sx-panel__header">
              <h2
                id="sx-section-handle-title"
                className="sx-panel__title"
              >
                Handle
              </h2>
              <p className="sx-panel__desc">
                The group&apos;s handle on the network. Set during
                registration; editing coming soon.
              </p>
            </header>
            <div className="sx-panel__body">
              <p className="username-card__value">@{org.handle}</p>
            </div>
          </section>

          <section
            id="social-graph"
            ref={setSectionRef("social-graph")}
            className="sx-section"
            aria-labelledby="sx-section-social-graph-title"
          >
            <header className="sx-panel__header">
              <h2
                id="sx-section-social-graph-title"
                className="sx-panel__title"
              >
                Sync social graph
              </h2>
              <p className="sx-panel__desc">
                Compare this group&apos;s Certified follows with its Bluesky
                follows and import any that are missing.
              </p>
            </header>
            <div className="sx-panel__body">
              {did ? (
                <SyncSocialGraphSection
                  did={groupDid}
                  ownDid={did}
                  targetDid={groupDid}
                />
              ) : (
                <p className="settings__note">Sign in to sync this group.</p>
              )}
            </div>
          </section>

          {/* Members — list + role controls + add affordance. */}
          <section
            id="members"
            ref={setSectionRef("members")}
            className="sx-section"
            aria-labelledby="sx-section-members-title"
          >
            <header className="sx-panel__header">
              <h2
                id="sx-section-members-title"
                className="sx-panel__title"
              >
                Members &amp; Roles
              </h2>
              <p className="sx-panel__desc">
                Manage who can access and act on behalf of this group.
              </p>
            </header>
            <div className="sx-panel__body">
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
          </section>

          {/* Activity Log section */}
          <section
            id="activity"
            ref={setSectionRef("activity")}
            className="sx-section"
            aria-labelledby="sx-section-activity-title"
          >
            <header className="sx-panel__header">
              <h2
                id="sx-section-activity-title"
                className="sx-panel__title"
              >
                Activity Log
              </h2>
              <p className="sx-panel__desc">
                Recent actions performed within this group.
              </p>
            </header>
            <div className="sx-panel__body">
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
          </section>

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
