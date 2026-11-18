import "server-only";

import { cacheLife } from "next/cache";
import { getUser, readOAuthSession } from "@/lib/auth/dal";
import {
  listMembershipsForDisplay,
  type Membership,
  manages,
  readCachedMemberships,
} from "@/lib/cgs";
import { logError } from "@/lib/log";

// The organizations the signed-in user belongs to, for deciding what pages
// show (whom you act as, whose workspace you may open, the owner's controls).
// Writes never rely on it: CGS checks the role on every write.
//
// They're kept in Valkey for five minutes per user (cgs.ts). Read from there,
// they need no OAuth session, so they're cached per session ("use cache:
// private"): the browser remembers them between navigations, and links into
// a page that depends on them prefetch it. Only when Valkey has none does a
// request restore the OAuth session and ask CGS, which fills Valkey again.

const NOT_CACHED = "memberships not cached";

/** Five minutes, as in Valkey; at least five minutes keeps it in the prefetched shell. */
async function rememberedMemberships(did: string): Promise<Membership[]> {
  "use cache: private";
  cacheLife({ stale: 300, revalidate: 300, expire: 300 });
  const memberships = await readCachedMemberships(did);
  // Thrown, not returned, so the miss isn't remembered: errors aren't cached.
  if (!memberships) throw new Error(NOT_CACHED);
  return memberships;
}

/**
 * The signed-in user's memberships (up to five minutes old), null when signed
 * out, or "expired" when they must sign in again to load them. Throws
 * SessionUnavailableError (from readOAuthSession) when the session can't be
 * read right now.
 */
export async function getMemberships(): Promise<Membership[] | "expired" | null> {
  const user = await getUser();
  if (!user) return null;
  try {
    return await rememberedMemberships(user.did);
  } catch (err) {
    if (!(err instanceof Error && err.message === NOT_CACHED))
      logError("[memberships] cache read failed", err);
  }
  const session = await readOAuthSession();
  if (session === null) return null;
  if (session === "expired") return "expired";
  return listMembershipsForDisplay(session);
}

/**
 * Whether the signed-in user may edit `did`'s profile, for showing "Edit
 * profile": their own, or an organization where they're an admin or owner.
 * Acting as an organization doesn't by itself make a member an editor. The
 * edit itself is checked again on CGS (canEdit).
 */
export async function mayEditProfile(did: string): Promise<boolean> {
  const user = await getUser();
  if (!user) return false;
  if (user.did === did) return true;
  const memberships = await getMemberships().catch(() => null);
  return Array.isArray(memberships) && memberships.some((m) => m.groupDid === did && manages(m));
}
