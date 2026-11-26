"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Moves a profile page from `from` (the address it was opened at) to `to`
 * (where it belongs: its verified handle, or its DID), keeping the tab and
 * the query: `/did:plc:…/followers` becomes `/name.example/followers`. The
 * profile layout renders it once the handle is checked (canonicalProfileBase),
 * which the page itself doesn't wait for.
 */
export function ProfileAddress({ from, to }: { from: string; to: string }) {
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    const path = decodeURIComponent(pathname);
    const rest = path.startsWith(from) ? path.slice(from.length) : "";
    router.replace(`${to}${rest}${window.location.search}`);
  }, [pathname, router, from, to]);
  return null;
}
