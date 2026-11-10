"use client"

import React, { useEffect, useRef, useState } from "react"
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
  const [view, setView] = useState<ModalView>("certified")
  const [inputValue, setInputValue] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Reset state when the modal opens. Backdrop/Esc/focus-trap/scroll-lock
  // are all owned by <AppDialog> now; we only manage the form state here.
  useEffect(() => {
    if (isOpen) {
      setView("certified")
      setInputValue("")
      setIsSubmitting(false)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [isOpen])

  // Focus input when switching views.
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [view, isOpen])

  // <AppDialog> calls showModal() on mount and has no `open` prop, so gate
  // the mount here to match the previous isOpen-driven render.
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

  const heading = isCertified ? "Your email" : "Your handle"
  const placeholder = isCertified ? "you@example.com" : "you.bsky.social"
  // Worded and laid out in parallel with "Sign in with Google": same
  // pattern, a 20px mark in the logo's place. The Atmosphere has no agreed
  // logo yet, so it uses the blue "@" from atproto.com's favicon, as is
  // (48px is the largest published size). Email gets the mail icon.
  const switchLabel = isCertified ? "Sign in with Atmosphere" : "Sign in with email"
  const submitLabel = isSubmitting ? "Connecting…" : "Continue"

  return (
    <AppDialog ariaLabel="Sign in" onClose={onClose}>
      <AppDialogHeader title="" bare onClose={onClose} />

      <AppDialogBody>
        <div className="flex justify-center mb-8 text-[var(--fg-primary)] max-[799px]:mb-6">
          <Brandmark size={72} decorative className="block" />
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col" method="post" aria-label="Sign in">
          <label
            className="font-[var(--font-inter),system-ui,sans-serif] text-[1.125rem] font-semibold tracking-[-0.01em] text-[var(--fg-primary)] mb-3 max-[799px]:text-base"
            htmlFor={isCertified ? "email" : "username"}
          >
            {heading}
          </label>
          <Input
            ref={inputRef}
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
            type="button"
            variant="secondary"
            size="lg"
            disabled={isSubmitting}
            onClick={() => void handleGoogle()}
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
              role="alert"
              className="mt-2 flex items-start gap-1 text-caption text-[var(--color-error)]"
            >
              <AlertCircle size={12} strokeWidth={2} className="mt-[0.15rem] shrink-0" aria-hidden />
              <span>{formError}</span>
            </p>
          )}
        </form>

        <div
          className='block mx-auto mt-6 w-[165px] h-[18px] bg-[var(--fg-primary)] dark:bg-[var(--fg-secondary)] [mask-image:url("/assets/powered_by_certified_black.svg")] [mask-size:contain] [mask-repeat:no-repeat] [mask-position:center] [-webkit-mask-image:url("/assets/powered_by_certified_black.svg")] [-webkit-mask-size:contain] [-webkit-mask-repeat:no-repeat] [-webkit-mask-position:center]'
          role="img"
          aria-label="Powered by Certified"
        />
      </AppDialogBody>
    </AppDialog>
  )
}
