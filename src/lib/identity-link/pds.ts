import { Agent } from "@atproto/api"
import type { AttestationRecord, Attestation, EIP712Message } from "./types"
import { ATTESTATION_COLLECTION, buildRecordKey } from "./attestation"

export async function listAttestations(
  agent: Agent,
  did: string
): Promise<AttestationRecord[]> {
  try {
    const res = await agent.com.atproto.repo.listRecords({
      repo: did,
      collection: ATTESTATION_COLLECTION,
      limit: 100,
    })
    return res.data.records.map((record) => {
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
  agent: Agent,
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
  const res = await agent.com.atproto.repo.putRecord({
    repo: did,
    collection: ATTESTATION_COLLECTION,
    rkey,
    record,
  })
  return { uri: res.data.uri, cid: res.data.cid }
}

export async function deleteAttestation(
  agent: Agent,
  did: string,
  rkey: string
): Promise<void> {
  await agent.com.atproto.repo.deleteRecord({
    repo: did,
    collection: ATTESTATION_COLLECTION,
    rkey,
  })
}
