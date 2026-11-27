"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Moves a profile page from `from` (the address it was opened at) to `to`
 * (where it belongs: its verified handle, or its DID), keeping the tab,
 * query and hash: `/did:plc:…/followers` becomes `/name.example/followers`.
 * Uses `history.replaceState` (Next.js App Router syncs `usePathname()`) so
 * the URL updates in place without tearing down the layout or re-fetching the
 * page.
 */
export function ProfileAddress({ from, to }: { from: string; to: string }) {
  const pathname = usePathname();
  useEffect(() => {
    const path = decodeURIComponent(pathname);
    if (!path.startsWith(from)) return;
    const rest = path.slice(from.length);
    if (rest && !rest.startsWith("/")) return;
    const next = `${to}${rest}${window.location.search}${window.location.hash}`;
    // Pass `null` (not `window.history.state`, which carries Next's internal
    // `__NA` marker): Next.js copies its internal state and syncs `usePathname()`.
    window.history.replaceState(null, "", next);
  }, [pathname, from, to]);
  return null;
}
