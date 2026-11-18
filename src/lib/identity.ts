import "server-only";

import { AtprotoHandleResolverNode } from "@atproto/oauth-client-node";
import { safeFetchWrap } from "@atproto-labs/fetch-node";
import { createIdentityResolver } from "@atproto-labs/identity-resolver";
import { cacheLife } from "next/cache";

// Handles, which the API's views don't carry yet (README, spike finding 4;
// TECH-896). Resolved with the AT Protocol identity resolver the OAuth client
// uses, but on its own: handles are public facts, needed while building and
// prerendering pages, where the OAuth client can't start. Its fetch refuses
// private and local addresses (SSRF-safe), since anyone can point a handle at
// any domain.

const fetch = safeFetchWrap({ allowImplicitRedirect: true });
const resolver = createIdentityResolver({
  fetch,
  handleResolver: new AtprotoHandleResolverNode({ fetch }),
});

async function resolveHandle(did: string): Promise<string | null> {
  "use cache";
  cacheLife("hours");
  const { handle } = await resolver.resolve(did);
  // The resolver reports "handle.invalid" unless the handle points back to the DID.
  return handle === "handle.invalid" ? null : handle;
}

async function resolveDidOf(handle: string): Promise<string | null> {
  "use cache";
  cacheLife("hours");
  // Resolving a handle also checks that the DID claims it back.
  const { did, handle: verified } = await resolver.resolve(handle);
  return verified === "handle.invalid" ? null : did;
}

/**
 * The DID a handle belongs to, verified both ways, or null. For accounts the
 * API has no records for, whose handles it can't resolve. Failures aren't
 * cached.
 */
export async function getDid(handle: string): Promise<string | null> {
  try {
    return await resolveDidOf(handle.toLowerCase());
  } catch {
    return null;
  }
}

/** How long a page waits for a handle before linking by DID instead. */
const HANDLE_TIMEOUT_MS = 2_000;

/**
 * An account's handle, verified both ways, or null (also when resolving takes
 * longer than HANDLE_TIMEOUT_MS: a handle's domain can be slow or down).
 * Failures aren't cached.
 */
export async function getHandle(did: string): Promise<string | null> {
  try {
    return await Promise.race([
      resolveHandle(did),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), HANDLE_TIMEOUT_MS)),
    ]);
  } catch {
    return null;
  }
}
