export function asHex(s: string): `0x${string}` {
  if (!s.startsWith("0x")) {
    throw new Error(`Expected hex string starting with "0x", got: ${s}`)
  }
  return s as `0x${string}`
}

export interface EIP712Message {
  did: string
  evmAddress: string
  chainId: string
  timestamp: string
  nonce: string
}

export interface Attestation {
  $type: "org.impactindexer.link.attestation"
  address: string        // 0x-prefixed, 42 chars, lowercase
  chainId: number
  signature: string      // hex signature
  message: EIP712Message
  signatureType: "eoa" | "erc1271" | "erc6492"
  createdAt: string      // ISO 8601
}

export interface AttestationRecord {
  uri: string            // at:// URI
  cid: string
  rkey: string           // record key: "{address}-{chainId}"
  value: Attestation
}

export interface VerifiedAttestation extends AttestationRecord {
  verified: boolean
  verificationError: string | null
}
