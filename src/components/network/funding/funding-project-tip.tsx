import type { FundingDataset } from "@/lib/funding/dataset-types"
import type { ProjectTotal } from "@/lib/funding/select"
import { formatCount, formatUsd, formatPlace } from "@/lib/funding/format"

/** The hover card for a project on the map or the globe. `x`/`y` are the
 *  pointer within the drawing; the card sits above it, kept inside `width`. */
export default function FundingProjectTip({
  ds,
  t,
  x,
  y,
  width,
}: {
  ds: FundingDataset
  t: ProjectTotal
  x: number
  y: number
  width: number
}) {
  const p = ds.projects[t.project]
  const owner = ds.accounts[p.owner]
  return (
    <div
      className="funding-tip"
      style={{ left: Math.min(Math.max(x, 110), width - 110), top: Math.max(0, y - 74) }}
      role="status"
    >
      <b>{owner?.name ?? p.title ?? "Project"}</b>
      <span>
        {formatUsd(t.total)} · {formatCount(t.count)} gifts
      </span>
      {p.place ? <span className="funding-tip__muted">{formatPlace(p.place)}</span> : null}
    </div>
  )
}
