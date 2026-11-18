"use server";

import { getOAuthSession, SessionUnavailableError } from "@/lib/auth/dal";
import { setActingAs } from "@/lib/auth/session";
import { getActingAs } from "@/lib/acting-as";
import { listMembershipsForDisplay } from "@/lib/cgs";
import { logError } from "@/lib/log";

/** `previous`: whom the user acted as before, for Undo. */
export type SwitchResult = { ok: true; previous: string } | { ok: false };

/**
 * Acts as `did` from now on: the user's own account, or an organization they
 * belong to (memberships for display, like the menu that offered it: writes
 * check CGS anyway). Called as a Server Action, it returns the page
 * re-rendered as the new identity in the same round trip.
 */
export async function switchActingAs(did: string): Promise<SwitchResult> {
  try {
    const session = await getOAuthSession();
    if (!session) return { ok: false };
    const previous = (await getActingAs()) ?? session.did;
    if (did === session.did) {
      await setActingAs(null);
    } else {
      const memberships = await listMembershipsForDisplay(session);
      if (!memberships.some((m) => m.groupDid === did)) return { ok: false };
      await setActingAs(did);
    }
    // The changed cookie re-renders the page as the new identity.
    return { ok: true, previous };
  } catch (err) {
    if (!(err instanceof SessionUnavailableError)) logError("[acting-as] switch failed", err);
    return { ok: false };
  }
}
