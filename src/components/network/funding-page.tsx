"use client"

import { useMemo, useState } from "react"
import { ChartScatter, Earth, LayoutGrid, ReceiptText, Split } from "lucide-react"
import PageContainer from "@/components/ui/page-container"
import PageHeader from "@/components/ui/page-header"
import SectionHeader from "@/components/ui/section-header"
import SegmentedControl from "@/components/ui/segmented-control"
import StatRow from "@/components/ui/stat-row"
import ErrorMessage from "@/components/ui/error-message"
import LoadingSpinner from "@/components/ui/loading-spinner"
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

const VIEWS = [
  {
    value: "projects",
    label: "Projects",
    icon: LayoutGrid,
    blurb: "Each project is a tile sized by the money it received. Pick one to see its funding.",
  },
  {
    value: "flow",
    label: "Flow",
    icon: Split,
    blurb: "Gifts by size, through whoever recorded them, to where the money went.",
  },
  {
    value: "timeline",
    label: "Timeline",
    icon: ChartScatter,
    blurb: "Every gift by date and amount, with the money per day above.",
  },
  {
    value: "map",
    label: "Map",
    icon: Earth,
    blurb: "Where the funded work happens, sized by the money it received.",
  },
  {
    value: "receipts",
    label: "Receipts",
    icon: ReceiptText,
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
        <b>Note:</b> most receipts so far come from one funding round, run by Ma Earth. Running a funding program?{" "}
        <button type="button" className="funding-page__see-all" onClick={() => openFeedback("contact")}>
          Get in touch
        </button>
      </p>
    </aside>
  )
}

/**
 * Network → Funding (`/funding`): who funded which work. The "Confirmed by"
 * chips decide which receipts count (by default what a trusted source such
 * as Ma Earth recorded, and what both sides confirmed); five views show the
 * same selection: projects, flow, timeline, map and the receipts themselves.
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

  return (
    <PageContainer className="funding-page">
      <PageHeader title="Funding" description="Who funds which work across the Certified network." />
      {error && !ds ? (
        <ErrorMessage title="Funding didn't load" message={error} onRetry={retry} />
      ) : !ds || !summary || !counts ? (
        <div className="funding-loading" role="status">
          <LoadingSpinner size="md" />
          <p>Gathering every funding receipt. The first load can take up to a minute.</p>
        </div>
      ) : (
        <>
          <div className="funding-page__overview">
            <StatRow
              aria-label="Funding in this selection"
              className="funding-page__stats"
              items={[
                { label: "Received", value: formatUsd(summary.total) },
                { label: "Gifts", value: formatCount(summary.count) },
                { label: "Projects", value: formatCount(summary.projects) },
                { label: "Named donors", value: formatCount(summary.namedDonors) },
                { label: "Anonymous gifts", value: formatCount(summary.anonymous) },
              ]}
            />
            <FundingNote />
          </div>
          <FundingConfirmedBy
            roles={confirmed.roles}
            counts={counts}
            shown={idx.length}
            isDefault={confirmed.isDefault}
            onToggle={confirmed.toggleRole}
            onReset={confirmed.reset}
          />
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
          <div className="funding-page__switcher">
            <div className="funding-page__switcher-scroll">
              <SegmentedControl
                aria-label="View"
                value={view}
                onValueChange={(v) => setViewParam(v)}
                options={VIEWS.map((v) => ({
                  value: v.value,
                  label: v.label,
                  icon: <v.icon size={15} strokeWidth={1.75} />,
                }))}
              />
            </div>
            <p className="funding-page__blurb">{activeView.blurb}</p>
          </div>
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
    </PageContainer>
  )
}
