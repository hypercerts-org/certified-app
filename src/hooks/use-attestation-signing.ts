import { useSignTypedData, useAccount, useChainId } from "wagmi"
import { useState, useCallback } from "react"
import { Agent } from "@atproto/api"
import { ATTESTATION_DOMAIN, ATTESTATION_TYPES, buildAttestationMessage } from "@/lib/identity-link/attestation"
import { storeAttestation } from "@/lib/identity-link/pds"
import type { EIP712Message } from "@/lib/identity-link/types"

interface UseAttestationSigningResult {
  signAndStore: () => Promise<void>
  isSigning: boolean
  isStoring: boolean
  error: string | null
  reset: () => void
}

export function useAttestationSigning(
  agent: Agent | null,
  did: string | null
): UseAttestationSigningResult {
  const [isSigning, setIsSigning] = useState(false)
  const [isStoring, setIsStoring] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { signTypedDataAsync } = useSignTypedData()
  const { address, isConnected } = useAccount()
  const chainId = useChainId()

  const reset = useCallback(() => {
    setError(null)
  }, [])

  const signAndStore = useCallback(async () => {
    // Check preconditions
    if (!agent || !did) {
      setError("Not authenticated. Please log in first.")
      return
    }
    if (!isConnected || !address) {
      setError("No wallet connected. Please connect a wallet first.")
      return
    }

    setError(null)

    // Build the attestation message
    const msg = buildAttestationMessage(did, address, chainId)

    // Sign with wallet
    setIsSigning(true)
    let signature: string
    try {
      signature = await signTypedDataAsync({
        domain: ATTESTATION_DOMAIN,
        types: ATTESTATION_TYPES,
        primaryType: "Attestation",
        message: msg.typed,
      })
    } catch (err) {
      setIsSigning(false)
      if (
        err instanceof Error &&
        (err.message.toLowerCase().includes("user rejected") ||
          err.message.toLowerCase().includes("user denied") ||
          err.message.toLowerCase().includes("rejected"))
      ) {
        setError("Signature rejected. Please try again.")
      } else {
        setError(err instanceof Error ? err.message : "Signing failed")
      }
      return
    }
    setIsSigning(false)

    // Store the attestation in the PDS
    setIsStoring(true)
    try {
      const storedMessage: EIP712Message = msg.stored
      await storeAttestation(agent, did, address, chainId, signature, storedMessage, "eoa")
    } catch (err) {
      setIsStoring(false)
      setError(`Failed to save: ${err instanceof Error ? err.message : "Unknown error"}`)
      return
    }
    setIsStoring(false)
  }, [agent, did, isConnected, address, chainId, signTypedDataAsync])

  return {
    signAndStore,
    isSigning,
    isStoring,
    error,
    reset,
  }
}
