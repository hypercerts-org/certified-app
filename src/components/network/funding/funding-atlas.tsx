"use client"

import { useMemo } from "react"
import { Globe, Map as MapIcon } from "lucide-react"
import Avatar from "@/components/ui/avatar"
import Button from "@/components/ui/button"
import SegmentedControl from "@/components/ui/segmented-control"
import { useUrlParam } from "@/hooks/use-url-param"
import { recordUrlFromAtUri } from "@/lib/urls"
import type { FundingDataset } from "@/lib/funding/dataset-types"
import { destinationTotals, destinations, type ProjectTotal } from "@/lib/funding/select"
import { formatCount, formatUsd, formatPlace } from "@/lib/funding/format"
import FundingFlatMap from "./funding-flat-map"
import FundingGlobe from "./funding-globe"

/**
 * Where it landed: the projects on a dot map of the world, each a circle
 * sized by the money it received, with totals by region underneath. Hover a
 * circle for the project; click it to pick it. Both the flat map and the
 * globe (`?projection=globe`) zoom and move, and grow taller by dragging the
 * bar under them.
 */
export default function FundingAtlas({
  ds,
  totals,
  idx,
  selected,
  onSelect,
  onShowReceipts,
}: {
  ds: FundingDataset
  totals: ProjectTotal[]
  idx: readonly number[]
  selected: number
  onSelect: (project: number) => void
  onShowReceipts: (project: number) => void
}) {
  const [projection, setProjection] = useUrlParam("projection", { defaultValue: "flat" })
  const globe = projection === "globe"
  const placed = useMemo(
    () => totals.filter((t) => ds.projects[t.project].lat != null),
    [totals, ds],
  )
  const maxTotal = placed[0]?.total ?? 1

  const regions = useMemo(() => {
    const dest = destinations(ds, "regions", totals)
    return destinationTotals(ds, idx, dest).map((d) => ({ ...d, name: dest.names[d.dest], none: d.dest === dest.none }))
  }, [ds, idx, totals])
  const maxRegion = Math.max(1, ...regions.map((r) => r.total))
  const current = totals.find((t) => t.project === selected) ?? null

  return (
    <div className="funding-atlas">
      <div className="funding-atlas__bar">
        <p className="funding-atlas__legend">
          Circle area shows money received. {formatCount(placed.length)} of {formatCount(totals.length)} projects
          have a location.
        </p>
        <SegmentedControl
          aria-label="Projection"
          size="sm"
          value={globe ? "globe" : "flat"}
          onValueChange={(v) => setProjection(v)}
          options={[
            { value: "flat", label: "Flat", icon: <MapIcon size={14} strokeWidth={1.75} /> },
            { value: "globe", label: "Globe", icon: <Globe size={14} strokeWidth={1.75} /> },
          ]}
        />
      </div>
      {globe ? (
        <FundingGlobe ds={ds} placed={placed} maxTotal={maxTotal} selected={selected} onSelect={onSelect} />
      ) : (
        <FundingFlatMap ds={ds} placed={placed} maxTotal={maxTotal} selected={selected} onSelect={onSelect} />
      )}
      {current ? <AtlasSelection ds={ds} t={current} onShowReceipts={onShowReceipts} /> : null}
      {/* Largest first, places without a location last. */}
      <div className="funding-regions">
        {[...regions.filter((r) => !r.none), ...regions.filter((r) => r.none)].map((r) => (
          <div key={r.name} className="funding-regions__item">
            <b title={r.name}>{r.name}</b>
            <span className="funding-regions__bar">
              <i style={{ width: `${((r.total / maxRegion) * 100).toFixed(1)}%` }} />
            </span>
            <span>
              {formatUsd(r.total)} · {formatCount(r.projects)} {r.projects === 1 ? "project" : "projects"}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function AtlasSelection({
  ds,
  t,
  onShowReceipts,
}: {
  ds: FundingDataset
  t: ProjectTotal
  onShowReceipts: (project: number) => void
}) {
  const p = ds.projects[t.project]
  const owner = ds.accounts[p.owner]
  const href = recordUrlFromAtUri(p.uri)
  return (
    <div className="funding-atlas__selection">
      <Avatar src={owner?.avatar ?? p.avatar ?? undefined} alt="" size="sm" seed={owner?.did} />
      <div className="funding-atlas__selection-text">
        <b>{owner?.name ?? "Organization"}</b>
        <span>
          {p.title ?? "Untitled project"} · {formatUsd(t.total)} from {formatCount(t.count)} gifts
          {p.place ? ` · ${formatPlace(p.place)}` : ""}
        </span>
      </div>
      <div className="funding-atlas__selection-actions">
        {href ? (
          <Button href={href} size="sm" variant="secondary">
            Open project
          </Button>
        ) : null}
        <Button size="sm" variant="secondary" onClick={() => onShowReceipts(t.project)}>
          Its receipts
        </Button>
      </div>
    </div>
  )
}
