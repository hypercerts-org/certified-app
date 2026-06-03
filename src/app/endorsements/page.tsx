"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Plus } from "lucide-react"
import { useAuth } from "@/lib/auth/auth-context"
import { useOrg } from "@/lib/groups/org-context"
import { usePageTitle } from "@/lib/navbar-context"
import { useGivenEndorsements } from "@/hooks/use-endorsements"
import { useReceivedEndorsements, type ReceivedEndorsement } from "@/hooks/use-received-endorsements"
import { useOwnResponseStates } from "@/hooks/use-own-response-states"
import { useAuthorInfo } from "@/hooks/use-author-info"
import { deleteEndorsementAward } from "@/lib/atproto/badges"
import ResponseButtons from "@/components/badges/response-buttons"
import EndorsementRow from "@/components/endorsements/endorsement-row"
import NewEndorsementPanel from "@/components/endorsements/new-endorsement-panel"
import ConfirmDialog from "@/components/ui/confirm-dialog"
import { Tabs, TabList, Tab, TabPanel } from "@/components/ui/tabs"
import Avatar from "@/components/ui/avatar"
import LoadingSpinner from "@/components/ui/loading-spinner"
import ErrorMessage from "@/components/ui/error-message"
import Skeleton from "@/components/ui/skeleton"
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
 *  inline Accept / Reject buttons. The /endorsements page is always
 *  the viewer's OWN inbox, so the response controls always show. */
function ReceivedRow({
  endorsement,
  ownerDid,
  state,
  onAfterWrite,
}: {
  endorsement: ReceivedEndorsement
  ownerDid: string | null
  state: ReturnType<ReturnType<typeof useOwnResponseStates>["resolve"]>["state"]
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
          <Skeleton circle animate={false} width={48} height={48} />
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
      <ResponseButtons
        awardUri={endorsement.uri}
        awardCid={endorsement.cid}
        issuerDisplayName={displayName}
        ownerDid={ownerDid}
        state={state}
        labelStyle="accept-reject"
        onAfterWrite={onAfterWrite}
      />
    </li>
  )
}

function ReceivedEndorsementsList() {
  const { did } = useAuth()
  // This page is always the viewer's OWN management inbox (it renders
  // Accept/Reject controls), so opt into seeing rejected awards —
  // otherwise an already-rejected endorsement vanishes with no UI to
  // un-reject it. §22.21 privacy is preserved: foreign viewers never
  // reach this surface, so they never see rejected awards.
  const { endorsements, isLoading, error } = useReceivedEndorsements(did, {
    includeRejected: true,
  })
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
    <>
      <p className="endorsements-hint">
        Endorsements with no response are shown on your profile by default.
        Rejected endorsements are hidden from your profile.
      </p>
      <ul className="endorsements-list">
        {endorsements.map((e) => (
          <ReceivedRow
            key={e.uri}
            endorsement={e}
            ownerDid={did}
            state={ownStates.resolve(e.uri).state}
            onAfterWrite={handleAfterWrite}
          />
        ))}
      </ul>
    </>
  )
}

const TABS: { key: TabKey; label: string }[] = [
  { key: "received", label: "Received" },
  { key: "given", label: "Given" },
]

const DEFAULT_TAB: TabKey = "given"

export default function EndorsementsPage() {
  usePageTitle("Endorsements")
  const { did } = useAuth()
  const { activeOrg } = useOrg()

  // Tab state lives in `?tab=<key>` on the URL so refresh / shared
  // link lands on the same view. The default tab stays bare to keep
  // the URL clean.
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // /endorsements manages your PERSONAL given/received endorsements. While
  // delegated (acting as a group) it's hidden from nav; if reached by a
  // direct URL, bounce to /home so you can't create/revoke/respond on your
  // personal repo while "being" the org. The org's endorsements live on the
  // org's own profile.
  useEffect(() => {
    if (activeOrg) router.replace("/home")
  }, [activeOrg, router])
  const tabFromUrl = useMemo<TabKey>(() => {
    const v = searchParams?.get("tab")
    return v && TABS.some((t) => t.key === v) ? (v as TabKey) : DEFAULT_TAB
  }, [searchParams])
  const [activeTab, setActiveTab] = useState<TabKey>(tabFromUrl)
  // Mirror URL → state on back/forward navigation.
  if (tabFromUrl !== activeTab && TABS.some((t) => t.key === tabFromUrl)) {
    setActiveTab(tabFromUrl)
  }
  const changeTab = useCallback(
    (next: TabKey) => {
      setActiveTab(next)
      const params = new URLSearchParams(searchParams?.toString() ?? "")
      if (next === DEFAULT_TAB) params.delete("tab")
      else params.set("tab", next)
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [router, pathname, searchParams],
  )

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
      changeTab("given")
      setIsPanelOpen(true)
    }
    router.replace(pathname, { scroll: false })
    setConsumedDeepLink(true)
  }, [consumedDeepLink, isLoading, did, searchParams, existingSubjectDids, router, pathname, changeTab])

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
          <Tabs value={activeTab} onChange={(v) => changeTab(v as TabKey)}>
            <div className="endorsements-tabs-bar">
              {/* The surrounding .endorsements-tabs-bar (feed.css, cross-track)
                  already draws the strip's bottom border, so drop TabList's
                  own and pin it to the bar's bottom edge. */}
              <TabList
                aria-label="Endorsements"
                className="border-0 self-end"
              >
                {TABS.map((tab) => (
                  <Tab key={tab.key} value={tab.key}>
                    {tab.label}
                  </Tab>
                ))}
              </TabList>

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

            <TabPanel value="received">
              <ReceivedEndorsementsList />
            </TabPanel>
            <TabPanel value="given">
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
            </TabPanel>
          </Tabs>
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
