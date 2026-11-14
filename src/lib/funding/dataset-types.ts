/**
 * The /funding dataset: every funding receipt the page can show, with the
 * projects and recipients it needs to draw them, built on the server
 * (`build-dataset.ts`) and cached. The client filters and aggregates it
 * (`select.ts`), so switching the "Confirmed by" chips or the view never
 * goes back to the network.
 *
 * Receipts are stored column-wise (one array per field, same length) to keep
 * the payload small: there are ~15,000 of them.
 */

export const REGIONS = ["Americas", "Oceania", "Africa", "Asia", "Europe"] as const
export type Region = (typeof REGIONS)[number]

/** Bucket bits per receipt — see `CONFIRM_ROLES` in funding-provenance. */
export const BUCKET_TRUSTED = 1
export const BUCKET_BOTH = 2
export const BUCKET_SENDER = 4
export const BUCKET_RECIPIENT = 8
export const BUCKET_OTHER = 16

export interface FundingProject {
  /** at:// URI of the `org.hypercerts.collection` record. */
  uri: string
  /** Index into {@link FundingDataset.accounts}: the project's owner. */
  owner: number
  title: string | null
  /** Image URLs (proxied blob paths or absolute URIs). */
  banner: string | null
  avatar: string | null
  /** A point for the project: the location's point, or a polygon's centre. */
  lat: number | null
  lng: number | null
  /** The location record's name, when it has one. */
  place: string | null
  region: Region | null
}

export interface FundingAccount {
  did: string
  name: string | null
  avatar: string | null
}

export interface FundingReceiptColumns {
  /** Record key; the URI is `at://{authors[author]}/org.hypercerts.funding.receipt/{rkey}`. */
  rkey: string[]
  /** Index into {@link FundingDataset.authors}. */
  author: number[]
  /** When the payment happened (occurredAt, else createdAt), unix seconds. */
  t: number[]
  amount: number[]
  /** Index into {@link FundingDataset.currencies}. */
  currency: number[]
  /** Index into {@link FundingDataset.projects}, or -1 (see `forUri`). */
  project: number[]
  /** Index into {@link FundingDataset.accounts}, or -1 (see `toText`). */
  to: number[]
  /** Index into {@link FundingDataset.donors}; -1 anonymous; -2 text (see `fromText`). */
  from: number[]
  /** Bucket bits (BUCKET_*). */
  buckets: number[]
}

export interface FundingDataset {
  /** ISO time the dataset was built. */
  builtAt: string
  /** Trusted sources and how many receipts each published. */
  sources: { did: string; name: string; count: number }[]
  currencies: string[]
  authors: string[]
  accounts: FundingAccount[]
  /** Funder DIDs (names are hydrated on the client, for the rows on show). */
  donors: string[]
  projects: FundingProject[]
  receipts: FundingReceiptColumns
  /** Sparse extras keyed by receipt index (as a string). */
  toText: Record<string, string>
  fromText: Record<string, string>
  /** `for` targets that are not projects (activities), keyed by receipt index. */
  forUri: Record<string, string>
  /** Attestations by receipt index, as `[did, role][]`. For a trusted
   *  source's receipt: the confirmations other accounts published for it (the
   *  source's own third-party attestation is implied). For any other receipt:
   *  its full list. */
  attestations: Record<string, [string, "sender" | "recipient" | "third-party"][]>
  /** Receipts that could not be read completely (a source failed). */
  partial: boolean
}

export function receiptUri(ds: FundingDataset, i: number): string {
  return `at://${ds.authors[ds.receipts.author[i]]}/org.hypercerts.funding.receipt/${ds.receipts.rkey[i]}`
}
