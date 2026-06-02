"use client"

import React, { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { X, Maximize2, Minimize2 } from "lucide-react"
import { useFocusTrap } from "@/hooks/use-focus-trap"
import { useBottomSheetDrag } from "@/hooks/use-bottom-sheet-drag"
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock"
import { useFeedback } from "@/lib/feedback-context"
import { useSession } from "@/hooks/use-session"
import { useAuth } from "@/lib/auth/auth-context"
import { useAuthorInfo } from "@/hooks/use-author-info"
import { useLayoutBreakpoints } from "@/hooks/use-layout-breakpoints"

export default function FeedbackModal() {
  const { isOpen, closeFeedback } = useFeedback()
  const { handle: sessionHandle } = useSession()
  const { did } = useAuth()
  // Greeting priority: app.certified.actor.profile displayName →
  // app.bsky.actor.profile displayName → session handle. This is
  // exactly what /api/resolve-did already returns (Certs-first with
  // per-field Bluesky fallback), so we reuse useAuthorInfo and its
  // module-level cache rather than issuing a new request.
  const { info: authorInfo } = useAuthorInfo(did)
  const greetingName =
    authorInfo?.displayName ||
    (sessionHandle ? `@${sessionHandle}` : null)
  const [expanded, setExpanded] = useState(false)
  const [message, setMessage] = useState("")
  const [email, setEmail] = useState("")
  const [emailError, setEmailError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState("")
  const backdropRef = useRef<HTMLDivElement>(null)
  const { isDesktop } = useLayoutBreakpoints()
  const isMobile = !isDesktop
  const {
    sheetRef,
    sheetExpanded,
    setSheetExpanded,
    onHandleTouchStart,
    onHandleTouchMove,
    onHandleTouchEnd,
  } = useBottomSheetDrag({ isOpen, onClose: closeFeedback })

  const focusTrapRef = useFocusTrap<HTMLDivElement>(isOpen && !isMobile)
  // Wire mobile focus trap directly to sheetRef (avoids useEffect timing issue)
  const mobileFocusTrapRef = useFocusTrap<HTMLDivElement>(isOpen && isMobile)
  if (isMobile && sheetRef.current) {
    (mobileFocusTrapRef as React.MutableRefObject<HTMLDivElement | null>).current = sheetRef.current
  }
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (isOpen) {
      setEmailError("")
      setError("")
      setExpanded(false)
      setSheetExpanded(false)
      setTimeout(() => textareaRef.current?.focus(), 100)
    }
  }, [isOpen, setSheetExpanded])

  // Lock body scroll when open on mobile
  useBodyScrollLock(isOpen && isMobile)

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeFeedback()
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, closeFeedback])

  const validateEmail = (value: string) => {
    if (!value) {
      setEmailError("")
      return true
    }
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    setEmailError(valid ? "" : "Please enter a valid email address")
    return valid
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!message.trim() || isSubmitting) return
    if (email && !validateEmail(email)) return

    setIsSubmitting(true)
    setError("")
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: message.trim(),
          email: email.trim() || undefined,
          // Passed along so the support email includes the sender's
          // identity. DID is also re-derived server-side from the
          // session cookie for trust; this one is used only when the
          // user isn't authenticated.
          handle: sessionHandle || undefined,
        }),
      })
      if (!res.ok) throw new Error("Failed to send feedback")
      setSubmitted(true)
      setMessage("")
      setEmail("")
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const formContent = submitted ? (
    <div className="feedback-modal__success">
      <p>Thank you for your feedback!</p>
      <div className="feedback-modal__success-actions">
        <button
          className="feedback-modal__done"
          onClick={() => closeFeedback()}
        >
          Close
        </button>
        <button
          className="feedback-modal__more"
          onClick={() => setSubmitted(false)}
        >
          More Feedback
        </button>
      </div>
    </div>
  ) : (
    <form onSubmit={handleSubmit}>
      {greetingName ? (
        <p className="feedback-modal__greeting">Hi, {greetingName}!</p>
      ) : null}
      <label className="feedback-modal__label" htmlFor="feedback-message">
        Please share your feedback, suggestions, and questions.
      </label>
      <textarea
        ref={textareaRef}
        id="feedback-message"
        className="feedback-modal__textarea"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        required
        disabled={isSubmitting}
        rows={5}
      />

      <label className="feedback-modal__label feedback-modal__label--email" htmlFor="feedback-email">
        If you would like us to follow up with you regarding your feedback, please provide your email address (optional).
      </label>
      <input
        id="feedback-email"
        type="email"
        className="feedback-modal__input"
        value={email}
        onChange={(e) => { setEmail(e.target.value); if (emailError) validateEmail(e.target.value) }}
        onBlur={() => validateEmail(email)}
        placeholder="your@email.com"
        disabled={isSubmitting}
        aria-invalid={emailError ? true : undefined}
        aria-describedby={emailError ? "feedback-email-error" : undefined}
      />
      {emailError && <p id="feedback-email-error" className="feedback-modal__error" role="alert">{emailError}</p>}

      {error && <p className="feedback-modal__error" role="alert">{error}</p>}

      <button
        type="submit"
        className="feedback-modal__submit"
        disabled={isSubmitting || !message.trim()}
      >
        {isSubmitting ? "Sending..." : "Send Feedback"}
      </button>
    </form>
  )

  return (
    <>
      {isOpen && (
        <>
          {/* Desktop modal */}
          <div
            className="feedback-modal__backdrop feedback-modal__backdrop--desktop"
            ref={backdropRef}
            onClick={(e) => { if (e.target === backdropRef.current) closeFeedback() }}
          >
            <div
              className={`feedback-modal ${expanded ? "feedback-modal--expanded" : ""}`}
              ref={focusTrapRef}
              role="dialog"
              aria-modal="true"
              aria-label="Share feedback"
            >
              <div className="feedback-modal__header">
                <button
                  className="feedback-modal__expand"
                  onClick={() => setExpanded(!expanded)}
                  aria-label={expanded ? "Shrink" : "Expand"}
                >
                  {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                </button>
                <span className="feedback-modal__title">Share Feedback</span>
                <button
                  className="feedback-modal__close"
                  onClick={() => closeFeedback()}
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="feedback-modal__body">
                {!isMobile && formContent}
              </div>
            </div>
          </div>

          {/* Mobile bottom sheet */}
          {createPortal(
            <>
              <div className="bottom-sheet__backdrop feedback-bottom-sheet__backdrop" onClick={() => closeFeedback()} />
              <div
                className={`bottom-sheet feedback-bottom-sheet ${sheetExpanded ? "bottom-sheet--expanded" : ""}`}
                ref={sheetRef}
                role="dialog"
                aria-modal="true"
                aria-label="Share feedback"
              >
                <div
                  className="bottom-sheet__handle"
                  onTouchStart={onHandleTouchStart}
                  onTouchMove={onHandleTouchMove}
                  onTouchEnd={onHandleTouchEnd}
                />
                <div className="bottom-sheet__content">
                  <div className="feedback-modal__body">
                    {isMobile && formContent}
                  </div>
                </div>
              </div>
            </>,
            document.body
          )}
        </>
      )}
    </>
  )
}
