"use client";

import { Button } from "@hypercerts-org/ui-react";
import { usePathname, useSearchParams } from "next/navigation";
import { signInHref } from "@/lib/validate";

// Sends the visitor back to the current page after sign-in.
export function SignInLink() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const here = search ? `${pathname}?${search}` : pathname;
  const href = pathname === "/" || pathname === "/sign-in" ? "/sign-in" : signInHref(here);
  return (
    <Button href={href} variant="secondary" size="sm">
      Sign in
    </Button>
  );
}
