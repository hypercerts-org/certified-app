"use client"

import { useEffect, useId, useMemo, useState, type ReactNode } from "react"
import { Plus, RefreshCw } from "lucide-react"
import Button from "@/components/ui/button"
import EmptyState from "@/components/ui/empty-state"
import { FactCard, FactList, type Fact } from "@/components/ui/fact-card"
import Pagination from "@/components/ui/pagination"
import { SeeAllLink } from "@/components/ui/section-header"
import Skeleton from "@/components/ui/skeleton"
import FundingReceiptRow, {
  confirmedByKey,
  FundingReceiptHeader,
} from "@/components/explore-page/funding-receipt-row"
import FundingConfirmedByPopover from "@/components/explore-page/funding-confirmed-by-popover"
import FundingReceiptFormModal from "@/components/funding/funding-receipt-form-modal"
import FundingIdentityChoiceDialog from "@/components/funding/funding-identity-choice-dialog"
import { useRecordFunding } from "@/hooks/use-record-funding"
import { useMergedFunding } from "@/hooks/use-merged-funding"
import {
  useFundingConfirmedBy,
  type FundingConfirmedByState,
} from "@/hooks/use-funding-confirmed-by"
import { useTrustedEvaluators } from "@/hooks/use-trusted-evaluators"
import { useAuth } from "@/lib/auth/auth-context"
import { useOrg } from "@/lib/groups/org-context"
import { matchesConfirmedBy } from "@/lib/atproto/funding-provenance"
import type { FundingReceipt } from "@/lib/atproto/indexer"
import { confirmRoleLabel } from "@/lib/funding/labels"
import { formatMoney, formatUsd } from "@/lib/funding/format"
import {
  fundingByline,
  shownSentence,
  summarizeRecordFunding,
  type RecordFundingSummary,
} from "@/lib/funding/record-funding"

/** Receipts per page on the Funding tab. */
const PAGE_SIZE = 25

export interface RecordFundingView {
  /** Every loaded receipt (with the viewer's optimistic confirmations). */
  all: FundingReceipt[]
  /** The receipts the "Confirmed by" filter lets through. */
  shown: FundingReceipt[]
  summary: RecordFundingSummary
  /** Loaded receipts the filter hides. */
  hiddenCount: number
  /** Nothing is confirmed, but gifts are recorded: the default filter
   *  shows none, so the page lists them all, marked "Unconfirmed". */
  onlyUnconfirmed: boolean
  /** The Funding tab's count: the gifts it lists. */
  tabCount: number
  isLoading: boolean
  error: string | null
  refetch: () => void
  confirmedBy: FundingConfirmedByState
}

/**
 * The funding a record page shows: every receipt for `forUris` (an
 * activity, or a project and its activities), filtered by the same
 * "Confirmed by" selection as Explore and /funding (trusted sources and
 * both sides by default, `?confirmedRoles=` in the URL), and summed.
 */
export function useRecordFundingView(
  forUris: readonly string[],
  /** The page's own record: the viewer's just-made confirmations for it
   *  show at once. */
  primaryUri: string | null,
): RecordFundingView {
  const { receipts, isLoading, error, refetch } = useRecordFunding(forUris)
  const all = useMergedFunding(receipts, primaryUri)
  const confirmedBy = useFundingConfirmedBy()
  const shown = useMemo(
    () =>
      all.filter((r) =>
        matchesConfirmedBy(r.attestations, confirmedBy.roles, confirmedBy.thirdParties),
      ),
    [all, confirmedBy.roles, confirmedBy.thirdParties],
  )
  const summary = useMemo(() => summarizeRecordFunding(shown), [shown])
  const onlyUnconfirmed = shown.length === 0 && all.length > 0 && confirmedBy.isDefault
  return {
    all,
    shown,
    summary,
    hiddenCount: all.length - shown.length,
    onlyUnconfirmed,
    tabCount: onlyUnconfirmed ? all.length : summary.gifts,
    isLoading,
    error,
    refetch,
    confirmedBy,
  }
}

/** "1 unconfirmed gift", "3 unconfirmed gifts". */
export function unconfirmedLabel(n: number): string {
  return `${n.toLocaleString("en-US")} unconfirmed ${n === 1 ? "gift" : "gifts"}`
}

/** The total as one figure: dollars, else the first other currency, else
 *  the number of gifts (receipts without an amount). */
export function headlineAmount(s: RecordFundingSummary): string {
  if (s.total > 0) return formatUsd(s.total)
  const other = s.others[0]
  if (other && other.total > 0) return formatMoney(other.total, other.currency)
  return s.gifts.toLocaleString("en-US")
}

/** Gifts in other currencies, after the dollar total ("and 12.5 USDC"). */
export function otherCurrencies(s: RecordFundingSummary): string | null {
  const rest = s.total > 0 ? s.others : s.others.slice(1)
  const parts = rest.filter((o) => o.total > 0).map((o) => formatMoney(o.total, o.currency))
  return parts.length > 0 ? `and ${parts.join(", ")}` : null
}

/**
 * The rail's funding card: the total, how many gifts from how many
 * funders, who confirmed them, and a link to the Funding tab. Renders
 * nothing when the record has no funding at all.
 */
export function FundingFactCard({
  view,
  href,
  scope = null,
}: {
  view: RecordFundingView
  /** The Funding tab. */
  href: string | null
  /** What the total covers, under it ("Across 3 projects"). */
  scope?: string | null
}) {
  const titleId = useId()
  const { summary, isLoading, error, all, hiddenCount } = view

  if (isLoading && all.length === 0) {
    return (
      <FactCard title="Funding" labelledBy={titleId}>
        <div className="flex flex-col gap-2" role="status" aria-label="Loading funding">
          <Skeleton variant="line" width="8rem" height="1.75rem" />
          <Skeleton variant="line" width="12rem" height="0.875rem" />
        </div>
      </FactCard>
    )
  }
  if (error && all.length === 0) {
    return (
      <FactCard title="Funding" labelledBy={titleId}>
        <p className="m-0 text-body-sm text-[var(--fg-secondary)]">
          Couldn&apos;t load the funding.
        </p>
        <div>
          <Button variant="secondary" size="sm" onClick={view.refetch}>
            Try again
          </Button>
        </div>
      </FactCard>
    )
  }
  if (all.length === 0) return null

  const action = href ? <SeeAllLink href={href} label="All gifts" /> : null

  if (summary.gifts === 0) {
    // Receipts exist, but none the default filter shows.
    return (
      <FactCard title="Funding" action={action} labelledBy={titleId}>
        <p className="m-0 text-body-sm text-[var(--fg-secondary)]">
          {view.confirmedBy.isDefault ? unconfirmedLabel(hiddenCount) : "No gifts match the filter."}
        </p>
      </FactCard>
    )
  }

  const facts: Fact[] = []
  if (summary.confirmedBy.length > 0) {
    facts.push({
      label: "Confirmed by",
      value: summary.confirmedBy.map((r) => confirmRoleLabel(r)).join(", "),
    })
  }
  const others = otherCurrencies(summary)

  return (
    <FactCard title="Funding" action={action} labelledBy={titleId}>
      <div className="flex flex-col gap-1">
        <p className="record-funding__total m-0">{headlineAmount(summary)}</p>
        {others ? (
          <p className="m-0 text-body-sm text-[var(--fg-secondary)]">{others}</p>
        ) : null}
        <p className="m-0 text-body-sm text-[var(--fg-secondary)]">{fundingByline(summary)}</p>
        {scope ? <p className="m-0 text-caption text-[var(--fg-muted)]">{scope}</p> : null}
      </div>
      <FactList facts={facts} />
    </FactCard>
  )
}

/**
 * The Funding tab: the summary line (total, gifts, funders), the
 * "Confirmed by" filter as a labelled button and a sentence saying what
 * it shows, then the receipts, 25 to a page. The heading is the tab
 * itself, so the section's own is for screen readers only.
 */
export function RecordFundingSection({
  view,
  recipientDid,
  actions,
  note,
  showFor = false,
  recordInFlight = false,
}: {
  view: RecordFundingView
  /** The record's account: the recipient a "To" column would repeat. */
  recipientDid: string
  /** "Record funding", beside the filter. */
  actions?: ReactNode
  /** The "recording your funding…" status line. */
  note?: ReactNode
  /** Show what each gift was for (a project's tab mixes the project and
   *  its activities). */
  showFor?: boolean
  /** A receipt was just recorded: don't say there are none yet. */
  recordInFlight?: boolean
}) {
  const headingId = useId()
  const { summary, shown, all, confirmedBy, isLoading, error, hiddenCount, onlyUnconfirmed } =
    view
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState(1)
  // Nothing confirmed yet: list every gift, marked "Unconfirmed", rather
  // than an empty tab behind a count.
  const listed = onlyUnconfirmed ? all : shown
  const pageCount = Math.max(1, Math.ceil(listed.length / PAGE_SIZE))
  // A new filter starts at page 1; a shorter list keeps the page in range.
  const filterKey = `${[...confirmedBy.roles].sort().join(",")}|${[...confirmedBy.thirdParties].sort().join(",")}`
  useEffect(() => {
    setPage(1)
  }, [filterKey])
  const current = Math.min(page, pageCount)
  const rows = listed.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)

  const filter =
    all.length > 0 ? (
      <FundingConfirmedByPopover
        receipts={all}
        roles={confirmedBy.roles}
        onToggleRole={confirmedBy.toggleRole}
        thirdParties={confirmedBy.thirdParties}
        onToggleThirdParty={confirmedBy.toggleThirdParty}
        isDefault={confirmedBy.isDefault}
        onReset={confirmedBy.reset}
        open={open}
        onOpenChange={setOpen}
        triggerVariant="section"
      />
    ) : null

  let body: ReactNode
  if (isLoading && all.length === 0) {
    body = (
      <div className="flex flex-col gap-3" role="status" aria-label="Loading funding">
        <Skeleton variant="line" width="100%" height="2.5rem" />
        <Skeleton variant="line" width="100%" height="2.5rem" />
        <Skeleton variant="line" width="100%" height="2.5rem" />
      </div>
    )
  } else if (error && all.length === 0) {
    body = (
      <EmptyState variant="inline" title="Couldn't load the funding.">
        <Button variant="secondary" size="sm" onClick={view.refetch}>
          Try again
        </Button>
      </EmptyState>
    )
  } else if (all.length === 0) {
    body = recordInFlight ? null : (
      <EmptyState variant="inline" title="No funding recorded yet." />
    )
  } else if (listed.length === 0) {
    body = (
      <EmptyState variant="inline" title="No gifts match this filter.">
        <Button variant="secondary" size="sm" onClick={confirmedBy.reset}>
          Reset filter
        </Button>
      </EmptyState>
    )
  } else {
    // "To" says nothing when every gift went to the record's own account.
    const showTo = !listed.every(
      (r) => !r.to || (r.to.kind === "account" && r.to.did === recipientDid),
    )
    // "Confirmed by" says nothing when every gift has the same confirmer:
    // the sentence above the list names it.
    const firstKey = listed[0] ? confirmedByKey(listed[0]) : ""
    const showConfirmedBy =
      onlyUnconfirmed || !listed.every((r) => confirmedByKey(r) === firstKey)
    const listClass = `cert-detail__funding-list record-funding__list${
      showTo ? " record-funding__list--to" : ""
    }${showFor ? " record-funding__list--for" : ""}${
      showConfirmedBy ? "" : " record-funding__list--no-confirmed"
    }`
    body = (
      <>
        <ul className={listClass}>
          <li>
            <FundingReceiptHeader
              showFor={showFor}
              showTo={showTo}
              showConfirmedBy={showConfirmedBy}
            />
          </li>
          {rows.map((r) => (
            <li key={r.uri}>
              <FundingReceiptRow
                receipt={r}
                showTextParties
                showFor={showFor}
                showTo={showTo}
                showConfirmedBy={showConfirmedBy}
                amountStyle="money"
                compact
                unconfirmed={onlyUnconfirmed}
              />
            </li>
          ))}
        </ul>
        <Pagination
          page={current}
          pageCount={pageCount}
          onChange={setPage}
          label="Funding pages"
          className="mt-6"
        />
      </>
    )
  }

  const hasSummary = summary.gifts > 0
  const others = otherCurrencies(summary)

  return (
    <section className="record-funding" aria-labelledby={headingId}>
      <h2 id={headingId} className="sr-only">
        Funding
      </h2>
      {hasSummary || actions || filter || all.length > 0 ? (
        <div className="record-funding__head">
          <div className="record-funding__summary">
            {hasSummary ? (
              <>
                <p className="record-funding__total m-0">
                  {headlineAmount(summary)}
                  {others ? (
                    <span className="record-funding__others"> {others}</span>
                  ) : null}
                </p>
                <p className="m-0 text-body-sm text-[var(--fg-secondary)]">
                  {fundingByline(summary)}
                </p>
              </>
            ) : onlyUnconfirmed ? (
              <p className="m-0 text-body font-semibold text-[var(--fg-primary)]">
                {unconfirmedLabel(all.length)}
              </p>
            ) : null}
            {/* What the filter shows, so the list never looks like all
                there is when it isn't. */}
            {onlyUnconfirmed ? (
              <p className="record-funding__note">
                Recorded, but not yet confirmed by both sides or by a trusted source.
              </p>
            ) : all.length > 0 ? (
              <p className="record-funding__note">
                {shownSentence(confirmedBy.roles, confirmedBy.thirdParties.size)}
                {hiddenCount > 0
                  ? ` ${hiddenCount.toLocaleString("en-US")} more ${hiddenCount === 1 ? "is" : "are"} hidden by the filter.`
                  : ""}
              </p>
            ) : null}
          </div>
          {actions || filter ? (
            <div className="record-funding__actions">
              {actions}
              {filter}
            </div>
          ) : null}
        </div>
      ) : null}
      {note}
      {body}
    </section>
  )
}

/**
 * Recording a payment from a record page: the "Record funding" button for
 * a signed-in viewer, the "as me or as the group" choice when the viewer
 * runs the group that published the record, the form, and then polling
 * the indexer until the new receipt shows (it is eventually consistent).
 */
export function useRecordFundingFlow({
  recordDid,
  uri,
  cid,
  title,
  receipts,
  refetch,
  isLoading,
  kind = "activity",
}: {
  /** The record's repo: the recipient. */
  recordDid: string
  /** What the record is, for the form's wording. */
  kind?: "activity" | "project"
  uri: string | null
  cid: string
  title: string | undefined
  /** The loaded receipts, to notice the new one. */
  receipts: readonly FundingReceipt[]
  refetch: () => void
  isLoading: boolean
}): {
  control: ReactNode
  note: ReactNode
  dialogs: ReactNode
  inFlight: boolean
  canRecord: boolean
} {
  const { did: sessionDid, isAuthenticated } = useAuth()
  const { groups } = useOrg()
  const { evaluatorDids } = useTrustedEvaluators()
  const canRecord = isAuthenticated && !!sessionDid && !!uri
  const [formOpen, setFormOpen] = useState(false)
  const [identityOpen, setIdentityOpen] = useState(false)
  const [as, setAs] = useState<"individual" | "group">("individual")
  const [pendingUri, setPendingUri] = useState<string | null>(null)
  const [timedOut, setTimedOut] = useState(false)

  // The group that published the record, when the viewer runs it.
  const authoringGroup =
    groups.find(
      (g) => g.groupDid === recordDid && (g.role === "owner" || g.role === "admin"),
    ) ?? null

  // Stop polling once the new receipt arrives.
  useEffect(() => {
    if (!pendingUri) return
    if (receipts.some((r) => r.uri === pendingUri)) {
      setPendingUri(null)
      setTimedOut(false)
    }
  }, [pendingUri, receipts])

  // Poll every 1.5s, up to 10 times, then offer a manual refresh.
  useEffect(() => {
    if (!pendingUri) return
    let attempts = 0
    const id = setInterval(() => {
      attempts += 1
      refetch()
      if (attempts >= 10) {
        clearInterval(id)
        setPendingUri(null)
        setTimedOut(true)
      }
    }, 1500)
    return () => clearInterval(id)
  }, [pendingUri, refetch])

  const open = () => {
    setPendingUri(null)
    setTimedOut(false)
    if (authoringGroup) setIdentityOpen(true)
    else {
      setAs("individual")
      setFormOpen(true)
    }
  }

  const control = canRecord ? (
    <Button variant="secondary" size="sm" onClick={open}>
      <Plus size={14} strokeWidth={1.75} aria-hidden />
      Record funding
    </Button>
  ) : null

  const note = pendingUri ? (
    <p role="status" className="record-funding__note">
      Recording your funding. It will show here in a moment.
      <RefreshCw
        size={14}
        strokeWidth={2}
        aria-hidden
        className="animate-spin ml-1.5 inline-block align-middle"
      />
    </p>
  ) : timedOut ? (
    <p role="status" className="record-funding__note">
      Funding recorded. It is taking longer than usual to show.{" "}
      <Button variant="secondary" size="sm" loading={isLoading} onClick={refetch}>
        Refresh
      </Button>
    </p>
  ) : null

  const asGroup = as === "group" && !!authoringGroup
  const writerDid = asGroup ? recordDid : sessionDid
  const dialogs = (
    <>
      {identityOpen && sessionDid && authoringGroup ? (
        <FundingIdentityChoiceDialog
          individualDid={sessionDid}
          groupDid={recordDid}
          onChoose={(choice) => {
            setAs(choice)
            setIdentityOpen(false)
            setFormOpen(true)
          }}
          onClose={() => setIdentityOpen(false)}
        />
      ) : null}
      {formOpen && sessionDid && writerDid && uri ? (
        <FundingReceiptFormModal
          writerDid={writerDid}
          writerIsGroup={asGroup}
          canRecordAsRecipient={asGroup || sessionDid === recordDid}
          isEvaluator={evaluatorDids.includes(writerDid)}
          activityAuthorDid={recordDid}
          forActivity={{ uri, cid, title }}
          forKind={kind}
          onClose={() => setFormOpen(false)}
          onCreated={(result) => {
            setTimedOut(false)
            setPendingUri(result.uri)
          }}
        />
      ) : null}
    </>
  )

  return {
    control,
    note,
    dialogs,
    inFlight: pendingUri !== null || timedOut,
    canRecord,
  }
}
