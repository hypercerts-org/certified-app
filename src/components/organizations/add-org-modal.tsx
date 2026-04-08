"use client"

import React, { useState, useEffect, useRef } from "react"
import { X } from "lucide-react"
import { putMembership, listOrgMembers } from "@/lib/organizations/api"
import { authFetch } from "@/lib/auth/fetch"
import { resolveHandle } from "@/lib/atproto/did"
import Input from "@/components/ui/input"
import Button from "@/components/ui/button"
import ErrorMessage from "@/components/ui/error-message"
import LoadingSpinner from "@/components/ui/loading-spinner"
import type { OrgRole } from "@/lib/organizations/types"

interface AddOrgModalProps {
  did: string
  onClose: () => void
  onAdded: () => Promise<void>
}

function isDid(value: string): boolean {
  return value.startsWith("did:plc:") || value.startsWith("did:web:")
}

export default function AddOrgModal({ did, onClose, onAdded }: AddOrgModalProps) {
  const [input, setInput] = useState("")
  const [resolvedDid, setResolvedDid] = useState<string | null>(null)
  const [resolvedRole, setResolvedRole] = useState<OrgRole | null>(null)
  const [resolvedHandle, setResolvedHandle] = useState<string | null>(null)
  const [isResolving, setIsResolving] = useState(false)
  const [isAdding, setIsAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    const trimmed = input.trim()
    if (!trimmed || trimmed.length < 3) {
      setResolvedDid(null)
      setResolvedRole(null)
      setResolvedHandle(null)
      setError(null)
      return
    }

    debounceRef.current = setTimeout(async () => {
      setIsResolving(true)
      setResolvedDid(null)
      setResolvedRole(null)
      setResolvedHandle(null)
      setError(null)

      try {
        let groupDid: string

        if (isDid(trimmed)) {
          // Input is a DID — use directly
          groupDid = trimmed
          // Resolve handle from DID document
          const handle = await resolveHandle(trimmed).catch(() => null)
          if (handle) setResolvedHandle(handle)
        } else {
          // Input is a handle — resolve to DID
          const res = await authFetch(
            `/api/resolve-handle?handle=${encodeURIComponent(trimmed)}`
          )
          if (!res.ok) {
            setError("Could not resolve handle. Make sure it's correct.")
            setIsResolving(false)
            return
          }
          const data = await res.json()
          groupDid = data.did
          setResolvedHandle(trimmed)
        }

        setResolvedDid(groupDid)

        // Check membership
        const members = await listOrgMembers(groupDid)
        const me = members.find((m) => m.did === did)
        if (me) {
          setResolvedRole(me.role)
        } else {
          setError("You are not a member of this organization")
        }
      } catch {
        setError("Could not verify membership. You may not be a member of this group.")
      } finally {
        setIsResolving(false)
      }
    }, 500)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [input, did])

  const handleAdd = async () => {
    if (!resolvedDid || !resolvedRole) return
    setIsAdding(true)
    setError(null)
    try {
      await putMembership(did, resolvedDid, resolvedRole)
      await onAdded()
      onClose()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to add organization"
      )
    } finally {
      setIsAdding(false)
    }
  }

  return (
    <div className="signin-modal__backdrop" role="presentation" onClick={onClose}>
      <div
        className="signin-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Add Existing Organization"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 480 }}
      >
        <div className="signin-modal__header">
          <span className="signin-modal__title">Add Existing Organization</span>
          <button className="signin-modal__close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="signin-modal__body">
          <p className="dash-card__desc" style={{ marginBottom: 16 }}>
            If someone added you to an organization, enter its handle or DID to link it to your account.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Input
              label="Handle or DID"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="org.example.com or did:plc:..."
            />

            {isResolving && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <LoadingSpinner size="sm" />
                <span className="dash-card__desc" style={{ margin: 0 }}>Checking membership...</span>
              </div>
            )}

            {resolvedHandle && (
              <p style={{ fontSize: "0.8125rem", color: "var(--color-primary)", margin: 0 }}>
                Organization: <strong>@{resolvedHandle}</strong>
              </p>
            )}

            {resolvedDid && resolvedHandle && !isDid(input.trim()) && (
              <p style={{ fontSize: "0.6875rem", fontFamily: "monospace", color: "var(--color-mid-gray)", margin: 0 }}>
                {resolvedDid}
              </p>
            )}

            {resolvedRole && (
              <p style={{ fontSize: "0.8125rem", color: "var(--color-success-text)", margin: 0 }}>
                Your role: <strong>{resolvedRole}</strong>
              </p>
            )}

            {error && <ErrorMessage message={error} />}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Button variant="ghost" onClick={onClose} disabled={isAdding}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleAdd}
                loading={isAdding}
                disabled={!resolvedDid || !resolvedRole || isAdding}
              >
                Add Organization
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
