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
  anotherAccount = false,
  buttonClassName,
  variant = "primary",
  children = "Sign in",
}: {
  returnTo?: string;
  /** Ask who is signing in, instead of returning the account signed in at Certified. */
  anotherAccount?: boolean;
  /** Replaces the design-system button with a plain one, for a menu row. */
  buttonClassName?: string;
  /** Secondary in the chrome (top bars), where it sits beside the navigation. */
  variant?: "primary" | "secondary";
  children?: ReactNode;
}) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const here = returnTo ?? (search ? `${pathname}?${search}` : pathname);
  return (
    <form method="post" action="/oauth/sign-in">
      <input type="hidden" name="returnTo" value={here} />
      {anotherAccount && <input type="hidden" name="prompt" value="login" />}
      {buttonClassName ? (
        <button type="submit" className={buttonClassName}>
          {children}
        </button>
      ) : (
        <Button type="submit" variant={variant} size="sm">
          {children}
        </Button>
      )}
    </form>
  );
}
