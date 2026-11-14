import { CONFIRM_ROLES, type ConfirmRole } from "@/lib/atproto/funding-provenance"
import { confirmRoleLabel } from "./labels"
import {
  BUCKET_BOTH,
  BUCKET_OTHER,
  BUCKET_RECIPIENT,
  BUCKET_SENDER,
  BUCKET_TRUSTED,
  REGIONS,
  type FundingDataset,
  type Region,
} from "./dataset-types"

/**
 * Pure selectors over the /funding dataset. Everything the page shows is
 * derived here from the receipts the "Confirmed by" selection lets through,
 * so the stats, every view and the receipts list always agree.
 *
 * Money is drawn in one currency ({@link PRIMARY_CURRENCY}); receipts in
 * other currencies are counted and listed but not converted.
 */

export const PRIMARY_CURRENCY = "USD"

export const ROLE_BIT: Record<ConfirmRole, number> = {
  trusted: BUCKET_TRUSTED,
  both: BUCKET_BOTH,
  sender: BUCKET_SENDER,
  recipient: BUCKET_RECIPIENT,
  other: BUCKET_OTHER,
}

export function roleMask(roles: ReadonlySet<ConfirmRole>): number {
  let mask = 0
  for (const r of roles) mask |= ROLE_BIT[r]
  return mask
}

/** Indices of the receipts in the selection, newest first. */
export function selectReceipts(ds: FundingDataset, mask: number): number[] {
  const out: number[] = []
  const b = ds.receipts.buckets
  for (let i = 0; i < b.length; i++) if (b[i] & mask) out.push(i)
  return out
}

/** How many receipts fall in each bucket (a receipt can be in several). */
export function bucketCounts(ds: FundingDataset): Record<ConfirmRole, number> {
  const out = { trusted: 0, both: 0, sender: 0, recipient: 0, other: 0 }
  for (const bits of ds.receipts.buckets) {
    for (const role of CONFIRM_ROLES) if (bits & ROLE_BIT[role]) out[role]++
  }
  return out
}

/** The strongest bucket a receipt is in, for its mark and label. */
export function primaryRole(bits: number): ConfirmRole {
  if (bits & BUCKET_BOTH) return "both"
  if (bits & BUCKET_TRUSTED) return "trusted"
  if (bits & BUCKET_RECIPIENT) return "recipient"
  if (bits & BUCKET_SENDER) return "sender"
  return "other"
}

export function isPrimary(ds: FundingDataset, i: number): boolean {
  return ds.currencies[ds.receipts.currency[i]] === PRIMARY_CURRENCY
}

export interface FundingSummary {
  count: number
  /** Sum in the primary currency. */
  total: number
  projects: number
  namedDonors: number
  anonymous: number
  /** Totals in other currencies, largest count first. */
  others: { currency: string; total: number; count: number }[]
}

export function summarize(ds: FundingDataset, idx: readonly number[]): FundingSummary {
  const r = ds.receipts
  let total = 0
  let anonymous = 0
  const projects = new Set<number>()
  const donors = new Set<number>()
  const others = new Map<string, { currency: string; total: number; count: number }>()
  for (const i of idx) {
    const cur = ds.currencies[r.currency[i]]
    if (cur === PRIMARY_CURRENCY) total += r.amount[i]
    else {
      const o = others.get(cur) ?? { currency: cur || "?", total: 0, count: 0 }
      o.total += r.amount[i]
      o.count++
      others.set(cur, o)
    }
    if (r.project[i] >= 0) projects.add(r.project[i])
    if (r.from[i] >= 0) donors.add(r.from[i])
    else if (r.from[i] === -1) anonymous++
  }
  return {
    count: idx.length,
    total,
    projects: projects.size,
    namedDonors: donors.size,
    anonymous,
    others: [...others.values()].sort((a, b) => b.count - a.count),
  }
}

export interface ProjectTotal {
  project: number
  total: number
  count: number
  donors: number
  anonymous: number
  /** First and last gift, unix seconds. */
  first: number
  last: number
}

/** Per-project totals in the primary currency, largest first. */
export function projectTotals(ds: FundingDataset, idx: readonly number[]): ProjectTotal[] {
  const r = ds.receipts
  const by = new Map<number, ProjectTotal & { donorSet: Set<number> }>()
  for (const i of idx) {
    const p = r.project[i]
    if (p < 0 || !isPrimary(ds, i)) continue
    let t = by.get(p)
    if (!t) {
      t = { project: p, total: 0, count: 0, donors: 0, anonymous: 0, first: Infinity, last: 0, donorSet: new Set() }
      by.set(p, t)
    }
    t.total += r.amount[i]
    t.count++
    if (r.from[i] >= 0) t.donorSet.add(r.from[i])
    else if (r.from[i] === -1) t.anonymous++
    if (r.t[i] < t.first) t.first = r.t[i]
    if (r.t[i] > t.last) t.last = r.t[i]
  }
  return [...by.values()]
    .map(({ donorSet, ...t }) => ({ ...t, donors: donorSet.size }))
    .sort((a, b) => b.total - a.total)
}

export interface DayTotal {
  /** Days since the unix epoch (UTC). */
  day: number
  count: number
  total: number
}

const DAY = 86_400

/** Gifts and money per UTC day, oldest first, only days with gifts. */
export function dailyTotals(
  ds: FundingDataset,
  idx: readonly number[],
  keep: (i: number) => boolean = () => true,
): DayTotal[] {
  const r = ds.receipts
  const by = new Map<number, DayTotal>()
  for (const i of idx) {
    if (!keep(i) || !isPrimary(ds, i) || !r.t[i]) continue
    const day = Math.floor(r.t[i] / DAY)
    const d = by.get(day) ?? { day, count: 0, total: 0 }
    d.count++
    d.total += r.amount[i]
    by.set(day, d)
  }
  return [...by.values()].sort((a, b) => a.day - b.day)
}

export const GIFT_SIZES = [
  { label: "Under $25", max: 25 },
  { label: "$25 to $99", max: 100 },
  { label: "$100 to $999", max: 1000 },
  { label: "$1,000 and up", max: Infinity },
] as const

export function giftSizeIndex(amount: number): number {
  return GIFT_SIZES.findIndex((s) => amount < s.max)
}

export type FlowRegion = Region | "none"
export const FLOW_REGIONS: readonly FlowRegion[] = [...REGIONS, "none"]

export interface FlowData {
  sizes: { count: number; total: number }[]
  /** matrix[size][region] = money. */
  matrix: number[][]
  regionTotals: number[]
  /** Distinct projects per region. */
  regionProjects: number[]
  /** The largest project per region (index into ds.projects), or -1. */
  regionTop: number[]
  total: number
}

/** Money by gift size and by the region of the project it went to. */
export function flowData(ds: FundingDataset, idx: readonly number[]): FlowData {
  const r = ds.receipts
  const sizes = GIFT_SIZES.map(() => ({ count: 0, total: 0 }))
  const matrix = GIFT_SIZES.map(() => FLOW_REGIONS.map(() => 0))
  const regionTotals = FLOW_REGIONS.map(() => 0)
  const projectSets = FLOW_REGIONS.map(() => new Map<number, number>())
  let total = 0
  for (const i of idx) {
    if (!isPrimary(ds, i)) continue
    const a = r.amount[i]
    const s = giftSizeIndex(a)
    const p = r.project[i]
    const region = p >= 0 ? ds.projects[p].region : null
    const g = region ? FLOW_REGIONS.indexOf(region) : FLOW_REGIONS.length - 1
    sizes[s].count++
    sizes[s].total += a
    matrix[s][g] += a
    regionTotals[g] += a
    total += a
    if (p >= 0) projectSets[g].set(p, (projectSets[g].get(p) ?? 0) + a)
  }
  const regionTop = projectSets.map((m) => {
    let best = -1
    let bestSum = -1
    for (const [p, sum] of m) if (sum > bestSum) [best, bestSum] = [p, sum]
    return best
  })
  return {
    sizes,
    matrix,
    regionTotals,
    regionProjects: projectSets.map((m) => m.size),
    regionTop,
    total,
  }
}

export function regionLabel(region: FlowRegion): string {
  return region === "none" ? "No location yet" : region
}

/** "Showing 14,887 receipts recorded by Ma Earth or confirmed by both sides." */
export function selectionSentence(roles: ReadonlySet<ConfirmRole>, count: number): string {
  if (roles.size === 0) return "Nothing is switched on. Turn on a source above to see receipts."
  const phrase: Record<ConfirmRole, string> = {
    trusted: `recorded by ${confirmRoleLabel("trusted")}`,
    both: "confirmed by both sides",
    sender: "published only by the funder",
    recipient: "published only by the recipient",
    other: "published by other publishers",
  }
  const parts = CONFIRM_ROLES.filter((r) => roles.has(r)).map((r) => phrase[r])
  const joined =
    parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} or ${parts[parts.length - 1]}`
  return `Showing ${count.toLocaleString("en-US")} ${count === 1 ? "receipt" : "receipts"} ${joined}.`
}
