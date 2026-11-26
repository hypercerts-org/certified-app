"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { forgetMemberships, readCachedMemberships } from "@/lib/cgs";
import { tags } from "@/lib/hypercerts/cache";
import { logError } from "@/lib/log";
import { returnPath } from "@/lib/validate";
import { endElevatedSession } from "./elevated-session";
import { endAppSession, readAppSession } from "./session";

/**
 * Signs this browser out and goes to `next` (a path on this site, default
 * `/welcome`). The account's OAuth tokens are shared by all its browsers,
 * so they are revoked only when this was the last one.
 */
export async function signOut(form?: FormData): Promise<void> {
  try {
    const session = await readAppSession();
    await endAppSession({ revokeIfLast: true });
    if (session) {
      const memberships = (await readCachedMemberships(session.did).catch(() => undefined)) ?? [];
      await Promise.all([
        forgetMemberships(session.did),
        endElevatedSession({ kind: "personal", callerDid: session.did }),
        ...memberships.map((m) =>
          endElevatedSession({ kind: "group", callerDid: session.did, groupDid: m.groupDid }),
        ),
      ]);
    }
  } catch (err) {
    // The cookie is already cleared; a Valkey failure leaves at most an orphaned
    // session record, which expires.
    logError("[auth] sign-out cleanup failed", err);
  }
  // Flush the browser's private `"use cache: private"` session cache so the
  // redirect never observes the previous signed-in state.
  updateTag(tags.session());
  const next = form?.get("next");
  redirect(typeof next === "string" && next ? returnPath(next) : "/welcome");
}
