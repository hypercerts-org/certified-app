"use client"

import React from "react"
import { useConnect, useAccount, useDisconnect, useChainId } from "wagmi"
import Button from "@/components/ui/button"
import { useAttestationSigning } from "@/hooks/use-attestation-signing"
import { SUPPORTED_CHAINS } from "@/lib/wagmi"

interface LinkWalletFlowProps {
  did: string | null
  onComplete: () => void
  onCancel: () => void
}

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

const LinkWalletFlow: React.FC<LinkWalletFlowProps> = ({ did, onComplete, onCancel }) => {
  const { connectors, connect } = useConnect()
  const { isConnected, address } = useAccount()
  const { disconnect } = useDisconnect()
  const chainId = useChainId()

  const { signAndStore, isSigning, isStoring, error } = useAttestationSigning(did)

  const isSupported = chainId in SUPPORTED_CHAINS
  const chain = SUPPORTED_CHAINS[chainId]
  const chainName = chain?.name ?? `Chain ${chainId}`

  const handleSignClick = async () => {
    const success = await signAndStore()
    if (success) {
      onComplete()
    }
  }

  // Step 1: Connect wallet
  if (!isConnected) {
    const availableConnectors = connectors.filter((c) => (c as { ready?: boolean }).ready !== false)

    return (
      <div className="p-4 rounded-sm bg-gray-50 border border-gray-100">
        <p className="font-sans text-overline tracking-[0.12em] text-gray-400 mb-3">Connect a wallet</p>
        <div className="flex flex-col gap-2">
          {availableConnectors.map((connector) => (
            <Button
              key={connector.id}
              variant="secondary"
              className="w-full"
              onClick={() => connect({ connector })}
            >
              {connector.name}
            </Button>
          ))}
        </div>
        <div className="flex justify-end mt-3">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    )
  }

  // Step 2: Confirm & Sign
  return (
    <div className="p-4 rounded-sm bg-gray-50 border border-gray-100">
      <p className="font-sans text-overline tracking-[0.12em] text-gray-400 mb-3">Sign to link</p>
      <div>
        <p className="font-sans text-body-sm text-gray-700">Wallet: {address ? truncateAddress(address) : ""}</p>
        <p className="font-sans text-body-sm text-gray-400 mt-1">Chain: {chainName}</p>
        <p className="font-sans text-body-sm text-gray-400 mt-2">
          Your wallet will ask you to sign a message proving you own this address. No transaction will be sent.
        </p>
      </div>

      {error && (
        <p className="font-sans text-body-sm text-error mt-2">{error}</p>
      )}

      {!isSupported && (
        <p className="font-sans text-body-sm text-warning mt-2">
          Switch to Ethereum, Base, Optimism, or Arbitrum to continue.
        </p>
      )}

      <div className="flex gap-2 mt-3">
        <Button
          variant="primary"
          size="sm"
          disabled={isSigning || isStoring || !isSupported}
          onClick={handleSignClick}
        >
          {isSigning ? "Signing..." : isStoring ? "Saving..." : "Sign & Link"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            disconnect()
            onCancel()
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}

export default LinkWalletFlow
