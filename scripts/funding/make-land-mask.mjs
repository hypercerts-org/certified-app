#!/usr/bin/env node
// Rasterises Natural Earth land (world-atlas's land-50m.json, TopoJSON) to
// the fine land grid behind the /funding map and globe when zoomed in, and
// writes src/lib/funding/land-mask-fine.ts.
//
//   npm i --no-save world-atlas
//   node scripts/funding/make-land-mask.mjs node_modules/world-atlas/land-50m.json
//
// A cell is land when its centre is (even-odd fill, row by row). Rows run
// from 76°N down to 56°S like the coarse grid in land-mask.ts; each row is
// stored as run lengths, water first.

import { readFileSync, writeFileSync } from "node:fs"

const STEP = 0.25
const LAT0 = 76
const LAT_SPAN = 132
const COLS = Math.round(360 / STEP)
const ROWS = Math.round(LAT_SPAN / STEP)

const src = process.argv[2]
if (!src) {
  console.error("usage: make-land-mask.mjs <world-atlas land-50m.json>")
  process.exit(1)
}
const topo = JSON.parse(readFileSync(src, "utf8"))

// TopoJSON arcs are quantised and delta-encoded.
const [sx, sy] = topo.transform.scale
const [tx, ty] = topo.transform.translate
const arcs = topo.arcs.map((arc) => {
  let x = 0
  let y = 0
  return arc.map(([dx, dy]) => {
    x += dx
    y += dy
    return [x * sx + tx, y * sy + ty]
  })
})
const arcPoints = (i) => (i >= 0 ? arcs[i] : arcs[~i].slice().reverse())
const ring = (ids) => {
  const out = []
  for (const id of ids) {
    const pts = arcPoints(id)
    out.push(...(out.length ? pts.slice(1) : pts))
  }
  return out
}

const rings = []
const collect = (geom) => {
  if (geom.type === "GeometryCollection") geom.geometries.forEach(collect)
  else if (geom.type === "Polygon") geom.arcs.forEach((r) => rings.push(ring(r)))
  else if (geom.type === "MultiPolygon") geom.arcs.forEach((p) => p.forEach((r) => rings.push(ring(r))))
}
Object.values(topo.objects).forEach(collect)

// Every edge, for the scanline fill.
const edges = []
for (const r of rings) {
  for (let i = 0; i < r.length - 1; i++) {
    const [x0, y0] = r[i]
    const [x1, y1] = r[i + 1]
    if (y0 !== y1) edges.push([x0, y0, x1, y1])
  }
}

const rows = []
let land = 0
for (let row = 0; row < ROWS; row++) {
  const lat = LAT0 - (row + 0.5) * STEP
  const xs = []
  for (const [x0, y0, x1, y1] of edges) {
    if ((y0 > lat) !== (y1 > lat)) xs.push(x0 + ((lat - y0) * (x1 - x0)) / (y1 - y0))
  }
  xs.sort((a, b) => a - b)
  const bits = new Uint8Array(COLS)
  for (let k = 0; k + 1 < xs.length; k += 2) {
    const from = Math.max(0, Math.ceil((xs[k] + 180) / STEP - 0.5))
    const to = Math.min(COLS - 1, Math.floor((xs[k + 1] + 180) / STEP - 0.5))
    for (let c = from; c <= to; c++) bits[c] = 1
  }
  // Run lengths, water first, in base 36.
  const runs = []
  let value = 0
  let n = 0
  for (let c = 0; c < COLS; c++) {
    if (bits[c] === value) n++
    else {
      runs.push(n)
      value = bits[c]
      n = 1
    }
    land += bits[c]
  }
  runs.push(n)
  rows.push(runs.map((v) => v.toString(36)).join("."))
}

const body = rows.join(",")
const out = `/**
 * The fine land grid for the /funding map and globe when zoomed in: ${COLS} x
 * ${ROWS} cells of ${STEP} degrees, rows from ${LAT0} degrees north, columns
 * from 180 degrees west. Each row is run lengths in base 36, water first,
 * "." between runs and "," between rows. Rasterised from Natural Earth's
 * 1:50m land (public domain, via world-atlas) by
 * scripts/funding/make-land-mask.mjs. Loaded only on zooming in.
 */
export const FINE_LAND = {
  step: ${STEP},
  lat0: ${LAT0},
  lon0: -180,
  cols: ${COLS},
  rows: ${ROWS},
  runs:
    "${body}",
} as const
`
writeFileSync(new URL("../../src/lib/funding/land-mask-fine.ts", import.meta.url), out)
console.log(`${ROWS} rows x ${COLS} cols, ${land} land cells, ${(body.length / 1024).toFixed(1)} KB of runs`)
