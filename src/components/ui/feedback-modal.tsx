"use client"

import React, { useEffect, useRef, useState, useCallback } from "react"
import { createPortal } from "react-dom"
import { MessageSquare, X, Maximize2, Minimize2 } from "lucide-react"
import { useFocusTrap } from "@/hooks/use-focus-trap"

export default function FeedbackModal() {
  const [isOpen, setIsOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [message, setMessage] = useState("")
  const [email, setEmail] = useState("")
  const [emailError, setEmailError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState("")
  const [bottomOffset, setBottomOffset] = useState(20)
  const backdropRef = useRef<HTMLDivElement>(null)
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    setIsMobile(window.innerWidth <= 768)
  }, [isOpen])
  const focusTrapRef = useFocusTrap<HTMLDivElement>(isOpen && !isMobile)
  const mobileFocusTrapRef = useFocusTrap<HTMLDivElement>(isOpen && isMobile)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Sync mobile focus trap ref with sheet ref so both point to the same element
  useEffect(() => {
    if (isMobile && sheetRef.current) {
      (mobileFocusTrapRef as React.MutableRefObject<HTMLDivElement | null>).current = sheetRef.current;
    }
  }, [isMobile, isOpen, mobileFocusTrapRef])

  // Bottom sheet drag state (mobile)
  const sheetRef = useRef<HTMLDivElement>(null)
  const [sheetExpanded, setSheetExpanded] = useState(false)
  const dragStartY = useRef(0)
  const isDragging = useRef(false)

  const updateButtonPosition = useCallback(() => {
    const footer = document.querySelector(".landing-footer")
    if (!footer) { setBottomOffset(20); return }
    const footerRect = footer.getBoundingClientRect()
    const viewportHeight = window.innerHeight
    // Only push button up when footer is visible from below, not when scrolled past
    if (footerRect.top < viewportHeight && footerRect.bottom > 0) {
      setBottomOffset(viewportHeight - footerRect.top + 12)
    } else {
      setBottomOffset(20)
    }
  }, [])

  useEffect(() => {
    updateButtonPosition()
    window.addEventListener("scroll", updateButtonPosition, { passive: true })
    window.addEventListener("resize", updateButtonPosition, { passive: true })
    return () => {
      window.removeEventListener("scroll", updateButtonPosition)
      window.removeEventListener("resize", updateButtonPosition)
    }
  }, [updateButtonPosition])

  useEffect(() => {
    if (isOpen) {
      setEmailError("")
      setError("")
      setExpanded(false)
      setSheetExpanded(false)
      setTimeout(() => textareaRef.current?.focus(), 100)
    }
  }, [isOpen])

  // Lock body scroll when open on mobile
  useEffect(() => {
    if (isOpen && window.innerWidth <= 768) {
      document.body.style.overflow = "hidden"
      return () => { document.body.style.overflow = "" }
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false)
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [isOpen])

  // Reset sheet expanded state when closed
  useEffect(() => {
    if (!isOpen) setSheetExpanded(false)
  }, [isOpen])

  // Auto-expand sheet when input is focused on mobile (keyboard opens)
  useEffect(() => {
    if (!isOpen || typeof window === "undefined" || window.innerWidth > 768) return

    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === "TEXTAREA" || target.tagName === "INPUT") {
        setSheetExpanded(true)
        // Scroll the focused element into view after keyboard appears
        setTimeout(() => target.scrollIntoView({ behavior: "smooth", block: "center" }), 300)
      }
    }

    document.addEventListener("focusin", handleFocusIn)
    return () => document.removeEventListener("focusin", handleFocusIn)
  }, [isOpen])

  // Adjust sheet height when virtual keyboard opens/closes via visualViewport
  useEffect(() => {
    if (!isOpen || typeof window === "undefined" || window.innerWidth > 768) return
    const vv = window.visualViewport
    if (!vv) return

    const handleResize = () => {
      if (sheetRef.current) {
        const keyboardHeight = window.innerHeight - vv.height
        if (keyboardHeight > 100) {
          sheetRef.current.style.maxHeight = `${vv.height - 20}px`
          sheetRef.current.style.bottom = `${keyboardHeight}px`
        } else {
          sheetRef.current.style.maxHeight = ""
          sheetRef.current.style.bottom = "0"
        }
      }
    }

    vv.addEventListener("resize", handleResize)
    return () => vv.removeEventListener("resize", handleResize)
  }, [isOpen])

  const onHandleTouchStart = useCallback((e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY
    isDragging.current = true
    if (sheetRef.current) {
      sheetRef.current.style.transition = "none"
    }
  }, [])

  const onHandleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current || !sheetRef.current) return
    e.preventDefault()
    const dy = e.touches[0].clientY - dragStartY.current
    if (dy > 0) {
      // Dragging down — slide sheet down
      sheetRef.current.style.transform = `translateY(${dy}px)`
    } else {
      // Dragging up — grow the sheet with a dampened translateY
      const dampened = dy * 0.3
      sheetRef.current.style.transform = `translateY(${dampened}px)`
    }
  }, [])

  const onHandleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current || !sheetRef.current) return
    isDragging.current = false
    const dy = e.changedTouches[0].clientY - dragStartY.current
    sheetRef.current.style.transition = "transform 0.3s ease-out, max-height 0.3s ease-out"
    sheetRef.current.style.transform = "translateY(0)"

    if (dy > 80) {
      sheetRef.current.style.transform = "translateY(100%)"
      setTimeout(() => setIsOpen(false), 250)
    } else if (dy < -40) {
      setSheetExpanded(true)
    } else if (dy > 20 && sheetExpanded) {
      setSheetExpanded(false)
    }
  }, [sheetExpanded])

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
        body: JSON.stringify({ message: message.trim(), email: email.trim() || undefined }),
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
          onClick={() => setIsOpen(false)}
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
      {!isOpen && <button
        className="feedback-trigger"
        style={{ bottom: `${bottomOffset}px` }}
        onClick={() => setIsOpen(true)}
        aria-label="Share feedback"
      >
        <MessageSquare size={16} />
        <span>Share Feedback</span>
      </button>}

      {isOpen && (
        <>
          {/* Desktop modal */}
          <div
            className="feedback-modal__backdrop feedback-modal__backdrop--desktop"
            ref={backdropRef}
            onClick={(e) => { if (e.target === backdropRef.current) setIsOpen(false) }}
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
                  onClick={() => setIsOpen(false)}
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="feedback-modal__body">
                {formContent}
              </div>
            </div>
          </div>

          {/* Mobile bottom sheet */}
          {createPortal(
            <>
              <div className="bottom-sheet__backdrop feedback-bottom-sheet__backdrop" onClick={() => setIsOpen(false)} />
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
                    {formContent}
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
