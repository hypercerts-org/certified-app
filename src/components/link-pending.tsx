"use client";

import { useLinkStatus } from "next/link";

/**
 * Inside a navigation <Link> (tabs, the sidebar): marks it while its page
 * loads, so the click shows at once even when the page wasn't prefetched
 * (in development, nothing is; in production, a link clicked before its
 * prefetch finished). globals.css gives the marked link the current page's
 * look and takes that look from the old one ("Instant feedback").
 */
export function LinkPending() {
  const { pending } = useLinkStatus();
  return <span className="link-pending" data-pending={pending || undefined} aria-hidden />;
}
