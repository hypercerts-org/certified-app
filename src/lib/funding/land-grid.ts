import { LAND_MASK, unpackLandMask } from "./land-mask"

/**
 * Land as a grid of dots for the /funding map and globe, at the spacing the
 * zoom calls for. The coarse grid (land-mask.ts, 1.5 degrees) draws at
 * once; the fine one (land-mask-fine.ts, 0.25 degrees, ~11 KB gzipped)
 * loads when a map first draws and then serves every spacing: 1.5, 0.75,
 * 0.5 and 0.25 degrees, each a block of fine cells counted as land when a
 * third or more of it is. Zooming in picks a finer spacing, so coastlines
 * gain dots instead of the dots just spreading apart.
 */
export interface LandGrid {
  /** Degrees between dots. */
  step: number
  /** Centre of row 0 and column 0. */
  lat0: number
  lon0: number
  cols: number
  rows: number
  /** One byte per cell, row by row: 1 = land. */
  bits: Uint8Array
}

let coarse: LandGrid | null = null

/** The 1.5-degree grid that ships with the page. */
export function coarseLand(): LandGrid {
  coarse ??= {
    step: LAND_MASK.step,
    lat0: LAND_MASK.lat0,
    lon0: LAND_MASK.lon0,
    cols: LAND_MASK.cols,
    rows: LAND_MASK.rows,
    bits: unpackLandMask(),
  }
  return coarse
}

/** Fine cells per dot, coarsest first. */
const LEVELS = [6, 3, 2, 1] as const

let fine: { step: number; lat0: number; lon0: number; cols: number; rows: number; bits: Uint8Array } | null = null
let loading: Promise<boolean> | null = null
const pooled = new Map<number, LandGrid>()

/** Loads the fine grid once; resolves true when it is ready. */
export function loadFineLand(): Promise<boolean> {
  if (fine) return Promise.resolve(true)
  loading ??= import("./land-mask-fine")
    .then(({ FINE_LAND }) => {
      const bits = new Uint8Array(FINE_LAND.cols * FINE_LAND.rows)
      FINE_LAND.runs.split(",").forEach((row, r) => {
        let c = r * FINE_LAND.cols
        let land = 0
        for (const run of row.split(".")) {
          const n = parseInt(run, 36)
          if (land) bits.fill(1, c, c + n)
          c += n
          land ^= 1
        }
      })
      fine = { ...FINE_LAND, bits }
      return true
    })
    .catch(() => {
      loading = null
      return false
    })
  return loading
}

export function fineLandReady(): boolean {
  return fine !== null
}

function level(n: number): LandGrid {
  const f = fine!
  let grid = pooled.get(n)
  if (grid) return grid
  const cols = f.cols / n
  const rows = f.rows / n
  const bits = new Uint8Array(cols * rows)
  const need = (n * n) / 3
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let count = 0
      for (let i = 0; i < n; i++) {
        const base = (r * n + i) * f.cols + c * n
        for (let j = 0; j < n; j++) count += f.bits[base + j]
      }
      if (count >= need) bits[r * cols + c] = 1
    }
  }
  const half = (n * f.step) / 2
  grid = { step: n * f.step, lat0: f.lat0 - half, lon0: f.lon0 + half, cols, rows, bits }
  pooled.set(n, grid)
  return grid
}

/** The grid to draw at `pxPerDegree`: the finest whose dots are at least
 *  `minGap` pixels apart, or the coarsest when even that is closer. */
export function landFor(pxPerDegree: number, minGap: number): LandGrid {
  if (!fine) return coarseLand()
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    const n = LEVELS[i]
    if (n * fine.step * pxPerDegree >= minGap) return level(n)
  }
  return level(LEVELS[0])
}
