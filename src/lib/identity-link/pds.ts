"use client"

import type { AttestationRecord, Attestation, EIP712Message } from "./types"
import { ATTESTATION_COLLECTION, buildRecordKey } from "./attestation"
import { authFetch } from "@/lib/auth/fetch"

function isAttestation(v: unknown): v is Attestation {
  if (typeof v !== "object" || v === null) return false
  const a = v as Record<string, unknown>
  if (typeof a.address !== "string") return false
  if (typeof a.chainId !== "number") return false
  if (typeof a.signature !== "string") return false
  if (typeof a.signatureType !== "string") return false
  if (typeof a.createdAt !== "string") return false
  if (typeof a.message !== "object" || a.message === null) return false
  const msg = a.message as Record<string, unknown>
  if (typeof msg.did !== "string") return false
  if (typeof msg.evmAddress !== "string") return false
  if (typeof msg.chainId !== "string") return false
  if (typeof msg.nonce !== "string") return false
  if (typeof msg.timestamp !== "string") return false
  return true
}

export async function listAttestations(
  did: string
): Promise<AttestationRecord[]> {
  const res = await authFetch(
    `/api/xrpc/com/atproto/repo/listRecords?repo=${encodeURIComponent(did)}&collection=${encodeURIComponent(ATTESTATION_COLLECTION)}&limit=100`
  )
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data as { error?: string }).error || res.statusText)
  }
  const data = await res.json()
  const rawRecords: { uri: string; cid: string; value: unknown }[] = data.records ?? []
  return rawRecords
    .filter((record) => isAttestation(record.value))
    .map((record) => {
      const uri = record.uri
      const rkey = uri.split("/").pop() ?? ""
      return {
        uri,
        cid: record.cid,
        rkey,
        value: record.value as Attestation,
      }
    })
}

export async function storeAttestation(
  did: string,
  address: string,
  chainId: number,
  signature: string,
  message: EIP712Message,
  signatureType: "eoa" | "erc1271" | "erc6492"
): Promise<{ uri: string; cid: string }> {
  const rkey = buildRecordKey(address, chainId)
  const record: Attestation = {
    $type: ATTESTATION_COLLECTION as "org.impactindexer.link.attestation",
    address: address.toLowerCase(),
    chainId,
    signature,
    message,
    signatureType,
    createdAt: new Date().toISOString(),
  }
  const res = await authFetch("/api/xrpc/com/atproto/repo/putRecord", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      repo: did,
      collection: ATTESTATION_COLLECTION,
      rkey,
      record,
    }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data as { error?: string }).error || res.statusText)
  }
  const data = await res.json()
  return { uri: data.uri, cid: data.cid }
}

export async function deleteAttestation(
  did: string,
  rkey: string
): Promise<void> {
  const res = await authFetch("/api/xrpc/com/atproto/repo/deleteRecord", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      repo: did,
      collection: ATTESTATION_COLLECTION,
      rkey,
    }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data as { error?: string }).error || res.statusText)
  }
}
