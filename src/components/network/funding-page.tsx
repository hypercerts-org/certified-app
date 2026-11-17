"use client"

import { useMemo, useState } from "react"
import { Filter as FilterIcon } from "lucide-react"
import Button from "@/components/ui/button"
import PageContainer from "@/components/ui/page-container"
import PageHeader from "@/components/ui/page-header"
import SectionHeader from "@/components/ui/section-header"
import Skeleton from "@/components/ui/skeleton"
import StatRow from "@/components/ui/stat-row"
import ErrorMessage from "@/components/ui/error-message"
import LoadingSpinner from "@/components/ui/loading-spinner"
import { Tab, TabList, TabPanel, Tabs } from "@/components/ui/tabs"
import {
  CONFIRM_ROLES,
  DEFAULT_CONFIRM_ROLES,
  type ConfirmRole,
} from "@/lib/atproto/funding-provenance"
import { useFeedback } from "@/lib/feedback-context"
import { usePageTitle } from "@/lib/navbar-context"
import { useUrlParam } from "@/hooks/use-url-param"
import { useFundingDataset } from "@/hooks/use-funding-dataset"
import { useFundingConfirmedBy } from "@/hooks/use-funding-confirmed-by"
import {
  DEFAULT_GIFT_BOUNDS,
  bucketCounts,
  giftBoundsParam,
  parseGiftBounds,
  projectTotals,
  roleMask,
  selectReceipts,
  summarize,
} from "@/lib/funding/select"
import { formatCount, formatUsd } from "@/lib/funding/format"
import FundingConfirmedBy from "./funding/funding-confirmed-by"
import FundingMosaic from "./funding/funding-mosaic"
import FundingFlow from "./funding/funding-flow"
import FundingPulse from "./funding/funding-pulse"
import FundingAtlas from "./funding/funding-atlas"
import FundingRegister from "./funding/funding-register"
import FundingReceiptDialog from "./funding/funding-receipt-dialog"
import { FundingLedgerHeader, FundingLedgerRow } from "./funding/funding-ledger"
import NetworkFiltersSheet from "./network-filters-sheet"

const VIEWS = [
  {
    value: "projects",
    label: "Projects",
    blurb: "Each project is a tile sized by the money it received. Pick one to see its funding.",
  },
  {
    value: "flow",
    label: "Flow",
    blurb: "Gifts by size, through whoever recorded them, to where the money went.",
  },
  {
    value: "timeline",
    label: "Timeline",
    blurb: "Every gift by date and amount, with the money per day above.",
  },
  {
    value: "map",
    label: "Map",
    blurb: "Where the funded work happens, sized by the money it received.",
  },
  {
    value: "receipts",
    label: "Receipts",
    blurb: "Every receipt, newest first. Open one for the full record.",
  },
] as const

type View = (typeof VIEWS)[number]["value"]
const LATEST = 6

/**
 * Why most receipts so far are Ma Earth's, and an invitation to other
 * funding programs (the shared contact form, as on the landing page): a
 * short card at the right end of the totals row.
 */
function FundingNote() {
  const { openFeedback } = useFeedback()
  return (
    <aside className="funding-note-card" aria-label="About this data">
      <p>
        <b>Note:</b> most receipts so far come from one funding round, run by Ma Earth. As other programs run
        theirs with Certified, they&apos;ll show here too. Running a funding program?{" "}
        <button type="button" className="funding-page__see-all" onClick={() => openFeedback("contact")}>
          Get in touch
        </button>
      </p>
    </aside>
  )
}

/** How many "Confirmed by" chips differ from the default selection: the
 *  count on the phone Filters button. */
function changedRoles(roles: ReadonlySet<ConfirmRole>): number {
  return CONFIRM_ROLES.filter((r) => roles.has(r) !== DEFAULT_CONFIRM_ROLES.includes(r)).length
}

/** The totals labels, shared by the loaded row and its skeleton. */
const STAT_LABELS = ["Received", "Gifts", "Projects", "Named donors", "Anonymous gifts"] as const

/** The main box's height while the receipts load: the projects mosaic's. */
const LOADING_HEIGHT = 480

/**
 * The first load (up to a minute): the page as it will be, with skeletons
 * for the numbers and chips, and the loading message inside the main box,
 * so nothing moves when the receipts arrive.
 */
function FundingLoading() {
  return (
    <>
      <div className="funding-page__desktop-only">
        <div className="funding-page__overview">
          <StatRow
            aria-label="Funding in this selection"
            className="funding-page__stats"
            items={STAT_LABELS.map((label) => ({ label, value: null, loading: true }))}
          />
          <FundingNote />
        </div>
        <div className="funding-confirmed" aria-hidden="true">
          <div className="funding-confirmed__row">
            <span className="funding-confirmed__label">Confirmed by</span>
            <div className="funding-confirmed__skeleton">
              {[112, 104, 120, 132, 140].map((w, i) => (
                <Skeleton key={i} width={w} height={36} radius="999px" />
              ))}
            </div>
          </div>
          <Skeleton variant="line" width="40%" height={14} className="funding-confirmed__readout" />
        </div>
      </div>
      <div className="funding-page__phone-only funding-page__bar" aria-hidden="true">
        <Skeleton variant="line" width="70%" height={14} />
        <Button variant="secondary" size="md" disabled tabIndex={-1}>
          <FilterIcon size={16} strokeWidth={1.75} aria-hidden />
          Filters
        </Button>
      </div>
      <div className="funding-loading" role="status" style={{ minHeight: LOADING_HEIGHT }}>
        <LoadingSpinner size="md" />
        <p>Gathering every funding receipt. The first load can take up to a minute.</p>
      </div>
    </>
  )
}

/**
 * Network → Funding (`/funding`): who funded which work. Five views of the
 * same selection (`?view=`), as tabs under the title: projects, flow,
 * timeline, map and the receipts themselves. The "Confirmed by" chips decide
 * which receipts count (by default what a trusted source such as Ma Earth
 * recorded, and what both sides confirmed): in the page from 800px, in the
 * Filters sheet on phones, where the totals shrink to one line so the view
 * comes first.
 */
export default function FundingPage() {
  usePageTitle("Funding")
  const { data: ds, error, retry } = useFundingDataset()
  const confirmed = useFundingConfirmedBy()
  const [viewParam, setViewParam] = useUrlParam("view", { defaultValue: "projects" })
  // The gift sizes Flow draws and Receipts filters by (`?sizes=10-50-250`).
  const [sizesParam, setSizesParam] = useUrlParam("sizes")
  const bounds = useMemo(() => parseGiftBounds(sizesParam) ?? [...DEFAULT_GIFT_BOUNDS], [sizesParam])
  const view: View = VIEWS.some((v) => v.value === viewParam) ? (viewParam as View) : "projects"
  const [selectedProject, setSelectedProject] = useState(-1)
  const [registerProject, setRegisterProject] = useState(-1)
  const [openReceipt, setOpenReceipt] = useState<number | null>(null)

  const mask = roleMask(confirmed.roles)
  const idx = useMemo(() => (ds ? selectReceipts(ds, mask) : []), [ds, mask])
  const counts = useMemo(() => (ds ? bucketCounts(ds) : null), [ds])
  const summary = useMemo(() => (ds ? summarize(ds, idx) : null), [ds, idx])
  const totals = useMemo(() => (ds ? projectTotals(ds, idx) : []), [ds, idx])

  const showReceiptsFor = (project: number) => {
    setRegisterProject(project)
    setViewParam("receipts")
  }
  const activeView = VIEWS.find((v) => v.value === view)!

  const confirmedBy =
    counts !== null ? (
      <FundingConfirmedBy
        roles={confirmed.roles}
        counts={counts}
        shown={idx.length}
        isDefault={confirmed.isDefault}
        onToggle={confirmed.toggleRole}
        onReset={confirmed.reset}
      />
    ) : null

  return (
    <PageContainer className="funding-page">
      <PageHeader title="Funding" description="Who funds which work across the Certified network." />
      <Tabs value={view} onChange={(v) => setViewParam(v)} className="funding-page__tabs">
        <div className="funding-page__tab-scroll">
          <TabList aria-label="View" className="funding-page__tab-list">
            {VIEWS.map((v) => (
              <Tab key={v.value} value={v.value}>
                {v.label}
              </Tab>
            ))}
          </TabList>
        </div>
        <TabPanel value={view} className="funding-page__panel">
          {error && !ds ? (
            <ErrorMessage title="Funding didn't load" message={error} onRetry={retry} />
          ) : !ds || !summary || !counts ? (
            <FundingLoading />
          ) : (
            <>
              {/* From 800px: the totals with the note, then the chips. */}
              <div className="funding-page__desktop-only">
                <div className="funding-page__overview">
                  <StatRow
                    aria-label="Funding in this selection"
                    className="funding-page__stats"
                    items={[
                      { label: STAT_LABELS[0], value: formatUsd(summary.total) },
                      { label: STAT_LABELS[1], value: formatCount(summary.count) },
                      { label: STAT_LABELS[2], value: formatCount(summary.projects) },
                      { label: STAT_LABELS[3], value: formatCount(summary.namedDonors) },
                      { label: STAT_LABELS[4], value: formatCount(summary.anonymous) },
                    ]}
                  />
                  <FundingNote />
                </div>
                {confirmedBy}
              </div>
              {/* Phones: the totals as one line, the chips in the Filters
                  sheet, so the view is in reach. */}
              <div className="funding-page__phone-only funding-page__bar">
                <p className="funding-page__stats-line">
                  {formatUsd(summary.total)} received · {formatCount(summary.count)} gifts ·{" "}
                  {formatCount(summary.projects)} projects · {formatCount(summary.namedDonors)} named donors ·{" "}
                  {formatCount(summary.anonymous)} anonymous gifts
                </p>
                <NetworkFiltersSheet changed={changedRoles(confirmed.roles)} onReset={confirmed.reset}>
                  {confirmedBy}
                </NetworkFiltersSheet>
              </div>
              {/* Below the chips, not above: it comes and goes as chips toggle,
                  and must not move them under the pointer. */}
              {summary.others.length > 0 ? (
                <p className="funding-page__currencies">
                  Received counts US dollars only. Also in this selection:{" "}
                  {summary.others
                    .map(
                      (o) =>
                        `${formatCount(o.count)} ${o.count === 1 ? "receipt" : "receipts"} in ${o.currency} (${o.total.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${o.currency})`,
                    )
                    .join(", ")}
                  , not converted.
                </p>
              ) : null}
              <p className="funding-page__blurb">{activeView.blurb}</p>
              <section className="funding-page__view" aria-label={activeView.label}>
                {view === "projects" ? (
                  <FundingMosaic
                    ds={ds}
                    totals={totals}
                    idx={idx}
                    selected={selectedProject}
                    onSelect={setSelectedProject}
                    onShowReceipts={showReceiptsFor}
                  />
                ) : view === "flow" ? (
                  <FundingFlow
                    ds={ds}
                    idx={idx}
                    totals={totals}
                    bounds={bounds}
                    onBoundsChange={(next) => setSizesParam(giftBoundsParam(next))}
                  />
                ) : view === "timeline" ? (
                  <FundingPulse ds={ds} idx={idx} />
                ) : view === "map" ? (
                  <FundingAtlas
                    ds={ds}
                    totals={totals}
                    idx={idx}
                    selected={selectedProject}
                    onSelect={setSelectedProject}
                    onShowReceipts={showReceiptsFor}
                  />
                ) : (
                  <FundingRegister
                    ds={ds}
                    idx={idx}
                    project={registerProject}
                    bounds={bounds}
                    onClearProject={() => setRegisterProject(-1)}
                    onOpen={setOpenReceipt}
                  />
                )}
              </section>
              {/* Phones: the note after the view, not before it. */}
              <div className="funding-page__phone-only funding-page__note-after">
                <FundingNote />
              </div>
              {view !== "receipts" && idx.length > 0 ? (
                <section className="funding-page__latest" aria-labelledby="funding-latest-heading">
                  <SectionHeader
                    id="funding-latest-heading"
                    title="Latest receipts"
                    action={
                      <button
                        type="button"
                        className="funding-page__see-all"
                        onClick={() => {
                          setRegisterProject(-1)
                          setViewParam("receipts")
                        }}
                      >
                        See all receipts
                      </button>
                    }
                  />
                  <div className="funding-ledger" role="list" aria-label="Latest funding receipts">
                    <FundingLedgerHeader showDate />
                    {idx.slice(0, LATEST).map((i) => (
                      <div role="listitem" key={i}>
                        <FundingLedgerRow ds={ds} i={i} showDate onOpen={setOpenReceipt} />
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}
              {ds.partial ? (
                <p className="funding-page__partial">
                  Some sources couldn&apos;t be read completely this time, so a few receipts may be missing.
                </p>
              ) : null}
              {openReceipt !== null ? (
                <FundingReceiptDialog ds={ds} index={openReceipt} onClose={() => setOpenReceipt(null)} />
              ) : null}
            </>
          )}
        </TabPanel>
      </Tabs>
    </PageContainer>
  )
}
