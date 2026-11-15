"use client"

import { Fragment, useMemo, useState } from "react"
import { Search, X } from "lucide-react"
import Input from "@/components/ui/input"
import Select from "@/components/ui/select"
import Button from "@/components/ui/button"
import LoadMoreSentinel from "@/components/ui/load-more-sentinel"
import type { FundingDataset } from "@/lib/funding/dataset-types"
import { giftSizeIndex, giftSizes, isPrimary } from "@/lib/funding/select"
import { formatCount, formatDay, formatUsd } from "@/lib/funding/format"
import { FundingLedgerHeader, FundingLedgerRow } from "./funding-ledger"

const PAGE = 100
const DAY = 86_400

/**
 * The log: every receipt in the selection, newest first, grouped by day.
 * Search by recipient or project, narrow by gift size or to one project,
 * and open any row for the full receipt (where a recipient can confirm it).
 */
export default function FundingRegister({
  ds,
  idx,
  project,
  bounds,
  onClearProject,
  onOpen,
}: {
  ds: FundingDataset
  idx: readonly number[]
  /** Only this project's receipts (index into ds.projects), or -1. */
  project: number
  /** Where each gift size starts, in dollars (shared with Flow). */
  bounds: readonly number[]
  onClearProject: () => void
  onOpen: (i: number) => void
}) {
  const [query, setQuery] = useState("")
  const [size, setSize] = useState("any")
  const [limit, setLimit] = useState(PAGE)

  const sizes = useMemo(() => giftSizes(bounds), [bounds])
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const r = ds.receipts
    // A size from boundaries since changed falls back to any amount.
    const sizeIndex = size === "any" || Number(size) >= sizes.length ? -1 : Number(size)
    // Precompute which recipients / projects match the search once.
    const accountHit = q
      ? ds.accounts.map((a) => (a.name ?? "").toLowerCase().includes(q) || a.did === q)
      : null
    const projectHit = q ? ds.projects.map((p) => (p.title ?? "").toLowerCase().includes(q)) : null
    return idx.filter((i) => {
      if (project >= 0 && r.project[i] !== project) return false
      if (sizeIndex >= 0 && (!isPrimary(ds, i) || giftSizeIndex(r.amount[i], bounds) !== sizeIndex)) return false
      if (!q) return true
      if (r.to[i] >= 0 && accountHit![r.to[i]]) return true
      if (r.project[i] >= 0 && projectHit![r.project[i]]) return true
      if (r.from[i] >= 0 && ds.donors[r.from[i]] === q) return true
      if ((ds.toText[i] ?? "").toLowerCase().includes(q)) return true
      if ((ds.fromText[i] ?? "").toLowerCase().includes(q)) return true
      return false
    })
  }, [ds, idx, query, size, project, bounds, sizes.length])

  // Day totals for the headers, over the filtered rows.
  const dayTotals = useMemo(() => {
    const m = new Map<number, { count: number; total: number }>()
    for (const i of rows) {
      const day = Math.floor(ds.receipts.t[i] / DAY)
      const d = m.get(day) ?? { count: 0, total: 0 }
      d.count++
      if (isPrimary(ds, i)) d.total += ds.receipts.amount[i]
      m.set(day, d)
    }
    return m
  }, [ds, rows])

  const shown = rows.slice(0, limit)
  const projectName = project >= 0 ? ds.projects[project]?.title ?? "this project" : null

  return (
    <div className="funding-register">
      <div className="funding-register__tools">
        {/* Input and Select fill their parent, so the wrappers set the widths. */}
        <div className="funding-register__search">
          <Input
            type="search"
            size="sm"
            placeholder="Search recipients and projects"
            aria-label="Search recipients and projects"
            value={query}
            leadingIcon={<Search size={14} aria-hidden />}
            onChange={(e) => {
              setQuery(e.target.value)
              setLimit(PAGE)
            }}
          />
        </div>
        <div className="funding-register__size">
          <Select
            size="sm"
            aria-label="Gift size"
            value={Number(size) >= sizes.length ? "any" : size}
            onChange={(e) => {
              setSize(e.target.value)
              setLimit(PAGE)
            }}
          >
            <option value="any">Any amount</option>
            {sizes.map((s, i) => (
              <option key={s.label} value={String(i)}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>
        {projectName ? (
          <Button size="sm" variant="secondary" onClick={onClearProject} aria-label={`Show all projects, not only ${projectName}`}>
            <span className="funding-register__project-filter">For: {projectName}</span>
            <X size={14} aria-hidden />
          </Button>
        ) : null}
        <span className="funding-register__count">
          {formatCount(rows.length)} {rows.length === 1 ? "receipt" : "receipts"}
        </span>
      </div>
      {rows.length === 0 ? (
        <div className="funding-empty">
          <p>No receipts match.</p>
        </div>
      ) : (
        <div className="funding-ledger" role="list" aria-label="Funding receipts">
          <FundingLedgerHeader showDate={false} />
          {shown.map((i, n) => {
            const day = Math.floor(ds.receipts.t[i] / DAY)
            const prev = n > 0 ? Math.floor(ds.receipts.t[shown[n - 1]] / DAY) : null
            const totals = dayTotals.get(day)
            return (
              <Fragment key={i}>
                {day !== prev ? (
                  <div className="funding-ledger__day" role="listitem">
                    <b>{ds.receipts.t[i] ? formatDay(ds.receipts.t[i]) : "Undated"}</b>
                    {totals ? (
                      <span>
                        {formatCount(totals.count)} {totals.count === 1 ? "gift" : "gifts"}
                        {totals.total > 0 ? ` · ${formatUsd(totals.total)}` : ""}
                      </span>
                    ) : null}
                  </div>
                ) : null}
                <div role="listitem">
                  <FundingLedgerRow ds={ds} i={i} showDate={false} onOpen={onOpen} />
                </div>
              </Fragment>
            )
          })}
        </div>
      )}
      {rows.length > limit ? (
        <LoadMoreSentinel
          onLoadMore={() => setLimit((l) => l + PAGE)}
          isLoading={false}
          label="Show more receipts"
        />
      ) : null}
    </div>
  )
}
