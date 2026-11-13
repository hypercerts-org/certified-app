import { useEffect, useRef, useState, type RefObject } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [contenteditable="true"], [tabindex]:not([tabindex="-1"])';

/** The visible, tabbable descendants of `root`, in DOM order. */
export function getTabbable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) =>
      !el.hasAttribute("hidden") &&
      el.getAttribute("aria-hidden") !== "true" &&
      (el.offsetParent !== null || el.getClientRects().length > 0),
  );
}

export interface FocusTrapOptions {
  /** Where focus goes when the trap deactivates. Defaults to the element
   *  that had focus when it activated. Pass it when that element won't
   *  survive (a menu item that opened the overlay). */
  returnFocusRef?: RefObject<HTMLElement | null>;
}

function focusedElement(): HTMLElement | null {
  return typeof document !== "undefined" && document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;
}

/**
 * Traps keyboard focus within a container element while active, and
 * restores focus when deactivated.
 *
 * - Tab / Shift+Tab wrap at the ends of the container, and pull focus back
 *   in when it is outside (e.g. still on the trigger that opened a sheet).
 * - The element to restore is read during the render that activates the
 *   trap — before any child's `autoFocus` moves focus into the container —
 *   unless `returnFocusRef` names one.
 *
 * Returns a ref to attach to the container element. Pass `externalRef` when the
 * container element already owns a ref (e.g. a bottom sheet whose node is held
 * by `useBottomSheetDrag`) to trap focus on that same node without aliasing.
 *
 * Callers that also make the page behind `inert` must lift it before this
 * hook restores focus (declare that effect first: cleanups run in order).
 */
export function useFocusTrap<T extends HTMLElement>(
  active: boolean,
  externalRef?: RefObject<T | null>,
  options: FocusTrapOptions = {},
) {
  const internalRef = useRef<T>(null);
  const containerRef = externalRef ?? internalRef;

  // Opener captured on the render that activates the trap (state derived
  // from the `active` prop, the documented render-time pattern).
  const [wasActive, setWasActive] = useState(active);
  const [opener, setOpener] = useState<HTMLElement | null>(() =>
    active ? focusedElement() : null,
  );
  if (active !== wasActive) {
    setWasActive(active);
    if (active) setOpener(focusedElement());
  }

  // Latest restore targets, read by the deactivate cleanup below without
  // making it re-run (a re-run would restore focus mid-session).
  const restoreRef = useRef({ opener, returnFocusRef: options.returnFocusRef });
  useEffect(() => {
    restoreRef.current = { opener, returnFocusRef: options.returnFocusRef };
  });

  // Tab handling.
  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const focusable = getTabbable(container);
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const current = document.activeElement;
      const inside = !!current && container.contains(current);

      if (!inside) {
        // Focus is outside the container (on the trigger, or <body>): bring
        // it in at the end the user is moving toward.
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && current === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && current === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [active, containerRef]);

  // Focus restore on deactivate (or unmount while active).
  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    return () => {
      // Leave focus alone when it has already moved somewhere deliberate
      // outside the container (a dialog the overlay opened, a field).
      const now = document.activeElement;
      const lost = !now || now === document.body || !!container?.contains(now);
      if (!lost) return;
      const { returnFocusRef, opener: openedFrom } = restoreRef.current;
      const target = [returnFocusRef?.current, openedFrom].find(
        (el): el is HTMLElement =>
          !!el && el.isConnected && !container?.contains(el),
      );
      target?.focus({ preventScroll: true });
    };
  }, [active, containerRef]);

  return containerRef;
}
