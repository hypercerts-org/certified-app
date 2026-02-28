import type { AttestationRecord, Attestation, EIP712Message } from "./types"
import { ATTESTATION_COLLECTION, buildRecordKey } from "./attestation"

export async function listAttestations(
  did: string
): Promise<AttestationRecord[]> {
  try {
    const res = await fetch(
      `/api/xrpc/com/atproto/repo/listRecords?repo=${encodeURIComponent(did)}&collection=${encodeURIComponent(ATTESTATION_COLLECTION)}&limit=100`
    )
    if (!res.ok) return []
    const data = await res.json()
    return (data.records ?? []).map((record: { uri: string; cid: string; value: unknown }) => {
      const uri = record.uri
      const rkey = uri.split("/").pop() ?? ""
      return {
        uri,
        cid: record.cid,
        rkey,
        value: record.value as Attestation,
      }
    })
  } catch (err) {
    console.error("listAttestations error:", err)
    return []
  }
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
  const res = await fetch("/api/xrpc/com/atproto/repo/putRecord", {
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
  const res = await fetch("/api/xrpc/com/atproto/repo/deleteRecord", {
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
