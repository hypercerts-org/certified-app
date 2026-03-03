import type { EIP712Message } from "./types"
import { asHex } from "./types"

export const ATTESTATION_DOMAIN = {
  name: "ATProto EVM Attestation",
  version: "1",
} as const

export const ATTESTATION_TYPES = {
  Attestation: [
    { name: "did", type: "string" },
    { name: "evmAddress", type: "address" },
    { name: "chainId", type: "uint256" },
    { name: "timestamp", type: "uint256" },
    { name: "nonce", type: "uint256" },
  ],
} as const

export const ATTESTATION_COLLECTION = "org.impactindexer.link.attestation"

export function buildAttestationMessage(
  did: string,
  address: string,
  chainId: number
): {
  typed: {
    did: string
    evmAddress: `0x${string}`
    chainId: bigint
    timestamp: bigint
    nonce: bigint
  }
  stored: EIP712Message
} {
  const timestamp = BigInt(Math.floor(Date.now() / 1000))
  const nonce = BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER))
  const evmAddress = asHex(address.toLowerCase())

  return {
    typed: {
      did,
      evmAddress,
      chainId: BigInt(chainId),
      timestamp,
      nonce,
    },
    stored: {
      did,
      evmAddress: address.toLowerCase(),
      chainId: String(chainId),
      timestamp: String(timestamp),
      nonce: String(nonce),
    },
  }
}

export function buildRecordKey(address: string, chainId: number): string {
  return `${address.toLowerCase()}-${chainId}`
}
