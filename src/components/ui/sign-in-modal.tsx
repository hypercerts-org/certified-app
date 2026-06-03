"use client"

import React, { useEffect, useRef, useState } from "react"
import AppDialog, { AppDialogHeader, AppDialogBody } from "./app-dialog"
import Brandmark from "./brandmark"
import Button from "./button"
import Checkbox from "./checkbox"
import Input from "./input"

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

      <AppDialogBody>
        <div className="flex justify-center mb-8 text-[var(--fg-primary)] max-[520px]:mb-6">
          <Brandmark size={72} decorative className="block" />
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col" method="post" aria-label="Sign in">
          <label
            className="font-[var(--font-inter),system-ui,sans-serif] text-[1.125rem] font-semibold tracking-[-0.01em] text-[var(--fg-primary)] mb-3 max-[520px]:text-base"
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
          className='block mx-auto mt-6 w-[165px] h-[18px] bg-[var(--fg-primary)] dark:bg-[var(--fg-secondary)] [mask-image:url("/assets/powered_by_certified_black.svg")] [mask-size:contain] [mask-repeat:no-repeat] [mask-position:center] [-webkit-mask-image:url("/assets/powered_by_certified_black.svg")] [-webkit-mask-size:contain] [-webkit-mask-repeat:no-repeat] [-webkit-mask-position:center]'
          role="img"
          aria-label="Powered by Certified"
        />
      </AppDialogBody>
    </AppDialog>
  )
}
