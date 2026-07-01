"use client"

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import { createPortal } from "react-dom"
import { usePathname, useRouter } from "next/navigation"
import { useMounted } from "@/hooks/use-mounted"
import { useTour } from "@/lib/tour/tour-context"
import Button from "@/components/ui/button"

// Gap between the spotlight ring and the card, and the minimum distance the
// card keeps from each viewport edge while clamping.
const CARD_GAP = 12
const VIEWPORT_PAD = 8
// Breathing room painted around the targeted element inside the spotlight.
const HOLE_PAD = 6
// When bringing a step's target into view we align its TOP this far below
// the viewport top (clearing the sticky chrome) rather than centering it —
// so tall targets like the feed start from the top instead of scrolling
// past their beginning.
const SCROLL_TOP_OFFSET = 96
// Max animation frames to wait for a step's anchor to mount after navigating
// (~2.5s at 60fps) before giving up and showing a centered card instead.
const MAX_RESOLVE_FRAMES = 150

interface CardPos {
  left: number
  top: number
}

/** Resolved per-step geometry. `rect === null` means "render a centered
 *  card over a full dim backdrop" (anchorless step, or anchor never
 *  appeared). */
interface TourLayout {
  /** Which step this layout was measured for — guards against painting a
   *  stale position for one frame after the step changes. */
  step: number
  rect: DOMRect | null
  card: CardPos | null
}

/** Card placement next to the target rect, flipping sides when the
 *  preferred side lacks room and clamping within the viewport. Mirrors the
 *  FLIP/clamp logic in `computePortalCoords` (popover.tsx). */
function computeCardPos(
  target: DOMRect,
  cardW: number,
  cardH: number,
  placement: "top" | "bottom" | "left" | "right",
  align: "start" | "center" | "end",
): CardPos {
  const vw = globalThis.innerWidth
  const vh = globalThis.innerHeight

  // Side placement: card sits beside the target, flipping if the preferred
  // side lacks room. Its top aligns to the target's top, clamped to stay on
  // screen — so it sits next to the visible start of a tall target.
  if (placement === "left" || placement === "right") {
    const spaceRight = vw - target.right
    const spaceLeft = target.left
    let side = placement
    if (
      side === "right" &&
      spaceRight < cardW + CARD_GAP + VIEWPORT_PAD &&
      spaceLeft > spaceRight
    ) {
      side = "left"
    } else if (
      side === "left" &&
      spaceLeft < cardW + CARD_GAP + VIEWPORT_PAD &&
      spaceRight > spaceLeft
    ) {
      side = "right"
    }
    let left =
      side === "right" ? target.right + CARD_GAP : target.left - CARD_GAP - cardW
    const maxL = vw - VIEWPORT_PAD - cardW
    left = Math.min(Math.max(left, VIEWPORT_PAD), Math.max(VIEWPORT_PAD, maxL))
    const maxT = vh - VIEWPORT_PAD - cardH
    const top = Math.min(
      Math.max(target.top, VIEWPORT_PAD),
      Math.max(VIEWPORT_PAD, maxT),
    )
    return { left, top }
  }

  const spaceBelow = vh - target.bottom
  const spaceAbove = target.top
  let side = placement
  if (
    side === "bottom" &&
    spaceBelow < cardH + CARD_GAP + VIEWPORT_PAD &&
    spaceAbove > spaceBelow
  ) {
    side = "top"
  } else if (
    side === "top" &&
    spaceAbove < cardH + CARD_GAP + VIEWPORT_PAD &&
    spaceBelow > spaceAbove
  ) {
    side = "bottom"
  }

  let top =
    side === "bottom"
      ? target.bottom + CARD_GAP
      : target.top - CARD_GAP - cardH
  const maxTop = vh - VIEWPORT_PAD - cardH
  top = Math.min(Math.max(top, VIEWPORT_PAD), Math.max(VIEWPORT_PAD, maxTop))

  let left: number
  if (align === "start") {
    left = target.left
  } else if (align === "end") {
    left = target.right - cardW
  } else {
    left = target.left + target.width / 2 - cardW / 2
  }
  const maxLeft = vw - VIEWPORT_PAD - cardW
  left = Math.min(Math.max(left, VIEWPORT_PAD), Math.max(VIEWPORT_PAD, maxLeft))

  return { left, top }
}

/** Scroll the page so the target's TOP sits just below the sticky chrome.
 *  Sticky targets (nav buttons) don't move, so this is a no-op for them; for
 *  in-flow targets (the feed, settings sections) it scrolls their start into
 *  view rather than centering — clamped at the document top. */
function scrollAnchorToTop(el: HTMLElement): void {
  const rect = el.getBoundingClientRect()
  const targetTop = globalThis.scrollY + rect.top - SCROLL_TOP_OFFSET
  globalThis.scrollTo({ top: Math.max(0, targetTop), behavior: "auto" })
}

/** First *rendered* element carrying the anchor id (width/height > 0, i.e.
 *  not display:none), so the visible variant wins when the same anchor
 *  exists in more than one layout (e.g. desktop vs mobile). */
function findAnchor(anchor: string): { el: HTMLElement; rect: DOMRect } | null {
  const els = document.querySelectorAll<HTMLElement>(`[data-tour="${anchor}"]`)
  for (const el of els) {
    const rect = el.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) return { el, rect }
  }
  return null
}

/**
 * The product walk-through renderer. Mounted once in the root layout; it
 * returns null unless the tour is active. Each step navigates to its page,
 * waits for the target element to mount, scrolls it into view, and renders
 * a spotlight (four dim panels leaving a hole around the element) plus a
 * positioned step card. Anchorless steps — and steps whose anchor never
 * appears — show a centered card over a full dim backdrop.
 */
export default function ProductTour() {
  const { isActive, step, stepIndex, totalSteps, next, back, skip, finish } =
    useTour()
  const mounted = useMounted()
  const router = useRouter()
  const pathname = usePathname()
  const cardRef = useRef<HTMLDivElement>(null)
  const navedForStep = useRef<number | null>(null)
  const [layout, setLayout] = useState<TourLayout | null>(null)
  const titleId = useId()

  const isLast = stepIndex === totalSteps - 1

  // Navigation: on entering a step with a `navigateTo`, route there unless
  // the step's anchor is already on the page (or, for anchorless steps,
  // we're already on the target path). Guarded by a ref so a redirect or
  // pathname change mid-step doesn't re-trigger the push.
  useEffect(() => {
    if (!isActive || !step || !mounted) return
    if (!step.navigateTo) return
    // A step may target a sub-view via #hash (e.g. a settings sub-page). The
    // pathname drives routing; the hash drives same-page state.
    const hashAt = step.navigateTo.indexOf("#")
    const targetPath =
      hashAt === -1 ? step.navigateTo : step.navigateTo.slice(0, hashAt)
    const targetHash = hashAt === -1 ? "" : step.navigateTo.slice(hashAt + 1)
    if (step.anchor) {
      if (findAnchor(step.anchor)) return // already where we need to be
    } else if (pathname === targetPath) {
      return
    }
    if (navedForStep.current === stepIndex) return
    navedForStep.current = stepIndex
    if (pathname === targetPath && targetHash) {
      // Same route, different sub-view. router.push() uses history.pushState,
      // which doesn't fire `hashchange`, so components that key off the hash
      // (the settings rail) wouldn't react. Set the hash directly instead —
      // that does fire `hashchange` — so the right section actually mounts.
      if (window.location.hash.slice(1) !== targetHash) {
        window.location.hash = targetHash
      }
    } else {
      router.push(step.navigateTo)
    }
  }, [isActive, step, stepIndex, mounted, pathname, router])

  // Resolve + position the spotlight. Polls for the anchor (it mounts
  // asynchronously after navigation), scrolls it into view on first sight,
  // then keeps the card glued to it on scroll/resize. Falls back to a
  // centered card if the anchor never shows.
  useLayoutEffect(() => {
    if (!isActive || !step || !mounted) return
    let rafId = 0
    let frames = 0
    let found = false
    let scrolled = false

    const finalize = (rect: DOMRect) => {
      // Pinned steps keep the spotlight on the anchor but park the card in a
      // fixed corner (positioned via CSS), so no per-target coords needed.
      if (step.pin) {
        setLayout({ step: stepIndex, rect, card: null })
        return
      }
      const cardRect = cardRef.current?.getBoundingClientRect()
      const card = cardRect
        ? computeCardPos(
            rect,
            cardRect.width,
            cardRect.height,
            step.placement ?? "bottom",
            step.align ?? "center",
          )
        : null
      setLayout({ step: stepIndex, rect, card })
    }

    const centered = () => setLayout({ step: stepIndex, rect: null, card: null })

    const tick = () => {
      if (!step.anchor) {
        centered()
        return
      }
      const anchor = step.anchor
      const hit = findAnchor(anchor)
      if (hit) {
        if (!scrolled) {
          scrolled = true
          scrollAnchorToTop(hit.el)
          // Re-measure next frame, after the scroll has applied. Re-query the
          // anchor rather than reusing `hit.el`: the page may re-render between
          // frames (e.g. Explore's async loaders swap the chrome) and detach
          // the captured node, whose getBoundingClientRect would read as zero —
          // leaving the spotlight stuck at the top-left corner.
          rafId = requestAnimationFrame(() => {
            found = true
            const rehit = findAnchor(anchor)
            finalize(rehit ? rehit.rect : hit.el.getBoundingClientRect())
          })
          return
        }
        found = true
        finalize(hit.rect)
        return
      }
      // Anchor not present yet (page still mounting after navigation).
      if (!found && frames++ < MAX_RESOLVE_FRAMES) {
        rafId = requestAnimationFrame(tick)
      } else {
        centered()
      }
    }

    tick()
    // Coalesce reflow bursts into one measure per frame: capture-phase
    // scroll fires very frequently and tick() does a getBoundingClientRect +
    // setLayout, so measuring synchronously on every event is wasteful.
    let reflowRaf = 0
    const onReflow = () => {
      if (!found || reflowRaf) return
      reflowRaf = requestAnimationFrame(() => {
        reflowRaf = 0
        if (found) tick()
      })
    }
    globalThis.addEventListener("scroll", onReflow, {
      passive: true,
      capture: true,
    })
    globalThis.addEventListener("resize", onReflow, { passive: true })
    // Content can reflow after first paint without any scroll/resize — async
    // loaders populating, sections mounting late — which moves or replaces the
    // anchor. Watch the document so we re-measure and the spotlight follows.
    const ro = new ResizeObserver(onReflow)
    ro.observe(document.body)
    return () => {
      cancelAnimationFrame(rafId)
      if (reflowRaf) cancelAnimationFrame(reflowRaf)
      ro.disconnect()
      globalThis.removeEventListener("scroll", onReflow, {
        capture: true,
      } as EventListenerOptions)
      globalThis.removeEventListener("resize", onReflow)
    }
  }, [isActive, step, stepIndex, mounted])

  // Move focus into the card on each step so keyboard users land on the
  // controls. preventScroll so the freshly-positioned card doesn't yank the
  // page around.
  useEffect(() => {
    if (!isActive) return
    cardRef.current?.focus({ preventScroll: true })
  }, [isActive, stepIndex])

  // Esc dismisses the tour (same as Skip).
  useEffect(() => {
    if (!isActive) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        skip()
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [isActive, skip])

  // Finishing the tour returns the user to their feed.
  const handleFinish = useCallback(() => {
    finish()
    router.push("/home")
  }, [finish, router])

  // Arrow keys step through the tour: Right advances (finishing on the last
  // step, mirroring the primary button), Left goes back. Bail out when the
  // user is typing into a field or holding a modifier, so we never hijack
  // text navigation, and only preventDefault when we actually handle the key.
  useEffect(() => {
    if (!isActive) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target?.isContentEditable
      ) {
        return
      }
      if (e.key === "ArrowRight") {
        e.preventDefault()
        if (isLast) {
          handleFinish()
        } else {
          next()
        }
      } else if (stepIndex > 0) {
        e.preventDefault()
        back()
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [isActive, isLast, stepIndex, next, back, handleFinish])

  // Lightweight focus trap: keep Tab cycling within the card's controls.
  const handleCardKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== "Tab") return
    const card = cardRef.current
    if (!card) return
    const focusable = card.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    )
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const activeEl = document.activeElement
    if (e.shiftKey && (activeEl === first || activeEl === card)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && activeEl === last) {
      e.preventDefault()
      first.focus()
    }
  }, [])

  if (!isActive || !step || !mounted) return null

  const measured = layout?.step === stepIndex
  const anchored = measured && layout?.rect != null
  const pinned = anchored && step.pin != null
  const rect = anchored ? layout!.rect! : null
  const cardPos = anchored && !pinned ? layout!.card : null
  const cardReady = measured && (pinned || !anchored || cardPos != null)

  // Spotlight hole (padded target rect) and its four surrounding dim panels.
  const hole = rect
    ? {
        top: rect.top - HOLE_PAD,
        left: rect.left - HOLE_PAD,
        width: rect.width + HOLE_PAD * 2,
        height: rect.height + HOLE_PAD * 2,
      }
    : null

  const cardStyle: React.CSSProperties = cardReady
    ? !pinned && anchored && cardPos
      ? { position: "fixed", left: cardPos.left, top: cardPos.top }
      : {}
    : { position: "fixed", left: 0, top: 0, visibility: "hidden" }

  // Card placement class: a fixed corner (pinned), centered (anchorless /
  // unresolved), or coords-positioned (anchored, handled via cardStyle).
  const cardPlacementClass = pinned
    ? ` product-tour__card--pin-${step.pin}`
    : anchored
      ? ""
      : " product-tour__card--centered"

  return createPortal(
    <div className="product-tour" role="presentation">
      {hole ? (
        <>
          <div
            className="product-tour__panel"
            style={{ top: 0, left: 0, right: 0, height: Math.max(0, hole.top) }}
          />
          <div
            className="product-tour__panel"
            style={{ top: hole.top + hole.height, left: 0, right: 0, bottom: 0 }}
          />
          <div
            className="product-tour__panel"
            style={{
              top: hole.top,
              left: 0,
              width: Math.max(0, hole.left),
              height: hole.height,
            }}
          />
          <div
            className="product-tour__panel"
            style={{
              top: hole.top,
              left: hole.left + hole.width,
              right: 0,
              height: hole.height,
            }}
          />
          <div
            className="product-tour__ring"
            style={{
              top: hole.top,
              left: hole.left,
              width: hole.width,
              height: hole.height,
            }}
          />
        </>
      ) : (
        <div className="product-tour__panel product-tour__panel--full" />
      )}

      {/*
        NOTE (a11y, deferred): aria-modal="true" tells AT the rest of the
        page is inert, but we don't actually inert it. The tour portals into
        document.body alongside the app's several direct body children (no
        single app-root wrapper — body itself is the flex column), plus the
        toast/live-region portals. Inerting "everything but the tour" would
        risk suppressing those live regions, and there's no clean sibling
        wrapper to target. Proper inerting needs a stable app-root element +
        an AT smoke test, so it's tracked for a follow-up rather than guessed
        at here. The Esc-to-dismiss + Tab focus trap keep it keyboard-usable
        in the meantime.
      */}
      <div
        ref={cardRef}
        className={`product-tour__card${cardPlacementClass}`}
        style={cardStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={handleCardKeyDown}
      >
        <h2 id={titleId} className="product-tour__title font-headline text-h3">
          {step.title}
        </h2>
        {step.body.split("\n\n").map((para, i) => (
          <p key={i} className="product-tour__body">
            {para}
          </p>
        ))}

        <div className="product-tour__footer">
          <ol
            className="product-tour__dots"
            aria-label={`Step ${stepIndex + 1} of ${totalSteps}`}
          >
            {Array.from({ length: totalSteps }, (_, i) => (
              <li
                key={i}
                className={`product-tour__dot${i === stepIndex ? " product-tour__dot--active" : ""}`}
                aria-current={i === stepIndex ? "step" : undefined}
              />
            ))}
          </ol>
          <div className="product-tour__actions">
            {stepIndex > 0 ? (
              <Button variant="ghost" size="sm" onClick={back}>
                Back
              </Button>
            ) : null}
            <div className="product-tour__actions-right">
              {!isLast ? (
                <Button variant="ghost" size="sm" onClick={skip}>
                  Skip
                </Button>
              ) : null}
              <Button
                variant="primary"
                size="sm"
                onClick={isLast ? handleFinish : next}
              >
                {isLast ? "Finish" : "Next"}
              </Button>
            </div>
          </div>
          <p className="product-tour__kbd-hint">
            Tip: use the <kbd>←</kbd> and <kbd>→</kbd> arrow keys to move between
            steps.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  )
}
