"use client"

import React, { useEffect, useRef, useState } from "react"
import { useFocusTrap } from "@/hooks/use-focus-trap"
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock"
import Brandmark from "@/components/ui/brandmark"

interface SignInModalProps {
  isOpen: boolean
  error: string | null
  onClose: () => void
  onSubmitEmail: (email: string) => Promise<void>
  onSubmitHandle: (handle: string) => Promise<void>
}

type ModalView = "certified" | "atproto"

export default function SignInModal({
  isOpen,
  error,
  onClose,
  onSubmitEmail,
  onSubmitHandle,
}: SignInModalProps) {
  const focusTrapRef = useFocusTrap<HTMLDivElement>(isOpen)
  const inputRef = useRef<HTMLInputElement>(null)
  const [view, setView] = useState<ModalView>("certified")
  const [inputValue, setInputValue] = useState("")
  const [rememberMe, setRememberMe] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setView("certified")
      setInputValue("")
      setIsSubmitting(false)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [isOpen])

  // Focus input when switching views
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => inputRef.current?.focus())
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
  useBodyScrollLock(isOpen)

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

  const heading = isCertified ? "Your email" : "Your handle"
  const placeholder = isCertified ? "you@example.com" : "you.bsky.social"
  const switchLabel = isCertified
    ? "Or sign in with ATProto/Bluesky"
    : "Or sign in with Certified"
  const submitLabel = isSubmitting ? "Connecting..." : "Continue"

  return (
    <div
      className="signin-modal__backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
      aria-label="Sign in"
    >
      <div className="signin-modal__wrapper" ref={focusTrapRef}>
        <button
          type="button"
          className="signin-modal__close"
          onClick={onClose}
          aria-label="Close"
        >
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>

        <div className="signin-modal">
          <div className="signin-modal__brandmark-wrap">
            <Brandmark size={72} title="" aria-hidden="true" className="signin-modal__brandmark" />
          </div>

          <form onSubmit={handleSubmit} className="signin-modal__form" method="post" aria-label="Sign in">
            <label className="signin-modal__heading" htmlFor={isCertified ? "email" : "username"}>
              {heading}
            </label>
            <input
              ref={inputRef}
              id={isCertified ? "email" : "username"}
              name={isCertified ? "email" : "username"}
              type={isCertified ? "email" : "text"}
              inputMode={isCertified ? "email" : "text"}
              className="signin-modal__input"
              placeholder={placeholder}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              required
              autoComplete={isCertified ? "email" : "username"}
              disabled={isSubmitting}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "signin-error" : undefined}
            />

            <label className="signin-modal__remember">
              <input
                type="checkbox"
                className="signin-modal__remember-input"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <span className="signin-modal__remember-box" aria-hidden="true">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 8.5 L6.5 12 L13 4" />
                </svg>
              </span>
              <span className="signin-modal__remember-label">Remember me on this device</span>
            </label>

            {error && (
              <p id="signin-error" className="signin-modal__error" role="alert">{error}</p>
            )}

            <button
              type="submit"
              className="signin-modal__submit"
              disabled={isSubmitting || !inputValue.trim()}
            >
              {submitLabel}
            </button>

            <button
              type="button"
              className="signin-modal__alt"
              onClick={() => {
                setView(isCertified ? "atproto" : "certified")
                setInputValue("")
              }}
            >
              {switchLabel}
            </button>
          </form>
        </div>

        <div
          className="signin-modal__powered"
          role="img"
          aria-label="Powered by Certified"
        />
      </div>
    </div>
  )
}
