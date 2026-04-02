"use client"

import React, { useEffect, useRef, useState, useCallback } from "react"
import { MessageSquare, X, Maximize2, Minimize2 } from "lucide-react"

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
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const updateButtonPosition = useCallback(() => {
    const footer = document.querySelector(".landing-footer")
    if (!footer) { setBottomOffset(20); return }
    const footerRect = footer.getBoundingClientRect()
    const viewportHeight = window.innerHeight
    if (footerRect.top < viewportHeight) {
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
      setMessage("")
      setEmail("")
      setEmailError("")
      setError("")
      setSubmitted(false)
      setExpanded(false)
      setTimeout(() => textareaRef.current?.focus(), 100)
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
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <button
        className="feedback-trigger"
        style={{ bottom: `${bottomOffset}px` }}
        onClick={() => setIsOpen(true)}
        aria-label="Share feedback"
      >
        <MessageSquare size={16} />
        <span>Share Feedback</span>
      </button>

      {isOpen && (
        <div
          className="feedback-modal__backdrop"
          ref={backdropRef}
          onClick={(e) => { if (e.target === backdropRef.current) setIsOpen(false) }}
          role="dialog"
          aria-modal="true"
          aria-label="Share feedback"
        >
          <div className={`feedback-modal ${expanded ? "feedback-modal--expanded" : ""}`}>
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
              {submitted ? (
                <div className="feedback-modal__success">
                  <p>Thank you for your feedback!</p>
                  <button
                    className="feedback-modal__done"
                    onClick={() => setIsOpen(false)}
                  >
                    Close
                  </button>
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
                  />
                  {emailError && <p className="feedback-modal__error">{emailError}</p>}

                  {error && <p className="feedback-modal__error">{error}</p>}

                  <button
                    type="submit"
                    className="feedback-modal__submit"
                    disabled={isSubmitting || !message.trim()}
                  >
                    {isSubmitting ? "Sending..." : "Send Feedback"}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
