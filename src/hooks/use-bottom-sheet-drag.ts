"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useLayoutBreakpoints } from "@/hooks/use-layout-breakpoints"

interface UseBottomSheetDragOptions {
  isOpen: boolean
  onClose: () => void
}

interface UseBottomSheetDragReturn {
  sheetRef: React.RefObject<HTMLDivElement | null>
  sheetExpanded: boolean
  setSheetExpanded: React.Dispatch<React.SetStateAction<boolean>>
  onHandleTouchStart: (e: React.TouchEvent) => void
  onHandleTouchMove: (e: React.TouchEvent) => void
  onHandleTouchEnd: (e: React.TouchEvent) => void
}

/**
 * Encapsulates bottom-sheet drag-to-dismiss / drag-to-expand behaviour
 * and virtual-keyboard height adjustments for mobile bottom sheets.
 */
export function useBottomSheetDrag({
  isOpen,
  onClose,
}: UseBottomSheetDragOptions): UseBottomSheetDragReturn {
  const sheetRef = useRef<HTMLDivElement>(null)
  const [sheetExpanded, setSheetExpanded] = useState(false)
  const dragStartY = useRef(0)
  const dragStartTime = useRef(0)
  const isDragging = useRef(false)
  const { isDesktop } = useLayoutBreakpoints()

  // Reset sheet expanded state when closed — adjusted during render so
  // the collapse doesn't wait for an effect pass.
  if (!isOpen && sheetExpanded) {
    setSheetExpanded(false)
  }

  // Auto-expand sheet when input is focused on mobile (keyboard opens)
  useEffect(() => {
    if (!isOpen || isDesktop) return

    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === "TEXTAREA" || target.tagName === "INPUT") {
        setSheetExpanded(true)
        // JS smooth scrolling isn't covered by the CSS reduced-motion block.
        const reduce = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches
        setTimeout(
          () => target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" }),
          300,
        )
      }
    }

    document.addEventListener("focusin", handleFocusIn)
    return () => document.removeEventListener("focusin", handleFocusIn)
  }, [isOpen, isDesktop])

  // Adjust sheet height when virtual keyboard opens/closes via visualViewport
  useEffect(() => {
    if (!isOpen) return
    if (isDesktop) return
    // globalThis is always defined in our supported runtimes (ES2020+),
    // so no presence guard.
    const vv = globalThis.visualViewport
    if (!vv) return

    const sheet = sheetRef.current

    const handleResize = () => {
      if (sheet) {
        const keyboardHeight = globalThis.innerHeight - vv.height
        if (keyboardHeight > 100) {
          sheet.style.maxHeight = `${vv.height - 20}px`
          sheet.style.bottom = `${keyboardHeight}px`
        } else {
          sheet.style.maxHeight = ""
          sheet.style.bottom = "0"
        }
      }
    }

    vv.addEventListener("resize", handleResize)
    return () => {
      vv.removeEventListener("resize", handleResize)
      // Reset inline styles so a reused/reopened sheet node doesn't flash a
      // stale clamped height/offset until the next resize event fires.
      if (sheet) {
        sheet.style.maxHeight = ""
        sheet.style.bottom = ""
      }
    }
  }, [isOpen, isDesktop])

  const onHandleTouchStart = useCallback((e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY
    dragStartTime.current = e.timeStamp
    isDragging.current = true
    if (sheetRef.current) {
      sheetRef.current.style.transition = "none"
    }
  }, [])

  const onHandleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current || !sheetRef.current) return
    e.preventDefault()
    const dy = e.touches[0].clientY - dragStartY.current
    if (dy > 0) {
      sheetRef.current.style.transform = `translateY(${dy}px)`
    } else {
      const dampened = dy * 0.3
      sheetRef.current.style.transform = `translateY(${dampened}px)`
    }
  }, [])

  const onHandleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current || !sheetRef.current) return
    isDragging.current = false
    const dy = e.changedTouches[0].clientY - dragStartY.current
    const elapsed = Math.max(1, e.timeStamp - dragStartTime.current)

    // Dismiss on distance OR a fast downward flick (px/ms). The consumer
    // (<BottomSheet>) owns the exit: it slides the sheet out from the
    // current dragged position, so leave the transform where it is.
    if (dy > 80 || (dy > 10 && dy / elapsed > 0.11)) {
      onClose()
      return
    }

    sheetRef.current.style.transition =
      "transform 0.3s cubic-bezier(0.32, 0.72, 0, 1), max-height 0.3s cubic-bezier(0.16, 1, 0.3, 1)"
    sheetRef.current.style.transform = "translateY(0)"

    if (dy < -40) {
      setSheetExpanded(true)
    } else if (dy > 20 && sheetExpanded) {
      setSheetExpanded(false)
    }
  }, [sheetExpanded, onClose])

  return {
    sheetRef,
    sheetExpanded,
    setSheetExpanded,
    onHandleTouchStart,
    onHandleTouchMove,
    onHandleTouchEnd,
  }
}
