"use client"

import React, { useEffect, useRef, useState } from "react"

interface SignInModalProps {
  isOpen: boolean
  authMode: "sign-in" | "sign-up"
  error: string | null
  onClose: () => void
  onSubmitEmail: (email: string) => Promise<void>
  onSubmitHandle: (handle: string) => Promise<void>
}

type ModalView = "certified" | "atproto"

export default function SignInModal({
  isOpen,
  authMode,
  error,
  onClose,
  onSubmitEmail,
  onSubmitHandle,
}: SignInModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [view, setView] = useState<ModalView>("certified")
  const [inputValue, setInputValue] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setView("certified")
      setInputValue("")
      setIsSubmitting(false)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  // Focus input when switching views
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [view, isOpen])

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

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputValue.trim() || isSubmitting) return
    setIsSubmitting(true)
    try {
      if (view === "certified") {
        await onSubmitEmail(inputValue.trim())
      } else {
        await onSubmitHandle(inputValue.trim())
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const isCertified = view === "certified"

  const title = isCertified
    ? authMode === "sign-up"
      ? "Create your Certified ID"
      : "Sign in to Certified"
    : "Sign in with ATProto"

  const buttonLabel = isCertified
    ? authMode === "sign-up"
      ? "Sign up for Certified"
      : "Sign in with Certified"
    : "Sign in"

  const switchLabel = isCertified
    ? "Sign in with ATProto/Bluesky"
    : "Sign in with Certified"

  return (
    <div
      className="signin-modal__backdrop"
      ref={backdropRef}
      onClick={(e) => { if (e.target === backdropRef.current) onClose() }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="signin-modal">
        <div className="signin-modal__header">
          <img src="/assets/certified_brandmark.svg" alt="" className="signin-modal__logo" />
          <span className="signin-modal__title">{title}</span>
          <button
            className="signin-modal__close"
            onClick={onClose}
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>

        <div className="signin-modal__body">
            <form onSubmit={handleSubmit} className="signin-modal__form">
              <label className="signin-modal__label">
                {isCertified ? "Email address" : "Handle (username)"}
              </label>
              <input
                ref={inputRef}
                type={isCertified ? "email" : "text"}
                className="signin-modal__input"
                placeholder={isCertified ? "you@example.com" : "you.bsky.social"}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                required
                autoComplete={isCertified ? "email" : "username"}
                disabled={isSubmitting}
              />

              {error && (
                <p className="signin-modal__error">{error}</p>
              )}

              <button
                type="submit"
                className="signin-modal__submit"
                disabled={isSubmitting || !inputValue.trim()}
              >
                {isSubmitting ? "Connecting..." : buttonLabel}
              </button>
            </form>

            <div className="signin-modal__switch">
              <button
                type="button"
                className="signin-modal__switch-btn"
                onClick={() => {
                  setView(isCertified ? "atproto" : "certified")
                  setInputValue("")
                }}
              >
                {switchLabel}
              </button>
            </div>
          </div>
      </div>
    </div>
  )
}
