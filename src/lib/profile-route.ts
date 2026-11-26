import "server-only";

import { notFound } from "next/navigation";
import { getActor, getActorCore } from "@/lib/hypercerts/queries";
import type { ActorDetail } from "@/lib/hypercerts/views";

// Profiles live at their handle (`/hypercerts.org`), the address people share.
// The app's own links go there directly (account cards carry verified
// handles, see queries.ts). A DID in the URL, from a link elsewhere, moves to
// the handle; an account without a valid handle stays at its DID. A handle
// that doesn't point back to the account moves too (canonicalProfileBase).
//
// Checking a handle takes outside lookups (its DID document and its domain),
// up to a second for an account nobody has opened lately. A profile's pages
// don't wait for it: they need only the account (profileActor), and the
// layout moves the page once the check is done (ProfileAddress).

/** The profile's base path for links within it: the URL's handle, or the DID. */
export function profileBase(param: string): string {
  return `/${decodeURIComponent(param)}`;
}

/**
 * The account a profile page shows, as the API has it (getActorCore: without
 * its handle and place), or a 404.
 */
export async function profileActor(
  params: Promise<{ actor: string }>,
): Promise<{ actor: ActorDetail; base: string }> {
  const id = decodeURIComponent((await params).actor);
  const actor = await getActorCore(id);
  if (!actor) notFound();
  return { actor, base: profileBase(id) };
}

/**
 * Where the profile at URL segment `param` belongs, when that isn't where it
 * is: its verified handle for a DID or a handle that isn't (or isn't any
 * longer) the account's, its DID when it has no valid handle. Null when the
 * address is right, or there is no such account (the page says so).
 */
export async function canonicalProfileBase(param: string): Promise<string | null> {
  const id = decodeURIComponent(param);
  const actor = await getActor(id);
  if (!actor) return null;
  if (id.startsWith("did:")) return actor.handle ? `/${actor.handle}` : null;
  // The API resolves a handle one way only: anyone can point their domain
  // at someone else's DID. A profile stays only at a handle verified both
  // ways (or its DID), never at the borrowed name.
  return actor.handle === id.toLowerCase() ? null : `/${actor.handle ?? actor.did}`;
}
