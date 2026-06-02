"use client"

import React, { useEffect, useRef, useState } from "react"
import ResponsiveDialog from "@/components/ui/responsive-dialog"
import { AppDialogHeader } from "@/components/ui/app-dialog"
import Button from "@/components/ui/button"
import Input from "@/components/ui/input"
import Textarea from "@/components/ui/textarea"
import { useFeedback } from "@/lib/feedback-context"
import { useSession } from "@/hooks/use-session"
import { useAuth } from "@/lib/auth/auth-context"
import { useAuthorInfo } from "@/hooks/use-author-info"

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
  const [message, setMessage] = useState("")
  const [email, setEmail] = useState("")
  const [emailError, setEmailError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Backdrop / Esc / focus trap / body-scroll lock / drag-to-dismiss are all
  // owned by <ResponsiveDialog> now; we only manage form state here.
  useEffect(() => {
    if (isOpen) {
      setEmailError("")
      setError("")
      setTimeout(() => textareaRef.current?.focus(), 100)
    }
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

  const body = submitted ? (
    <div className="feedback-modal__success">
      <p>Thank you for your feedback!</p>
      <div className="feedback-modal__success-actions">
        <Button variant="primary" size="sm" onClick={() => closeFeedback()}>
          Close
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setSubmitted(false)}>
          More Feedback
        </Button>
      </div>
    </div>
  ) : (
    <form onSubmit={handleSubmit}>
      {greetingName ? (
        <p className="feedback-modal__greeting">Hi, {greetingName}!</p>
      ) : null}
      <Textarea
        ref={textareaRef}
        id="feedback-message"
        label="Please share your feedback, suggestions, and questions."
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        required
        disabled={isSubmitting}
        rows={5}
      />

      <div className="mt-4">
        <Input
          id="feedback-email"
          type="email"
          label="If you would like us to follow up with you regarding your feedback, please provide your email address (optional)."
          value={email}
          onChange={(e) => { setEmail(e.target.value); if (emailError) validateEmail(e.target.value) }}
          onBlur={() => validateEmail(email)}
          placeholder="your@email.com"
          disabled={isSubmitting}
          error={emailError || undefined}
        />
      </div>

      {error && (
        <p className="feedback-modal__error mt-2" role="alert">{error}</p>
      )}

      <Button
        type="submit"
        loading={isSubmitting}
        disabled={isSubmitting || !message.trim()}
        aria-busy={isSubmitting}
        className="mt-5 w-full"
      >
        {isSubmitting ? "Sending..." : "Send Feedback"}
      </Button>
    </form>
  )

  return (
    <ResponsiveDialog
      open={isOpen}
      onClose={closeFeedback}
      ariaLabel="Share feedback"
      maxWidth={440}
      header={<AppDialogHeader title="Share Feedback" onClose={closeFeedback} />}
    >
      <div className="feedback-modal__body">{body}</div>
    </ResponsiveDialog>
  )
}
