"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Plus } from "lucide-react"
import { useAuth } from "@/lib/auth/auth-context"
import { usePageTitle } from "@/lib/navbar-context"
import { useGivenEndorsements } from "@/hooks/use-endorsements"
import { useReceivedEndorsements, type ReceivedEndorsement } from "@/hooks/use-received-endorsements"
import { useOwnResponseStates } from "@/hooks/use-own-response-states"
import { useAuthorInfo } from "@/hooks/use-author-info"
import { deleteEndorsementAward } from "@/lib/atproto/badges"
import ResponseMenu from "@/components/badges/response-menu"
import EndorsementRow from "@/components/endorsements/endorsement-row"
import NewEndorsementPanel from "@/components/endorsements/new-endorsement-panel"
import ConfirmDialog from "@/components/ui/confirm-dialog"
import Avatar from "@/components/ui/avatar"
import LoadingSpinner from "@/components/ui/loading-spinner"
import ErrorMessage from "@/components/ui/error-message"
import { formatShortDate } from "@/lib/utils/format-date"
import { getInitials } from "@/lib/utils/initials"

type TabKey = "received" | "given"

interface GivenEndorsementsListProps {
  readonly endorsements: ReturnType<typeof useGivenEndorsements>["endorsements"]
  readonly isLoading: boolean
  readonly error: string | null
  readonly revokeError: string | null
  readonly revokingRkey: string | null
  readonly onRevoke: (rkey: string) => void
}

function GivenEndorsementsList({
  endorsements,
  isLoading,
  error,
  revokeError,
  revokingRkey,
  onRevoke,
}: GivenEndorsementsListProps) {
  if (isLoading) {
    return (
      <>
        {revokeError ? <ErrorMessage message={revokeError} /> : null}
        <div className="endorsements-loading">
          <LoadingSpinner size="md" />
        </div>
      </>
    )
  }

  if (error) {
    return (
      <>
        {revokeError ? <ErrorMessage message={revokeError} /> : null}
        <ErrorMessage message={error} />
      </>
    )
  }

  if (endorsements.length === 0) {
    return (
      <>
        {revokeError ? <ErrorMessage message={revokeError} /> : null}
        <p className="endorsements-empty">No endorsements yet.</p>
      </>
    )
  }

  return (
    <>
      {revokeError ? <ErrorMessage message={revokeError} /> : null}
      <ul className="endorsements-list">
        {endorsements.map((e) => (
          <EndorsementRow
            key={e.uri}
            subjectDid={e.subjectDid}
            createdAt={e.createdAt}
            note={e.note}
            onRevoke={() => onRevoke(e.rkey)}
            isRevoking={revokingRkey === e.rkey}
          />
        ))}
      </ul>
    </>
  )
}

/** One row in the "Received" list: issuer, optional note, date, and
 *  the kebab menu for accept/reject/reset. The /endorsements page
 *  is always the viewer's OWN inbox, so the menu always shows. */
function ReceivedRow({
  endorsement,
  ownerDid,
  state,
  allResponses,
  onAfterWrite,
}: {
  endorsement: ReceivedEndorsement
  ownerDid: string | null
  state: ReturnType<ReturnType<typeof useOwnResponseStates>["resolve"]>["state"]
  allResponses: ReturnType<typeof useOwnResponseStates>["responses"]
  onAfterWrite: () => void | Promise<void>
}) {
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
          <Avatar size="md" src={info?.avatarUrl || undefined} alt="" fallbackInitials={initials} />
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
      <ResponseMenu
        awardUri={endorsement.uri}
        awardCid={endorsement.cid}
        issuerDisplayName={displayName}
        ownerDid={ownerDid}
        state={state}
        allResponses={allResponses}
        onAfterWrite={onAfterWrite}
      />
    </li>
  )
}

function ReceivedEndorsementsList() {
  const { did } = useAuth()
  const { endorsements, isLoading, error } = useReceivedEndorsements(did)
  const ownStates = useOwnResponseStates()

  if (isLoading) {
    return (
      <div className="endorsements-loading">
        <LoadingSpinner size="md" />
      </div>
    )
  }
  if (error) return <ErrorMessage message={error} />
  if (endorsements.length === 0) {
    return (
      <p className="endorsements-empty">
        You haven&apos;t received any endorsements yet.
      </p>
    )
  }

  const handleAfterWrite = async () => {
    ownStates.invalidate()
    await ownStates.refetch()
  }

  return (
    <ul className="endorsements-list">
      {endorsements.map((e) => (
        <ReceivedRow
          key={e.uri}
          endorsement={e}
          ownerDid={did}
          state={ownStates.resolve(e.uri).state}
          allResponses={ownStates.responses}
          onAfterWrite={handleAfterWrite}
        />
      ))}
    </ul>
  )
}

const TABS: { key: TabKey; label: string }[] = [
  { key: "received", label: "Received" },
  { key: "given", label: "Given" },
]

export default function EndorsementsPage() {
  usePageTitle("Endorsements")
  const { did } = useAuth()

  const [activeTab, setActiveTab] = useState<TabKey>("given")
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  const [initialDids, setInitialDids] = useState<readonly string[]>([])
  const [confirmRkey, setConfirmRkey] = useState<string | null>(null)
  const [revokingRkey, setRevokingRkey] = useState<string | null>(null)
  const [revokeError, setRevokeError] = useState<string | null>(null)

  const { endorsements, isLoading, error, refetch } = useGivenEndorsements(did)

  const existingSubjectDids = useMemo(
    () => new Set(endorsements.map((e) => e.subjectDid)),
    [endorsements]
  )

  // Deep-link: `/endorsements?endorse=did:plc:...` from a profile page
  // opens the panel with that DID pre-selected. Wait until the given-
  // list has loaded so the duplicate guard is honored, then consume
  // the param once and clean the URL.
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const [consumedDeepLink, setConsumedDeepLink] = useState(false)
  useEffect(() => {
    if (consumedDeepLink) return
    if (isLoading) return
    const endorseDid = searchParams?.get("endorse")
    if (!did || !endorseDid) {
      setConsumedDeepLink(true)
      return
    }
    const isUsable =
      endorseDid.startsWith("did:") &&
      endorseDid !== did &&
      !existingSubjectDids.has(endorseDid)
    if (isUsable) {
      setInitialDids([endorseDid])
      setActiveTab("given")
      setIsPanelOpen(true)
    }
    router.replace(pathname, { scroll: false })
    setConsumedDeepLink(true)
  }, [consumedDeepLink, isLoading, did, searchParams, existingSubjectDids, router, pathname])

  const handleConfirmRevoke = useCallback(async () => {
    if (!did || !confirmRkey) return
    const rkey = confirmRkey
    setRevokingRkey(rkey)
    setRevokeError(null)
    try {
      await deleteEndorsementAward(did, rkey)
      await refetch()
      setConfirmRkey(null)
    } catch (err) {
      setRevokeError(
        err instanceof Error ? err.message : "Failed to revoke endorsement"
      )
    } finally {
      setRevokingRkey(null)
    }
  }, [did, confirmRkey, refetch])

  return (
    <div className="dashboard">
      <div className="dashboard__body dashboard__body--single">
        <div className="dashboard__main">
          <div className="endorsements-tabs-bar">
            <div
              className="endorsements-tabs"
              role="tablist"
              aria-label="Endorsements"
            >
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  id={`tab-${tab.key}`}
                  aria-selected={activeTab === tab.key}
                  aria-controls={`tabpanel-${tab.key}`}
                  className={`endorsements-tabs__tab ${
                    activeTab === tab.key ? "endorsements-tabs__tab--active" : ""
                  }`}
                  onClick={() => setActiveTab(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activeTab === "given" && !isPanelOpen ? (
              <button
                type="button"
                className="endorsements-new-btn"
                onClick={() => setIsPanelOpen(true)}
                disabled={!did}
                aria-label="New endorsement"
              >
                <Plus size={16} />
                <span>New</span>
              </button>
            ) : null}
          </div>

          {activeTab === "received" ? (
            <div role="tabpanel" id="tabpanel-received" aria-labelledby="tab-received">
              <ReceivedEndorsementsList />
            </div>
          ) : (
            <div role="tabpanel" id="tabpanel-given" aria-labelledby="tab-given">
              {did && isPanelOpen ? (
                <NewEndorsementPanel
                  ownDid={did}
                  existingSubjectDids={existingSubjectDids}
                  initialDids={initialDids}
                  onClose={() => {
                    setIsPanelOpen(false)
                    setInitialDids([])
                  }}
                  onCreated={refetch}
                />
              ) : null}
              <GivenEndorsementsList
                endorsements={endorsements}
                isLoading={isLoading}
                error={error}
                revokeError={revokeError}
                revokingRkey={revokingRkey}
                onRevoke={setConfirmRkey}
              />
            </div>
          )}
        </div>
      </div>


      {confirmRkey ? (
        <ConfirmDialog
          title="Revoke endorsement"
          message="Do you really want to delete this endorsement?"
          confirmLabel="Revoke"
          isConfirming={revokingRkey === confirmRkey}
          onCancel={() => {
            if (revokingRkey === confirmRkey) return
            setConfirmRkey(null)
          }}
          onConfirm={handleConfirmRevoke}
        />
      ) : null}
    </div>
  )
}
