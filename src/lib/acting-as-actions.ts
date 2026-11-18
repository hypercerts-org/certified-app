"use server";

import { getActingAs } from "@/lib/acting-as";
import { getUser, SessionUnavailableError } from "@/lib/auth/dal";
import { setActingAs } from "@/lib/auth/session";
import { logError } from "@/lib/log";
import { getMemberships } from "@/lib/memberships";

/** `previous`: whom the user acted as before, for Undo. */
export type SwitchResult = { ok: true; previous: string } | { ok: false };

/**
 * Acts as `did` from now on: the user's own account, or an organization they
 * belong to. Checked against the memberships for display (memberships.ts),
 * like the menu that offered it, so a switch needs no OAuth restore: acting
 * as only decides what pages show, and writes check CGS anyway. Called as a
 * Server Action, it returns the page re-rendered as the new identity in the
 * same round trip.
 */
export async function switchActingAs(did: string): Promise<SwitchResult> {
  try {
    const user = await getUser();
    if (!user) return { ok: false };
    const previous = (await getActingAs()) ?? user.did;
    if (did === user.did) {
      await setActingAs(null);
    } else {
      const memberships = await getMemberships();
      if (!Array.isArray(memberships) || !memberships.some((m) => m.groupDid === did)) {
        return { ok: false };
      }
      await setActingAs(did);
    }
    // The changed cookie re-renders the page as the new identity.
    return { ok: true, previous };
  } catch (err) {
    if (!(err instanceof SessionUnavailableError)) logError("[acting-as] switch failed", err);
    return { ok: false };
  }
}
