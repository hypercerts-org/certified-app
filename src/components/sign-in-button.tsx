"use client";

import { Button } from "@hypercerts-org/ui-react";
import { useMutation } from "@tanstack/react-query";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { signIn } from "@/lib/auth/actions";

/**
 * Goes to Certified's sign-in page, then back to `returnTo` (default: the
 * current page). The action redirects, so the button keeps spinning until the
 * browser leaves.
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
  const start = useMutation({ mutationFn: signIn });
  return (
    <Button
      variant="primary"
      size="sm"
      loading={start.isPending}
      onClick={() => {
        if (!start.isPending) start.mutate({ returnTo: here });
      }}
    >
      {children}
    </Button>
  );
}
