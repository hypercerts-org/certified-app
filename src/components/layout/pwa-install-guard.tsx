"use client";

import { useEffect } from "react";

/**
 * Suppresses the browser's native PWA install prompt on desktop.
 * Chrome (and other Chromium browsers) fire `beforeinstallprompt` whenever
 * the install criteria are met and show an install button in the address bar.
 * On desktop that's confusing — the app is designed for mobile standalone use.
 *
 * On mobile, the event is allowed through so Android users can still be
 * prompted via the browser menu ("Add to Home Screen"). iOS Safari never
 * fires this event; it uses the Share sheet instead.
 */
export default function PwaInstallGuard() {
  useEffect(() => {
    const handler = (e: Event) => {
      if (window.innerWidth >= 800) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);
  return null;
}
