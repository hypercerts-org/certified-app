"use client"

import { useId, useMemo, useRef, useState } from "react"
import { SlidersHorizontal } from "lucide-react"
import Button from "@/components/ui/button"
import SegmentedControl from "@/components/ui/segmented-control"
import TabStripFades from "@/components/ui/tab-strip-fades"
import { useUrlParam } from "@/hooks/use-url-param"
import { useLayoutBreakpoints } from "@/hooks/use-layout-breakpoints"
import { useOverflowEdges } from "@/hooks/use-overflow-edges"
import type { FundingDataset } from "@/lib/funding/dataset-types"
import { confirmRoleLabel } from "@/lib/funding/labels"
import { trustedFundingSource, trustedSourceByKey } from "@/lib/funding/trusted-sources"
import { regionPhrase } from "@/lib/funding/geo"
import {
  DEFAULT_GIFT_BOUNDS,
  destinations,
  giftSizeIndex,
  giftSizes,
  isFlowTarget,
  isPrimary,
  primaryRole,
  type Destinations,
  type FlowTarget,
  type ProjectTotal,
} from "@/lib/funding/select"
import { formatCount, formatUsd, formatUsdShort } from "@/lib/funding/format"
import FundingGiftSizes from "./funding-gift-sizes"

const W = 1060
const TOP = 34
const BOTTOM = 40
const GAP = 14
const LX = 200
const NW = 12
const GX = 500
const GW = 24
const RX = 812
const H = 470
/** Least distance between the centres of two labels in a column, so each
 *  label sits beside its own bar: two lines on the left, a pill in the
 *  middle, three lines on the right. */
const PITCH = { left: 38, mid: 30, right: 46 }

const TARGET_OPTIONS: { value: FlowTarget; label: string }[] = [
  { value: "regions", label: "Regions" },
  { value: "continents", label: "Continents" },
  { value: "projects", label: "Projects" },
]

const AXIS: Record<FlowTarget, string> = { regions: "REGION", continents: "CONTINENT", projects: "PROJECT" }

interface Node {
  y: number
  h: number
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
const many = (n: number, one: string, more: string) => `${formatCount(n)} ${n === 1 ? one : more}`

/** Stack bars top to bottom, pushing each down until its label clears the
 *  one above. Returns the bars (y from 0) and the column's height. */
function stack(ids: number[], height: (i: number) => number, pitch: number) {
  const nodes = new Map<number, Node>()
  let y = 0
  let prev = -pitch / 2
  for (const i of ids) {
    const h = height(i)
    let top = y
    if (top + h / 2 - prev < pitch) top = prev + pitch - h / 2
    nodes.set(i, { y: top, h })
    prev = top + h / 2
    y = top + h + GAP
  }
  return { nodes, height: Math.max(y - GAP, prev + pitch / 2) }
}

/** Where the money went, in words, for a ribbon's tooltip. */
function destPhrase(dest: Destinations, d: number, ds: FundingDataset): string {
  const name = dest.names[d]
  if (dest.by === "projects") {
    const p = dest.project[d]
    if (p >= 0) return ds.projects[p].title ?? "an untitled project"
    return d === dest.none ? "receipts not tied to a project" : "other projects"
  }
  if (d === dest.none) return "projects with no location yet"
  return `projects in ${dest.by === "regions" ? regionPhrase(name) : name}`
}

/**
 * Follow the money: gifts grouped by size flow through whoever recorded them
 * (a trusted source, or the parties themselves) and out to where the money
 * went: a region, a continent, or the largest projects (`?to=`). A second
 * trusted platform shows up as a second gate. The sizes are the default
 * ones unless the visitor sets their own (`?sizes=`, in "Gift sizes").
 *
 * On phones the three columns stack, each a list of bars (its share of the
 * money), since the ribbons need more width than a phone has. From 800px,
 * where the chart can still be wider than its box, the box scrolls
 * sideways with a fade over the cut edge and a line that says so.
 */
export default function FundingFlow({
  ds,
  idx,
  totals,
  bounds,
  onBoundsChange,
}: {
  ds: FundingDataset
  idx: readonly number[]
  /** Per-project totals for the selection, largest first. */
  totals: readonly ProjectTotal[]
  /** Where each gift size starts, in dollars. */
  bounds: readonly number[]
  onBoundsChange: (bounds: number[]) => void
}) {
  const [toParam, setTo] = useUrlParam("to", { defaultValue: "regions" })
  const to: FlowTarget = isFlowTarget(toParam) ? toParam : "regions"
  const [editing, setEditing] = useState(false)
  const panelId = useId()
  const custom = bounds.join("-") !== DEFAULT_GIFT_BOUNDS.join("-")
  const { isDesktop } = useLayoutBreakpoints()
  const scrollRef = useRef<HTMLDivElement>(null)
  const edges = useOverflowEdges(scrollRef)

  const sizeList = useMemo(() => giftSizes(bounds), [bounds])
  const dest = useMemo(() => destinations(ds, to, totals), [ds, to, totals])

  const flow = useMemo(() => {
    const r = ds.receipts
    const gateIndex = new Map<string, number>()
    const gates: { key: string; label: string; total: number; count: number }[] = []
    const sizes = sizeList.map(() => ({ total: 0, count: 0 }))
    const targets = dest.names.map(() => ({ total: 0, count: 0, projects: new Map<number, number>() }))
    const sg = new Map<string, number>() // `${size}:${gate}` -> money
    const gt = new Map<string, number>() // `${gate}:${target}` -> money
    let total = 0
    for (const i of idx) {
      if (!isPrimary(ds, i)) continue
      const a = r.amount[i]
      if (a <= 0) continue
      // A trusted source's gate holds what it recorded, named after it
      // (Ma Earth, GainForest); a receipt another account wrote and a source
      // confirmed joins that source's gate.
      const role = primaryRole(r.buckets[i])
      const source = trustedFundingSource(ds.authors[r.author[i]]) ?? trustedSourceByKey(role)
      const key = source ? `src:${source.did}` : `role:${role}`
      let g = gateIndex.get(key)
      if (g === undefined) {
        g = gates.length
        gateIndex.set(key, g)
        gates.push({
          key,
          label: source ? source.name : confirmRoleLabel(role),
          total: 0,
          count: 0,
        })
      }
      const s = giftSizeIndex(a, bounds)
      const t = dest.of(i)
      const p = r.project[i]
      sizes[s].total += a
      sizes[s].count++
      gates[g].total += a
      gates[g].count++
      targets[t].total += a
      targets[t].count++
      if (p >= 0) targets[t].projects.set(p, (targets[t].projects.get(p) ?? 0) + a)
      sg.set(`${s}:${g}`, (sg.get(`${s}:${g}`) ?? 0) + a)
      gt.set(`${g}:${t}`, (gt.get(`${g}:${t}`) ?? 0) + a)
      total += a
    }
    const byTotal = (list: { total: number }[]) =>
      list
        .map((_, i) => i)
        .filter((i) => list[i].total > 0)
        .sort((a, b) => list[b].total - list[a].total)
    // Largest gate and destination on top; "nowhere" always last. Projects
    // keep their ranking, with "Other projects" after the named ones.
    const gateOrder = byTotal(gates)
    const targetOrder =
      dest.by === "projects"
        ? targets.map((_, i) => i).filter((i) => targets[i].total > 0)
        : byTotal(targets).sort((a, b) => Number(a === dest.none) - Number(b === dest.none))
    return { sizes, gates, gateOrder, targets, targetOrder, sg, gt, total }
  }, [ds, idx, dest, sizeList, bounds])

  const bar = (
    <div className="funding-flow__bar">
      <Button
        size="sm"
        variant="secondary"
        aria-expanded={editing}
        aria-controls={panelId}
        onClick={() => setEditing((v) => !v)}
      >
        <SlidersHorizontal size={14} aria-hidden />
        {custom ? "Gift sizes: your own" : "Gift sizes"}
      </Button>
      <SegmentedControl
        aria-label="Where the money went"
        size="sm"
        value={to}
        onValueChange={(v) => setTo(v)}
        options={TARGET_OPTIONS}
      />
    </div>
  )
  const panel = editing ? (
    <FundingGiftSizes id={panelId} bounds={bounds} onChange={onBoundsChange} />
  ) : null

  if (flow.total <= 0) {
    return (
      <div className="funding-flow">
        {bar}
        {panel}
        <div className="funding-empty">
          <p>No funding in US dollars in this selection.</p>
        </div>
      </div>
    )
  }

  const { sizes, gates, gateOrder, targets, targetOrder, sg, gt, total } = flow
  const sizeIdx = sizes.map((_, i) => i).filter((i) => sizes[i].total > 0)
  const maxNodes = Math.max(sizeIdx.length, gateOrder.length, targetOrder.length)
  // Room for the money: the chart's usual height, or more with many bars.
  const content = Math.max(H - TOP - BOTTOM, maxNodes * 34)
  const k = (content - (maxNodes - 1) * GAP) / total

  const leftCol = stack(sizeIdx, (s) => sizes[s].total * k, PITCH.left)
  const midCol = stack(gateOrder, (g) => gates[g].total * k, PITCH.mid)
  const rightCol = stack(targetOrder, (t) => targets[t].total * k, PITCH.right)
  const inner = Math.max(content, leftCol.height, midCol.height, rightCol.height)
  const svgH = TOP + inner + BOTTOM
  // Centre each column in the drawing.
  const place = (col: ReturnType<typeof stack>) => {
    const off = TOP + (inner - col.height) / 2
    return new Map([...col.nodes].map(([i, n]) => [i, { y: n.y + off, h: n.h }]))
  }
  const left = place(leftCol)
  const mid = place(midCol)
  const right = place(rightCol)

  const ribbon = (x0: number, y0: number, x1: number, y1: number, t: number) => {
    const xm = (x0 + x1) / 2
    return `M${x0} ${y0}C${xm} ${y0} ${xm} ${y1} ${x1} ${y1}L${x1} ${y1 + t}C${xm} ${y1 + t} ${xm} ${y0 + t} ${x0} ${y0 + t}Z`
  }
  // Bigger gifts, darker ribbons.
  const opacity = (s: number) => 0.14 + (0.5 * s) / Math.max(1, sizes.length - 1)

  // Stage 1: size -> gate. Offsets advance per node as ribbons attach.
  const leftOff = new Map([...left].map(([i, n]) => [i, n.y]))
  const midInOff = new Map([...mid].map(([g, n]) => [g, n.y]))
  const stage1: { d: string; o: number; title: string }[] = []
  for (const s of sizeIdx) {
    for (const g of gateOrder) {
      const v = sg.get(`${s}:${g}`) ?? 0
      if (v <= 0) continue
      const t = v * k
      stage1.push({
        d: ribbon(LX + NW, leftOff.get(s)!, GX, midInOff.get(g)!, t),
        o: opacity(s),
        title: `${formatUsd(v)} from gifts ${sizeList[s].label.toLowerCase()}, recorded by ${gates[g].label}`,
      })
      leftOff.set(s, leftOff.get(s)! + t)
      midInOff.set(g, midInOff.get(g)! + t)
    }
  }
  // Stage 2: gate -> destination.
  const midOutOff = new Map([...mid].map(([g, n]) => [g, n.y]))
  const rightOff = new Map([...right].map(([t, n]) => [t, n.y]))
  const stage2: { d: string; title: string }[] = []
  for (const g of gateOrder) {
    for (const d of targetOrder) {
      const v = gt.get(`${g}:${d}`) ?? 0
      if (v <= 0) continue
      const t = v * k
      stage2.push({
        d: ribbon(GX + GW, midOutOff.get(g)!, RX, rightOff.get(d)!, t),
        title: `${formatUsd(v)} recorded by ${gates[g].label} went to ${destPhrase(dest, d, ds)}`,
      })
      midOutOff.set(g, midOutOff.get(g)! + t)
      rightOff.set(d, rightOff.get(d)! + t)
    }
  }

  /** The three lines beside a destination's bar. */
  const targetLines = (d: number): [string, string, string | null] => {
    const t = targets[d]
    const money = formatUsdShort(t.total)
    const p = dest.project[d]
    if (p >= 0) {
      const project = ds.projects[p]
      const owner = ds.accounts[project.owner]
      return [
        clip(owner?.name ?? project.title ?? "Project", 26),
        `${money} · ${many(t.count, "gift", "gifts")}`,
        owner?.name && project.title ? clip(project.title, 32) : null,
      ]
    }
    if (dest.by === "projects") {
      return d === dest.none
        ? ["No project", `${money} · ${many(t.count, "gift", "gifts")}`, null]
        : ["Other projects", `${money} · ${many(t.projects.size, "project", "projects")}`, null]
    }
    let top = -1
    let topSum = -1
    for (const [proj, v] of t.projects) if (v > topSum) [top, topSum] = [proj, v]
    const owner = top >= 0 ? ds.accounts[ds.projects[top].owner] : null
    const topName = owner?.name ?? (top >= 0 ? ds.projects[top].title : null)
    return [
      dest.names[d],
      `${money} · ${many(t.projects.size, "project", "projects")}`,
      topName ? `Largest: ${clip(topName, 26)}` : null,
    ]
  }

  const big = sizes[sizes.length - 1]
  const small = sizes[0]
  const lead = targetOrder.find((d) => d !== dest.none)
  const leadName = (() => {
    if (lead === undefined) return null
    const p = dest.project[lead]
    if (p >= 0) return ds.accounts[ds.projects[p].owner]?.name ?? ds.projects[p].title ?? "One project"
    if (dest.by === "projects") return null
    return `Projects in ${dest.by === "regions" ? regionPhrase(dest.names[lead]) : dest.names[lead]}`
  })()
  const firstBound = formatUsd(bounds[0])
  const lastBound = formatUsd(bounds[bounds.length - 1])

  const pct = (v: number) => Math.round((v / total) * 100)

  const note = (
    <p className="funding-note">
      {big.count > 0 ? (
        <span>
          <b>{many(big.count, "gift", "gifts")}</b> of {lastBound} or more carried{" "}
          <b>{Math.round((big.total / total) * 100)}%</b> of the money.
        </span>
      ) : null}
      {small.count > 0 ? (
        <span>
          <b>{many(small.count, "gift", "gifts")}</b> under {firstBound} carried{" "}
          <b>{Math.round((small.total / total) * 100)}%</b>.
        </span>
      ) : null}
      {lead !== undefined && leadName ? (
        <span>
          {leadName} received <b>{Math.round((targets[lead].total / total) * 100)}%</b>.
        </span>
      ) : null}
    </p>
  )

  // Phones: the three columns one under another, each row a bar of its
  // share of the money.
  if (!isDesktop) {
    return (
      <div className="funding-flow">
        {bar}
        {panel}
        <div className="funding-flow__stack">
          <FlowColumn
            title="Gift size"
            rows={sizeIdx.map((s) => ({
              key: `s${s}`,
              name: sizeList[s].label,
              sub: `${many(sizes[s].count, "gift", "gifts")} · ${formatUsdShort(sizes[s].total)}`,
              share: pct(sizes[s].total),
            }))}
          />
          <FlowColumn
            title="Recorded by"
            rows={gateOrder.map((g) => ({
              key: `g${g}`,
              name: gates[g].label,
              sub: `${many(gates[g].count, "gift", "gifts")} · ${formatUsdShort(gates[g].total)}`,
              share: pct(gates[g].total),
            }))}
          />
          <FlowColumn
            title={AXIS[to].charAt(0) + AXIS[to].slice(1).toLowerCase()}
            rows={targetOrder.map((d) => {
              const [name, sub, extra] = targetLines(d)
              return { key: `t${d}`, name, sub: extra ? `${sub} · ${extra}` : sub, share: pct(targets[d].total) }
            })}
          />
        </div>
        {note}
      </div>
    )
  }

  return (
    <div className="funding-flow">
      {bar}
      {panel}
      <div className="funding-flow__frame">
      <div className="funding-flow__scroll" ref={scrollRef}>
        <svg
          className="funding-flow__svg"
          viewBox={`0 0 ${W} ${svgH}`}
          role="img"
          aria-label={`Money by gift size, by who recorded it, and by ${AXIS[to].toLowerCase()}. ${formatUsd(total)} in all.`}
        >
          <text x={LX} y={16} className="funding-flow__axis">
            GIFT SIZE
          </text>
          <text x={GX + GW / 2} y={16} textAnchor="middle" className="funding-flow__axis">
            RECORDED BY
          </text>
          <text x={RX + NW} y={16} textAnchor="end" className="funding-flow__axis">
            {AXIS[to]}
          </text>
          {stage1.map((r, i) => (
            <path key={`a${i}`} className="funding-flow__ribbon" d={r.d} fillOpacity={r.o}>
              <title>{r.title}</title>
            </path>
          ))}
          {stage2.map((r, i) => (
            <path key={`b${i}`} className="funding-flow__ribbon" d={r.d} fillOpacity={0.3}>
              <title>{r.title}</title>
            </path>
          ))}
          {sizeIdx.map((s) => {
            const n = left.get(s)!
            const cy = n.y + n.h / 2
            return (
              <g key={`l${s}`}>
                <rect x={LX} y={n.y} width={NW} height={Math.max(1.5, n.h)} className="funding-flow__node" />
                <text x={LX - 12} y={cy - 3} textAnchor="end" className="funding-flow__label">
                  {sizeList[s].label}
                </text>
                <text x={LX - 12} y={cy + 13} textAnchor="end" className="funding-flow__sub">
                  {many(sizes[s].count, "gift", "gifts")} · {formatUsdShort(sizes[s].total)} ·{" "}
                  {Math.round((sizes[s].total / total) * 100)}%
                </text>
              </g>
            )
          })}
          {gateOrder.map((g) => {
            const n = mid.get(g)!
            return (
              <rect
                key={`g${g}`}
                x={GX}
                y={n.y}
                width={GW}
                height={Math.max(2, n.h)}
                className="funding-flow__gate"
              />
            )
          })}
          {gateOrder.map((g) => {
            const n = mid.get(g)!
            const cy = n.y + n.h / 2
            const label = gates[g].label
            const w = Math.max(64, label.length * 7 + 18)
            return (
              <g key={`gl${g}`}>
                <rect x={GX + GW / 2 - w / 2} y={cy - 11} width={w} height={22} rx={11} className="funding-flow__pill" />
                <text x={GX + GW / 2} y={cy + 4} textAnchor="middle" className="funding-flow__pill-text">
                  {label}
                </text>
              </g>
            )
          })}
          {targetOrder.map((d) => {
            const n = right.get(d)!
            const cy = n.y + n.h / 2
            const [name, sub, extra] = targetLines(d)
            return (
              <g key={`r${d}`}>
                <rect x={RX} y={n.y} width={NW} height={Math.max(1.5, n.h)} className="funding-flow__node" />
                <text x={RX + NW + 12} y={cy - 9} className="funding-flow__label">
                  {name}
                </text>
                <text x={RX + NW + 12} y={cy + 6} className="funding-flow__sub funding-flow__sub--strong">
                  {sub}
                </text>
                {extra ? (
                  <text x={RX + NW + 12} y={cy + 20} className="funding-flow__sub">
                    {extra}
                  </text>
                ) : null}
              </g>
            )
          })}
        </svg>
      </div>
      <TabStripFades start={edges.start} end={edges.end} />
      </div>
      {edges.start || edges.end ? (
        <p className="funding-flow__hint">Scroll sideways for the whole chart.</p>
      ) : null}
      {note}
    </div>
  )
}

/** One stage of the flow on a phone: its rows, each with its share of the
 *  money as a bar. */
function FlowColumn({
  title,
  rows,
}: {
  title: string
  rows: { key: string; name: string; sub: string; share: number }[]
}) {
  const id = useId()
  return (
    <section className="funding-flow__col" aria-labelledby={id}>
      <p id={id} className="funding-flow__col-title">
        {title}
      </p>
      <ul className="funding-flow__rows">
        {rows.map((r) => (
          <li key={r.key} className="funding-flow__row">
            <span className="funding-flow__row-head">
              <span className="funding-flow__row-name">{r.name}</span>
              <span className="funding-flow__row-share">{r.share}%</span>
            </span>
            <span className="funding-flow__row-sub">{r.sub}</span>
            <span className="funding-flow__meter" aria-hidden="true">
              <span style={{ width: `${Math.max(1, r.share)}%` }} />
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
