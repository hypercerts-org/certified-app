// Acting as: the identity the signed-in user works as in this browser, their
// own account or an organization they belong to on the Certified Group
// Service. The choice is a cookie (see session.ts), so the server renders the
// right header, menu and workspace on first paint, and a switch re-renders
// them all from this one function.
//
// It decides only what pages show. Every form carries the DID it writes to,
// and writes ask CGS (canEdit) whatever is stored here, so a tab opened before
// a switch still writes as what it showed.
import { unstable_rethrow } from "next/navigation";
import "server-only";

import { cache } from "react";
import { getUser } from "@/lib/auth/dal";
import { readActingAs } from "@/lib/auth/session";
import { logError } from "@/lib/log";
import { getMemberships } from "@/lib/memberships";

/**
 * The DID the signed-in user acts as, or null when signed out: the stored
 * organization while they still belong to it (memberships up to five minutes
 * old), otherwise their own account. Once per request (React cache): the
 * header, the profile's owner controls and the gates all ask. Render inside a
 * Suspense boundary.
 */
export const getActingAs = cache(async (): Promise<string | null> => {
  const user = await getUser();
  if (!user) return null;
  const stored = await readActingAs();
  if (!stored || stored === user.did) return user.did;
  try {
    // Remembered per session (memberships.ts), so this costs no OAuth restore.
    const memberships = await getMemberships();
    if (!Array.isArray(memberships)) return user.did;
    return memberships.some((m) => m.groupDid === stored) ? stored : user.did;
  } catch (err) {
    unstable_rethrow(err); // Next's own signals (prerendering, redirects) pass through
    // Memberships can't be read: show the user's own account rather than
    // trust the cookie unchecked (it only decides what pages show).
    logError("[acting-as] membership check failed", err);
    return user.did;
  }
});
