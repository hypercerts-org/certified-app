"use client"

import { memo, useState } from "react"
import { Inbox, ThumbsUp, X, type LucideIcon } from "lucide-react"
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
import EndorsementSubjectRow, {
  type EndorsementSubjectRowClasses,
} from "@/components/endorsements/endorsement-subject-row"
import LoadingSpinner from "@/components/ui/loading-spinner"
import PersonCard from "@/components/profile/person-card"
import Tooltip from "@/components/ui/tooltip"

// Presentational views below ProfileEndorsements' fold: the Received /
// Given grids and lists, their cards and rows, the bulk-action bar, and
// the pure filter + sort helpers. All state lives in the parent — every
// unit here receives data plus stable callbacks via props.

export type SortKey =
  | "created-desc"
  | "created-asc"
  | "alpha-asc"
  | "alpha-desc"

export type ResponseFilterKey = "hide-rejected" | "only-rejected" | "show-all"

// ----------------------------- Received -----------------------------

interface ReceivedGridProps {
  /** Already filtered + sorted by the parent (`visibleReceived`); the
   *  grid renders it directly instead of recomputing the sort. */
  visible: ReceivedEndorsement[]
  /** Size of the pre-search set — drives the "No endorsements yet" vs
   *  "No matches" empty-state split. */
  total: number
  isLoading: boolean
  error: string | null
  viewerIsOwner: boolean
  viewerDid: string | null
  /** Group DID when acting AS this group — accept/reject responses route
   *  to the group's repo. Undefined for personal responses. */
  targetDid?: string
  /** Active response filter — used by the empty-state copy so a
   *  zero-results "Show only rejected" view says "No rejected
   *  endorsements yet" instead of the generic "No endorsements
   *  yet." */
  responseFilter: ResponseFilterKey
  resolve: ReturnType<typeof useOwnResponseStates>["resolve"]
  allResponses: ReturnType<typeof useOwnResponseStates>["responses"]
  onAfterWrite: () => void | Promise<void>
}

export function ReceivedGrid({
  visible,
  total,
  isLoading,
  error,
  viewerIsOwner,
  viewerDid,
  targetDid,
  responseFilter,
  resolve,
  allResponses,
  onAfterWrite,
}: ReceivedGridProps) {
  if (isLoading) {
    return (
      <div className="profile-endorsements-v2__loading">
        <LoadingSpinner size="md" />
      </div>
    )
  }
  if (error) {
    return (
      <div className="profile-endorsements-v2__grid">
        <EmptyState
          icon={Inbox}
          title="Couldn’t load endorsements"
          description={error}
        />
      </div>
    )
  }
  if (visible.length === 0) {
    // Three empty-state cases:
    //   1. The "Show only rejected" filter is active with no matches
    //      — phrase the empty state in terms of the filter so the
    //      user knows nothing is missing, the filter just has no
    //      hits yet.
    //   2. There's a search query / sort filter but the pre-filter
    //      set is non-empty — "No matches."
    //   3. The user has zero endorsements total — the generic
    //      "No endorsements yet" CTA.
    const onlyRejectedActive = responseFilter === "only-rejected"
    const title = onlyRejectedActive
      ? "No rejected endorsements yet"
      : total === 0
        ? "No endorsements yet"
        : "No matches"
    const description = onlyRejectedActive
      ? "Endorsements you reject will appear here."
      : total === 0
        ? "Endorsements from other people will appear here."
        : "No endorsements match your search."
    return (
      <div className="profile-endorsements-v2__grid">
        <EmptyState icon={ThumbsUp} title={title} description={description} />
      </div>
    )
  }
  return (
    <ul className="profile-endorsements-v2__grid">
      {visible.map((e) => (
        <ReceivedCard
          key={e.uri}
          endorsement={e}
          viewerIsOwner={viewerIsOwner}
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

const ReceivedCard = memo(function ReceivedCard({
  endorsement,
  viewerIsOwner,
  viewerDid,
  targetDid,
  resolve,
  allResponses,
  onAfterWrite,
}: {
  endorsement: ReceivedEndorsement
  viewerIsOwner: boolean
  viewerDid: string | null
  targetDid?: string
  resolve: ReturnType<typeof useOwnResponseStates>["resolve"]
  allResponses: ReturnType<typeof useOwnResponseStates>["responses"]
  onAfterWrite: () => void | Promise<void>
}) {
  const { info, isLoading } = useReceivedIssuerInfo(endorsement)

  return (
    <PersonCard
      did={endorsement.issuerDid}
      info={info}
      isLoadingInfo={isLoading}
      createdAt={endorsement.createdAt}
      note={endorsement.note}
      listTitle={endorsement.listTitle}
      menu={
        viewerIsOwner ? (
          <ResponseMenu
            awardUri={endorsement.uri}
            awardCid={endorsement.cid}
            issuerDisplayName={
              info?.displayName || info?.handle || endorsement.issuerDid
            }
            ownerDid={viewerDid}
            targetDid={targetDid}
            state={resolve(endorsement.uri).state}
            allResponses={allResponses}
            onAfterWrite={onAfterWrite}
          />
        ) : null
      }
    />
  )
})

// ------------------------------ Given -------------------------------

interface GivenGridProps {
  /** Already filtered + sorted by the parent (`visibleGiven`); the grid
   *  renders it directly instead of recomputing the sort. */
  visible: GivenEndorsement[]
  /** Size of the pre-search set — drives the "No endorsements given yet"
   *  vs "No matches" empty-state split. */
  total: number
  isLoading: boolean
  error: string | null
  /** True when the profile being viewed is the signed-in user's
   *  own profile — i.e. the cards represent endorsements THEY
   *  issued. Controls whether the per-card revoke `×` renders. */
  viewerIsOwner: boolean
  viewerDid: string | null
  /** Group DID when the viewer is acting AS this group — revokes route
   *  to the group repo. Undefined for personal revokes. */
  targetDid?: string
  onAfterRevoke: () => void | Promise<void>
}

export function GivenGrid({
  visible,
  total,
  isLoading,
  error,
  viewerIsOwner,
  viewerDid,
  targetDid,
  onAfterRevoke,
}: GivenGridProps) {
  if (isLoading) {
    return (
      <div className="profile-endorsements-v2__loading">
        <LoadingSpinner size="md" />
      </div>
    )
  }
  if (error) {
    return (
      <div className="profile-endorsements-v2__grid">
        <EmptyState
          icon={Inbox}
          title="Couldn’t load endorsements"
          description={error}
        />
      </div>
    )
  }
  if (visible.length === 0) {
    return (
      <div className="profile-endorsements-v2__grid">
        <EmptyState
          icon={ThumbsUp}
          title={total === 0 ? "No endorsements given yet" : "No matches"}
          description={
            total === 0
              ? "Endorsements this user gives to others will appear here."
              : "No endorsements match your search."
          }
        />
      </div>
    )
  }
  return (
    <ul className="profile-endorsements-v2__grid">
      {visible.map((e) => (
        <GivenCard
          key={e.uri}
          endorsement={e}
          canRevoke={viewerIsOwner && !!viewerDid}
          viewerDid={viewerDid}
          targetDid={targetDid}
          onAfterRevoke={onAfterRevoke}
        />
      ))}
    </ul>
  )
}

const GivenCard = memo(function GivenCard({
  endorsement,
  canRevoke,
  viewerDid,
  targetDid,
  onAfterRevoke,
}: {
  endorsement: GivenEndorsement
  canRevoke: boolean
  viewerDid: string | null
  targetDid?: string
  onAfterRevoke: () => void | Promise<void>
}) {
  const { info, isLoading } = useAuthorInfo(endorsement.subjectDid)
  return (
    <PersonCard
      did={endorsement.subjectDid}
      info={info}
      isLoadingInfo={isLoading}
      createdAt={endorsement.createdAt}
      note={endorsement.note}
      listTitle={endorsement.listTitle}
      menu={
        canRevoke && viewerDid ? (
          <RevokeGivenButton
            viewerDid={viewerDid}
            rkeys={endorsement.rkeys}
            targetDid={targetDid}
            subjectDisplay={
              info?.displayName || info?.handle || endorsement.subjectDid
            }
            onAfterRevoke={onAfterRevoke}
          />
        ) : null
      }
    />
  )
})

/**
 * Small `×` revoke affordance shown on the owner's Given grid.
 * Click → ConfirmDialog ("Revoke endorsement?") → on confirm,
 * `deleteEndorsementAward` runs and the parent's `onAfterRevoke`
 * refetches the Given list so the card disappears.
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
      <Tooltip label="Revoke endorsement">
        <button
          type="button"
          className="profile-endorsements-v2__given-revoke"
          onClick={(e) => {
            // PersonCard's outer Link otherwise catches the click and
            // navigates to the subject's profile.
            e.preventDefault()
            e.stopPropagation()
            setConfirmOpen(true)
          }}
          aria-label={`Revoke endorsement of ${subjectDisplay}`}
        >
          <X size={14} strokeWidth={2} aria-hidden />
        </button>
      </Tooltip>
      {confirmOpen ? (
        <ConfirmDialog
          title={`Revoke endorsement of ${subjectDisplay}?`}
          message="Your endorsement will be removed from this profile. You can endorse them again later."
          confirmLabel="Revoke"
          cancelLabel="Keep endorsement"
          confirmVariant="destructive"
          isConfirming={isRevoking}
          onConfirm={handleConfirm}
          onCancel={() => !isRevoking && setConfirmOpen(false)}
        />
      ) : null}
      {error ? (
        <span className="profile-endorsements-v2__endorse-error" role="alert">
          {error}
        </span>
      ) : null}
    </>
  )
}

// ----------------------- List view + bulk select -----------------------

/**
 * Compose the issuer's AuthorInfo from the indexer's denormalised block,
 * filling gaps via `useAuthorInfo`. The indexer's `issuer` join can carry
 * a handle WITHOUT a displayName/avatar (certified-only orgs have no
 * bsky-profile join), so we only skip the per-row resolve when the
 * indexer block is complete. Shared by the received card + list row.
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

/** Select-all + bulk-action strip shown above the list view for owners. */
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
    <div
      className="profile-endorsements-v2__bulk-bar"
      role="toolbar"
      aria-label="Bulk actions"
    >
      <Checkbox
        checked={allSelected}
        indeterminate={!allSelected && selectedCount > 0}
        onChange={onToggleAll}
        disabled={!anyVisible}
        aria-label={allSelected ? "Deselect all" : "Select all"}
        label={selectedCount > 0 ? `${selectedCount} selected` : "Select all"}
      />
      <div className="profile-endorsements-v2__bulk-actions">
        {error ? (
          <span className="profile-endorsements-v2__bulk-error" role="alert">
            {error}
          </span>
        ) : null}
        <Button
          variant="destructive"
          size="sm"
          onClick={onAction}
          disabled={selectedCount === 0 || busy}
        >
          <ActionIcon size={14} strokeWidth={1.75} aria-hidden />
          {actionLabel}
          {selectedCount > 0 ? ` (${selectedCount})` : ""}
        </Button>
      </div>
    </div>
  )
}

/** BEM skin the shared subject row wears in the compact list view.
 *  Used by both Given and Received rows. */
const V2_ROW_CLASSES: EndorsementSubjectRowClasses = {
  main: "profile-endorsements-v2__row-main",
  meta: "profile-endorsements-v2__row-text",
  name: "profile-endorsements-v2__row-name",
  handle: "profile-endorsements-v2__row-handle",
  note: "profile-endorsements-v2__row-note",
  date: "profile-endorsements-v2__row-date",
}

export function GivenList({
  visible,
  total,
  isLoading,
  error,
  viewerIsOwner,
  viewerDid,
  targetDid,
  selectable,
  selected,
  onToggleOne,
  onAfterRevoke,
}: {
  visible: GivenEndorsement[]
  total: number
  isLoading: boolean
  error: string | null
  viewerIsOwner: boolean
  viewerDid: string | null
  targetDid?: string
  selectable: boolean
  selected: Set<string>
  onToggleOne: (uri: string) => void
  onAfterRevoke: () => void | Promise<void>
}) {
  if (isLoading) {
    return (
      <div className="profile-endorsements-v2__loading">
        <LoadingSpinner size="md" />
      </div>
    )
  }
  if (error) {
    return (
      <EmptyState icon={Inbox} title="Couldn’t load endorsements" description={error} />
    )
  }
  if (visible.length === 0) {
    return (
      <EmptyState
        icon={ThumbsUp}
        title={total === 0 ? "No endorsements given yet" : "No matches"}
        description={
          total === 0
            ? "Endorsements this user gives to others will appear here."
            : "No endorsements match your search."
        }
      />
    )
  }
  return (
    <ul className="profile-endorsements-v2__list">
      {visible.map((e) => (
        <GivenListRow
          key={e.uri}
          endorsement={e}
          selectable={selectable}
          selected={selected.has(e.uri)}
          onToggleOne={onToggleOne}
          canRevoke={viewerIsOwner && !!viewerDid}
          viewerDid={viewerDid}
          targetDid={targetDid}
          onAfterRevoke={onAfterRevoke}
        />
      ))}
    </ul>
  )
}

const GivenListRow = memo(function GivenListRow({
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
    <li className="profile-endorsements-v2__row" data-selected={selected || undefined}>
      {selectable ? (
        <Checkbox
          className="profile-endorsements-v2__row-check"
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
        classes={V2_ROW_CLASSES}
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

export function ReceivedList({
  visible,
  total,
  isLoading,
  error,
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
}: {
  visible: ReceivedEndorsement[]
  total: number
  isLoading: boolean
  error: string | null
  responseFilter: ResponseFilterKey
  viewerIsOwner: boolean
  viewerDid: string | null
  targetDid?: string
  resolve: ReturnType<typeof useOwnResponseStates>["resolve"]
  allResponses: ReturnType<typeof useOwnResponseStates>["responses"]
  selectable: boolean
  selected: Set<string>
  onToggleOne: (uri: string) => void
  onAfterWrite: () => void | Promise<void>
}) {
  if (isLoading) {
    return (
      <div className="profile-endorsements-v2__loading">
        <LoadingSpinner size="md" />
      </div>
    )
  }
  if (error) {
    return (
      <EmptyState icon={Inbox} title="Couldn’t load endorsements" description={error} />
    )
  }
  if (visible.length === 0) {
    const onlyRejectedActive = responseFilter === "only-rejected"
    return (
      <EmptyState
        icon={ThumbsUp}
        title={
          onlyRejectedActive
            ? "No rejected endorsements yet"
            : total === 0
              ? "No endorsements yet"
              : "No matches"
        }
        description={
          onlyRejectedActive
            ? "Endorsements you reject will appear here."
            : total === 0
              ? "Endorsements from other people will appear here."
              : "No endorsements match your search."
        }
      />
    )
  }
  return (
    <ul className="profile-endorsements-v2__list">
      {visible.map((e) => (
        <ReceivedListRow
          key={e.uri}
          endorsement={e}
          selectable={selectable}
          selected={selected.has(e.uri)}
          onToggleOne={onToggleOne}
          viewerIsOwner={viewerIsOwner}
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

const ReceivedListRow = memo(function ReceivedListRow({
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
      className="profile-endorsements-v2__row"
      data-selected={selected || undefined}
      data-state={resolve(endorsement.uri).state}
    >
      {selectable ? (
        <Checkbox
          className="profile-endorsements-v2__row-check"
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
        classes={V2_ROW_CLASSES}
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
