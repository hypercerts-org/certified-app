"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { FundingDataset } from "@/lib/funding/dataset-types"
import { dailyTotals, isPrimary } from "@/lib/funding/select"
import {
  formatCount,
  formatDay,
  formatMonth,
  formatShortDay,
  formatUsd,
  formatUsdShort,
} from "@/lib/funding/format"
import { prepareCanvas, useCanvasColors, useElementWidth } from "./use-element-width"

const DAY = 86_400
const BARS_H = 84
const GAP = 18
const PLOT_H = 250
const AXIS_H = 26
const LEFT = 44
const RIGHT = 8
const HEIGHT = BARS_H + GAP + PLOT_H + AXIS_H

/** A piecewise-linear time axis: [day, x] stops, ascending. */
type Axis = { day: number; x: number }[]

/**
 * Most gifts can land in a few weeks (a campaign) and leave the rest of the
 * range nearly empty. When the busiest stretch holding 80% of gifts spans
 * under a third of the range, it gets 70% of the width and the quiet days
 * share the rest, with a break mark between them. Otherwise time is linear.
 */
function buildAxis(days: { day: number; count: number }[], x0: number, x1: number): { axis: Axis; breaks: number[] } {
  const first = days[0].day
  const last = days[days.length - 1].day + 1
  const span = last - first
  const linear = { axis: [{ day: first, x: x0 }, { day: last, x: x1 }], breaks: [] }
  if (span < 30 || days.length < 3) return linear
  const total = days.reduce((s, d) => s + d.count, 0)
  let best: [number, number] | null = null
  let sum = 0
  let lo = 0
  for (let hi = 0; hi < days.length; hi++) {
    sum += days[hi].count
    while (lo < hi && sum - days[lo].count >= total * 0.8) {
      sum -= days[lo].count
      lo++
    }
    if (sum >= total * 0.8) {
      const w = days[hi].day + 1 - days[lo].day
      if (!best || w < best[1] - best[0]) best = [days[lo].day, days[hi].day + 1]
    }
  }
  if (!best || best[1] - best[0] > span / 3) return linear
  const [a, b] = best
  const width = x1 - x0
  const quiet = span - (b - a)
  const before = ((a - first) / Math.max(1, quiet)) * width * 0.3
  const axis: Axis = []
  const breaks: number[] = []
  axis.push({ day: first, x: x0 })
  if (a > first) {
    axis.push({ day: a, x: x0 + before })
    breaks.push(x0 + before)
  }
  const bx = x0 + before + width * 0.7
  axis.push({ day: b, x: bx })
  if (b < last) {
    axis.push({ day: last, x: x1 })
    breaks.push(bx)
  } else {
    axis[axis.length - 1].x = x1
  }
  return { axis, breaks }
}

function xOf(axis: Axis, day: number): number {
  for (let i = 1; i < axis.length; i++) {
    if (day <= axis[i].day || i === axis.length - 1) {
      const a = axis[i - 1]
      const b = axis[i]
      return a.x + ((day - a.day) / Math.max(1e-9, b.day - a.day)) * (b.x - a.x)
    }
  }
  return axis[0].x
}

function dayOf(axis: Axis, x: number): number {
  for (let i = 1; i < axis.length; i++) {
    if (x <= axis[i].x || i === axis.length - 1) {
      const a = axis[i - 1]
      const b = axis[i]
      return a.day + ((x - a.x) / Math.max(1e-9, b.x - a.x)) * (b.day - a.day)
    }
  }
  return axis[0].day
}

/**
 * Every gift in time: one dot per gift, placed by date and amount, with the
 * money per day above. Hover a day for what came in.
 */
export default function FundingPulse({ ds, idx }: { ds: FundingDataset; idx: readonly number[] }) {
  const [wrapRef, width] = useElementWidth<HTMLDivElement>()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const colors = useCanvasColors()
  const [hover, setHover] = useState<{ day: number; x: number } | null>(null)

  const data = useMemo(() => {
    const days = dailyTotals(ds, idx)
    const gifts: { t: number; a: number }[] = []
    const r = ds.receipts
    let maxA = 1
    for (const i of idx) {
      if (!isPrimary(ds, i) || !r.t[i] || r.amount[i] <= 0) continue
      gifts.push({ t: r.t[i], a: r.amount[i] })
      if (r.amount[i] > maxA) maxA = r.amount[i]
    }
    const byDay = new Map(days.map((d) => [d.day, d]))
    return { days, gifts, maxA, byDay }
  }, [ds, idx])

  const geometry = useMemo(() => {
    if (width <= 0 || data.days.length === 0) return null
    const { axis, breaks } = buildAxis(data.days, LEFT, width - RIGHT)
    const decades = Math.max(1, Math.ceil(Math.log10(data.maxA)))
    const maxDay = Math.max(...data.days.map((d) => d.total))
    return { axis, breaks, decades, maxDay }
  }, [width, data])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !geometry || !colors.key) return
    const ctx = prepareCanvas(canvas, width, HEIGHT)
    if (!ctx) return
    const { axis, breaks, decades, maxDay } = geometry
    const plotTop = BARS_H + GAP
    const plotBottom = plotTop + PLOT_H
    const yOf = (a: number) => plotBottom - (Math.log10(Math.max(1, a)) / decades) * PLOT_H

    // Grid + y labels.
    ctx.font = "11px Inter, system-ui, sans-serif"
    ctx.textBaseline = "middle"
    ctx.textAlign = "right"
    for (let d = 0; d <= decades; d++) {
      const y = yOf(10 ** d)
      ctx.globalAlpha = 0.12
      ctx.fillStyle = colors.fg
      ctx.fillRect(LEFT, Math.round(y), width - LEFT - RIGHT, 1)
      ctx.globalAlpha = 1
      ctx.fillStyle = colors.muted
      ctx.fillText(formatUsdShort(10 ** d), LEFT - 8, y)
    }
    ctx.fillText("per day", LEFT - 8, BARS_H - 8)

    // Daily bars.
    ctx.fillStyle = colors.fg
    for (const d of data.days) {
      const x = xOf(axis, d.day)
      const w = Math.max(1, xOf(axis, d.day + 1) - x - 1)
      const h = Math.max(1, (d.total / maxDay) * (BARS_H - 6))
      ctx.globalAlpha = hover && hover.day === d.day ? 1 : 0.62
      ctx.fillRect(x, BARS_H - h, w, h)
    }

    // One dot per gift. Small gifts are faint so density shows; large
    // gifts are solid.
    for (const g of data.gifts) {
      const day = g.t / DAY
      const x = xOf(axis, day)
      const y = yOf(g.a)
      const large = g.a >= 1000
      ctx.globalAlpha = large ? 0.9 : 0.22
      ctx.beginPath()
      ctx.arc(x, y, large ? 2.2 : 1.1, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1

    // Break marks.
    ctx.strokeStyle = colors.muted
    ctx.lineWidth = 1.2
    for (const bx of breaks) {
      for (const y of [BARS_H, plotBottom]) {
        ctx.beginPath()
        ctx.moveTo(bx - 4, y + 4)
        ctx.lineTo(bx - 1, y - 4)
        ctx.moveTo(bx + 1, y + 4)
        ctx.lineTo(bx + 4, y - 4)
        ctx.stroke()
      }
    }

    // X labels: dates inside the busy stretch, months outside it.
    ctx.fillStyle = colors.muted
    ctx.textAlign = "center"
    ctx.textBaseline = "top"
    const labelY = plotBottom + 8
    let lastX = -Infinity
    const first = axis[0].day
    const last = axis[axis.length - 1].day
    const pxPerDay = (width - LEFT - RIGHT) / Math.max(1, last - first)
    for (let day = Math.ceil(first); day < last; day++) {
      const x = xOf(axis, day)
      const localPx = xOf(axis, day + 1) - x
      const date = new Date(day * DAY * 1000)
      const isMonthStart = date.getUTCDate() === 1
      const dense = localPx > pxPerDay * 1.5
      const show = dense ? (day - Math.ceil(first)) % 7 === 0 : isMonthStart
      if (!show || x - lastX < 56) continue
      ctx.fillText(dense ? formatShortDay(day * DAY) : formatMonth(day * DAY), x, labelY)
      lastX = x
    }
  }, [geometry, data, colors, width, hover])

  if (data.days.length === 0) {
    return (
      <div ref={wrapRef} className="funding-empty">
        <p>No dated funding in US dollars in this selection.</p>
      </div>
    )
  }

  const hovered = hover ? data.byDay.get(hover.day) : undefined
  const totalGifts = data.gifts.length
  return (
    <div className="funding-pulse">
      <div
        ref={wrapRef}
        className="funding-pulse__chart"
        onMouseMove={(e) => {
          if (!geometry) return
          const rect = e.currentTarget.getBoundingClientRect()
          const x = e.clientX - rect.left
          if (x < LEFT || x > width - RIGHT) return setHover(null)
          const day = Math.floor(dayOf(geometry.axis, x))
          setHover(data.byDay.has(day) ? { day, x } : null)
        }}
        onMouseLeave={() => setHover(null)}
      >
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`${formatCount(totalGifts)} gifts by date and amount, with money per day.`}
        />
        {hover && hovered ? (
          <div
            className="funding-tip"
            style={{ left: Math.min(Math.max(hover.x, 90), width - 90), top: 0 }}
            role="status"
          >
            <b>{formatDay(hover.day * DAY)}</b>
            <span>
              {formatCount(hovered.count)} gifts · {formatUsd(hovered.total)}
            </span>
          </div>
        ) : null}
      </div>
      <p className="funding-note">
        <span>One dot per gift; height is the amount. Solid dots are gifts of $1,000 or more.</span>
        <span>Bars: money per day.</span>
      </p>
    </div>
  )
}
