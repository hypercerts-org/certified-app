"use client";

import React, {
  cloneElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { useMounted } from "@/hooks/use-mounted";

/**
 * Lightweight, accessible hover/focus tooltip.
 *
 *   <Tooltip label="Sort results">
 *     <button aria-label="Sort">…</button>
 *   </Tooltip>
 *
 * Behaviour:
 *  - shows on hover after a short delay, and immediately on keyboard focus
 *    (so it works for both pointer and keyboard users)
 *  - hides on mouse-leave, blur, Esc, and scroll
 *  - rendered through a portal with `position: fixed`, so it escapes any
 *    ancestor `overflow`/`transform` clipping (toolbars, sticky bars, rails)
 *  - centred over the trigger on the preferred `side`, flipping to the
 *    opposite side when there isn't room, then clamped within the viewport
 *  - the bubble is an inverted, theme-aware surface (dark in light mode,
 *    light in dark mode) so it reads as a tooltip in both themes
 *
 * The trigger is wrapped in an `inline-flex` span that carries the pointer
 * and focus listeners (focus/blur bubble from the child), and the child is
 * cloned only to attach `aria-describedby` for screen readers.
 *
 * When `label` is empty the children render unwrapped — no tooltip, no
 * extra DOM — so callers can pass a possibly-empty string without guarding.
 *
 * Touch devices render the children unwrapped too: a tap fires focus +
 * a synthetic mouseenter, which made the bubble pop up as a stray tag
 * after every tap. Tooltips are a hover affordance — on a coarse
 * pointer there is no hover, so there is no tooltip.
 */
export interface TooltipProps {
  /** The text shown in the bubble. Empty string disables the tooltip. */
  label: string;
  /** Single focusable trigger element. */
  children: React.ReactElement;
  /** Preferred side. Flips automatically when there's no room. Default "top". */
  side?: "top" | "bottom";
  /** Hover delay in ms before the bubble appears. Default 300. */
  delay?: number;
  /** Extra classes on the wrapper span (e.g. layout helpers). */
  className?: string;
}

interface Coords {
  left: number;
  top: number;
}

const GAP = 8;
const PADDING = 8;

const HOVER_QUERY = "(hover: hover) and (pointer: fine)";

function subscribeHoverCapable(onChange: () => void): () => void {
  const mq = globalThis.matchMedia?.(HOVER_QUERY);
  if (!mq) return () => {};
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/**
 * True once we know the primary pointer can actually hover (mouse /
 * trackpad). The server snapshot is false — matching the SSR markup —
 * so touch devices never mount the hover listeners at all.
 */
function useHoverCapable(): boolean {
  return useSyncExternalStore(
    subscribeHoverCapable,
    () => globalThis.matchMedia?.(HOVER_QUERY)?.matches ?? false,
    () => false,
  );
}

function computeCoords(
  rect: DOMRect,
  w: number,
  h: number,
  side: "top" | "bottom",
): Coords {
  const vw = globalThis.innerWidth;
  const vh = globalThis.innerHeight;

  const spaceAbove = rect.top;
  const spaceBelow = vh - rect.bottom;
  let resolved = side;
  if (side === "top" && spaceAbove < h + GAP + PADDING && spaceBelow > spaceAbove) {
    resolved = "bottom";
  } else if (
    side === "bottom" &&
    spaceBelow < h + GAP + PADDING &&
    spaceAbove > spaceBelow
  ) {
    resolved = "top";
  }

  const top =
    resolved === "top" ? rect.top - GAP - h : rect.bottom + GAP;

  let left = rect.left + rect.width / 2 - w / 2;
  const maxLeft = vw - PADDING - w;
  left = Math.min(Math.max(left, PADDING), Math.max(PADDING, maxLeft));

  return { left, top };
}

export default function Tooltip({
  label,
  children,
  side = "top",
  delay = 300,
  className = "",
}: TooltipProps) {
  const mounted = useMounted();
  const hoverCapable = useHoverCapable();
  const wrapRef = useRef<HTMLSpanElement | null>(null);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<Coords | null>(null);
  const id = useId();

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const show = useCallback(() => setOpen(true), []);
  // hide() is the only path that sets open=false, so clearing the stale
  // coords here keeps the bubble hidden-until-measured on the next open.
  const hide = useCallback(() => {
    clearTimer();
    setOpen(false);
    setCoords(null);
  }, [clearTimer]);

  const onPointerEnter = useCallback(() => {
    clearTimer();
    timerRef.current = setTimeout(show, delay);
  }, [clearTimer, show, delay]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  // Position when open; reposition on scroll/resize; hide on Esc.
  useLayoutEffect(() => {
    if (!open) return;
    const reposition = () => {
      const trigger = wrapRef.current;
      const bubble = bubbleRef.current;
      if (!trigger || !bubble) return;
      const rect = trigger.getBoundingClientRect();
      const b = bubble.getBoundingClientRect();
      setCoords(computeCoords(rect, b.width, b.height, side));
    };
    reposition();
    const onScroll = () => hide();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };
    globalThis.addEventListener("scroll", onScroll, { passive: true, capture: true });
    globalThis.addEventListener("resize", reposition, { passive: true });
    document.addEventListener("keydown", onKey);
    return () => {
      globalThis.removeEventListener("scroll", onScroll, { capture: true } as EventListenerOptions);
      globalThis.removeEventListener("resize", reposition);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, side, hide]);

  if (!label || !hoverCapable) return children;

  const trigger = cloneElement(children, {
    "aria-describedby": open
      ? `${(children.props as { "aria-describedby"?: string })["aria-describedby"] ?? ""} ${id}`.trim()
      : (children.props as { "aria-describedby"?: string })["aria-describedby"],
  } as Partial<React.HTMLAttributes<HTMLElement>>);

  return (
    <span
      ref={wrapRef}
      className={`inline-flex ${className}`}
      onMouseEnter={onPointerEnter}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {trigger}
      {open && mounted
        ? createPortal(
            <div
              ref={bubbleRef}
              id={id}
              role="tooltip"
              className="pointer-events-none fixed z-[var(--z-tooltip)] max-w-[240px] rounded bg-[var(--fg-primary)] px-2 py-1 text-xs font-medium leading-snug text-[var(--bg-canvas)] shadow-md"
              style={{
                left: coords?.left ?? 0,
                top: coords?.top ?? 0,
                visibility: coords ? undefined : "hidden",
              }}
            >
              {label}
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}
