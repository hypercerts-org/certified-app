"use client"

import { useEffect, useState } from "react"
import FundingReceiptDetailModal from "@/components/explore-page/funding-receipt-detail-modal"
import { authFetch } from "@/lib/auth/fetch"
import type { FundingAttestation, FundingParty, FundingReceipt } from "@/lib/atproto/indexer"
import { isTrustedFundingSource } from "@/lib/funding/trusted-sources"
import { receiptUri, type FundingDataset } from "@/lib/funding/dataset-types"

const RECEIPT_NSID = "org.hypercerts.funding.receipt"

function party(v: unknown): FundingParty {
  if (!v || typeof v !== "object") return null
  const o = v as Record<string, unknown>
  if (typeof o.did === "string" && o.did) return { kind: "account", did: o.did }
  if (typeof o.value === "string" && o.value) return { kind: "text", value: o.value }
  return null
}

function str(v: unknown): string | null {
  return typeof v === "string" && v ? v : null
}

function attestationsFor(ds: FundingDataset, i: number): FundingAttestation[] {
  const author = ds.authors[ds.receipts.author[i]]
  const extra = (ds.attestations[i] ?? []).map(([did, role]) => ({ did, role }))
  return isTrustedFundingSource(author) ? [{ did: author, role: "third-party" }, ...extra] : extra
}

/** A receipt from the dataset alone, for when the record can't be read. */
function fromDataset(ds: FundingDataset, i: number): FundingReceipt {
  const r = ds.receipts
  const to = r.to[i] >= 0 ? ds.accounts[r.to[i]] : null
  const from = r.from[i]
  const project = r.project[i] >= 0 ? ds.projects[r.project[i]] : null
  const iso = r.t[i] ? new Date(r.t[i] * 1000).toISOString() : null
  return {
    uri: receiptUri(ds, i),
    cid: "",
    did: ds.authors[r.author[i]],
    createdAt: iso,
    occurredAt: iso,
    amount: String(r.amount[i]),
    currency: ds.currencies[r.currency[i]] || null,
    from:
      from >= 0
        ? { kind: "account", did: ds.donors[from] }
        : from === -2 && ds.fromText[i]
          ? { kind: "text", value: ds.fromText[i] }
          : null,
    to: to ? { kind: "account", did: to.did } : ds.toText[i] ? { kind: "text", value: ds.toText[i] } : null,
    forUri: project?.uri ?? ds.forUri[i] ?? null,
    forCid: null,
    paymentRail: null,
    paymentNetwork: null,
    transactionId: null,
    notes: null,
    matchingReceipt: null,
    attestations: attestationsFor(ds, i),
  }
}

/**
 * Opens the shared receipt detail (the one Explore uses, with the confirm
 * flow) for a receipt in the dataset. The dataset is slim, so the record is
 * read first for its CID and every field; if that read fails the detail
 * still opens from the dataset.
 */
export default function FundingReceiptDialog({
  ds,
  index,
  onClose,
}: {
  ds: FundingDataset
  index: number
  onClose: () => void
}) {
  const [receipt, setReceipt] = useState<FundingReceipt | null>(null)

  useEffect(() => {
    let live = true
    setReceipt(null)
    const params = new URLSearchParams({
      repo: ds.authors[ds.receipts.author[index]],
      collection: RECEIPT_NSID,
      rkey: ds.receipts.rkey[index],
    })
    authFetch(`/api/xrpc/com/atproto/repo/getRecord?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status))
        const data = (await res.json()) as { uri: string; cid: string; value: Record<string, unknown> }
        const v = data.value
        const forRef = v.for && typeof v.for === "object" ? (v.for as Record<string, unknown>) : null
        const match =
          v.matchingReceipt && typeof v.matchingReceipt === "object"
            ? (v.matchingReceipt as Record<string, unknown>)
            : null
        const next: FundingReceipt = {
          uri: data.uri,
          cid: data.cid,
          did: ds.authors[ds.receipts.author[index]],
          createdAt: str(v.createdAt),
          occurredAt: str(v.occurredAt),
          amount: str(v.amount),
          currency: str(v.currency),
          from: party(v.from),
          to: party(v.to),
          forUri: str(forRef?.uri),
          forCid: str(forRef?.cid),
          paymentRail: str(v.paymentRail),
          paymentNetwork: str(v.paymentNetwork),
          transactionId: str(v.transactionId),
          notes: str(v.notes),
          matchingReceipt:
            str(match?.uri) && str(match?.cid) ? { uri: str(match?.uri)!, cid: str(match?.cid)! } : null,
          attestations: attestationsFor(ds, index),
        }
        if (live) setReceipt(next)
      })
      .catch(() => {
        if (live) setReceipt(fromDataset(ds, index))
      })
    return () => {
      live = false
    }
  }, [ds, index])

  if (!receipt) return null
  return <FundingReceiptDetailModal receipt={receipt} onClose={onClose} />
}
