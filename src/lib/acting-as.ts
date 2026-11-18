// Acting as: the identity the signed-in user works as in this browser, their
// own account or an organization they belong to on the Certified Group
// Service. The choice is a cookie (see session.ts), so the server renders the
// right header, menu and workspace on first paint, and a switch re-renders
// them all from this one function.
//
// It decides only what pages show. Every form carries the DID it writes to,
// and writes ask CGS (canEdit) whatever is stored here, so a tab opened before
// a switch still writes as what it showed.
import "server-only";

import { getUser, readOAuthSession } from "@/lib/auth/dal";
import { readActingAs } from "@/lib/auth/session";
import { listMembershipsForDisplay } from "@/lib/cgs";
import { logError } from "@/lib/log";

/**
 * The DID the signed-in user acts as, or null when signed out: the stored
 * organization while they still belong to it (memberships up to five minutes
 * old), otherwise their own account. Render inside a Suspense boundary.
 */
export async function getActingAs(): Promise<string | null> {
  const user = await getUser();
  if (!user) return null;
  const stored = await readActingAs();
  if (!stored || stored === user.did) return user.did;
  try {
    const session = await readOAuthSession();
    if (session === null || session === "expired") return user.did;
    const memberships = await listMembershipsForDisplay(session);
    return memberships.some((m) => m.groupDid === stored) ? stored : user.did;
  } catch (err) {
    // CGS or the PDS is unreachable: keep the choice, checked when it was made.
    logError("[acting-as] membership check failed", err);
    return stored;
  }
}
