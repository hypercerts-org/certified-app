"use client"

import React, { useEffect, useRef } from "react"

interface SignInModalProps {
  isOpen: boolean
  authorizeUrl: string | null
  authMode: "sign-in" | "sign-up"
  onClose: () => void
}

export default function SignInModal({ isOpen, authorizeUrl, authMode, onClose }: SignInModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null)

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, onClose])

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
    return () => { document.body.style.overflow = "" }
  }, [isOpen])

  if (!isOpen || !authorizeUrl) return null

  return (
    <div
      className="signin-modal__backdrop"
      ref={backdropRef}
      onClick={(e) => { if (e.target === backdropRef.current) onClose() }}
      role="dialog"
      aria-modal="true"
      aria-label={authMode === "sign-up" ? "Create Certified ID" : "Sign in"}
    >
      <div className="signin-modal">
        <div className="signin-modal__header">
          <img src="/assets/certified_brandmark.svg" alt="" className="signin-modal__logo" />
          <span className="signin-modal__title">
            {authMode === "sign-up" ? "Create Certified ID" : "Sign in to Certified"}
          </span>
          <button
            className="signin-modal__close"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="signin-modal__body">
          <iframe
            src={authorizeUrl}
            className="signin-modal__iframe"
            title={authMode === "sign-up" ? "Create Certified ID" : "Sign in"}
            allow="clipboard-write"
          />
        </div>
      </div>
    </div>
  )
}
