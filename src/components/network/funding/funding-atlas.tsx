"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Globe, Map as MapIcon } from "lucide-react"
import Avatar from "@/components/ui/avatar"
import Button from "@/components/ui/button"
import SegmentedControl from "@/components/ui/segmented-control"
import { useUrlParam } from "@/hooks/use-url-param"
import { recordUrlFromAtUri } from "@/lib/urls"
import type { FundingDataset } from "@/lib/funding/dataset-types"
import { FLOW_REGIONS, flowData, regionLabel, type ProjectTotal } from "@/lib/funding/select"
import { LAND_MASK, unpackLandMask } from "@/lib/funding/land-mask"
import { formatCount, formatUsd } from "@/lib/funding/format"
import { prepareCanvas, useCanvasColors, useElementWidth } from "./use-element-width"
import FundingGlobe from "./funding-globe"
import FundingProjectTip from "./funding-project-tip"

const LAT_TOP = 76
const LAT_SPAN = 132
const INSET = 28
const LABELS = 5

let landBits: Uint8Array | null = null

/**
 * Where it landed: the projects on a dot map of the world, each a circle
 * sized by the money it received, with totals by region underneath. Hover a
 * circle for the project; click it to pick it. A switch turns the flat map
 * into a globe (`?projection=globe`).
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
  const [wrapRef, width] = useElementWidth<HTMLDivElement>()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const colors = useCanvasColors()
  const [hover, setHover] = useState<{ t: ProjectTotal; x: number; y: number } | null>(null)
  const [projection, setProjection] = useUrlParam("projection", { defaultValue: "flat" })
  const globe = projection === "globe"

  const mapW = Math.max(0, width - 2 * INSET)
  const height = Math.round(mapW * (LAT_SPAN / 360)) + 8
  const scale = Math.max(0.45, mapW / 1000)
  const placed = useMemo(
    () => totals.filter((t) => ds.projects[t.project].lat != null),
    [totals, ds],
  )
  const maxTotal = placed[0]?.total ?? 1
  const proj = useMemo(() => {
    const xOf = (lng: number) => INSET + ((lng + 180) / 360) * mapW
    const yOf = (lat: number) => 4 + ((LAT_TOP - lat) / LAT_SPAN) * (height - 8)
    const rOf = (total: number) => (3 + 24 * Math.sqrt(total / maxTotal)) * scale
    return { xOf, yOf, rOf }
  }, [mapW, height, maxTotal, scale])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || width <= 0 || !colors.key) return
    const ctx = prepareCanvas(canvas, width, height)
    if (!ctx) return
    landBits ??= unpackLandMask()
    const { xOf, yOf, rOf } = proj
    const dot = Math.max(0.7, (mapW / LAND_MASK.cols) * 0.26)
    ctx.fillStyle = colors.muted
    ctx.globalAlpha = 0.4
    for (let row = 0; row < LAND_MASK.rows; row++) {
      const lat = LAND_MASK.lat0 - row * LAND_MASK.step
      if (lat < LAT_TOP - LAT_SPAN) break
      for (let col = 0; col < LAND_MASK.cols; col++) {
        if (!landBits[row * LAND_MASK.cols + col]) continue
        ctx.beginPath()
        ctx.arc(xOf(LAND_MASK.lon0 + col * LAND_MASK.step), yOf(lat), dot, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    // Largest first, so small circles stay on top and clickable.
    for (const t of placed) {
      const p = ds.projects[t.project]
      const x = xOf(p.lng!)
      const y = yOf(p.lat!)
      const r = rOf(t.total)
      const isSel = t.project === selected
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fillStyle = colors.fg
      ctx.globalAlpha = isSel ? 0.55 : 0.14
      ctx.fill()
      ctx.globalAlpha = isSel ? 1 : 0.7
      ctx.strokeStyle = colors.fg
      ctx.lineWidth = isSel ? 2 : 1
      ctx.stroke()
    }
    ctx.globalAlpha = 1
    ctx.fillStyle = colors.fg
    ctx.font = "600 11px Inter, system-ui, sans-serif"
    ctx.textBaseline = "middle"
    for (const t of placed.slice(0, LABELS)) {
      const p = ds.projects[t.project]
      const owner = ds.accounts[p.owner]
      const name = owner?.name ?? p.title ?? ""
      const text = name.length > 28 ? `${name.slice(0, 27)}…` : name
      const x = xOf(p.lng!)
      const r = rOf(t.total)
      const fitsRight = x + r + 5 + ctx.measureText(text).width <= width
      const tx = fitsRight ? x + r + 5 : x - r - 5
      ctx.textAlign = fitsRight ? "left" : "right"
      // A halo in the page colour keeps the name legible over circles.
      ctx.lineJoin = "round"
      ctx.lineWidth = 3
      ctx.strokeStyle = colors.bg
      ctx.globalAlpha = 0.9
      ctx.strokeText(text, tx, yOf(p.lat!))
      ctx.globalAlpha = 1
      ctx.fillText(text, tx, yOf(p.lat!))
    }
  }, [width, height, mapW, colors, placed, proj, ds, selected])

  const hit = (clientX: number, clientY: number, rect: DOMRect) => {
    const x = clientX - rect.left
    const y = clientY - rect.top
    let best: ProjectTotal | null = null
    let bestR = Infinity
    for (const t of placed) {
      const p = ds.projects[t.project]
      const r = proj.rOf(t.total)
      const dx = proj.xOf(p.lng!) - x
      const dy = proj.yOf(p.lat!) - y
      if (dx * dx + dy * dy <= Math.max(r, 6) ** 2 && r < bestR) {
        best = t
        bestR = r
      }
    }
    return best ? { t: best, x, y } : null
  }

  const flow = useMemo(() => flowData(ds, idx), [ds, idx])
  const maxRegion = Math.max(1, ...flow.regionTotals)
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
        <div
          ref={wrapRef}
          className="funding-atlas__map"
          style={{ height: height || undefined }}
          onMouseMove={(e) => setHover(hit(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect()))}
          onMouseLeave={() => setHover(null)}
          onClick={(e) => {
            const h = hit(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())
            if (h) onSelect(h.t.project)
          }}
        >
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={`Map of ${formatCount(placed.length)} funded projects, sized by money received.`}
          />
          {hover ? <FundingProjectTip ds={ds} t={hover.t} x={hover.x} y={hover.y} width={width} /> : null}
        </div>
      )}
      {current ? <AtlasSelection ds={ds} t={current} onShowReceipts={onShowReceipts} /> : null}
      <div className="funding-regions">
        {FLOW_REGIONS.map((region, i) =>
          flow.regionTotals[i] > 0 ? (
            <div key={region} className="funding-regions__item">
              <b>{regionLabel(region)}</b>
              <span className="funding-regions__bar">
                <i style={{ width: `${((flow.regionTotals[i] / maxRegion) * 100).toFixed(1)}%` }} />
              </span>
              <span>
                {formatUsd(flow.regionTotals[i])} · {formatCount(flow.regionProjects[i])} projects
              </span>
            </div>
          ) : null,
        )}
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
          {p.place ? ` · ${p.place}` : ""}
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
