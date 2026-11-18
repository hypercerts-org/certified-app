"use client"

import React, { useEffect, useId, useRef, useState } from "react"
import { AlertCircle, Mail } from "lucide-react"
import AppDialog, { AppDialogHeader, AppDialogBody } from "./app-dialog"
import Brandmark from "./brandmark"
import Button from "./button"
import Input from "./input"

interface SignInModalProps {
  isOpen: boolean
  /** An error about what the user typed; shown on the email/handle field. */
  error: string | null
  /** An error about the form as a whole (Google sign-in that didn't start);
   *  shown under the sign-in buttons. */
  formError: string | null
  onClose: () => void
  /** Called when the user switches sign-in method, so an error from the
   *  other method doesn't stay on screen. */
  onClearErrors: () => void
  onSubmitEmail: (email: string) => Promise<void>
  onSubmitHandle: (handle: string) => Promise<void>
  onSubmitGoogle: () => Promise<void>
}

type ModalView = "certified" | "atproto"

/** The dialog's title and accessible name, per view: an email that has
 *  no account yet creates one; a handle only signs in. */
const TITLES: Record<ModalView, string> = {
  certified: "Sign in or create an account",
  atproto: "Sign in with your handle",
}

/** The dialog keeps its top edge when the view changes (the email view's
 *  helper line and the titles make the views differ in height): instead of
 *  centring, its top sits where a dialog of the email view's height would
 *  start when centred (about 30rem tall, so half of that above the middle),
 *  never closer than 20px to the top of the screen. */
const PIN_TOP_CLS = "mt-[max(20px,calc(50dvh-15rem))]"

/** The Terms and Privacy links in the consent line: muted text, underlined
 *  so they read as links. */
const LEGAL_LINK_CLS =
  "text-[var(--fg-secondary)] underline decoration-[var(--border-hover)] underline-offset-2 transition-[color,text-decoration-color] duration-fast motion-reduce:transition-none hover:text-[var(--fg-primary)] hover:decoration-[var(--fg-primary)] focus-visible:rounded focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-2"

export default function SignInModal({
  isOpen,
  error,
  formError,
  onClose,
  onClearErrors,
  onSubmitEmail,
  onSubmitHandle,
  onSubmitGoogle,
}: SignInModalProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const googleRef = useRef<HTMLButtonElement>(null)
  const formErrorId = useId()
  const [view, setView] = useState<ModalView>("certified")
  const [inputValue, setInputValue] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Backdrop/Esc/focus-trap/scroll-lock are all owned by <AppDialog>; we
  // only manage the form state here. The component stays mounted while
  // closed, so the view and typed value survive the context closing the
  // modal for a sign-in attempt and reopening it when that fails: the user
  // lands back where they were, with the error on the right field. They're
  // reset in handleClose, when the user closes the modal.
  useEffect(() => {
    if (isOpen) setIsSubmitting(false)
  }, [isOpen])

  // Focus on open and on switching views: the field, or the Google button
  // when Google sign-in just failed to start, so the error (linked to the
  // button) is read with it and Enter retries.
  useEffect(() => {
    if (!isOpen) return
    const target = formError ? googleRef : inputRef
    requestAnimationFrame(() => target.current?.focus())
  }, [view, isOpen, formError])

  // <AppDialog> calls showModal() on mount and has no `open` prop, so gate
  // the mount here to match the previous isOpen-driven render.
  if (!isOpen) return null

  // The user closed the modal (Esc, backdrop or X), so the next open
  // starts fresh on the email view. Closing it to start a sign-in doesn't
  // come through here.
  const handleClose = () => {
    setView("certified")
    setInputValue("")
    onClose()
  }

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

  const handleGoogle = async () => {
    if (isSubmitting) return
    setIsSubmitting(true)
    try {
      await onSubmitGoogle()
    } finally {
      setIsSubmitting(false)
    }
  }

  const isCertified = view === "certified"

  const title = TITLES[view]
  const fieldLabel = isCertified ? "Your email" : "Your handle"
  const placeholder = isCertified ? "you@example.com" : "you.bsky.social"
  // Worded and laid out in parallel with "Sign in with Google": same
  // pattern, a 20px mark in the logo's place. The Atmosphere has no agreed
  // logo yet, so it uses the blue "@" from atproto.com's favicon, as is
  // (48px is the largest published size). Email gets the mail icon.
  const switchLabel = isCertified ? "Sign in with Atmosphere" : "Sign in with email"
  const submitLabel = isSubmitting ? "Connecting…" : "Continue"

  return (
    <AppDialog ariaLabel={title} onClose={handleClose} className={PIN_TOP_CLS}>
      {/* The standard dialog title (DESIGN §9.8), with the brandmark
          beside it so it's clear whose account this is. */}
      <AppDialogHeader
        title={
          <span className="flex items-center gap-3">
            <Brandmark size={28} decorative className="block shrink-0 text-[var(--fg-primary)]" />
            <span className="min-w-0">{title}</span>
          </span>
        }
        onClose={handleClose}
      />

      <AppDialogBody>
        <form onSubmit={handleSubmit} className="flex flex-col" method="post" aria-label="Sign in">
          {/* A standard field label (the dialog title above is the only
              heading). */}
          <Input
            ref={inputRef}
            label={fieldLabel}
            id={isCertified ? "email" : "username"}
            name={isCertified ? "email" : "username"}
            type={isCertified ? "email" : "text"}
            inputMode={isCertified ? "email" : "text"}
            size="lg"
            placeholder={placeholder}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            required
            autoComplete={isCertified ? "email" : "username"}
            disabled={isSubmitting}
            error={error ?? undefined}
            helperText={
              isCertified
                ? "New here? Continuing with your email creates your account."
                : undefined
            }
          />

          {/* Continue is the normal next step, so it stays the filled
              primary button even while the field is empty (the field's
              `required` stops an empty submit). */}
          <Button
            type="submit"
            size="lg"
            loading={isSubmitting}
            disabled={isSubmitting}
            className="mt-4 w-full"
          >
            {submitLabel}
          </Button>

          {/* The alternatives: the other sign-in view (Atmosphere, or email
              on the handle view) first, then Google. They share one outline
              style, below an "or" rule, so neither competes with Continue. */}
          <div className="my-4 flex items-center gap-3 text-xs text-[var(--fg-muted)]">
            <span aria-hidden="true" className="h-px flex-1 bg-[var(--border-default)]" />
            or
            <span aria-hidden="true" className="h-px flex-1 bg-[var(--border-default)]" />
          </div>

          <Button
            type="button"
            variant="secondary"
            size="lg"
            disabled={isSubmitting}
            onClick={() => {
              setView(isCertified ? "atproto" : "certified")
              setInputValue("")
              onClearErrors()
            }}
            className="w-full gap-2.5"
          >
            {isCertified ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src="/brand/signin/atproto_at.png"
                alt=""
                width={20}
                height={20}
                className="shrink-0"
              />
            ) : (
              <Mail size={20} aria-hidden="true" className="shrink-0" />
            )}
            {switchLabel}
          </Button>

          <Button
            ref={googleRef}
            type="button"
            variant="secondary"
            size="lg"
            disabled={isSubmitting}
            onClick={() => void handleGoogle()}
            aria-describedby={formError ? formErrorId : undefined}
            className="mt-2 w-full gap-2.5"
          >
            {/* Google's current gradient "G" (g-logo.png from Google's
                branding page), at the 20px size and 10px gap its
                guidelines set for a web button. The file is 200x204, so
                object-contain keeps the aspect ratio. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/signin/google_g.png"
              alt=""
              width={20}
              height={20}
              className="shrink-0 object-contain"
            />
            Sign in with Google
          </Button>

          {/* Same look as the field error in <Input>, under the button
              that failed. */}
          {formError && (
            <p
              id={formErrorId}
              role="alert"
              className="mt-1.5 flex items-start gap-1 text-caption text-[var(--color-error)]"
            >
              <AlertCircle size={12} strokeWidth={2} className="mt-[0.15rem] shrink-0" aria-hidden />
              <span>{formError}</span>
            </p>
          )}
        </form>

        {/* Consent, for new and returning accounts alike. The documents
            open in a new tab so the sign-in in progress isn't lost. */}
        <p className="mt-5 mb-0 text-caption text-[var(--fg-muted)] text-pretty">
          By continuing you agree to the{" "}
          <a href="/terms" target="_blank" rel="noopener noreferrer" className={LEGAL_LINK_CLS}>
            Terms
          </a>{" "}
          and{" "}
          <a href="/privacy" target="_blank" rel="noopener noreferrer" className={LEGAL_LINK_CLS}>
            Privacy Policy
          </a>
          .
        </p>
      </AppDialogBody>
    </AppDialog>
  )
}
