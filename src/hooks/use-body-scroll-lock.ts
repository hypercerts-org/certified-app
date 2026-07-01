"use client";

import { useEffect } from "react";

/**
 * Lock page scroll while `isLocked` is true; restores the prior value on
 * cleanup or when `isLocked` becomes false.
 *
 * Locks the *documentElement* (`<html>`), not `<body>`. tokens.css sets
 * `html { overflow-y: scroll }`, which makes `<html>` the viewport scroll
 * container — and once `<html>` is itself a scroll container, the old
 * body-based lock (`body { overflow: hidden }`) no longer propagates to
 * the viewport, so the page would scroll behind an open drawer /
 * bottom-sheet. Toggling overflow on `<html>` locks the real scroller,
 * and the `scrollbar-gutter: stable` on that same element keeps the
 * scrollbar width reserved during the lock so opening an overlay doesn't
 * shift the page. (Name kept as `useBodyScrollLock` for its callers.)
 */
export function useBodyScrollLock(isLocked: boolean) {
  useEffect(() => {
    if (isLocked) {
      const el = document.documentElement;
      const prev = el.style.overflow;
      el.style.overflow = "hidden";
      return () => {
        el.style.overflow = prev;
      };
    }
  }, [isLocked]);
}
