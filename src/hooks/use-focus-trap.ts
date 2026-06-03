import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Traps keyboard focus within a container element while active.
 * Restores focus to the previously focused element when deactivated.
 *
 * Returns a ref to attach to the container element. Pass `externalRef` when the
 * container element already owns a ref (e.g. a bottom sheet whose node is held
 * by `useBottomSheetDrag`) to trap focus on that same node without aliasing.
 */
export function useFocusTrap<T extends HTMLElement>(
  active: boolean,
  externalRef?: RefObject<T | null>
) {
  const internalRef = useRef<T>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const containerRef = externalRef ?? internalRef;
    if (!active) {
      // Restore focus when deactivated
      if (previousActiveElementRef.current?.isConnected) {
        previousActiveElementRef.current.focus();
        previousActiveElementRef.current = null;
      }
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    // Save the currently focused element
    previousActiveElementRef.current = document.activeElement as HTMLElement;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;

      const focusable = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [active, externalRef]);

  return externalRef ?? internalRef;
}
