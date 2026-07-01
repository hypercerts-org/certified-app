"use client";

import { useEffect } from "react";

/**
 * Lock document body scroll when `isLocked` is true.
 * Restores `overflow` on cleanup or when `isLocked` becomes false.
 */
export function useBodyScrollLock(isLocked: boolean) {
  useEffect(() => {
    if (isLocked) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [isLocked]);
}
