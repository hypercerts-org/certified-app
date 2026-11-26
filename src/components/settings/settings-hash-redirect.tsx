"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Redirects legacy v1 hash links (e.g. `/settings#app-passwords` or
 * `/{did}/settings#members`) to their canonical App Router sub-pages.
 */
export function SettingsHashRedirect({ routes }: { routes: Readonly<Record<string, string>> }) {
  const router = useRouter();
  useEffect(() => {
    const raw = window.location.hash.replace(/^#/, "").toLowerCase();
    if (Object.hasOwn(routes, raw)) {
      const target = routes[raw];
      if (target) router.replace(target);
    }
  }, [router, routes]);
  return null;
}
