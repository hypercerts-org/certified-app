"use client"

import { useCallback, useMemo, useState } from "react"
import Link from "next/link"
import { Plus } from "lucide-react"
import { useAuth } from "@/lib/auth/auth-context"
import { usePageTitle } from "@/lib/navbar-context"
import { useGivenEndorsements } from "@/hooks/use-endorsements"
import { useTrustedEndorsedDids, type EvaluatorAttribution } from "@/hooks/use-trusted-endorsed-dids"
import { useAuthorInfo } from "@/hooks/use-author-info"
import { ALL_EVALUATOR_DIDS, ALL_EVALUATORS_STABLE_KEY } from "@/config/trusted-evaluators"
import { deleteEndorsement } from "@/lib/atproto/endorsements"
import EndorsementRow from "@/components/endorsements/endorsement-row"
import NewEndorsementModal from "@/components/endorsements/new-endorsement-modal"
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
            subjectDid={e.value.subject.did}
            createdAt={e.value.createdAt}
            onRevoke={() => onRevoke(e.rkey)}
            isRevoking={revokingRkey === e.rkey}
          />
        ))}
      </ul>
    </>
  )
}

/** Single endorser chip shown under each endorsed user in the received list. */
function EndorserChip({ evaluatorDid, createdAt }: EvaluatorAttribution) {
  const { info, isLoading } = useAuthorInfo(evaluatorDid)
  const displayName = info?.displayName || info?.handle || evaluatorDid
  const initials = getInitials(info?.displayName, evaluatorDid)
  const href = `/profile/${encodeURIComponent(info?.handle || evaluatorDid)}`

  return (
    <Link href={href} className="endorser-chip" title={`Endorsed ${formatShortDate(createdAt)}`}>
      {isLoading && !info ? (
        <div className="endorsement-row__avatar-skel" style={{ width: 24, height: 24 }} aria-hidden="true" />
      ) : (
        <Avatar size="sm" src={info?.avatarUrl || undefined} alt="" fallbackInitials={initials} />
      )}
      <span className="endorser-chip__name">{displayName}</span>
      <time dateTime={createdAt} className="endorser-chip__date">
        {formatShortDate(createdAt)}
      </time>
    </Link>
  )
}

/** A single endorsed user with their list of endorsers. */
function ReceivedEndorsementCard({
  subjectDid,
  attributions,
}: {
  readonly subjectDid: string
  readonly attributions: EvaluatorAttribution[]
}) {
  const { info, isLoading } = useAuthorInfo(subjectDid)
  const displayName = info?.displayName || info?.handle || subjectDid
  const handle = info?.handle && info.handle !== info.did ? info.handle : null
  const initials = getInitials(info?.displayName, subjectDid)
  const href = `/profile/${encodeURIComponent(info?.handle || subjectDid)}`

  return (
    <li className="received-endorsement-card">
      <Link href={href} className="endorsement-row__main">
        {isLoading && !info ? (
          <div className="endorsement-row__avatar-skel" aria-hidden="true" />
        ) : (
          <Avatar size="md" src={info?.avatarUrl || undefined} alt="" fallbackInitials={initials} />
        )}
        <div className="endorsement-row__meta">
          <span className="endorsement-row__name">{displayName}</span>
          {handle ? <span className="endorsement-row__handle">@{handle}</span> : null}
        </div>
      </Link>
      <div className="received-endorsement-card__endorsers">
        {attributions.map((attr) => (
          <EndorserChip key={attr.evaluatorDid} {...attr} />
        ))}
      </div>
    </li>
  )
}

function ReceivedEndorsementsList() {
  const { did } = useAuth()
  const { attribution, isLoading, error } = useTrustedEndorsedDids(ALL_EVALUATOR_DIDS, ALL_EVALUATORS_STABLE_KEY)

  // Show only endorsements the current user received.
  const entries = useMemo(() => {
    if (!did) return []
    const attrs = attribution.get(did)
    if (!attrs || attrs.length === 0) return []
    return [{ did, attributions: attrs }]
  }, [attribution, did])

  if (isLoading) {
    return (
      <div className="endorsements-loading">
        <LoadingSpinner size="md" />
      </div>
    )
  }

  if (error) {
    return <ErrorMessage message={error} />
  }

  if (entries.length === 0) {
    return <p className="endorsements-empty">You haven&apos;t received any endorsements from trusted evaluators yet.</p>
  }

  const myAttributions = entries[0]?.attributions ?? []

  return (
    <ul className="endorsements-list">
      {myAttributions.map((attr) => (
        <li key={attr.evaluatorDid} className="received-endorsement-card">
          <EndorserChip {...attr} />
        </li>
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
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [confirmRkey, setConfirmRkey] = useState<string | null>(null)
  const [revokingRkey, setRevokingRkey] = useState<string | null>(null)
  const [revokeError, setRevokeError] = useState<string | null>(null)

  const { endorsements, isLoading, error, refetch } = useGivenEndorsements(did)

  const existingSubjectDids = useMemo(
    () => new Set(endorsements.map((e) => e.value.subject.did)),
    [endorsements]
  )

  const handleConfirmRevoke = useCallback(async () => {
    if (!did || !confirmRkey) return
    const rkey = confirmRkey
    setRevokingRkey(rkey)
    setRevokeError(null)
    try {
      await deleteEndorsement(did, rkey)
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

            {activeTab === "given" ? (
              <button
                type="button"
                className="endorsements-new-btn"
                onClick={() => setIsModalOpen(true)}
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

      {isModalOpen && did ? (
        <NewEndorsementModal
          ownDid={did}
          existingSubjectDids={existingSubjectDids}
          onClose={() => setIsModalOpen(false)}
          onCreated={refetch}
        />
      ) : null}

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
