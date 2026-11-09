"use client";

import { Button, Text } from "@hypercerts-org/ui-react";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { signOut } from "@/lib/auth/actions";
import { clearWriteStore } from "@/lib/write-overlay/local-store";
import { signInHref } from "@/lib/validate";

/**
 * Signs this browser out, first forgetting its local saves and cached reads.
 * `next` is where to go afterwards (default: the home page).
 */
export function SignOutForm({ next, children }: { next?: string; children: ReactNode }) {
  const queryClient = useQueryClient();
  return (
    <form
      action={signOut}
      onSubmit={() => {
        queryClient.clear();
        void clearWriteStore().catch(() => {});
      }}
    >
      {next && <input type="hidden" name="next" value={next} />}
      <Button type="submit" variant="ghost" size="sm">
        {children}
      </Button>
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
