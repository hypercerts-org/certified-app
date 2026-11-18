import type { FundingReceipt } from "@/lib/atproto/indexer"
import {
  CONFIRM_ROLES,
  confirmBuckets,
  isSourceRole,
  type ConfirmRole,
} from "@/lib/atproto/funding-provenance"
import { orPhrases, recordedByPhrase } from "./labels"
import { PRIMARY_CURRENCY } from "./select"
import type { TrustedSourceKey } from "./trusted-sources"

/**
 * Funding for one record page (an activity, or a project with its
 * activities): merging the receipts read per record, and the numbers the
 * page shows about them. Pure, so the rail card, the Funding tab's summary
 * line and the tab count always agree.
 */

/** When a receipt happened, for sorting: occurred, else created. */
function receiptTime(r: FundingReceipt): number {
  const t = Date.parse(r.occurredAt ?? r.createdAt ?? "")
  return Number.isFinite(t) ? t : 0
}

/**
 * One list from the receipts read per record: de-duplicated by URI (the
 * same receipt can come back for two reads) and newest first.
 */
export function mergeRecordReceipts(lists: readonly (readonly FundingReceipt[])[]): FundingReceipt[] {
  const byUri = new Map<string, FundingReceipt>()
  for (const list of lists) {
    for (const r of list) if (!byUri.has(r.uri)) byUri.set(r.uri, r)
  }
  return [...byUri.values()].sort((a, b) => receiptTime(b) - receiptTime(a))
}

function parseAmount(v: string | null): number {
  const n = v == null ? NaN : Number.parseFloat(v)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

export interface RecordFundingSummary {
  /** Receipts (gifts) counted. */
  gifts: number
  /** Sum of the gifts in {@link PRIMARY_CURRENCY}. */
  total: number
  /** Gifts in {@link PRIMARY_CURRENCY}. */
  primaryGifts: number
  /** Sums in other currencies, most gifts first (not converted). */
  others: { currency: string; total: number; count: number }[]
  /** Distinct named funders: accounts and written names. */
  funders: number
  /** Gifts with no funder recorded. */
  anonymous: number
  /** The "Confirmed by" buckets the gifts fall in, in display order. */
  confirmedBy: ConfirmRole[]
}

/** Totals for a set of receipts (already filtered by "Confirmed by"). */
export function summarizeRecordFunding(receipts: readonly FundingReceipt[]): RecordFundingSummary {
  let total = 0
  let primaryGifts = 0
  let anonymous = 0
  const funders = new Set<string>()
  const others = new Map<string, { currency: string; total: number; count: number }>()
  const buckets = new Set<ConfirmRole>()
  for (const r of receipts) {
    const currency = (r.currency ?? "").trim().toUpperCase()
    const amount = parseAmount(r.amount)
    if (currency === PRIMARY_CURRENCY) {
      total += amount
      primaryGifts++
    } else if (currency) {
      const o = others.get(currency) ?? { currency, total: 0, count: 0 }
      o.total += amount
      o.count++
      others.set(currency, o)
    }
    if (r.from?.kind === "account") funders.add(`did:${r.from.did}`)
    else if (r.from?.kind === "text" && r.from.value.trim()) {
      funders.add(`text:${r.from.value.trim().toLowerCase()}`)
    } else anonymous++
    for (const b of confirmBuckets(r.attestations)) buckets.add(b)
  }
  return {
    gifts: receipts.length,
    total: Math.round(total * 100) / 100,
    primaryGifts,
    others: [...others.values()].sort((a, b) => b.count - a.count),
    funders: funders.size,
    anonymous,
    confirmedBy: CONFIRM_ROLES.filter((r) => buckets.has(r)),
  }
}

/** "1 gift" / "64 gifts". */
export function giftsLabel(n: number): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? "gift" : "gifts"}`
}

/** "1 funder" / "46 funders". */
export function fundersLabel(n: number): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? "funder" : "funders"}`
}

/**
 * Who gave, in a line under the total: "64 gifts from 46 funders",
 * "64 gifts from 46 funders and anonymous donors", "3 anonymous gifts".
 */
export function fundingByline(s: RecordFundingSummary): string {
  if (s.gifts === 0) return "No gifts yet"
  if (s.funders === 0) return s.gifts === 1 ? "1 anonymous gift" : `${giftsLabel(s.gifts)}, all anonymous`
  const from = `${giftsLabel(s.gifts)} from ${fundersLabel(s.funders)}`
  return s.anonymous > 0 ? `${from} and anonymous donors` : from
}

/**
 * What the "Confirmed by" selection shows, as a sentence: "Showing gifts
 * recorded by Ma Earth and GainForest, or confirmed by both sides." Mirrors
 * /funding's wording (`selectionSentence`), without the count.
 */
export function shownSentence(roles: ReadonlySet<ConfirmRole>, thirdParties = 0): string {
  type Rest = Exclude<ConfirmRole, TrustedSourceKey>
  const phrase: Record<Rest, string> = {
    both: "confirmed by both sides",
    sender: "published only by the funder",
    recipient: "published only by the recipient",
    other: "published by others",
  }
  const on = CONFIRM_ROLES.filter((r) => roles.has(r))
  const sources = recordedByPhrase(on)
  const parts = [
    ...(sources ? [sources] : []),
    ...on.filter((r): r is Rest => !isSourceRole(r)).map((r) => phrase[r]),
  ]
  if (thirdParties > 0) {
    parts.push(
      thirdParties === 1 ? "confirmed by the account you picked" : "confirmed by the accounts you picked",
    )
  }
  if (parts.length === 0) return "The filter shows nothing. Turn on a source to see gifts."
  return `Showing gifts ${orPhrases(parts)}.`
}
