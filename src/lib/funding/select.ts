import {
  CONFIRM_ROLES,
  SOURCE_CONFIRM_ROLES,
  isSourceRole,
  type ConfirmRole,
} from "@/lib/atproto/funding-provenance"
import { orPhrases, recordedByPhrase } from "./labels"
import { TRUSTED_FUNDING_SOURCES, type TrustedSourceKey } from "./trusted-sources"
import {
  BUCKET_BOTH,
  BUCKET_OTHER,
  BUCKET_RECIPIENT,
  BUCKET_SENDER,
  BUCKET_TRUSTED,
  sourceBucket,
  type FundingDataset,
} from "./dataset-types"
import { CONTINENTS, REGIONS, continentFor, regionFor } from "./geo"

/**
 * Pure selectors over the /funding dataset. Everything the page shows is
 * derived here from the receipts the "Confirmed by" selection lets through,
 * so the stats, every view and the receipts list always agree.
 *
 * Money is drawn in one currency ({@link PRIMARY_CURRENCY}); receipts in
 * other currencies are counted and listed but not converted.
 */

export const PRIMARY_CURRENCY = "USD"

/** The bit each "Confirmed by" choice selects: a trusted source's own bit
 *  (not BUCKET_TRUSTED, which every source's receipts share). */
export const ROLE_BIT: Record<ConfirmRole, number> = {
  ...(Object.fromEntries(
    TRUSTED_FUNDING_SOURCES.map((s) => [s.key, sourceBucket(s.did)]),
  ) as Record<TrustedSourceKey, number>),
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

/** The bits for a receipt in these buckets (`confirmBuckets`): a trusted
 *  source's bucket adds BUCKET_TRUSTED as well as its own bit. */
export function bucketBitsFor(roles: Iterable<ConfirmRole>): number {
  let bits = 0
  for (const r of roles) bits |= ROLE_BIT[r] | (isSourceRole(r) ? BUCKET_TRUSTED : 0)
  return bits
}

/** The bits a choice's mark (the seal) is drawn from. */
export function roleSealBits(role: ConfirmRole): number {
  return isSourceRole(role) ? BUCKET_TRUSTED : ROLE_BIT[role]
}

/** The trusted sources whose bits are set, in list order. */
export function sourcesIn(bits: number): TrustedSourceKey[] {
  return SOURCE_CONFIRM_ROLES.filter((k) => bits & ROLE_BIT[k])
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
  const out = Object.fromEntries(CONFIRM_ROLES.map((r) => [r, 0])) as Record<ConfirmRole, number>
  for (const bits of ds.receipts.buckets) {
    for (const role of CONFIRM_ROLES) if (bits & ROLE_BIT[role]) out[role]++
  }
  return out
}

/** The strongest bucket a receipt is in, for its mark and label: both
 *  sides, then the (first) trusted source that recorded it, then one side,
 *  then another publisher. */
export function primaryRole(bits: number): ConfirmRole {
  if (bits & BUCKET_BOTH) return "both"
  const [source] = sourcesIn(bits)
  if (source) return source
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

/** Where each gift size starts, in US dollars: under $25, $25 to $99, $100
 *  to $999, and $1,000 and up. Visitors can set their own (`?sizes=`). */
export const DEFAULT_GIFT_BOUNDS: readonly number[] = [25, 100, 1000]
/** At most seven sizes. */
export const MAX_GIFT_BOUNDS = 6

export interface GiftSize {
  label: string
  /** Inclusive lower bound, exclusive upper bound, in dollars. */
  min: number
  max: number
}

const dollars = (n: number) => `$${n.toLocaleString("en-US")}`

/** The sizes the boundaries make, smallest first. */
export function giftSizes(bounds: readonly number[] = DEFAULT_GIFT_BOUNDS): GiftSize[] {
  const out: GiftSize[] = []
  for (let i = 0; i <= bounds.length; i++) {
    const min = i === 0 ? 0 : bounds[i - 1]
    const max = i === bounds.length ? Infinity : bounds[i]
    const label =
      i === 0
        ? `Under ${dollars(max)}`
        : max === Infinity
          ? `${dollars(min)} and up`
          : max - 1 <= min
            ? dollars(min)
            : `${dollars(min)} to ${dollars(max - 1)}`
    out.push({ label, min, max })
  }
  return out
}

export function giftSizeIndex(amount: number, bounds: readonly number[] = DEFAULT_GIFT_BOUNDS): number {
  for (let i = 0; i < bounds.length; i++) if (amount < bounds[i]) return i
  return bounds.length
}

/** Whole dollars above zero, each once, smallest first, at most six. */
export function normalizeGiftBounds(values: readonly number[]): number[] {
  const whole = values.filter((v) => Number.isFinite(v) && v >= 1).map((v) => Math.round(v))
  return [...new Set(whole)].sort((a, b) => a - b).slice(0, MAX_GIFT_BOUNDS)
}

/** `?sizes=10-50-250` back to boundaries; null when missing or not valid. */
export function parseGiftBounds(param: string | null | undefined): number[] | null {
  if (!param) return null
  const parts = param.split("-")
  if (parts.length > MAX_GIFT_BOUNDS || parts.some((p) => !/^\d{1,9}$/.test(p))) return null
  const bounds = normalizeGiftBounds(parts.map(Number))
  return bounds.length > 0 ? bounds : null
}

/** The `?sizes=` value for boundaries, or null for the default ones. */
export function giftBoundsParam(bounds: readonly number[]): string | null {
  const same =
    bounds.length === DEFAULT_GIFT_BOUNDS.length && bounds.every((b, i) => b === DEFAULT_GIFT_BOUNDS[i])
  return same ? null : bounds.join("-")
}

/** What the right side of the Flow groups the money by. */
export const FLOW_TARGETS = ["regions", "continents", "projects"] as const
export type FlowTarget = (typeof FLOW_TARGETS)[number]

export function isFlowTarget(v: string | null | undefined): v is FlowTarget {
  return (FLOW_TARGETS as readonly string[]).includes(v ?? "")
}

/** How many projects Flow names before "Other projects". */
export const FLOW_TOP_PROJECTS = 12

const places = new WeakMap<FundingDataset, { region: Int8Array; continent: Int8Array }>()

/** Each project's region and continent (indexes into REGIONS and
 *  CONTINENTS; -1 without a location), worked out once per dataset. */
export function projectPlaces(ds: FundingDataset): { region: Int8Array; continent: Int8Array } {
  let out = places.get(ds)
  if (!out) {
    const region = new Int8Array(ds.projects.length).fill(-1)
    const continent = new Int8Array(ds.projects.length).fill(-1)
    ds.projects.forEach((p, i) => {
      if (p.lat == null || p.lng == null) return
      region[i] = REGIONS.indexOf(regionFor(p.lat, p.lng))
      continent[i] = CONTINENTS.indexOf(continentFor(p.lat, p.lng))
    })
    out = { region, continent }
    places.set(ds, out)
  }
  return out
}

/** Where money can go under a grouping. */
export interface Destinations {
  by: FlowTarget
  names: string[]
  /** For "projects": the project each destination is (index into
   *  ds.projects), or -1 for "Other projects" and "No project". */
  project: number[]
  /** The destination for a receipt. */
  of: (i: number) => number
  /** The destination for receipts with nowhere to put them (no project, or
   *  no location): always the last. */
  none: number
}

/** The destinations for a grouping. `totals` (largest first) picks the
 *  projects that get their own place. */
export function destinations(
  ds: FundingDataset,
  by: FlowTarget,
  totals: readonly ProjectTotal[],
): Destinations {
  const r = ds.receipts
  if (by === "projects") {
    const top = totals.slice(0, FLOW_TOP_PROJECTS).map((t) => t.project)
    const slot = new Map(top.map((p, i) => [p, i]))
    const other = top.length
    const none = top.length + 1
    return {
      by,
      names: [...top.map((p) => ds.projects[p].title ?? "Untitled project"), "Other projects", "No project"],
      project: [...top, -1, -1],
      of: (i) => {
        const p = r.project[i]
        return p < 0 ? none : slot.get(p) ?? other
      },
      none,
    }
  }
  const place = projectPlaces(ds)[by === "regions" ? "region" : "continent"]
  const names: string[] = [...(by === "regions" ? REGIONS : CONTINENTS), "No location yet"]
  const none = names.length - 1
  return {
    by,
    names,
    project: names.map(() => -1),
    of: (i) => {
      const p = r.project[i]
      const g = p >= 0 ? place[p] : -1
      return g >= 0 ? g : none
    },
    none,
  }
}

export interface DestinationTotal {
  /** Index into Destinations.names. */
  dest: number
  total: number
  count: number
  /** Distinct projects. */
  projects: number
  /** The project that received most, or -1. */
  top: number
}

/** Money per destination in the primary currency, largest first, empty
 *  destinations left out. */
export function destinationTotals(
  ds: FundingDataset,
  idx: readonly number[],
  dest: Destinations,
): DestinationTotal[] {
  const r = ds.receipts
  const sums = dest.names.map(() => ({ total: 0, count: 0, projects: new Map<number, number>() }))
  for (const i of idx) {
    if (!isPrimary(ds, i)) continue
    const a = r.amount[i]
    const s = sums[dest.of(i)]
    s.total += a
    s.count++
    const p = r.project[i]
    if (p >= 0) s.projects.set(p, (s.projects.get(p) ?? 0) + a)
  }
  return sums
    .map((s, dest) => {
      let top = -1
      let best = -1
      for (const [p, v] of s.projects) if (v > best) [top, best] = [p, v]
      return { dest, total: s.total, count: s.count, projects: s.projects.size, top }
    })
    .filter((d) => d.total > 0)
    .sort((a, b) => b.total - a.total)
}

/** "Showing 14,887 receipts recorded by Ma Earth and GainForest, or
 *  confirmed by both sides." */
export function selectionSentence(roles: ReadonlySet<ConfirmRole>, count: number): string {
  if (roles.size === 0) return "Nothing is switched on. Turn on a source above to see receipts."
  type Rest = Exclude<ConfirmRole, TrustedSourceKey>
  const phrase: Record<Rest, string> = {
    both: "confirmed by both sides",
    sender: "published only by the funder",
    recipient: "published only by the recipient",
    other: "published by other publishers",
  }
  const on = CONFIRM_ROLES.filter((r) => roles.has(r))
  const sources = recordedByPhrase(on)
  const parts = [
    ...(sources ? [sources] : []),
    ...on.filter((r): r is Rest => !isSourceRole(r)).map((r) => phrase[r]),
  ]
  return `Showing ${count.toLocaleString("en-US")} ${count === 1 ? "receipt" : "receipts"} ${orPhrases(parts)}.`
}
