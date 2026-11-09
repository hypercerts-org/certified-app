"use client";

import { Button } from "@hypercerts-org/ui-react";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { signOut } from "@/lib/auth/actions";
import { clearWriteStore } from "@/lib/writes/local-store";

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
