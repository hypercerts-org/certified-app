import "server-only";

import { notFound, redirect } from "next/navigation";
import { getActor } from "@/lib/hypercerts/queries";
import type { ActorDetail } from "@/lib/hypercerts/views";

// Profiles live at their handle (`/hypercerts.org`), the address people share.
// The app's own links go there directly (account cards carry verified
// handles, see queries.ts). A DID in the URL, from a link elsewhere, redirects
// to the handle; an account without a valid handle stays at its DID. A handle
// that doesn't point back to the account redirects too.

/** The profile's base path for links within it: the URL's handle, or the DID. */
export function profileBase(param: string): string {
  return `/${decodeURIComponent(param)}`;
}

/**
 * The account a profile page shows, or a 404. `subpath` is the page within
 * the profile ("" for the Overview, "/followers", …), kept by the redirect.
 */
export async function profileActor(
  params: Promise<{ actor: string }>,
  subpath: string,
): Promise<{ actor: ActorDetail; base: string }> {
  const id = decodeURIComponent((await params).actor);
  const actor = await getActor(id);
  if (!actor) notFound();
  if (id.startsWith("did:")) {
    if (actor.handle) redirect(`/${actor.handle}${subpath}`);
  } else if (actor.handle !== id.toLowerCase()) {
    // The API resolves a handle one way only: anyone can point their domain
    // at someone else's DID. Show a profile only at a handle verified both
    // ways (or its DID), never at the borrowed name.
    redirect(`/${actor.handle ?? actor.did}${subpath}`);
  }
  return { actor, base: profileBase(id) };
}
