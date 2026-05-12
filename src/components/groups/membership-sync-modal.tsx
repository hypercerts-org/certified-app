"use client"

import React, { useCallback } from "react"
import { X } from "lucide-react"
import Button from "@/components/ui/button"
import { useFocusTrap } from "@/hooks/use-focus-trap"

export interface MembershipChange {
  groupDid: string
  handle: string
  type: "role_changed" | "removed"
  oldRole?: string
  newRole?: string
}

interface MembershipSyncModalProps {
  changes: MembershipChange[]
  isApplying: boolean
  onAcknowledge: () => void
  onClose: () => void
}

export default function MembershipSyncModal({
  changes,
  isApplying,
  onAcknowledge,
  onClose,
}: MembershipSyncModalProps) {
  const isOpen = true
  const focusTrapRef = useFocusTrap<HTMLDivElement>(isOpen)

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose()
  }, [onClose])

  return (
    <div className="signin-modal__backdrop" onClick={onClose}>
      <div
        ref={focusTrapRef}
        className="signin-modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        style={{ maxWidth: 500 }}
      >
        <div className="signin-modal__header">
          <span className="signin-modal__title">Membership Changes Detected</span>
          <button className="signin-modal__close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="signin-modal__body">
          <p className="dash-card__desc" style={{ marginBottom: 16 }}>
            Your group memberships have changed since your last visit.
          </p>

          <div className="org-sync__list">
            {changes.map((change) => (
              <div key={change.groupDid} className="org-sync__item">
                <div className="org-sync__item-info">
                  <p className="org-sync__item-handle">@{change.handle}</p>
                  <p className="org-sync__item-did">{change.groupDid}</p>
                </div>
                {change.type === "removed" ? (
                  <span className="org-sync__badge org-sync__badge--removed">
                    Removed
                  </span>
                ) : (
                  <span className="org-sync__badge org-sync__badge--changed">
                    {change.oldRole} &rarr; {change.newRole}
                  </span>
                )}
              </div>
            ))}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
            <Button
              variant="primary"
              onClick={onAcknowledge}
              loading={isApplying}
              disabled={isApplying}
            >
              Acknowledge &amp; Update
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
