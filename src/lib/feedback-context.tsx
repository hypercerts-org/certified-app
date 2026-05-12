"use client"

import { createContext, useContext, useState, useCallback, useMemo } from "react"

interface FeedbackContextValue {
  isOpen: boolean
  openFeedback: () => void
  closeFeedback: () => void
}

const FeedbackContext = createContext<FeedbackContextValue>({
  isOpen: false,
  openFeedback: () => {},
  closeFeedback: () => {},
})

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)

  const openFeedback = useCallback(() => setIsOpen(true), [])
  const closeFeedback = useCallback(() => setIsOpen(false), [])

  const value = useMemo(() => ({ isOpen, openFeedback, closeFeedback }), [isOpen, openFeedback, closeFeedback])

  return (
    <FeedbackContext.Provider value={value}>
      {children}
    </FeedbackContext.Provider>
  )
}

export function useFeedback() {
  return useContext(FeedbackContext)
}
