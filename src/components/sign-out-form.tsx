"use client";

import { Button } from "@hypercerts-org/ui-react";
import type { ReactNode } from "react";
import { signOut } from "@/lib/auth/actions";
import { clearWriteStore } from "@/lib/writes/local-store";

/**
 * Signs this browser out, first forgetting the saves it kept for reload
 * recovery so the next person here doesn't see them. `next` is where to go
 * afterwards (default: the home page).
 */
export function SignOutForm({ next, children }: { next?: string; children: ReactNode }) {
  return (
    <form action={signOut} onSubmit={() => void clearWriteStore().catch(() => {})}>
      {next && <input type="hidden" name="next" value={next} />}
      <Button type="submit" variant="ghost" size="sm">
        {children}
      </Button>
    </form>
  );
}
