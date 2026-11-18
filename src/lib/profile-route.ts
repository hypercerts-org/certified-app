import "server-only";

import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { getActor } from "@/lib/hypercerts/queries";
import type { ActorDetail } from "@/lib/hypercerts/views";
import { getHandle } from "@/lib/identity";

// Profiles live at their handle (`/hypercerts.org`), the address people share.
// The API resolves a handle in the URL, so those pages prerender and cache. A
// DID in the URL (every link the app makes today, since the API's views carry
// no handles: TECH-896) redirects to the handle once it is verified both ways;
// an account without a valid handle stays at its DID.

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
    // Resolving runs per request, through the OAuth client's resolver.
    await connection();
    const handle = await getHandle(actor.did);
    if (handle) redirect(`/${handle}${subpath}`);
  }
  return { actor, base: profileBase(id) };
}
