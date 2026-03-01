"use client"

import React, { useEffect, useRef, useState } from "react"

interface SignInModalProps {
  isOpen: boolean
  authMode: "sign-in" | "sign-up"
  error: string | null
  onClose: () => void
  onSubmitEmail: (email: string) => Promise<void>
  onSubmitHandle: (handle: string) => Promise<void>
}

type ModalView = "certified" | "atproto"

export default function SignInModal({
  isOpen,
  authMode,
  error,
  onClose,
  onSubmitEmail,
  onSubmitHandle,
}: SignInModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [view, setView] = useState<ModalView>("certified")
  const [inputValue, setInputValue] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setView("certified")
      setInputValue("")
      setIsSubmitting(false)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  // Focus input when switching views
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50)
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
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
    return () => { document.body.style.overflow = "" }
  }, [isOpen])

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

  const title = isCertified
    ? authMode === "sign-up"
      ? "Create your Certified ID"
      : "Sign in to Certified"
    : "Sign in with ATProto"

  const buttonLabel = isCertified
    ? authMode === "sign-up"
      ? "Sign up for Certified"
      : "Sign in with Certified"
    : "Sign in"

  const switchLabel = isCertified
    ? "Sign in with ATProto/Bluesky"
    : "Sign in with Certified"

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)" }}
      ref={backdropRef}
      onClick={(e) => { if (e.target === backdropRef.current) onClose() }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="bg-white rounded-sm shadow-modal w-full max-w-sm mx-4 p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <span className="font-sans text-sm uppercase tracking-[0.12em] text-gray-700">{title}</span>
          <button
            className="text-gray-400 hover:text-black transition-colors"
            onClick={onClose}
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block mb-1.5 font-sans text-xs uppercase tracking-[0.12em] text-gray-400">
              {isCertified ? "Email address" : "Handle (username)"}
            </label>
            <input
              ref={inputRef}
              type={isCertified ? "email" : "text"}
              className="h-11 w-full border border-gray-200 rounded-sm bg-white px-4 text-sm font-sans text-gray-700 placeholder:text-gray-400 focus:border-black focus:outline-none transition-all duration-150"
              placeholder={isCertified ? "you@example.com" : "you.bsky.social"}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              required
              autoComplete={isCertified ? "email" : "username"}
              disabled={isSubmitting}
            />
          </div>

          {error && (
            <p className="text-xs font-sans text-error">{error}</p>
          )}

          <button
            type="submit"
            className="w-full bg-black text-white font-sans text-xs uppercase tracking-[0.1em] py-3 rounded-sm transition-opacity hover:opacity-70 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isSubmitting || !inputValue.trim()}
          >
            {isSubmitting ? "Connecting..." : buttonLabel}
          </button>
        </form>

        <div className="mt-4 text-center">
          <button
            type="button"
            className="font-sans text-xs text-gray-500 hover:text-black transition-colors uppercase tracking-[0.1em]"
            onClick={() => {
              setView(isCertified ? "atproto" : "certified")
              setInputValue("")
            }}
          >
            {switchLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
