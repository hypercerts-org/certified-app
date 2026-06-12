"use client"

import { createContext, useContext, useState, useCallback, useMemo } from "react"

/** The one feedback modal serves two doors: app feedback (the floating
 *  trigger) and "get in touch" contact requests (landing CTAs). Same
 *  form, same /api/feedback wiring — only the copy and the message
 *  prefix differ (see feedback-modal.tsx). */
export type FeedbackVariant = "feedback" | "contact"

interface FeedbackContextValue {
  isOpen: boolean
  variant: FeedbackVariant
  openFeedback: (variant?: FeedbackVariant) => void
  closeFeedback: () => void
}

const FeedbackContext = createContext<FeedbackContextValue>({
  isOpen: false,
  variant: "feedback",
  openFeedback: () => {},
  closeFeedback: () => {},
})

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [variant, setVariant] = useState<FeedbackVariant>("feedback")

  const openFeedback = useCallback((v: FeedbackVariant = "feedback") => {
    setVariant(v)
    setIsOpen(true)
  }, [])
  const closeFeedback = useCallback(() => setIsOpen(false), [])

  const value = useMemo(
    () => ({ isOpen, variant, openFeedback, closeFeedback }),
    [isOpen, variant, openFeedback, closeFeedback]
  )

  return (
    <FeedbackContext.Provider value={value}>
      {children}
    </FeedbackContext.Provider>
  )
}

export function useFeedback() {
  return useContext(FeedbackContext)
}
