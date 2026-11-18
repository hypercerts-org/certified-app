import "server-only";

import { notFound, redirect } from "next/navigation";
import { getActor } from "@/lib/hypercerts/queries";
import type { ActorDetail } from "@/lib/hypercerts/views";

// Profiles live at their handle (`/hypercerts.org`), the address people share.
// The app's own links go there directly (account cards carry verified
// handles, see queries.ts). A DID in the URL, from a link elsewhere, redirects
// to the handle; an account without a valid handle stays at its DID.

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
  if (id.startsWith("did:") && actor.handle) redirect(`/${actor.handle}${subpath}`);
  return { actor, base: profileBase(id) };
}
