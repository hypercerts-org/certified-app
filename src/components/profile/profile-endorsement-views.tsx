"use client"

import { memo, useState } from "react"
import { Inbox, Plus, SearchX, ThumbsUp, X, type LucideIcon } from "lucide-react"
import type { GivenEndorsement } from "@/hooks/use-endorsements"
import type { ReceivedEndorsement } from "@/hooks/use-received-endorsements"
import { useOwnResponseStates } from "@/hooks/use-own-response-states"
import { useAuthorInfo, type AuthorInfo } from "@/hooks/use-author-info"
import { buildAvatarUrlFromCid } from "@/lib/atproto/profile"
import { deleteEndorsementAward } from "@/lib/atproto/badges"
import { deriveIdentity } from "@/lib/utils/identity"
import ResponseMenu from "@/components/badges/response-menu"
import Button from "@/components/ui/button"
import Checkbox from "@/components/ui/checkbox"
import ConfirmDialog from "@/components/ui/confirm-dialog"
import EmptyState from "@/components/ui/empty-state"
import EndorsementSubjectRow from "@/components/endorsements/endorsement-subject-row"
import { ProfileRowsSkeleton } from "@/components/profile/profile-panel"
import { PERSON_ROW_CLASSES } from "@/components/profile/profile-person-row"

// Presentational views below ProfileEndorsements' fold: the Received /
// Given rows, the bulk-action bar, and the pure filter + sort helpers.
// All state lives in the parent; every unit here receives data plus
// stable callbacks via props. Records' Endorsements pane reuses GivenList.

export type SortKey =
  | "created-desc"
  | "created-asc"
  | "alpha-asc"
  | "alpha-desc"

export type ResponseFilterKey = "hide-rejected" | "only-rejected" | "show-all"

/** Shared load-error state for the endorsement lists. The hook's error
 *  text is technical, so it stays out of the UI. */
function LoadError({ onRetry }: { onRetry?: () => void }) {
  return (
    <EmptyState
      icon={Inbox}
      title="Couldn't load endorsements"
      description="Something went wrong on our side. Try again in a moment."
    >
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </EmptyState>
  )
}

/** "Nothing matches" for a search, naming it and offering to clear it. */
function NoMatches({
  query,
  onClearSearch,
}: {
  query?: string
  onClearSearch?: () => void
}) {
  const q = query?.trim()
  return (
    <EmptyState
      icon={SearchX}
      title="Nothing matches"
      description={
        q ? `No endorsements match "${q}".` : "No endorsements match your search."
      }
    >
      {onClearSearch ? (
        <Button variant="secondary" size="sm" onClick={onClearSearch}>
          Clear search
        </Button>
      ) : null}
    </EmptyState>
  )
}

/**
 * The owner's revoke control on a Given row: an icon button that opens a
 * confirm dialog; on confirm every award for the recipient is deleted and
 * the parent's `onAfterRevoke` refetches so the row disappears.
 */
function RevokeGivenButton({
  viewerDid,
  rkeys,
  targetDid,
  subjectDisplay,
  onAfterRevoke,
}: {
  viewerDid: string
  /** All award rkeys for this recipient — revoke removes every one so a
   *  recipient endorsed more than once disappears in a single click. */
  rkeys: string[]
  targetDid?: string
  subjectDisplay: string
  onAfterRevoke: () => void | Promise<void>
}) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [isRevoking, setIsRevoking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleConfirm = async () => {
    if (isRevoking) return
    setIsRevoking(true)
    setError(null)
    try {
      for (const rkey of rkeys) {
        await deleteEndorsementAward(viewerDid, rkey, { targetDid })
      }
      await onAfterRevoke()
      setConfirmOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke")
    } finally {
      setIsRevoking(false)
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        className="profile-person__action"
        onClick={() => setConfirmOpen(true)}
        aria-label={`Revoke endorsement of ${subjectDisplay}`}
      >
        <X size={16} strokeWidth={1.75} aria-hidden />
      </Button>
      {confirmOpen ? (
        <ConfirmDialog
          title={`Revoke endorsement of ${subjectDisplay}?`}
          message="Your endorsement will be removed from this profile. You can endorse them again later."
          confirmLabel="Revoke endorsement"
          cancelLabel="Keep endorsement"
          confirmVariant="destructive"
          isConfirming={isRevoking}
          onConfirm={handleConfirm}
          onCancel={() => !isRevoking && setConfirmOpen(false)}
        />
      ) : null}
      {error ? (
        <span className="profile-person__error" role="alert">
          {error}
        </span>
      ) : null}
    </>
  )
}

/**
 * Compose the issuer's AuthorInfo from the indexer's denormalised block,
 * filling gaps via `useAuthorInfo`. The indexer's `issuer` join can carry
 * a handle WITHOUT a displayName/avatar (certified-only orgs have no
 * bsky-profile join), so we only skip the per-row resolve when the
 * indexer block is complete.
 */
function useReceivedIssuerInfo(endorsement: ReceivedEndorsement): {
  info: AuthorInfo | null
  isLoading: boolean
} {
  const idxIssuer = endorsement.issuer
  const indexerAvatar = buildAvatarUrlFromCid(
    idxIssuer?.did ?? endorsement.issuerDid,
    idxIssuer?.avatarCid,
  )
  const indexerComplete = !!(
    idxIssuer?.handle &&
    idxIssuer.displayName &&
    indexerAvatar
  )
  const { info: fetched, isLoading } = useAuthorInfo(
    indexerComplete ? null : endorsement.issuerDid,
  )
  const info: AuthorInfo | null =
    idxIssuer?.handle || idxIssuer?.displayName || indexerAvatar || fetched
      ? {
          did: idxIssuer?.did ?? endorsement.issuerDid,
          handle: idxIssuer?.handle ?? fetched?.handle ?? endorsement.issuerDid,
          displayName: idxIssuer?.displayName ?? fetched?.displayName ?? null,
          avatarUrl: indexerAvatar ?? fetched?.avatarUrl ?? null,
        }
      : fetched
  return { info, isLoading }
}

/** Select-all + bulk-action strip shown above the rows while selecting. */
export function BulkBar({
  selectedCount,
  allSelected,
  anyVisible,
  onToggleAll,
  actionLabel,
  actionIcon: ActionIcon,
  busy,
  error,
  onAction,
}: {
  selectedCount: number
  allSelected: boolean
  anyVisible: boolean
  onToggleAll: () => void
  actionLabel: string
  actionIcon: LucideIcon
  busy: boolean
  error: string | null
  onAction: () => void
}) {
  return (
    <div className="profile-panel__bulk-bar" role="toolbar" aria-label="Bulk actions">
      <Checkbox
        checked={allSelected}
        indeterminate={!allSelected && selectedCount > 0}
        onChange={onToggleAll}
        disabled={!anyVisible}
        aria-label={allSelected ? "Deselect all" : "Select all"}
        label={selectedCount > 0 ? `${selectedCount} selected` : "Select all"}
      />
      <div className="profile-panel__bulk-actions">
        {error ? (
          <span className="profile-person__error" role="alert">
            {error}
          </span>
        ) : null}
        <Button
          variant="destructive"
          size="sm"
          onClick={onAction}
          disabled={selectedCount === 0 || busy}
        >
          <ActionIcon size={16} strokeWidth={1.75} aria-hidden />
          {actionLabel}
          {selectedCount > 0 ? ` (${selectedCount})` : ""}
        </Button>
      </div>
      <span className="sr-only" aria-live="polite">
        {selectedCount > 0 ? `${selectedCount} selected` : ""}
      </span>
    </div>
  )
}

// ------------------------------ Given -------------------------------

export function GivenList({
  visible,
  total,
  isLoading,
  error,
  onRetry,
  viewerIsOwner,
  viewerDid,
  targetDid,
  selectable,
  selected,
  onToggleOne,
  onAfterRevoke,
  onEndorse,
  query,
  onClearSearch,
}: {
  visible: GivenEndorsement[]
  /** Size of the pre-search set: "No endorsements given yet" vs "Nothing
   *  matches". */
  total: number
  isLoading: boolean
  error: string | null
  /** Re-runs the load; shows a "Try again" button on error. */
  onRetry?: () => void
  /** The viewer is this account: the copy says "you" and rows can be
   *  revoked. */
  viewerIsOwner: boolean
  viewerDid: string | null
  /** Group DID when the viewer is acting as this group: revokes route to
   *  the group repo. Undefined for personal revokes. */
  targetDid?: string
  selectable: boolean
  selected: Set<string>
  onToggleOne: (uri: string) => void
  onAfterRevoke: () => void | Promise<void>
  /** Offers "Endorse someone" in the owner's empty state. */
  onEndorse?: () => void
  /** The active search, named by "Nothing matches". */
  query?: string
  onClearSearch?: () => void
}) {
  if (isLoading) return <ProfileRowsSkeleton rows={4} shape="circle" />
  if (error) return <LoadError onRetry={onRetry} />
  if (visible.length === 0) {
    if (total > 0) return <NoMatches query={query} onClearSearch={onClearSearch} />
    return (
      <EmptyState
        icon={ThumbsUp}
        title="No endorsements given yet"
        description={
          viewerIsOwner
            ? "Accounts you endorse show here."
            : "Accounts this account endorses show here."
        }
      >
        {viewerIsOwner && onEndorse ? (
          <Button variant="secondary" size="sm" onClick={onEndorse}>
            <Plus size={16} strokeWidth={1.75} aria-hidden />
            Endorse someone
          </Button>
        ) : null}
      </EmptyState>
    )
  }
  return (
    <ul className="profile-people">
      {visible.map((e) => (
        <GivenRow
          key={e.uri}
          endorsement={e}
          selectable={selectable}
          selected={selected.has(e.uri)}
          onToggleOne={onToggleOne}
          canRevoke={viewerIsOwner && !!viewerDid && !selectable}
          viewerDid={viewerDid}
          targetDid={targetDid}
          onAfterRevoke={onAfterRevoke}
        />
      ))}
    </ul>
  )
}

const GivenRow = memo(function GivenRow({
  endorsement,
  selectable,
  selected,
  onToggleOne,
  canRevoke,
  viewerDid,
  targetDid,
  onAfterRevoke,
}: {
  endorsement: GivenEndorsement
  selectable: boolean
  selected: boolean
  onToggleOne: (uri: string) => void
  canRevoke: boolean
  viewerDid: string | null
  targetDid?: string
  onAfterRevoke: () => void | Promise<void>
}) {
  const { info, isLoading } = useAuthorInfo(endorsement.subjectDid)
  // Same derivation the shared row renders, so aria-labels and the
  // revoke confirm dialog match the visible display name.
  const { displayName: display } = deriveIdentity(info, endorsement.subjectDid)
  return (
    <li className="profile-person" data-selected={selected || undefined}>
      {selectable ? (
        <Checkbox
          className="profile-person__check"
          checked={selected}
          onChange={() => onToggleOne(endorsement.uri)}
          aria-label={`Select endorsement of ${display}`}
        />
      ) : null}
      <EndorsementSubjectRow
        did={endorsement.subjectDid}
        info={info}
        isLoading={isLoading}
        createdAt={endorsement.createdAt}
        note={endorsement.note}
        avatarSize="sm"
        classes={PERSON_ROW_CLASSES}
        trailing={
          canRevoke && viewerDid ? (
            <RevokeGivenButton
              viewerDid={viewerDid}
              rkeys={endorsement.rkeys}
              targetDid={targetDid}
              subjectDisplay={display}
              onAfterRevoke={onAfterRevoke}
            />
          ) : null
        }
      />
    </li>
  )
})

// ----------------------------- Received -----------------------------

export function ReceivedList({
  visible,
  total,
  isLoading,
  error,
  onRetry,
  responseFilter,
  viewerIsOwner,
  viewerDid,
  targetDid,
  resolve,
  allResponses,
  selectable,
  selected,
  onToggleOne,
  onAfterWrite,
  query,
  onClearSearch,
}: {
  visible: ReceivedEndorsement[]
  total: number
  isLoading: boolean
  error: string | null
  /** Re-runs the load; shows a "Try again" button on error. */
  onRetry?: () => void
  responseFilter: ResponseFilterKey
  /** The viewer is this account: the copy says "you" and each row gets
   *  the accept / reject menu. */
  viewerIsOwner: boolean
  viewerDid: string | null
  targetDid?: string
  resolve: ReturnType<typeof useOwnResponseStates>["resolve"]
  allResponses: ReturnType<typeof useOwnResponseStates>["responses"]
  selectable: boolean
  selected: Set<string>
  onToggleOne: (uri: string) => void
  onAfterWrite: () => void | Promise<void>
  query?: string
  onClearSearch?: () => void
}) {
  if (isLoading) return <ProfileRowsSkeleton rows={4} shape="circle" />
  if (error) return <LoadError onRetry={onRetry} />
  if (visible.length === 0) {
    if (responseFilter === "only-rejected" && !query?.trim()) {
      return (
        <EmptyState
          icon={ThumbsUp}
          title="No rejected endorsements"
          description="Endorsements you reject are hidden from your profile and listed here."
        />
      )
    }
    if (total > 0) return <NoMatches query={query} onClearSearch={onClearSearch} />
    return (
      <EmptyState
        icon={ThumbsUp}
        title="No endorsements yet"
        description={
          viewerIsOwner
            ? "When another account endorses you, it shows here."
            : "When another account endorses this one, it shows here."
        }
      />
    )
  }
  return (
    <ul className="profile-people">
      {visible.map((e) => (
        <ReceivedRow
          key={e.uri}
          endorsement={e}
          selectable={selectable}
          selected={selected.has(e.uri)}
          onToggleOne={onToggleOne}
          viewerIsOwner={viewerIsOwner && !selectable}
          viewerDid={viewerDid}
          targetDid={targetDid}
          resolve={resolve}
          allResponses={allResponses}
          onAfterWrite={onAfterWrite}
        />
      ))}
    </ul>
  )
}

const ReceivedRow = memo(function ReceivedRow({
  endorsement,
  selectable,
  selected,
  onToggleOne,
  viewerIsOwner,
  viewerDid,
  targetDid,
  resolve,
  allResponses,
  onAfterWrite,
}: {
  endorsement: ReceivedEndorsement
  selectable: boolean
  selected: boolean
  onToggleOne: (uri: string) => void
  viewerIsOwner: boolean
  viewerDid: string | null
  targetDid?: string
  resolve: ReturnType<typeof useOwnResponseStates>["resolve"]
  allResponses: ReturnType<typeof useOwnResponseStates>["responses"]
  onAfterWrite: () => void | Promise<void>
}) {
  const { info, isLoading } = useReceivedIssuerInfo(endorsement)
  // Same derivation the shared row renders, so aria-labels and the
  // response menu match the visible display name.
  const { displayName: display } = deriveIdentity(info, endorsement.issuerDid)
  return (
    <li
      className="profile-person"
      data-selected={selected || undefined}
      data-state={resolve(endorsement.uri).state}
    >
      {selectable ? (
        <Checkbox
          className="profile-person__check"
          checked={selected}
          onChange={() => onToggleOne(endorsement.uri)}
          aria-label={`Select endorsement from ${display}`}
        />
      ) : null}
      <EndorsementSubjectRow
        did={endorsement.issuerDid}
        info={info}
        isLoading={isLoading}
        createdAt={endorsement.createdAt}
        note={endorsement.note}
        avatarSize="sm"
        classes={PERSON_ROW_CLASSES}
        trailing={
          viewerIsOwner ? (
            <ResponseMenu
              awardUri={endorsement.uri}
              awardCid={endorsement.cid}
              issuerDisplayName={display}
              ownerDid={viewerDid}
              targetDid={targetDid}
              state={resolve(endorsement.uri).state}
              allResponses={allResponses}
              onAfterWrite={onAfterWrite}
            />
          ) : null
        }
      />
    </li>
  )
})

// ----------------------- Filter + sort helpers -----------------------

export function filterAndSortReceived(
  records: ReceivedEndorsement[],
  query: string,
  sort: SortKey,
  names: Map<string, string>,
): ReceivedEndorsement[] {
  const q = query.trim().toLowerCase()
  const matches = q
    ? records.filter((r) => {
        const note = (r.note ?? "").toLowerCase()
        const name = names.get(r.issuerDid) ?? r.issuerDid.toLowerCase()
        return note.includes(q) || name.includes(q)
      })
    : records

  const sorted = matches.slice()
  sorted.sort((a, b) => {
    switch (sort) {
      case "created-desc":
        return compareString(b.createdAt, a.createdAt)
      case "created-asc":
        return compareString(a.createdAt, b.createdAt)
      case "alpha-asc":
        return (names.get(a.issuerDid) ?? "").localeCompare(
          names.get(b.issuerDid) ?? "",
        )
      case "alpha-desc":
        return (names.get(b.issuerDid) ?? "").localeCompare(
          names.get(a.issuerDid) ?? "",
        )
    }
  })
  return sorted
}

export function filterAndSortGiven(
  records: GivenEndorsement[],
  query: string,
  sort: SortKey,
  names: Map<string, string>,
): GivenEndorsement[] {
  const q = query.trim().toLowerCase()
  const matches = q
    ? records.filter((r) => {
        const note = (r.note ?? "").toLowerCase()
        const name = names.get(r.subjectDid) ?? r.subjectDid.toLowerCase()
        return note.includes(q) || name.includes(q)
      })
    : records

  const sorted = matches.slice()
  sorted.sort((a, b) => {
    switch (sort) {
      case "created-desc":
        return compareString(b.createdAt, a.createdAt)
      case "created-asc":
        return compareString(a.createdAt, b.createdAt)
      case "alpha-asc":
        return (names.get(a.subjectDid) ?? "").localeCompare(
          names.get(b.subjectDid) ?? "",
        )
      case "alpha-desc":
        return (names.get(b.subjectDid) ?? "").localeCompare(
          names.get(a.subjectDid) ?? "",
        )
    }
  })
  return sorted
}

function compareString(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}
