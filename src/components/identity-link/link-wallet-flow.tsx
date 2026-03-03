"use client"

import React from "react"
import { useConnect, useAccount, useDisconnect, useChainId } from "wagmi"
import Button from "@/components/ui/button"
import { useAttestationSigning } from "@/hooks/use-attestation-signing"
import { SUPPORTED_CHAINS } from "@/lib/wagmi"

interface LinkWalletFlowProps {
  did: string
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
    return (
      <div className="wallet-flow">
        <p className="wallet-flow__label">Connect a wallet</p>
        <div className="wallet-flow__connectors">
          {connectors.map((connector) => (
            <Button
              key={connector.id}
              variant="secondary"
              className="wallet-flow__connector-btn"
              onClick={() => connect({ connector })}
            >
              {connector.name}
            </Button>
          ))}
        </div>
        <div className="wallet-flow__footer">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    )
  }

  // Step 2: Confirm & Sign
  return (
    <div className="wallet-flow">
      <p className="wallet-flow__label">Sign to link</p>
      <div>
        <p className="wallet-flow__detail">Wallet: {address ? truncateAddress(address) : ""}</p>
        <p className="wallet-flow__detail wallet-flow__detail--muted">Chain: {chainName}</p>
        <p className="wallet-flow__detail wallet-flow__detail--muted wallet-flow__detail--spaced">
          Your wallet will ask you to sign a message proving you own this address. No transaction will be sent.
        </p>
      </div>

      {error && (
        <p className="wallet-flow__error" role="alert">{error}</p>
      )}

      {!isSupported && (
        <p className="wallet-flow__warning" role="alert">
          Switch to Ethereum, Base, Optimism, or Arbitrum to continue.
        </p>
      )}

      <div className="wallet-flow__actions">
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
