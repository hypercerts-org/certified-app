"use client"

import React, { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  AtSign,
  ChevronLeft,
  ChevronRight,
  ScrollText,
  Share2,
  ShieldAlert,
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
  destroyGroup,
} from "@/lib/groups/api"
import type { Group, OrgMember, AuditEntry, OrgRole } from "@/lib/groups/types"
import { authFetch } from "@/lib/auth/fetch"
import Button from "@/components/ui/button"
import Badge from "@/components/ui/badge"
import Select from "@/components/ui/select"
import ConfirmDialog from "@/components/ui/confirm-dialog"
import HandleSearch from "@/components/groups/handle-search"
import ErrorMessage from "@/components/ui/error-message"
import LoadingSpinner from "@/components/ui/loading-spinner"
import Tooltip from "@/components/ui/tooltip"

type CategoryKey = "handle" | "social-graph" | "members" | "activity" | "danger"

type CategoryDef = {
  key: CategoryKey
  /** Panel heading. */
  label: string
  /** Shorter label for the rail / mobile list. Defaults to `label`. */
  navLabel?: string
  description: string
  Icon: typeof AtSign
}

type CategoryGroup = { label: string; items: CategoryDef[] }

/**
 * Group settings share the personal-settings router layout (see
 * `SettingsPanel`): a grouped rail of pages; selecting one shows only that
 * page (no long scroll). On mobile the rail is a master list that drills
 * into a single page with a back control. Both views render the same DOM;
 * `data-view` + CSS pick which is visible, so there's no desktop hydration
 * flash.
 */
const GROUPS: CategoryGroup[] = [
  {
    label: "General",
    items: [
      {
        key: "handle",
        label: "Handle",
        description:
          "The group's handle on the network. Set during registration; editing coming soon.",
        Icon: AtSign,
      },
      {
        key: "social-graph",
        label: "Sync social graph",
        navLabel: "Social graph",
        description:
          "Compare this group's Certified follows with its Bluesky follows and import any that are missing.",
        Icon: Share2,
      },
    ],
  },
  {
    label: "Management",
    items: [
      {
        key: "members",
        label: "Members & Roles",
        description: "Manage who can access and act on behalf of this group.",
        Icon: Users,
      },
      {
        key: "activity",
        label: "Activity Log",
        description: "Recent actions performed within this group.",
        Icon: ScrollText,
      },
    ],
  },
]

/** Owner-only group, appended to the rail + rendered only for owners. */
const DANGER_GROUP: CategoryGroup = {
  label: "Danger zone",
  items: [
    {
      key: "danger",
      label: "Danger zone",
      description:
        "Remove this group from Certified. This deletes the group's membership and settings from the service only — the underlying account and its records are left intact, and the group can be imported again later.",
      Icon: ShieldAlert,
    },
  ],
}

/** Every defined category (incl. danger) — for hash-deep-link matching. */
const ALL_DEFS: CategoryDef[] = [
  ...GROUPS.flatMap((g) => g.items),
  ...DANGER_GROUP.items,
]
const DEFAULT_CATEGORY: CategoryKey = GROUPS[0].items[0].key

// Map an audit entry's `result` to the CSS modifier suffix for its pill.
// The allowlist must match `AuditEntry.result` ("permitted" | "denied")
// and the only styled classes (`--permitted` / `--denied`); anything
// else falls back to the neutral `--unknown` class.
export function auditResultClassSuffix(result: string): "permitted" | "denied" | "unknown" {
  return result === "permitted" || result === "denied" ? result : "unknown"
}

// groups-6: when the add-members loop fails part-way through, the members
// before `failedIndex` were already accepted by the service. Re-staging the
// whole list would double-add them, so keep only the failing member onward
// (the one that failed plus any not-yet-attempted).
export function remainingAfterAddIndex<T>(members: T[], failedIndex: number): T[] {
  return members.slice(failedIndex)
}

function readHashCategory(): CategoryKey | null {
  if (typeof window === "undefined") return null
  const raw = window.location.hash.replace(/^#/, "").toLowerCase()
  const match = ALL_DEFS.find((c) => c.key === raw)
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
  const router = useRouter()
  const isOwner = org.role === "owner"
  const isAdmin = org.role === "admin" || isOwner

  // Owners get the Danger zone (remove group) in the rail + panel.
  const visibleGroups = isOwner ? [...GROUPS, DANGER_GROUP] : GROUPS

  // Remove-group (destroy) state.
  const [confirmDestroy, setConfirmDestroy] = useState(false)
  const [destroying, setDestroying] = useState(false)
  const [destroyError, setDestroyError] = useState<string | null>(null)

  const handleDestroy = async () => {
    setDestroying(true)
    setDestroyError(null)
    try {
      await destroyGroup(groupDid)
      setConfirmDestroy(false)
      // The group is gone from the service — leave the settings page.
      router.push("/home")
    } catch (err) {
      setDestroyError(
        err instanceof Error ? err.message : "Failed to remove group",
      )
      setConfirmDestroy(false)
    } finally {
      setDestroying(false)
    }
  }

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
      for (let i = 0; i < pendingMembers.length; i++) {
        try {
          await addOrgMember(groupDid, pendingMembers[i].did, newMemberRole)
        } catch (err) {
          // Partial failure: members before `i` were already added. Re-stage
          // only the failing member onward so a retry doesn't double-add them.
          setPendingMembers(remainingAfterAddIndex(pendingMembers, i))
          setAddError(
            err instanceof Error ? err.message : "Failed to add member"
          )
          return
        }
      }
      setPendingMembers([])
      setNewMemberRole("member")
      await Promise.all([fetchMembers(), fetchAudit()])
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

  // ----- Router-style nav (mirrors <SettingsPanel> for personal accounts) ---
  // `null` = no page actively selected → first page on desktop, master list
  // on mobile. Driven by the `#<key>` hash so deep links + back/forward work.
  const [active, setActive] = useState<CategoryKey | null>(null)

  useEffect(() => {
    const sync = () => setActive(readHashCategory())
    sync()
    window.addEventListener("hashchange", sync)
    return () => window.removeEventListener("hashchange", sync)
  }, [])

  const select = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>, key: CategoryKey) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return
      }
      e.preventDefault()
      setActive(key)
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", `#${key}`)
        window.scrollTo({ top: 0 })
      }
    },
    [],
  )

  const back = useCallback(() => {
    setActive(null)
    if (typeof window !== "undefined") {
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      )
      window.scrollTo({ top: 0 })
    }
  }, [])

  // The page whose panel renders. A non-owner deep-linking #danger falls back
  // to the default, since danger isn't in their visible set.
  const allowedKeys = new Set(visibleGroups.flatMap((g) => g.items.map((c) => c.key)))
  const selectedKey: CategoryKey =
    active && allowedKeys.has(active) ? active : DEFAULT_CATEGORY
  const selected = ALL_DEFS.find((c) => c.key === selectedKey) ?? ALL_DEFS[0]

  const renderNavItem = (cat: CategoryDef) => {
    const isActive = cat.key === selectedKey
    const Icon = cat.Icon
    return (
      <li key={cat.key}>
        <a
          href={`#${cat.key}`}
          aria-current={isActive ? "true" : undefined}
          className={`sx-menu__item${isActive ? " sx-menu__item--active" : ""}`}
          onClick={(e) => select(e, cat.key)}
        >
          <span className="sx-menu__icon" aria-hidden>
            <Icon size={16} strokeWidth={1.75} />
          </span>
          <span className="sx-menu__label">{cat.navLabel ?? cat.label}</span>
          <ChevronRight className="sx-menu__chevron" size={16} aria-hidden />
        </a>
      </li>
    )
  }

  const renderBody = (key: CategoryKey) => {
    switch (key) {
      // Handle — read-only; group service doesn't support handle changes
      // after registration.
      case "handle":
        return <p className="username-card__value">@{org.handle}</p>

      case "social-graph":
        return did ? (
          <SyncSocialGraphSection
            did={groupDid}
            ownDid={did}
            targetDid={groupDid}
          />
        ) : (
          <p className="settings__note">Sign in to sync this group.</p>
        )

      // Members — list + role controls + add affordance.
      case "members":
        return membersLoading ? (
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
                      <Select
                        size="sm"
                        aria-label="Member role"
                        value={member.role}
                        onChange={(e) =>
                          handleRoleChange(member.did, e.target.value as OrgRole)
                        }
                      >
                        <option value="member">Member</option>
                        <option value="admin">Admin</option>
                      </Select>
                    ) : (
                      <Badge variant="role">{member.role}</Badge>
                    )}
                    {isAdmin && member.did !== did && member.role !== "owner" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Remove member"
                        onClick={() => setConfirmRemove(member.did)}
                      >
                        <Trash2 size={14} />
                      </Button>
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
                          <Tooltip label={`Remove ${m.handle}`}>
                            <button
                              type="button"
                              className="org-members__selected-remove"
                              onClick={() => removePendingMember(m.did)}
                              aria-label={`Remove ${m.handle}`}
                            >
                              &times;
                            </button>
                          </Tooltip>
                        </span>
                      ))}
                    </div>
                    {addError && <ErrorMessage message={addError} />}
                    <div className="org-members__add-submit">
                      <span className="org-members__add-submit-label">Add as</span>
                      <Select
                        size="sm"
                        aria-label="Role for new member"
                        value={newMemberRole}
                        onChange={(e) => setNewMemberRole(e.target.value as OrgRole)}
                      >
                        <option value="member">Member</option>
                        <option value="admin">Admin</option>
                      </Select>
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
        )

      case "activity":
        return !isAdmin ? (
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
                      const safeResult = auditResultClassSuffix(entry.result)
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
        )

      // Danger zone — owner-only (gated by the visible-set check above).
      case "danger":
        return (
          <>
            {destroyError && <ErrorMessage message={destroyError} />}
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setConfirmDestroy(true)}
              loading={destroying}
              disabled={destroying}
            >
              <Trash2 size={14} />
              Remove group
            </Button>
          </>
        )
    }
  }

  return (
    <div className="sx" data-view={active ? "detail" : "list"}>
      <h1 className="sx__heading sr-only">Group settings</h1>

      <div className="page-layout">
        <aside className="sx__menu">
          <nav aria-label="Group settings sections">
            {visibleGroups.map((group) => (
              <div className="sx-nav-group" key={group.label}>
                <p className="sx-nav-group__label">{group.label}</p>
                <ul className="sx-menu">{group.items.map(renderNavItem)}</ul>
              </div>
            ))}
          </nav>
        </aside>

        <div className="page-layout__main sx__panel">
          <button type="button" className="sx-back" onClick={back}>
            <ChevronLeft size={16} aria-hidden />
            Settings
          </button>
          <section className="sx-section" aria-labelledby="sx-section-title">
            <header className="sx-panel__header">
              <h2 id="sx-section-title" className="sx-panel__title">
                {selected.label}
              </h2>
              {selected.description ? (
                <p className="sx-panel__desc">{selected.description}</p>
              ) : null}
            </header>
            <div className="sx-panel__body">{renderBody(selectedKey)}</div>
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

      {confirmDestroy ? (
        <ConfirmDialog
          title="Remove group"
          message={`Remove @${org.handle} from Certified? This deletes the group from the service only — the underlying account and its records remain. The group can be imported again later.`}
          confirmLabel="Remove group"
          onCancel={() => setConfirmDestroy(false)}
          onConfirm={handleDestroy}
        />
      ) : null}
    </div>
  )
}
