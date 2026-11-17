"use client"

import React, { useEffect, useRef, useState } from "react"
import ResponsiveDialog from "./responsive-dialog"
import { AppDialogHeader } from "./app-dialog"
import Button from "./button"
import Input from "./input"
import Textarea from "./textarea"
import { useFeedback } from "@/lib/feedback-context"
import { useSession } from "@/hooks/use-session"
import { useAuth } from "@/lib/auth/auth-context"
import { useAuthorInfo } from "@/hooks/use-author-info"

/** Per-variant copy — the form, validation, and submit wiring are
 *  identical; contact requests additionally prefix the message so the
 *  support inbox can tell the two doors apart. */
const COPY = {
  feedback: {
    title: "Send feedback",
    note: "Certified.app is in beta, and your feedback shapes it.",
    messageLabel: "Tell us what's working, what's not, or what you'd like to see.",
    emailLabel: "Your email, if you'd like a reply (optional).",
    submit: "Send feedback",
    success: "Thank you for your feedback!",
    again: "Send more feedback",
    prefix: "",
  },
  contact: {
    title: "Get in touch",
    note: "",
    messageLabel:
      "Tell us about your organization, platform, or program, and what you have in mind.",
    emailLabel: "Your email, so we can get back to you (optional).",
    submit: "Send message",
    success: "Thank you! We'll get back to you soon.",
    again: "New message",
    prefix: "[Contact request] ",
  },
} as const

export default function FeedbackModal() {
  const { isOpen, variant, closeFeedback } = useFeedback()
  const copy = COPY[variant]
  const { handle: sessionHandle, email: sessionEmail } = useSession()
  const { did } = useAuth()
  // A signed-in account already has an email we can reply to: send it
  // along (and say so) instead of asking for it again. Signed out, or
  // signed in without one (an Atmosphere sign-in), the optional field
  // stays.
  const replyEmail = did && sessionEmail ? sessionEmail : null
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
      // preventScroll: focusing inside the top-layer dialog must not
      // scroll the page behind it (see the showModal note in
      // app-dialog.tsx).
      setTimeout(() => textareaRef.current?.focus({ preventScroll: true }), 100)
    }
  }, [isOpen])

  const validateEmail = (value: string) => {
    if (!value) {
      setEmailError("")
      return true
    }
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    setEmailError(valid ? "" : "Enter a valid email address.")
    return valid
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!message.trim() || isSubmitting) return
    if (!replyEmail && email && !validateEmail(email)) return

    setIsSubmitting(true)
    setError("")
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: copy.prefix + message.trim(),
          email: replyEmail ?? (email.trim() || undefined),
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
      <p>{copy.success}</p>
      <div className="feedback-modal__success-actions">
        <Button variant="primary" size="sm" onClick={() => closeFeedback()}>
          Close
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setSubmitted(false)}>
          {copy.again}
        </Button>
      </div>
    </div>
  ) : (
    <form onSubmit={handleSubmit}>
      {greetingName ? (
        <p className="feedback-modal__greeting">Hi, {greetingName}!</p>
      ) : null}
      <label htmlFor="feedback-message" className="feedback-modal__prompt">
        {copy.note ? `${copy.note} ${copy.messageLabel}` : copy.messageLabel}
      </label>
      <Textarea
        ref={textareaRef}
        id="feedback-message"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        required
        disabled={isSubmitting}
        rows={5}
      />

      {replyEmail ? (
        <p className="mt-3 mb-0 text-caption text-[var(--fg-muted)] [overflow-wrap:anywhere]">
          {variant === "contact"
            ? `We'll get back to you at ${replyEmail}.`
            : `We'll reply to ${replyEmail} if we have questions.`}
        </p>
      ) : (
        <div className="mt-4">
          <label htmlFor="feedback-email" className="feedback-modal__prompt">
            {copy.emailLabel}
          </label>
          <Input
            id="feedback-email"
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); if (emailError) validateEmail(e.target.value) }}
            onBlur={() => validateEmail(email)}
            placeholder="you@example.com"
            disabled={isSubmitting}
            error={emailError || undefined}
          />
        </div>
      )}

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
        {isSubmitting ? "Sending…" : copy.submit}
      </Button>
    </form>
  )

  return (
    <ResponsiveDialog
      open={isOpen}
      onClose={closeFeedback}
      ariaLabel={copy.title}
      maxWidth={420}
      header={<AppDialogHeader title={copy.title} onClose={closeFeedback} />}
    >
      <div className="feedback-modal__body">{body}</div>
    </ResponsiveDialog>
  )
}
