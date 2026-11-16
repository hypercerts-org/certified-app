import "server-only";

import { cacheLife } from "next/cache";
import { getOAuthClient } from "@/lib/auth/oauth-client";

// Handles, which the API's views don't carry yet (README, spike finding 4).
// Resolved through the OAuth client's resolver, with its SSRF-safe fetch.

async function resolveHandle(did: string): Promise<string | null> {
  "use cache";
  cacheLife("hours");
  const { handle } = await (await getOAuthClient()).identityResolver.resolve(did);
  // The resolver reports "handle.invalid" unless the handle points back to the DID.
  return handle === "handle.invalid" ? null : handle;
}

/** An account's handle, verified both ways, or null. Failures aren't cached. */
export async function getHandle(did: string): Promise<string | null> {
  try {
    return await resolveHandle(did);
  } catch {
    return null;
  }
}
