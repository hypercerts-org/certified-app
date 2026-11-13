"use client"

import React, { useState, useEffect, useCallback } from "react"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import {
  CircleUser,
  Crown,
  ScrollText,
  Share2,
  ShieldAlert,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react"
import { useAuth } from "@/lib/auth/auth-context"
import { useSession } from "@/hooks/use-session"
import { useOrg } from "@/lib/groups/org-context"
import { GROUP_PROMOTED_FLAG } from "@/lib/groups/constants"
import DidSection from "@/components/account/did-section"
import GroupPasswordReset from "@/components/groups/group-password-reset"
import GroupAccountManager from "@/components/groups/group-account-manager"

// Self-owned-group Account page reuses the personal account controls — you're
// signed in as the group account itself, so they act on the right session.
const UsernameCard = dynamic(
  () => import("@/components/dashboard/username-card"),
)
const EmailSection = dynamic(() => import("@/components/account/email-section"))
const PasswordSection = dynamic(
  () => import("@/components/account/password-section"),
)
import SyncSocialGraphSection from "@/components/settings/sync-social-graph-section"
import SettingsLayout, {
  SettingsBlock,
  SettingsNote,
  SettingsRow,
  useHashSection,
  type SettingsSectionDef,
} from "@/components/settings/settings-layout"
import {
  listOrgMembers,
  addOrgMember,
  removeOrgMember,
  setOrgMemberRole,
  queryOrgAuditLog,
  destroyGroup,
  getOwnershipTransfer,
  proposeOwnershipTransfer,
  acceptOwnershipTransfer,
  cancelOwnershipTransfer,
} from "@/lib/groups/api"
import type {
  Group,
  OrgMember,
  AuditEntry,
  OrgRole,
  OwnershipTransfer,
} from "@/lib/groups/types"
import { authFetch } from "@/lib/auth/fetch"
import { formatShortDate } from "@/lib/utils/format-date"
import { formatRelativeTime } from "@/lib/atproto/activity"
import { useAuthorInfo } from "@/hooks/use-author-info"
import { profileUrl } from "@/lib/urls"
import Link from "next/link"
import Button from "@/components/ui/button"
import Badge from "@/components/ui/badge"
import Select from "@/components/ui/select"
import IdentityRow from "@/components/ui/identity-row"
import ConfirmDialog from "@/components/ui/confirm-dialog"
import GroupResultModal from "@/components/groups/group-result-modal"
import HandleSearch from "@/components/groups/handle-search"
import ErrorMessage from "@/components/ui/error-message"
import Pagination from "@/components/ui/pagination"
import Skeleton from "@/components/ui/skeleton"

type CategoryKey =
  | "account"
  | "social-graph"
  | "members"
  | "ownership"
  | "activity"
  | "danger"

type CategoryDef = SettingsSectionDef<CategoryKey> & {
  /** The section heading; defaults to the SideNav label. */
  title?: string
  description: string
}

/**
 * Group settings share the personal settings frame (`SettingsLayout`): a
 * SideNav of sections and one section at a time, picked by the URL hash.
 * Which sections show depends on the viewer's role (`visibleCategories` in
 * the component): Transfer ownership only for the two parties, the Danger
 * zone only for the owner, and always last.
 */
const CATEGORIES: CategoryDef[] = [
  {
    key: "account",
    label: "Account",
    icon: CircleUser,
    description: "This group's handle and account ID.",
  },
  {
    key: "social-graph",
    label: "Import follows",
    title: "Import Bluesky follows",
    icon: Share2,
    description:
      "Compare this group's Certified follows with its Bluesky follows, and import the ones missing here.",
  },
  {
    key: "members",
    label: "Members & roles",
    icon: Users,
    description: "Who can act for this group, and what each person can do.",
  },
  {
    key: "ownership",
    label: "Transfer ownership",
    icon: Crown,
    description:
      "Hand this group to another member. They become the owner once they accept, and you become an admin. An unaccepted transfer expires after 7 days.",
  },
  {
    key: "activity",
    label: "Activity log",
    icon: ScrollText,
    description: "Recent actions taken in this group.",
  },
  {
    key: "danger",
    label: "Danger zone",
    icon: ShieldAlert,
    description: "Owner-only changes to the group itself.",
  },
]

const CATEGORY_KEYS: readonly CategoryKey[] = CATEGORIES.map((c) => c.key)

/** Old deep links: the group's Handle page is now part of Account. */
const CATEGORY_ALIASES: Readonly<Record<string, CategoryKey>> = {
  handle: "account",
  email: "account",
  password: "account",
}

const ROLE_PHRASE: Record<OrgRole, string> = {
  owner: "You're its owner.",
  admin: "You're an admin.",
  member: "You're a member.",
}

// Map an audit entry's `result` to the CSS modifier suffix for its pill.
// The allowlist must match `AuditEntry.result` ("permitted" | "denied")
// and the only styled classes (`--permitted` / `--denied`); anything
// else falls back to the neutral `--unknown` class.
export function auditResultClassSuffix(result: string): "permitted" | "denied" | "unknown" {
  return result === "permitted" || result === "denied" ? result : "unknown"
}

// Members & Roles remove-button gate (mirrors CGS RBAC): a caller can remove
// a member only when it isn't themselves, isn't the owner, and either the
// caller is the owner or the target is a plain member. Owners can remove
// admins + members; admins can remove only members.
export function canRemoveMember(params: {
  memberDid: string
  memberRole: OrgRole
  callerDid: string | null | undefined
  isOwner: boolean
}): boolean {
  const { memberDid, memberRole, callerDid, isOwner } = params
  return (
    memberDid !== callerDid &&
    memberRole !== "owner" &&
    (isOwner || memberRole === "member")
  )
}

/**
 * Which side of an ownership transfer the viewer is on — this decides whether
 * the Transfer ownership page appears at all, and what it offers.
 *
 * Only the two parties can act: the owner proposes and can revoke, and the
 * member named in a pending proposal can accept or decline. Everyone else gets
 * "none" and never sees the page. That leaks nothing: CGS reports
 * `pending: false` to a member who isn't a party, exactly as it does when no
 * transfer exists, so a bystander can't tell the two apart either way.
 */
export function transferViewerRole(params: {
  transfer: OwnershipTransfer | null
  callerDid: string | null | undefined
  isOwner: boolean
}): "owner" | "recipient" | "none" {
  const { transfer, callerDid, isOwner } = params
  if (isOwner) return "owner"
  if (transfer?.pending && callerDid && transfer.proposedOwner === callerDid) {
    return "recipient"
  }
  return "none"
}

/**
 * The "Proposed … — expires …" line under a pending transfer.
 *
 * Built as one string rather than JSX text interleaved with expressions:
 * JSX drops the space between `}` and the next word when that pair straddles
 * a line break, which ran the date straight into the following word.
 */
export function transferPendingNote(pending: {
  createdAt: string
  expiresAt: string
}): string {
  return `Proposed ${formatShortDate(pending.createdAt)} — expires ${formatShortDate(pending.expiresAt)} if it isn't accepted.`
}

// Who the owner may propose as the next owner: any member except the current
// owner (CGS rejects `AlreadyOwner`) and except themselves. CGS also requires
// the target to already be a member, which everyone in this list is.
export function eligibleTransferTargets<
  T extends { did: string; role: OrgRole },
>(members: T[], callerDid: string | null | undefined): T[] {
  return members.filter((m) => m.role !== "owner" && m.did !== callerDid)
}

// groups-6: when the add-members loop fails part-way through, the members
// before `failedIndex` were already accepted by the service. Re-staging the
// whole list would double-add them, so keep only the failing member onward
// (the one that failed plus any not-yet-attempted).
export function remainingAfterAddIndex<T>(members: T[], failedIndex: number): T[] {
  return members.slice(failedIndex)
}

interface ResolvedMember extends OrgMember {
  handle?: string
  displayName?: string
  avatarUrl?: string
}

interface OrgSettingsProps {
  groupDid: string
  org: Group
}

export default function OrgSettings({ groupDid, org }: OrgSettingsProps) {
  const { did, pdsUrl } = useAuth()
  const { email } = useSession()
  const { switchOrg, refetchOrgs } = useOrg()
  const router = useRouter()
  const isOwner = org.role === "owner"
  const isAdmin = org.role === "admin" || isOwner
  // Signed in as the group account itself (you promoted your own account):
  // you hold its credentials, so it gets the full Account page.
  const isSelfOwned = !!did && groupDid === did

  // Remove-group (destroy) state.
  const [confirmDestroy, setConfirmDestroy] = useState(false)
  const [destroying, setDestroying] = useState(false)
  const [destroyError, setDestroyError] = useState<string | null>(null)
  const [removed, setRemoved] = useState(false)

  // The promote-to-group flow drops a flag right before switching here, so the
  // celebration shows on the group settings (not over the personal page it just
  // left). Read it once on mount, then clear it.
  const [createdHandle, setCreatedHandle] = useState<string | null>(null)
  useEffect(() => {
    if (typeof window === "undefined") return
    const promoted = sessionStorage.getItem(GROUP_PROMOTED_FLAG)
    if (promoted) {
      sessionStorage.removeItem(GROUP_PROMOTED_FLAG)
      setCreatedHandle(promoted)
    }
  }, [])

  const handleDestroy = async () => {
    setDestroying(true)
    setDestroyError(null)
    try {
      await destroyGroup(groupDid)
      setConfirmDestroy(false)
      // Show the dry confirmation; stop acting as the group + leave on dismiss.
      setRemoved(true)
    } catch (err) {
      setDestroyError(
        err instanceof Error ? err.message : "Failed to remove group",
      )
      setConfirmDestroy(false)
    } finally {
      setDestroying(false)
    }
  }

  // Dismiss the "removed" modal: stop acting as the now-deleted group (else you
  // stay "signed in" as it), drop it from the switcher, and leave the page.
  const finishRemoval = () => {
    switchOrg(null)
    void refetchOrgs()
    router.push("/home")
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

  // Ownership transfer (CGS >= 0.6.0)
  const [transfer, setTransfer] = useState<OwnershipTransfer | null>(null)
  const [transferError, setTransferError] = useState<string | null>(null)
  const [transferBusy, setTransferBusy] = useState(false)
  const [transferTarget, setTransferTarget] = useState("")
  const [confirmPropose, setConfirmPropose] = useState(false)
  const [confirmAccept, setConfirmAccept] = useState(false)

  // Transfer ownership is only actionable by the two parties — the owner, and
  // a member with a pending proposal naming them. Everyone else never sees the
  // page (see `transferViewerRole`).
  const viewerTransferRole = transferViewerRole({
    transfer,
    callerDid: did,
    isOwner,
  })
  // Owners also get the Danger zone (remove group), always last.
  const visibleCategories = CATEGORIES.filter(
    (c) =>
      (c.key !== "ownership" || viewerTransferRole !== "none") &&
      (c.key !== "danger" || isOwner),
  )

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
                  avatarUrl: data.avatar || undefined,
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

  const fetchTransfer = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const next = await getOwnershipTransfer(groupDid, signal)
        if (!signal?.aborted) {
          setTransfer(next)
          setTransferError(null)
        }
      } catch (err) {
        if (signal?.aborted) return
        // Leave `transfer` as-is: a non-party's page stays hidden either way,
        // and the owner (whose page is always in the rail) sees this inline.
        setTransferError(
          err instanceof Error ? err.message : "Couldn't read transfer status"
        )
      }
    },
    [groupDid]
  )

  useEffect(() => {
    const controller = new AbortController()
    fetchMembers(controller.signal)
    fetchAudit(controller.signal)
    fetchTransfer(controller.signal)
    return () => controller.abort()
  }, [fetchMembers, fetchAudit, fetchTransfer])

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
      await Promise.all([fetchMembers(), fetchAudit(), fetchTransfer()])
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
      // Removing a party clears any pending proposal service-side, so the
      // transfer state has to be re-read rather than kept.
      await Promise.all([fetchMembers(), fetchAudit(), fetchTransfer()])
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
      // A role change also clears a pending proposal service-side.
      await Promise.all([fetchMembers(), fetchAudit(), fetchTransfer()])
    } catch (err) {
      setMemberError(
        err instanceof Error ? err.message : "Failed to change role"
      )
    }
  }

  const handlePropose = async () => {
    if (!transferTarget) return
    setTransferBusy(true)
    setTransferError(null)
    try {
      await proposeOwnershipTransfer(groupDid, transferTarget)
      setConfirmPropose(false)
      setTransferTarget("")
      await Promise.all([fetchTransfer(), fetchAudit()])
    } catch (err) {
      setTransferError(
        err instanceof Error ? err.message : "Failed to propose transfer"
      )
      setConfirmPropose(false)
    } finally {
      setTransferBusy(false)
    }
  }

  const handleAcceptTransfer = async () => {
    setTransferBusy(true)
    setTransferError(null)
    try {
      await acceptOwnershipTransfer(groupDid)
      setConfirmAccept(false)
      // Roles just swapped — the caller is the owner and the proposer an
      // admin. Refresh the org context too, since `org.role` drives which
      // pages and controls this whole screen renders.
      await Promise.all([fetchTransfer(), fetchMembers(), fetchAudit()])
      await refetchOrgs()
    } catch (err) {
      setTransferError(
        err instanceof Error ? err.message : "Failed to accept transfer"
      )
      setConfirmAccept(false)
    } finally {
      setTransferBusy(false)
    }
  }

  const handleCancelTransfer = async () => {
    setTransferBusy(true)
    setTransferError(null)
    try {
      await cancelOwnershipTransfer(groupDid)
      await Promise.all([fetchTransfer(), fetchAudit()])
    } catch (err) {
      setTransferError(
        err instanceof Error ? err.message : "Failed to cancel transfer"
      )
    } finally {
      setTransferBusy(false)
    }
  }

  // ----- Section nav (shared with <SettingsPanel> via SettingsLayout) -----
  // Driven by the `#<key>` hash so deep links, the tour and the promote flow's
  // `#members` hand-off land on the right section.
  const [active, select] = useHashSection(CATEGORY_KEYS, CATEGORY_ALIASES)

  // The section that renders. A deep link to a section this viewer doesn't
  // get (a non-owner's #danger) falls back to the first one, Account.
  const selected =
    visibleCategories.find((c) => c.key === active) ?? visibleCategories[0]

  const memberPageCount = Math.ceil(members.length / MEMBERS_PER_PAGE)
  const auditPageCount = Math.ceil(auditEntries.length / AUDIT_PER_PAGE)

  const renderBody = (key: CategoryKey) => {
    switch (key) {
      // Account — every group, in the same shape as an individual's Account.
      // Owners/admins edit the handle and email after unlocking with the
      // group's password, and can reset that password by email; members see
      // the handle read-only. A self-owned group (you are signed in as the
      // group account) uses the personal controls, since you hold its own
      // credentials.
      case "account":
        return (
          <>
            {isAdmin || isSelfOwned ? (
              <SettingsRow
                label="Profile"
                description="The group's name, picture, bio and links, as others see them."
              >
                <Button
                  variant="secondary"
                  size="sm"
                  href={
                    isSelfOwned
                      ? "/settings/edit-profile"
                      : `/groups/${encodeURIComponent(groupDid)}/edit-profile`
                  }
                >
                  Edit profile
                </Button>
              </SettingsRow>
            ) : null}
            {isSelfOwned ? (
              <>
                <SettingsRow
                  label="Handle"
                  description="The @handle people use to find this group on Certified."
                >
                  {/* The group account IS your account, so change the handle
                      via the standard personal updateHandle. */}
                  <UsernameCard
                    handle={org.handle}
                    pdsUrl={pdsUrl || undefined}
                    did={did || undefined}
                  />
                </SettingsRow>
                <SettingsRow
                  label="Email"
                  description="Used to sign in and to recover this account."
                >
                  <EmailSection email={email || ""} />
                </SettingsRow>
                <SettingsRow
                  label="Password"
                  description="Lets you sign in to other AT Protocol apps with this handle."
                >
                  <PasswordSection email={email || ""} />
                </SettingsRow>
              </>
            ) : isAdmin ? (
              <>
                {/* Unlock with the group's password → a real group session, so
                    updateHandle renames the GROUP (not the caller) and the
                    email can be read and changed. */}
                <GroupAccountManager
                  groupDid={groupDid}
                  currentHandle={org.handle}
                />
                {/* Password reset by email (for when you don't know the
                    password): you enter the group's email and reset against it. */}
                <SettingsRow
                  label="Password"
                  description="Reset the group's password using its sign-in email. Enter the group's own email (this changes the password of whichever account the email belongs to); you'll need access to that mailbox."
                >
                  <GroupPasswordReset groupDid={groupDid} />
                </SettingsRow>
              </>
            ) : (
              <SettingsRow
                label="Handle"
                description="The @handle people use to find this group on Certified."
              >
                <p className="m-0 text-body-sm font-medium text-[var(--fg-primary)]">
                  @{org.handle}
                </p>
              </SettingsRow>
            )}
            <SettingsRow
              label="Account ID"
              description="This group's permanent ID (a DID). Unlike its handle it never changes; apps and records refer to the group by it."
            >
              <DidSection did={groupDid} />
            </SettingsRow>
          </>
        )

      case "social-graph":
        return (
          <SettingsBlock>
            {did ? (
              <SyncSocialGraphSection
                did={groupDid}
                ownDid={did}
                targetDid={groupDid}
              />
            ) : (
              <SettingsNote>Sign in to sync this group.</SettingsNote>
            )}
          </SettingsBlock>
        )

      // Members — the list with role controls, then adding people.
      case "members":
        return (
          <>
            <SettingsBlock
              title="Members"
              description={
                isOwner
                  ? "You can change roles and remove admins and members."
                  : isAdmin
                    ? "You can add and remove members. Only the owner changes roles."
                    : "The owner and admins manage who belongs to this group."
              }
            >
              {memberError && <ErrorMessage message={memberError} />}
              {membersLoading ? (
                <div className="org-members__list" aria-busy="true">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="org-members__item">
                      <IdentityRow did="" size="sm" loading />
                    </div>
                  ))}
                </div>
              ) : (
                <ul className="org-members__list">
                  {members
                    .slice(membersPage * MEMBERS_PER_PAGE, (membersPage + 1) * MEMBERS_PER_PAGE)
                    .map((member) => (
                      <li key={member.did} className="org-members__item">
                        <div className="org-members__item-info">
                          <IdentityRow
                            did={member.did}
                            handle={member.handle}
                            displayName={member.displayName}
                            avatarUrl={member.avatarUrl}
                            size="sm"
                          />
                        </div>
                        <div className="org-members__item-actions">
                          {isOwner && member.role !== "owner" ? (
                            <Select
                              size="sm"
                              aria-label={`Role of ${member.handle ? `@${member.handle}` : "this member"}`}
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
                          {/* Owners can remove admins + members; admins can
                              remove only members (not other admins, not the
                              owner, not themselves). Mirrors CGS RBAC. */}
                          {canRemoveMember({
                            memberDid: member.did,
                            memberRole: member.role,
                            callerDid: did,
                            isOwner,
                          }) && (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Remove ${member.handle ? `@${member.handle}` : "member"}`}
                              onClick={() => setConfirmRemove(member.did)}
                            >
                              <Trash2 size={16} strokeWidth={1.75} aria-hidden />
                            </Button>
                          )}
                        </div>
                      </li>
                    ))}
                </ul>
              )}
              <Pagination
                page={membersPage + 1}
                pageCount={memberPageCount}
                onChange={(p) => setMembersPage(p - 1)}
                label="Members pages"
              />
            </SettingsBlock>

            {isAdmin && (
              <SettingsBlock
                title="Add members"
                description="Find people by name or handle, then choose their role."
              >
                <HandleSearch
                  label=""
                  placeholder="Search by name or handle"
                  onSelect={(selectedDid, selectedHandle) => {
                    if (!pendingMembers.some((m) => m.did === selectedDid)) {
                      setPendingMembers((prev) => [...prev, { did: selectedDid, handle: selectedHandle }])
                    }
                  }}
                />
                {pendingMembers.length > 0 && (
                  <>
                    <ul className="org-members__selected" aria-label="People to add">
                      {pendingMembers.map((m) => (
                        <li key={m.did} className="org-members__selected-tag">
                          @{m.handle}
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Don't add @${m.handle}`}
                            onClick={() => removePendingMember(m.did)}
                          >
                            <X size={14} strokeWidth={2} aria-hidden />
                          </Button>
                        </li>
                      ))}
                    </ul>
                    {addError && <ErrorMessage message={addError} />}
                    <div className="org-members__add-submit">
                      <span className="org-members__add-submit-label">Add as</span>
                      <Select
                        size="sm"
                        aria-label="Role for new members"
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
                        <UserPlus size={14} aria-hidden />
                        Add
                      </Button>
                    </div>
                  </>
                )}
              </SettingsBlock>
            )}
          </>
        )

      // Ownership transfer (CGS >= 0.6.0). Only the two parties get here —
      // `viewerTransferRole` keeps the section out of everyone else's nav.
      case "ownership": {
        const pending = transfer?.pending ? transfer : null
        const targets = eligibleTransferTargets(members, did)
        const identityFor = (memberDid: string) => {
          const m = members.find((x) => x.did === memberDid)
          return (
            <IdentityRow
              did={memberDid}
              handle={m?.handle}
              displayName={m?.displayName}
              avatarUrl={m?.avatarUrl}
              size="sm"
            />
          )
        }

        return (
          <>
            {transferError && <ErrorMessage message={transferError} />}

            {pending ? (
              <SettingsRow
                label="Transfer in progress"
                description={
                  viewerTransferRole === "recipient"
                    ? "You've been proposed as this group's owner. Accepting makes you the owner, and the current owner becomes an admin."
                    : "Nothing changes until the proposed owner accepts. You can cancel it before then."
                }
              >
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    {identityFor(pending.proposedOwner)}
                    <Badge variant="role">proposed owner</Badge>
                  </div>
                  <SettingsNote>{transferPendingNote(pending)}</SettingsNote>
                  <div className="flex flex-wrap gap-2">
                    {viewerTransferRole === "recipient" ? (
                      <>
                        <Button
                          size="sm"
                          onClick={() => setConfirmAccept(true)}
                          disabled={transferBusy}
                        >
                          Accept ownership
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={handleCancelTransfer}
                          loading={transferBusy}
                          disabled={transferBusy}
                        >
                          Decline
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleCancelTransfer}
                        loading={transferBusy}
                        disabled={transferBusy}
                      >
                        Cancel transfer
                      </Button>
                    )}
                  </div>
                </div>
              </SettingsRow>
            ) : (
              <SettingsRow
                label="New owner"
                description="Pick a member. Nothing changes until they accept."
              >
                {membersLoading ? (
                  <Skeleton variant="box" width={240} height={32} />
                ) : targets.length === 0 ? (
                  <SettingsNote>
                    This group has no other members yet. Add someone under
                    Members &amp; roles first.
                  </SettingsNote>
                ) : (
                  <div className="org-members__add-submit">
                    <Select
                      size="sm"
                      aria-label="New owner"
                      value={transferTarget}
                      onChange={(e) => setTransferTarget(e.target.value)}
                    >
                      <option value="">Select a member…</option>
                      {targets.map((m) => (
                        <option key={m.did} value={m.did}>
                          {m.handle ? `@${m.handle}` : m.did}
                        </option>
                      ))}
                    </Select>
                    <Button
                      size="sm"
                      onClick={() => setConfirmPropose(true)}
                      disabled={!transferTarget || transferBusy}
                      loading={transferBusy}
                    >
                      Propose transfer
                    </Button>
                  </div>
                )}
              </SettingsRow>
            )}

            <SettingsBlock>
              <SettingsNote>
                This moves control of the group within Certified. It doesn&apos;t
                hand over the group account&apos;s own sign-in credentials.
              </SettingsNote>
            </SettingsBlock>
          </>
        )
      }

      case "activity":
        return (
          <SettingsBlock>
            {!isAdmin ? (
              <SettingsNote>Only admins and owners can view the activity log.</SettingsNote>
            ) : auditLoading ? (
              <div className="org-audit__list" aria-busy="true">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="org-audit__item">
                    <Skeleton variant="text" lines={2} />
                  </div>
                ))}
              </div>
            ) : auditError ? (
              <SettingsNote role="alert">
                Couldn&apos;t load the activity log: {auditError}
              </SettingsNote>
            ) : auditEntries.length === 0 ? (
              <SettingsNote>No activity recorded yet.</SettingsNote>
            ) : (
              <>
                <ul className="org-audit__list">
                  {auditEntries
                    .slice(auditPage * AUDIT_PER_PAGE, (auditPage + 1) * AUDIT_PER_PAGE)
                    .map((entry) => (
                      <li key={entry.id} className="org-audit__item">
                        <div className="org-audit__item-main">
                          <span className="org-audit__action">{entry.action}</span>
                          <span
                            className={`org-audit__result org-audit__result--${auditResultClassSuffix(entry.result)}`}
                          >
                            {entry.result}
                          </span>
                        </div>
                        <dl className="org-audit__item-meta">
                          <div className="org-audit__detail-row">
                            <dt className="org-audit__detail-label">by</dt>
                            <dd className="org-audit__detail-value">
                              <AuditActor did={entry.actorDid} />
                            </dd>
                          </div>
                          <div className="org-audit__detail-row">
                            <dt className="org-audit__detail-label">at</dt>
                            <dd className="org-audit__detail-value">
                              <time
                                dateTime={entry.createdAt}
                                title={new Date(entry.createdAt).toLocaleString()}
                              >
                                {formatRelativeTime(entry.createdAt) || entry.createdAt}
                              </time>
                            </dd>
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
                      </li>
                    ))}
                </ul>
                <Pagination
                  page={auditPage + 1}
                  pageCount={auditPageCount}
                  onChange={(p) => setAuditPage(p - 1)}
                  label="Activity log pages"
                />
              </>
            )}
          </SettingsBlock>
        )

      // Danger zone — owner-only (gated by `visibleCategories` above).
      case "danger":
        return (
          <SettingsRow
            label="Remove group"
            description="Turn this group back into a regular account. The group features go away; the account and everything it published stay, and you can make it a group again later."
          >
            <div className="flex flex-col items-start gap-3">
              {destroyError && <ErrorMessage message={destroyError} />}
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setConfirmDestroy(true)}
                loading={destroying}
                disabled={destroying}
              >
                <Trash2 size={14} aria-hidden />
                Remove group
              </Button>
            </div>
          </SettingsRow>
        )
    }
  }

  // The Account section gains rows by role, so its one-liner follows.
  const sectionDescription =
    selected.key === "account"
      ? isSelfOwned
        ? "This group's profile, handle, sign-in email and password, and its account ID."
        : isAdmin
          ? "This group's profile, handle, sign-in email and password, and its account ID."
          : "This group's handle and account ID."
      : selected.description

  return (
    <>
      <SettingsLayout
        description={
          <>
            Settings for the group{" "}
            <strong className="font-medium text-[var(--fg-primary)]">@{org.handle}</strong>.{" "}
            {ROLE_PHRASE[org.role]}
          </>
        }
        navLabel="Group settings sections"
        sections={visibleCategories}
        current={selected.key}
        onSelect={select}
        title={selected.title ?? selected.label}
        sectionDescription={sectionDescription}
      >
        {renderBody(selected.key)}
      </SettingsLayout>

      {confirmRemove ? (
        <ConfirmDialog
          title={`Remove @${
            members.find((m) => m.did === confirmRemove)?.handle ?? confirmRemove
          }?`}
          message="They'll lose access to act as this group. You can add them again later."
          confirmLabel="Remove member"
          onCancel={() => setConfirmRemove(null)}
          onConfirm={() => handleRemoveMember(confirmRemove)}
        />
      ) : null}

      {confirmPropose ? (
        <ConfirmDialog
          title="Propose new owner"
          message={`Propose @${
            members.find((m) => m.did === transferTarget)?.handle ??
            transferTarget
          } as the owner of @${org.handle}? They become the owner once they accept — and you become an admin. You can cancel until then.`}
          confirmLabel="Propose transfer"
          isConfirming={transferBusy}
          onCancel={() => setConfirmPropose(false)}
          onConfirm={handlePropose}
        />
      ) : null}

      {confirmAccept ? (
        <ConfirmDialog
          title="Accept ownership"
          message={`Become the owner of @${org.handle}? The current owner is demoted to admin. Only the new owner can undo this, by transferring ownership back.`}
          confirmLabel="Accept ownership"
          isConfirming={transferBusy}
          onCancel={() => setConfirmAccept(false)}
          onConfirm={handleAcceptTransfer}
        />
      ) : null}

      {confirmDestroy ? (
        <ConfirmDialog
          title={`Turn @${org.handle} back into a regular account?`}
          message="The group features go away. The account and everything it published stay."
          confirmLabel="Remove group"
          confirmPhrase={org.handle}
          isConfirming={destroying}
          onCancel={() => setConfirmDestroy(false)}
          onConfirm={handleDestroy}
        />
      ) : null}

      {createdHandle ? (
        <GroupResultModal
          variant="created"
          handle={createdHandle}
          primaryLabel="Add members"
          onPrimary={() => setCreatedHandle(null)}
          onClose={() => setCreatedHandle(null)}
        />
      ) : null}

      {removed ? (
        <GroupResultModal
          variant="removed"
          handle={org.handle}
          primaryLabel="Done"
          onPrimary={finishRemoval}
          onClose={finishRemoval}
        />
      ) : null}
    </>
  )
}

/** Audit-log actor: the @handle (linked to the profile) once it resolves,
 *  the raw DID until then; the DID is always in the title. */
function AuditActor({ did }: { did: string }) {
  const { info } = useAuthorInfo(did)
  const handle = info?.handle
  return (
    <Link href={profileUrl(handle || did)} title={did} className="org-audit__actor">
      {handle ? `@${handle}` : did}
    </Link>
  )
}
