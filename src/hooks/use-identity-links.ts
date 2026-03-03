"use client"

import { useState, useEffect, useCallback } from "react"
import { verifyTypedData } from "viem"
import { listAttestations } from "@/lib/identity-link/pds"
import { ATTESTATION_DOMAIN, ATTESTATION_TYPES } from "@/lib/identity-link/attestation"
import type { AttestationRecord, VerifiedAttestation } from "@/lib/identity-link/types"

interface UseIdentityLinksResult {
  attestations: VerifiedAttestation[]
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export function useIdentityLinks(
  did: string | null
): UseIdentityLinksResult {
  const [attestations, setAttestations] = useState<VerifiedAttestation[]>([])
  const [isLoading, setIsLoading] = useState(did ? true : false)
  const [error, setError] = useState<string | null>(null)

  const fetchAndVerify = useCallback(async (signal?: AbortSignal) => {
    if (!did) {
      setAttestations([])
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const records: AttestationRecord[] = await listAttestations(did)

      const verified: VerifiedAttestation[] = await Promise.all(
        records.map(async (record) => {
          // Only verify EOA signatures; skip on-chain verification for erc1271/erc6492
          if (record.value.signatureType !== "eoa") {
            return {
              ...record,
              verified: true,
              verificationError: null,
            }
          }

          try {
            const msg = record.value.message
            const typedMessage = {
              did: msg.did,
              evmAddress: msg.evmAddress as `0x${string}`,
              chainId: BigInt(msg.chainId),
              timestamp: BigInt(msg.timestamp),
              nonce: BigInt(msg.nonce),
            }

            const isValid = await verifyTypedData({
              address: record.value.address as `0x${string}`,
              domain: ATTESTATION_DOMAIN,
              types: ATTESTATION_TYPES,
              primaryType: "Attestation",
              message: typedMessage,
              signature: record.value.signature as `0x${string}`,
            })

            return {
              ...record,
              verified: isValid,
              verificationError: isValid ? null : "Signature verification failed",
            }
          } catch (err) {
            return {
              ...record,
              verified: false,
              verificationError: err instanceof Error ? err.message : "Verification error",
            }
          }
        })
      )

      if (signal?.aborted) return
      setAttestations(verified)
    } catch (err) {
      if (signal?.aborted) return
      setError(err instanceof Error ? err.message : "Failed to fetch attestations")
      setAttestations([])
    } finally {
      if (!signal?.aborted) {
        setIsLoading(false)
      }
    }
  }, [did])

  useEffect(() => {
    const controller = new AbortController()
    fetchAndVerify(controller.signal)
    return () => controller.abort()
  }, [fetchAndVerify])

  return {
    attestations,
    isLoading,
    error,
    refetch: fetchAndVerify,
  }
}
