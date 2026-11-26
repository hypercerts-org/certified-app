import "server-only";

import { extractPdsUrl } from "@atproto/did";
import { AtprotoHandleResolverNode } from "@atproto/oauth-client-node";
import { safeFetchWrap } from "@atproto-labs/fetch-node";
import {
  type AtprotoDid,
  type AtprotoIdentityResolver,
  createIdentityResolver,
  extractNormalizedHandle,
} from "@atproto-labs/identity-resolver";
import { cacheLife, cacheTag } from "next/cache";
import { tags } from "@/lib/hypercerts/cache";

// Handles, which the API's views don't carry yet (README, spike finding 4;
// TECH-896). Resolved with the AT Protocol identity resolver the OAuth client
// uses, but on its own: handles are public facts, needed while building and
// prerendering pages, where the OAuth client can't start. Its fetch refuses
// private and local addresses (SSRF-safe), since anyone can point a handle at
// any domain.
//
// `createIdentityResolver` wraps its DID resolver in an in-memory cache that
// Next.js `updateTag` cannot clear, so every call passes `{ noCache: true }`
// and lets Next.js's tagged `"use cache"` own the caching.
//
// An account's DID document is read once (didDocument) and serves both its
// handle and its PDS: resolving the DID in full would also check the handle
// again, a second round trip to plc.directory and the handle's domain on the
// way to every blob.

/** Refuses private and local addresses: for any URL a record or DID names. */
export const safeFetch = safeFetchWrap({ allowImplicitRedirect: true });
const fetch = safeFetch;
const handleResolver = new AtprotoHandleResolverNode({ fetch });
// Given a handle resolver it is always the AT Protocol resolver, whose
// document-only lookup this uses.
const resolver = createIdentityResolver({ fetch, handleResolver }) as AtprotoIdentityResolver;

/** The account's DID document. Throws when it can't be read; failures aren't cached. */
async function didDocument(did: string) {
  "use cache";
  cacheLife("hours");
  cacheTag(tags.actor(did));
  return resolver.getDocumentFromDid(did as AtprotoDid, { noCache: true });
}

async function resolveHandle(did: string): Promise<string | null> {
  "use cache";
  cacheLife("hours");
  cacheTag(tags.actor(did));
  // The handle the document claims, only if that handle points back to the
  // DID (as the resolver's own resolveFromDid checks it).
  const handle = extractNormalizedHandle(await didDocument(did));
  if (!handle) return null;
  const pointsTo = await handleResolver.resolve(handle, { noCache: true }).catch(() => null);
  return pointsTo === did ? handle : null;
}

async function resolveDidOf(handle: string): Promise<string | null> {
  "use cache";
  cacheLife("hours");
  cacheTag(tags.handle(handle));
  // Resolving a handle also checks that the DID claims it back.
  const { did, handle: verified } = await resolver.resolve(handle, { noCache: true });
  if (verified !== "handle.invalid") cacheTag(tags.actor(did));
  return verified === "handle.invalid" ? null : did;
}

/**
 * Resolves a DID's verified handle directly past every cache, for checking
 * whether a handle change has propagated before expiring cached pages.
 */
export async function resolveHandleFresh(did: string): Promise<string | null> {
  try {
    const { handle } = await resolver.resolve(did, { noCache: true });
    return handle === "handle.invalid" ? null : handle;
  } catch {
    return null;
  }
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

/**
 * The address of the server holding an account's data (its PDS), from its
 * DID document. Throws when it can't be resolved; failures aren't cached.
 */
export async function getPdsUrl(did: string): Promise<string> {
  "use cache";
  cacheLife("hours");
  cacheTag(tags.actor(did));
  return extractPdsUrl(await didDocument(did)).origin;
}
