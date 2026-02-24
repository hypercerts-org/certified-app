"use client"

import React, { useState } from "react"
import { Agent } from "@atproto/api"
import { Trash2 } from "lucide-react"
import Button from "@/components/ui/button"
import Badge from "@/components/ui/badge"
import LoadingSpinner from "@/components/ui/loading-spinner"
import { useIdentityLinks } from "@/hooks/use-identity-links"
import { deleteAttestation } from "@/lib/identity-link/pds"
import { SUPPORTED_CHAINS } from "@/lib/wagmi"

interface IdentityLinkCardProps {
  agent: Agent | null
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

const IdentityLinkCard: React.FC<IdentityLinkCardProps> = ({ agent, did }) => {
  const [showLinkFlow, setShowLinkFlow] = useState(false)
  const [confirmDeleteRkey, setConfirmDeleteRkey] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const { attestations, isLoading, error, refetch } = useIdentityLinks(agent, did)

  if (!agent || !did) return null

  const handleDelete = async (rkey: string) => {
    if (!agent || !did) return
    setIsDeleting(true)
    setDeleteError(null)
    try {
      await deleteAttestation(agent, did, rkey)
      setConfirmDeleteRkey(null)
      await refetch()
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to remove wallet")
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="app-card">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="app-card__label">Identity Links</span>
        <Button variant="secondary" size="sm" onClick={() => setShowLinkFlow(true)}>
          Link Wallet
        </Button>
      </div>

      {/* Link wallet flow placeholder */}
      {showLinkFlow && (
        <div className="mt-3">
          <div>Link wallet flow coming soon</div>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="mt-4">
          <LoadingSpinner size="sm" />
        </div>
      )}

      {/* Error */}
      {error && !isLoading && (
        <p className="mt-4 text-error text-body-sm">{error}</p>
      )}

      {/* Empty state */}
      {!isLoading && !error && attestations.length === 0 && (
        <div className="py-8 text-center">
          <p className="text-body text-gray-400">No wallets linked yet.</p>
          <p className="text-body-sm text-gray-400 mt-1">Link a wallet to prove you own it.</p>
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
            className={`flex items-center justify-between py-3 ${index > 0 ? "border-t border-gray-200" : ""}`}
          >
            {/* Left side */}
            <div className="flex items-center gap-3">
              <span>{chainIcon}</span>
              <div>
                <p className="text-body-sm text-gray-400">{chainName}</p>
                <p className="font-mono text-body-sm text-gray-700">
                  {truncateAddress(attestation.value.address)}
                </p>
              </div>
            </div>

            {/* Right side */}
            <div className="flex items-center gap-3">
              <Badge variant={attestation.verified ? "verified" : "unverified"}>
                {attestation.verified ? "Verified" : "Unverified"}
              </Badge>
              <span className="text-xs text-gray-400">
                {relativeTime(attestation.value.createdAt)}
              </span>

              {isConfirming ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Remove?</span>
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
                  className="text-gray-300 hover:text-error transition-colors"
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
        <p className="text-body-sm text-error mt-2">{deleteError}</p>
      )}
    </div>
  )
}

export default IdentityLinkCard
