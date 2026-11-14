"use client"

import { useMemo } from "react"
import type { FundingDataset } from "@/lib/funding/dataset-types"
import { confirmRoleLabel } from "@/lib/funding/labels"
import { isTrustedFundingSource } from "@/lib/funding/trusted-sources"
import {
  FLOW_REGIONS,
  GIFT_SIZES,
  giftSizeIndex,
  isPrimary,
  primaryRole,
  regionLabel,
} from "@/lib/funding/select"
import { formatCount, formatUsd, formatUsdShort } from "@/lib/funding/format"

const W = 1040
const TOP = 34
const BOTTOM = 40
const GAP = 14
const LX = 200
const NW = 12
const GX = 500
const GW = 24
const RX = 812
const LABEL_GAP = 46

interface Node {
  y: number
  h: number
}

/**
 * Follow the money: gifts grouped by size flow through whoever recorded them
 * (a trusted source, or the parties themselves) and out to the region of the
 * project they funded. A second trusted platform shows up as a second gate.
 */
export default function FundingFlow({ ds, idx }: { ds: FundingDataset; idx: readonly number[] }) {
  const flow = useMemo(() => {
    const r = ds.receipts
    const gateIndex = new Map<string, number>()
    const gates: { key: string; label: string; total: number; count: number }[] = []
    const sizes = GIFT_SIZES.map(() => ({ total: 0, count: 0 }))
    const regions = FLOW_REGIONS.map(() => ({ total: 0, projects: new Map<number, number>() }))
    const sg = new Map<string, number>() // `${size}:${gate}` -> money
    const gr = new Map<string, number>() // `${gate}:${region}` -> money
    let total = 0
    for (const i of idx) {
      if (!isPrimary(ds, i)) continue
      const a = r.amount[i]
      if (a <= 0) continue
      const author = ds.authors[r.author[i]]
      const key = isTrustedFundingSource(author) ? `src:${author}` : `role:${primaryRole(r.buckets[i])}`
      let g = gateIndex.get(key)
      if (g === undefined) {
        g = gates.length
        gateIndex.set(key, g)
        const source = ds.sources.find((s) => `src:${s.did}` === key)
        gates.push({
          key,
          label: source ? source.name : confirmRoleLabel(primaryRole(r.buckets[i])),
          total: 0,
          count: 0,
        })
      }
      const s = giftSizeIndex(a)
      const p = r.project[i]
      const region = p >= 0 ? ds.projects[p].region : null
      const rg = region ? FLOW_REGIONS.indexOf(region) : FLOW_REGIONS.length - 1
      sizes[s].total += a
      sizes[s].count++
      gates[g].total += a
      gates[g].count++
      regions[rg].total += a
      if (p >= 0) regions[rg].projects.set(p, (regions[rg].projects.get(p) ?? 0) + a)
      sg.set(`${s}:${g}`, (sg.get(`${s}:${g}`) ?? 0) + a)
      gr.set(`${g}:${rg}`, (gr.get(`${g}:${rg}`) ?? 0) + a)
      total += a
    }
    // Largest gate on top; keep the original index for the ribbon maps.
    const gateOrder = gates.map((_, i) => i).sort((a, b) => gates[b].total - gates[a].total)
    return { sizes, gates, gateOrder, regions, sg, gr, total }
  }, [ds, idx])

  if (flow.total <= 0) {
    return (
      <div className="funding-empty">
        <p>No funding in US dollars in this selection.</p>
      </div>
    )
  }

  const { sizes, gates, gateOrder, regions, sg, gr, total } = flow
  const sizeIdx = sizes.map((_, i) => i).filter((i) => sizes[i].total > 0)
  const regionIdx = regions.map((_, i) => i).filter((i) => regions[i].total > 0)
  const maxNodes = Math.max(sizeIdx.length, gateOrder.length, regionIdx.length)
  const H = 470
  const avail = H - TOP - BOTTOM - (maxNodes - 1) * GAP
  const k = avail / total

  const stack = (ids: number[], value: (i: number) => number) => {
    const h = ids.reduce((s, i) => s + value(i) * k, 0) + (ids.length - 1) * GAP
    let y = TOP + (H - TOP - BOTTOM - h) / 2
    const out = new Map<number, Node>()
    for (const i of ids) {
      const n = { y, h: value(i) * k }
      out.set(i, n)
      y += n.h + GAP
    }
    return out
  }
  const left = stack(sizeIdx, (i) => sizes[i].total)
  const mid = stack(gateOrder, (g) => gates[g].total)
  const right = stack(regionIdx, (r) => regions[r].total)

  const ribbon = (x0: number, y0: number, x1: number, y1: number, t: number) => {
    const xm = (x0 + x1) / 2
    return `M${x0} ${y0}C${xm} ${y0} ${xm} ${y1} ${x1} ${y1}L${x1} ${y1 + t}C${xm} ${y1 + t} ${xm} ${y0 + t} ${x0} ${y0 + t}Z`
  }
  const opacity = [0.16, 0.28, 0.44, 0.64]

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
        o: opacity[s],
        title: `${formatUsd(v)} from gifts ${GIFT_SIZES[s].label.toLowerCase()}, recorded by ${gates[g].label}`,
      })
      leftOff.set(s, leftOff.get(s)! + t)
      midInOff.set(g, midInOff.get(g)! + t)
    }
  }
  // Stage 2: gate -> region.
  const midOutOff = new Map([...mid].map(([g, n]) => [g, n.y]))
  const rightOff = new Map([...right].map(([r, n]) => [r, n.y]))
  const stage2: { d: string; title: string }[] = []
  for (const g of gateOrder) {
    for (const rg of regionIdx) {
      const v = gr.get(`${g}:${rg}`) ?? 0
      if (v <= 0) continue
      const t = v * k
      stage2.push({
        d: ribbon(GX + GW, midOutOff.get(g)!, RX, rightOff.get(rg)!, t),
        title: `${formatUsd(v)} recorded by ${gates[g].label} went to projects in ${regionLabel(FLOW_REGIONS[rg])}`,
      })
      midOutOff.set(g, midOutOff.get(g)! + t)
      rightOff.set(rg, rightOff.get(rg)! + t)
    }
  }

  // Right labels, pushed apart so small regions don't collide.
  const rightLabels: { rg: number; cy: number; topName: string | null }[] = []
  for (const rg of regionIdx) {
    const n = right.get(rg)!
    const prev = rightLabels.length ? rightLabels[rightLabels.length - 1].cy : -Infinity
    const cy = Math.max(n.y + n.h / 2, prev + LABEL_GAP)
    let top = -1
    let topSum = -1
    for (const [p, v] of regions[rg].projects) if (v > topSum) [top, topSum] = [p, v]
    const owner = top >= 0 ? ds.accounts[ds.projects[top].owner] : null
    const topName = owner?.name ?? (top >= 0 ? ds.projects[top].title : null)
    rightLabels.push({ rg, cy, topName })
  }
  // Gate labels, the same way.
  const gateLabels: { g: number; cy: number }[] = []
  for (const g of gateOrder) {
    const n = mid.get(g)!
    const prev = gateLabels.length ? gateLabels[gateLabels.length - 1].cy : -Infinity
    gateLabels.push({ g, cy: Math.max(n.y + n.h / 2, prev + 30) })
  }
  const lastCy = rightLabels.length ? rightLabels[rightLabels.length - 1].cy : 0
  const lastGy = gateLabels.length ? gateLabels[gateLabels.length - 1].cy : 0
  const svgH = Math.max(H, Math.ceil(lastCy + 30), Math.ceil(lastGy + 24))

  const big = sizes[3]
  const small = sizes[0]
  const topRegion = regionIdx.reduce((a, b) => (regions[b].total > regions[a].total ? b : a), regionIdx[0])

  return (
    <div className="funding-flow">
      <div className="funding-flow__scroll">
        <svg
          className="funding-flow__svg"
          viewBox={`0 0 ${W} ${svgH}`}
          role="img"
          aria-label={`Money by gift size, by who recorded it, and by region. ${formatUsd(total)} in all.`}
        >
          <text x={LX} y={16} className="funding-flow__axis">
            GIFT SIZE
          </text>
          <text x={GX + GW / 2} y={16} textAnchor="middle" className="funding-flow__axis">
            RECORDED BY
          </text>
          <text x={RX + NW} y={16} textAnchor="end" className="funding-flow__axis">
            REGION
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
                  {GIFT_SIZES[s].label}
                </text>
                <text x={LX - 12} y={cy + 13} textAnchor="end" className="funding-flow__sub">
                  {formatCount(sizes[s].count)} gifts · {formatUsdShort(sizes[s].total)} ·{" "}
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
          {gateLabels.map(({ g, cy }) => {
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
          {regionIdx.map((rg) => {
            const n = right.get(rg)!
            return <rect key={`r${rg}`} x={RX} y={n.y} width={NW} height={Math.max(1.5, n.h)} className="funding-flow__node" />
          })}
          {rightLabels.map(({ rg, cy, topName }) => (
            <g key={`rl${rg}`}>
              <text x={RX + NW + 12} y={cy - 9} className="funding-flow__label">
                {regionLabel(FLOW_REGIONS[rg])}
              </text>
              <text x={RX + NW + 12} y={cy + 6} className="funding-flow__sub funding-flow__sub--strong">
                {formatUsdShort(regions[rg].total)} · {formatCount(regions[rg].projects.size)} projects
              </text>
              {topName ? (
                <text x={RX + NW + 12} y={cy + 20} className="funding-flow__sub">
                  Largest: {topName.length > 26 ? `${topName.slice(0, 25)}…` : topName}
                </text>
              ) : null}
            </g>
          ))}
        </svg>
      </div>
      <p className="funding-note">
        {big.count > 0 ? (
          <span>
            <b>{formatCount(big.count)} gifts</b> of $1,000 or more carried{" "}
            <b>{Math.round((big.total / total) * 100)}%</b> of the money.
          </span>
        ) : null}
        {small.count > 0 ? (
          <span>
            <b>{formatCount(small.count)} gifts</b> under $25 carried{" "}
            <b>{Math.round((small.total / total) * 100)}%</b>.
          </span>
        ) : null}
        {topRegion !== undefined && FLOW_REGIONS[topRegion] !== "none" ? (
          <span>
            Projects in {regionLabel(FLOW_REGIONS[topRegion])} received{" "}
            <b>{Math.round((regions[topRegion].total / total) * 100)}%</b>.
          </span>
        ) : null}
      </p>
    </div>
  )
}
