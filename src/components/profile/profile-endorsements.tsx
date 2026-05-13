"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ChevronLeft, ChevronRight, ThumbsUp } from "lucide-react"
import { useGivenEndorsements, type GivenEndorsement } from "@/hooks/use-endorsements"
import { useReceivedEndorsements, type ReceivedEndorsement } from "@/hooks/use-received-endorsements"
import { useOwnResponseStates } from "@/hooks/use-own-response-states"
import { useAuthorInfo } from "@/hooks/use-author-info"
import { useAuth } from "@/lib/auth/auth-context"
import EndorsementRow from "@/components/endorsements/endorsement-row"
import ResponseMenu from "@/components/badges/response-menu"
import Avatar from "@/components/ui/avatar"
import LoadingSpinner from "@/components/ui/loading-spinner"
import { formatShortDate } from "@/lib/utils/format-date"
import { getInitials } from "@/lib/utils/initials"

/** How many endorsement rows render per page in each section. */
const PAGE_SIZE = 10

interface ProfileEndorsementsProps {
  /** DID of the profile being viewed. */
  readonly did: string
}

/**
 * Endorsements tab content on a user profile page.
 *
 * Read paths:
 *   - "Endorsements received" — runs the cross-network scan via
 *     useReceivedEndorsements (PDS fan-out per known issuer until
 *     the indexer exposes a `subjectDid` filter on badge awards).
 *   - "Endorsements given" — direct PDS listRecords on the profile
 *     user's own repo via useGivenEndorsements.
 *
 * Trust model: every user owns their own endorsement badge
 * definition, so the surface shows *all* badge.award records that
 * target the profile DID. No global trusted-evaluator allowlist.
 */
export default function ProfileEndorsements({ did }: ProfileEndorsementsProps) {
  const { did: viewerDid } = useAuth()
  const viewerIsOwner = !!viewerDid && viewerDid === did

  const given = useGivenEndorsements(did)
  const received = useReceivedEndorsements(did)

  // Owner-only response state. The hook is keyed on the viewer's
  // own DID via useAuth, so we only get response data for our own
  // profile — never leak per-row state for someone else's profile.
  const ownStates = useOwnResponseStates()

  const receivedReady = !received.isLoading && !received.error
  const givenReady = !given.isLoading && !given.error

  // Show the Endorse shortcut only on someone else's profile, and only
  // when the viewer is signed in (the destination flow requires auth
  // anyway). Pre-fills `?endorse=<did>` so /endorsements pops open the
  // panel with this profile pre-selected.
  const showEndorseBtn = !!viewerDid && !viewerIsOwner

  return (
    <div className="profile-endorsements">
      <section className="profile-endorsements__section">
        <div className="profile-endorsements__heading-row">
          <h3 className="profile-endorsements__heading">
            Endorsements received
            {receivedReady && received.endorsements.length > 0 ? (
              <span className="profile-endorsements__count">
                {received.endorsements.length}
              </span>
            ) : null}
          </h3>
          {showEndorseBtn ? (
            <Link
              href={`/endorsements?endorse=${encodeURIComponent(did)}`}
              className="profile-endorsements__endorse-btn"
            >
              <ThumbsUp size={14} aria-hidden="true" />
              <span>Endorse</span>
            </Link>
          ) : null}
        </div>
        <ReceivedBody
          {...received}
          viewerIsOwner={viewerIsOwner}
          resolve={ownStates.resolve}
          allResponses={ownStates.responses}
          onAfterWrite={async () => {
            ownStates.invalidate()
            await ownStates.refetch()
          }}
        />
      </section>

      <section className="profile-endorsements__section">
        <h3 className="profile-endorsements__heading">
          Endorsements given
          {givenReady && given.endorsements.length > 0 ? (
            <span className="profile-endorsements__count">
              {given.endorsements.length}
            </span>
          ) : null}
        </h3>
        <GivenBody
          isLoading={given.isLoading}
          error={given.error}
          endorsements={given.endorsements}
        />
      </section>
    </div>
  )
}

/**
 * Generic pagination state for a list-of-N rendered PAGE_SIZE rows
 * at a time. Clamps the current page if `total` shrinks (e.g. owner
 * revokes a row, leaving the previous last page empty). Resets to
 * page 1 when `resetKey` changes — useful when the underlying list
 * is replaced (different profile, new fetch).
 */
function usePagination(total: number, resetKey: string) {
  const [page, setPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  useEffect(() => {
    setPage(1)
  }, [resetKey])

  // Clamp on every render — total can shrink between renders without
  // resetKey changing (e.g. response-state filter hides a row).
  const clampedPage = Math.min(page, totalPages)
  if (clampedPage !== page) {
    // Defer to avoid setState-in-render.
    queueMicrotask(() => setPage(clampedPage))
  }

  const sliceStart = (clampedPage - 1) * PAGE_SIZE
  const sliceEnd = sliceStart + PAGE_SIZE
  return {
    page: clampedPage,
    totalPages,
    sliceStart,
    sliceEnd,
    setPage,
  }
}

interface PaginationControlsProps {
  readonly page: number
  readonly totalPages: number
  readonly onPageChange: (next: number) => void
  readonly label: string
}

function PaginationControls({
  page,
  totalPages,
  onPageChange,
  label,
}: PaginationControlsProps) {
  if (totalPages <= 1) return null
  return (
    <nav className="profile-endorsements__pagination" aria-label={label}>
      <button
        type="button"
        className="profile-endorsements__pagination-btn"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        aria-label="Previous page"
      >
        <ChevronLeft size={14} aria-hidden="true" />
        <span>Previous</span>
      </button>
      <span className="profile-endorsements__pagination-status">
        Page {page} of {totalPages}
      </span>
      <button
        type="button"
        className="profile-endorsements__pagination-btn"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        aria-label="Next page"
      >
        <span>Next</span>
        <ChevronRight size={14} aria-hidden="true" />
      </button>
    </nav>
  )
}

interface ReceivedBodyProps {
  isLoading: boolean
  error: string | null
  endorsements: ReceivedEndorsement[]
  viewerIsOwner: boolean
  resolve: ReturnType<typeof useOwnResponseStates>["resolve"]
  allResponses: ReturnType<typeof useOwnResponseStates>["responses"]
  onAfterWrite: () => void | Promise<void>
}

function ReceivedBody({
  isLoading,
  error,
  endorsements,
  viewerIsOwner,
  resolve,
  allResponses,
  onAfterWrite,
}: ReceivedBodyProps) {
  // Reset to page 1 when the first row's URI changes — that signals a
  // brand-new fetch (different profile or substantial reshuffle).
  const resetKey = endorsements[0]?.uri ?? "empty"
  const { page, totalPages, sliceStart, sliceEnd, setPage } = usePagination(
    endorsements.length,
    resetKey,
  )
  const visible = useMemo(
    () => endorsements.slice(sliceStart, sliceEnd),
    [endorsements, sliceStart, sliceEnd],
  )

  if (isLoading) {
    return (
      <div className="profile-endorsements__loading">
        <LoadingSpinner size="md" />
      </div>
    )
  }
  if (error) {
    return (
      <p className="profile-endorsements__placeholder">
        Couldn&rsquo;t load endorsements: {error}
      </p>
    )
  }
  if (endorsements.length === 0) {
    return (
      <p className="profile-endorsements__placeholder">
        This user hasn&rsquo;t been endorsed yet.
      </p>
    )
  }
  return (
    <>
      <ul className="endorsements-list">
        {visible.map((e) => (
          <ReceivedRow
            key={e.uri}
            endorsement={e}
            viewerIsOwner={viewerIsOwner}
            resolve={resolve}
            allResponses={allResponses}
            onAfterWrite={onAfterWrite}
          />
        ))}
      </ul>
      <PaginationControls
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        label="Endorsements received pagination"
      />
    </>
  )
}

interface GivenBodyProps {
  isLoading: boolean
  error: string | null
  endorsements: GivenEndorsement[]
}

function GivenBody({ isLoading, error, endorsements }: GivenBodyProps) {
  const resetKey = endorsements[0]?.uri ?? "empty"
  const { page, totalPages, sliceStart, sliceEnd, setPage } = usePagination(
    endorsements.length,
    resetKey,
  )
  const visible = useMemo(
    () => endorsements.slice(sliceStart, sliceEnd),
    [endorsements, sliceStart, sliceEnd],
  )

  if (isLoading) {
    return (
      <div className="profile-endorsements__loading">
        <LoadingSpinner size="md" />
      </div>
    )
  }
  if (error) {
    return (
      <p className="profile-endorsements__placeholder">
        Couldn&rsquo;t load endorsements: {error}
      </p>
    )
  }
  if (endorsements.length === 0) {
    return (
      <p className="profile-endorsements__placeholder">
        This user hasn&rsquo;t endorsed anyone yet.
      </p>
    )
  }
  return (
    <>
      <ul className="endorsements-list">
        {visible.map((e) => (
          <EndorsementRow
            key={e.uri}
            subjectDid={e.subjectDid}
            createdAt={e.createdAt}
            note={e.note}
          />
        ))}
      </ul>
      <PaginationControls
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        label="Endorsements given pagination"
      />
    </>
  )
}

/** A row in "Endorsements received": shows the issuer (avatar + name
 *  + handle), the note if any, and the date. When the viewer owns
 *  the profile, the row also gets a kebab menu for hide/show/reset
 *  per the badge.response flow. */
function ReceivedRow({
  endorsement,
  viewerIsOwner,
  resolve,
  allResponses,
  onAfterWrite,
}: {
  endorsement: ReceivedEndorsement
  viewerIsOwner: boolean
  resolve: ReturnType<typeof useOwnResponseStates>["resolve"]
  allResponses: ReturnType<typeof useOwnResponseStates>["responses"]
  onAfterWrite: () => void | Promise<void>
}) {
  const { did: viewerDid } = useAuth()
  const { info, isLoading } = useAuthorInfo(endorsement.issuerDid)
  const displayName = info?.displayName || info?.handle || endorsement.issuerDid
  const handle = info?.handle && info.handle !== info.did ? info.handle : null
  const initials = getInitials(info?.displayName, endorsement.issuerDid)
  const href = `/profile/${encodeURIComponent(info?.handle || endorsement.issuerDid)}`

  return (
    <li className="endorsement-row">
      <Link href={href} className="endorsement-row__main">
        {isLoading && !info ? (
          <div className="endorsement-row__avatar-skel" aria-hidden="true" />
        ) : (
          <Avatar
            size="md"
            src={info?.avatarUrl || undefined}
            alt=""
            fallbackInitials={initials}
          />
        )}
        <div className="endorsement-row__meta">
          <span className="endorsement-row__name">{displayName}</span>
          {handle ? <span className="endorsement-row__handle">@{handle}</span> : null}
          {endorsement.note ? (
            <span className="endorsement-row__note">{endorsement.note}</span>
          ) : null}
        </div>
      </Link>
      <time
        dateTime={endorsement.createdAt}
        className="endorsement-row__date"
        title={new Date(endorsement.createdAt).toLocaleString()}
      >
        {formatShortDate(endorsement.createdAt)}
      </time>
      {viewerIsOwner ? (
        <ResponseMenu
          awardUri={endorsement.uri}
          awardCid={endorsement.cid}
          issuerDisplayName={displayName}
          ownerDid={viewerDid}
          state={resolve(endorsement.uri).state}
          allResponses={allResponses}
          onAfterWrite={onAfterWrite}
        />
      ) : null}
    </li>
  )
}
