"use client"

import React, { useEffect, useRef, useState } from "react"
import AppDialog, { AppDialogHeader } from "@/components/ui/app-dialog"
import Brandmark from "@/components/ui/brandmark"
import Button from "@/components/ui/button"
import Checkbox from "@/components/ui/checkbox"
import Input from "@/components/ui/input"

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
  const inputRef = useRef<HTMLInputElement>(null)
  const [view, setView] = useState<ModalView>("certified")
  const [inputValue, setInputValue] = useState("")
  const [rememberMe, setRememberMe] = useState(true)
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

  const isCertified = view === "certified"

  const heading = isCertified ? "Your email" : "Your handle"
  const placeholder = isCertified ? "you@example.com" : "you.bsky.social"
  const switchLabel = isCertified
    ? "Or sign in with ATProto/Bluesky"
    : "Or sign in with Certified"
  const submitLabel = isSubmitting ? "Connecting..." : "Continue"

  return (
    <AppDialog ariaLabel="Sign in" onClose={onClose}>
      <AppDialogHeader title="" onClose={onClose} />

      <div className="signin-modal__body">
        <div className="signin-modal__brandmark-wrap">
          <Brandmark size={72} decorative className="signin-modal__brandmark" />
        </div>

        <form onSubmit={handleSubmit} className="signin-modal__form" method="post" aria-label="Sign in">
          <label className="signin-modal__heading" htmlFor={isCertified ? "email" : "username"}>
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

          <div className="mt-4">
            <Checkbox
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              label="Remember me on this device"
            />
          </div>

          <Button
            type="submit"
            size="lg"
            loading={isSubmitting}
            disabled={isSubmitting || !inputValue.trim()}
            className="mt-4 w-full"
          >
            {submitLabel}
          </Button>

          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setView(isCertified ? "atproto" : "certified")
              setInputValue("")
            }}
            className="mt-2 w-full"
          >
            {switchLabel}
          </Button>
        </form>

        <div
          className="signin-modal__powered"
          role="img"
          aria-label="Powered by Certified"
        />
      </div>
    </AppDialog>
  )
}
