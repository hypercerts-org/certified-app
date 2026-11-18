"use client";

import Link from "next/link";
import { type ComponentProps, useState } from "react";

/**
 * A link in a list or grid. Every visible link prefetches the destination's
 * shared App Shell; its own cached content only once the pointer is on it,
 * it has focus, or a finger touches it ("Hover-triggered prefetch" in the
 * Next.js prefetching guide). `<Link prefetch>` on every row would make one
 * server request per visible row. Small navigation surfaces (tabs, the
 * sidebar) use `<Link prefetch>` directly.
 */
export function IntentLink({
  onMouseEnter,
  onFocus,
  onTouchStart,
  ...props
}: ComponentProps<typeof Link>) {
  const [intent, setIntent] = useState(false);
  return (
    <Link
      {...props}
      prefetch={intent ? true : "auto"}
      onMouseEnter={(event) => {
        setIntent(true);
        onMouseEnter?.(event);
      }}
      onFocus={(event) => {
        setIntent(true);
        onFocus?.(event);
      }}
      onTouchStart={(event) => {
        setIntent(true);
        onTouchStart?.(event);
      }}
    />
  );
}
