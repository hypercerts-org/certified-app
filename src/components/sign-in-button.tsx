"use client";

import { Button } from "@hypercerts-org/ui-react";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Goes to Certified's sign-in page, then back to `returnTo` (default: the
 * current page). A plain form posting to /oauth/sign-in: the browser leaves
 * as after any form, with no waiting state of our own.
 */
export function SignInButton({
  returnTo,
  children = "Sign in",
}: {
  returnTo?: string;
  children?: ReactNode;
}) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const here = returnTo ?? (search ? `${pathname}?${search}` : pathname);
  return (
    <form method="post" action="/oauth/sign-in">
      <input type="hidden" name="returnTo" value={here} />
      <Button type="submit" variant="primary" size="sm">
        {children}
      </Button>
    </form>
  );
}
