import { unstable_rethrow } from "next/navigation";
import "server-only";

import type { l } from "@atproto/lex";
import { cacheLife, cacheTag } from "next/cache";
import { cache } from "react";
import { getUser, readOAuthSession, SessionUnavailableError } from "@/lib/auth/dal";
import {
  type GroupMember,
  listGroupMembersForDisplay,
  listMembershipsForDisplay,
  type Membership,
  manages,
  readCachedGroupMembers,
  readCachedMemberships,
} from "@/lib/cgs";
import { tags } from "@/lib/hypercerts/cache";
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

/** Thrown inside `"use cache: private"` helpers so cache misses aren't cached. */
class CacheMissError extends Error {
  constructor(what: string) {
    super(`${what} not cached`);
    this.name = "CacheMissError";
  }
}

/**
 * Next.js `"use cache"` serializes errors thrown across the cache boundary,
 * dropping the prototype chain, so check `name` in addition to `instanceof`.
 */
function isCacheMiss(err: unknown): boolean {
  return err instanceof CacheMissError || (err instanceof Error && err.name === "CacheMissError");
}

/** Five minutes, as in Valkey; at least five minutes keeps it in the prefetched shell. */
async function rememberedMemberships(did: string): Promise<Membership[]> {
  "use cache: private";
  cacheLife({ stale: 300, revalidate: 300, expire: 300 });
  cacheTag(tags.memberships(did));
  const memberships = await readCachedMemberships(did);
  // Thrown, not returned, so the miss isn't remembered: errors aren't cached.
  if (!memberships) throw new CacheMissError("memberships");
  return memberships;
}

/**
 * The signed-in user's memberships (up to five minutes old), null when signed
 * out, or "expired" when they must sign in again to load them. Throws
 * SessionUnavailableError (from readOAuthSession) when the session can't be
 * read right now. Once per request (React cache): every gate on a page asks,
 * and a Valkey miss must not become one OAuth restore and CGS call each.
 */
export const getMemberships = cache(async (): Promise<Membership[] | "expired" | null> => {
  const user = await getUser();
  if (!user) return null;
  try {
    return await rememberedMemberships(user.did);
  } catch (err) {
    unstable_rethrow(err); // Next's own signals (prerendering, redirects) pass through
    if (!isCacheMiss(err)) logError("[memberships] cache read failed", err);
  }
  const session = await readOAuthSession();
  if (session === null) return null;
  if (session === "expired") return "expired";
  return listMembershipsForDisplay(session);
});

async function rememberedGroupMembers(groupDid: string): Promise<GroupMember[]> {
  "use cache: private";
  cacheLife({ stale: 300, revalidate: 300, expire: 300 });
  cacheTag(tags.groupMembers(groupDid));
  const members = await readCachedGroupMembers(groupDid);
  if (!members) throw new CacheMissError("group members");
  return members;
}

/**
 * A group's member list for display on its Workspace Overview (up to five
 * minutes old, invalidated on add/remove/role changes). Reads Valkey without
 * restoring OAuth on cache hits so workspace prefetches stay cheap.
 */
export const getGroupMembers = cache(
  async (groupDid: l.DidString): Promise<GroupMember[] | "expired" | null> => {
    const user = await getUser();
    if (!user) return null;
    try {
      return await rememberedGroupMembers(groupDid);
    } catch (err) {
      unstable_rethrow(err);
      if (!isCacheMiss(err)) {
        logError("[memberships] group members cache read failed", err, { groupDid });
      }
    }
    const session = await readOAuthSession();
    if (session === null) return null;
    if (session === "expired") return "expired";
    return listGroupMembersForDisplay(session, groupDid);
  },
);

/**
 * Whether the signed-in user may edit account `did`'s profile and records,
 * for showing "Edit profile" and a record's menu: their own, or an
 * organization where they're an admin or owner. Acting as an organization
 * doesn't by itself make a member an editor. An edit itself is checked again
 * on CGS (canEdit).
 */
export const mayEditAccount = cache(async (did: string): Promise<boolean> => {
  const user = await getUser();
  if (!user) return false;
  if (user.did === did) return true;
  const memberships = await getMemberships().catch((err) => {
    unstable_rethrow(err);
    if (!(err instanceof SessionUnavailableError)) {
      logError("[memberships] mayEditAccount check failed", err, { did });
    }
    return null;
  });
  return Array.isArray(memberships) && memberships.some((m) => m.groupDid === did && manages(m));
});
