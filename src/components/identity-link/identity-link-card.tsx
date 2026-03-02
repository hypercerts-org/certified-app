"use client"

import React, { useState } from "react"
import { Trash2 } from "lucide-react"
import Button from "@/components/ui/button"
import LoadingSpinner from "@/components/ui/loading-spinner"
import { useIdentityLinks } from "@/hooks/use-identity-links"
import { deleteAttestation } from "@/lib/identity-link/pds"
import { SUPPORTED_CHAINS } from "@/lib/wagmi"
import LinkWalletFlow from "./link-wallet-flow"

interface IdentityLinkCardProps {
  did: string | null
}

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function relativeTime(dateString: string): string {
  const now = Date.now()
  const then = new Date(dateString).getTime()
  const seconds = Math.floor((now - then) / 1000)
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

const IdentityLinkCard: React.FC<IdentityLinkCardProps> = ({ did }) => {
  const [showLinkFlow, setShowLinkFlow] = useState(false)
  const [confirmDeleteRkey, setConfirmDeleteRkey] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const { attestations, isLoading, error, refetch } = useIdentityLinks(did)

  if (!did) return null

  const handleDelete = async (rkey: string) => {
    if (!did) return
    setIsDeleting(true)
    setDeleteError(null)
    try {
      await deleteAttestation(did, rkey)
      setConfirmDeleteRkey(null)
      await refetch()
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to remove wallet")
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="wallet-card">
      {/* Header */}
      <div className="wallet-card__header">
        <span className="wallet-card__label">Linked Wallets</span>
        <Button variant="secondary" size="sm" onClick={() => setShowLinkFlow(true)}>
          Link Wallet
        </Button>
      </div>

      {/* Link wallet flow */}
      {showLinkFlow && (
        <div className="wallet-card__flow">
          <LinkWalletFlow
            did={did}
            onComplete={() => {
              setShowLinkFlow(false)
              refetch()
            }}
            onCancel={() => setShowLinkFlow(false)}
          />
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="wallet-card__loading">
          <LoadingSpinner size="sm" />
        </div>
      )}

      {/* Error */}
      {error && !isLoading && (
        <p className="wallet-card__error">{error}</p>
      )}

      {/* Empty state */}
      {!isLoading && !error && attestations.length === 0 && (
        <div className="wallet-card__empty">
          <p className="wallet-card__empty-title">No wallets linked yet.</p>
          <p className="wallet-card__empty-desc">Link a wallet to prove you own it.</p>
        </div>
      )}

      {/* Attestation list */}
      {!isLoading && attestations.map((attestation, index) => {
        const chainId = attestation.value.chainId
        const chain = SUPPORTED_CHAINS[chainId]
        const chainIcon = chain?.icon ?? "🔗"
        const chainName = chain?.name ?? `Chain ${chainId}`
        const isConfirming = confirmDeleteRkey === attestation.rkey

        return (
          <div
            key={attestation.rkey}
            className={`wallet-card__row ${index > 0 ? "wallet-card__row--bordered" : ""}`}
          >
            {/* Left side */}
            <div className="wallet-card__wallet-info">
              <span className="wallet-card__chain-icon">{chainIcon}</span>
              <div>
                <p className="wallet-card__chain-name">{chainName}</p>
                <p className="wallet-card__address">
                  {truncateAddress(attestation.value.address)}
                </p>
              </div>
            </div>

            {/* Right side */}
            <div className="wallet-card__actions">
              <span className={`wallet-card__badge ${attestation.verified ? "wallet-card__badge--verified" : "wallet-card__badge--unverified"}`}>
                {attestation.verified ? "Verified" : "Unverified"}
              </span>
              <span className="wallet-card__time">
                {relativeTime(attestation.value.createdAt)}
              </span>

              {isConfirming ? (
                <div className="wallet-card__confirm">
                  <span className="wallet-card__confirm-text">Remove?</span>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={isDeleting}
                    onClick={() => handleDelete(attestation.rkey)}
                  >
                    Yes
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isDeleting}
                    onClick={() => {
                      setConfirmDeleteRkey(null)
                      setDeleteError(null)
                    }}
                  >
                    No
                  </Button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setConfirmDeleteRkey(attestation.rkey)
                    setDeleteError(null)
                  }}
                  className="wallet-card__delete"
                  aria-label="Remove wallet"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          </div>
        )
      })}

      {/* Delete error */}
      {deleteError && (
        <p className="wallet-card__error">{deleteError}</p>
      )}
    </div>
  )
}

export default IdentityLinkCard
