"use client";

import { Button, Text } from "@hypercerts-org/ui-react";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { signOut } from "@/lib/auth/actions";
import { signInHref } from "@/lib/validate";

/**
 * Signs this browser out, first forgetting its cached reads.
 * `next` is where to go afterwards (default: the home page). `buttonClassName`
 * replaces the design-system button with a plain one, for a menu row.
 */
export function SignOutForm({
  next,
  buttonClassName,
  children,
}: {
  next?: string;
  buttonClassName?: string;
  children: ReactNode;
}) {
  const queryClient = useQueryClient();
  return (
    <form action={signOut} onSubmit={() => queryClient.clear()}>
      {next && <input type="hidden" name="next" value={next} />}
      {buttonClassName ? (
        <button type="submit" className={buttonClassName}>
          {children}
        </button>
      ) : (
        <Button type="submit" variant="ghost" size="sm">
          {children}
        </Button>
      )}
    </form>
  );
}

/** For a page whose OAuth session has expired: sign out, then sign in again and return. */
export function SignInAgain({ path, children }: { path: string; children: ReactNode }) {
  return (
    <div className="stack">
      <Text>{children}</Text>
      <SignOutForm next={signInHref(path)}>Sign in again</SignOutForm>
    </div>
  );
}
