// Account, profile, and actor-card read queries.
import "server-only";

import { l } from "@atproto/lex";
import { app } from "@hypercerts-org/api";
import { cacheLife, cacheTag } from "next/cache";
import { getDid, getHandle } from "@/lib/identity";
import { isDid as isDidParam } from "@/lib/validate";
import { tags } from "../cache";
import {
  type ActorCard,
  type ActorDetail,
  type Place,
  type ProfileVersion,
  toActorCard,
  toActorDetail,
  toProfileVersion,
} from "../views";
import { api, chunks, type Did, notFound, placeOf, publicData, read, withHandles } from "./client";

/**
 * An account as the API has it: its profile and organization records, read
 * in one or two API calls, with `handle` and `place` still null. Those two
 * need lookups outside the API (the handle checked against its DID document
 * and domain, the place's name from a geocoder), which can take a second;
 * pages show this first and stream them in (getActor, getHandle,
 * getActorPlace).
 */
export async function getActorCore(actor: string): Promise<ActorDetail | null> {
  "use cache";
  // Anything else in the URL (a stray /favicon.png, a probe) is no account:
  // answered without an API call or cache tag pollution.
  if (!isDidParam(actor) && !l.isHandleString(actor)) return null;
  cacheLife("public");
  const isDid = actor.startsWith("did:");
  cacheTag(isDid ? tags.actor(actor) : tags.handle(actor.toLowerCase()));

  // getProfile accepts a handle or DID; getOrganization needs the DID and
  // fails for accounts without an organization record (people). An
  // organization can exist without a profile, so a DID gets the organization
  // lookup either way. Given a DID, both lookups run at once; given a
  // handle, the profile names the DID first.
  const organizationOf = (did: Did) =>
    api.xrpcSafe(app.certified.actor.getOrganization, { params: { actor: did }, ...read() });
  const byDid = isDid ? organizationOf(actor as Did) : null;
  const profile = await api.xrpcSafe(app.certified.actor.getProfile, {
    params: { actor: actor as l.AtIdentifierString },
    ...read(),
  });
  if (!profile.success && !notFound(profile)) throw profile;
  // An account without a profile still has a page (others follow and endorse
  // it), so a handle the API doesn't know is resolved on its own.
  const did = profile.success
    ? profile.body.profile.did
    : isDid
      ? (actor as Did)
      : ((await getDid(actor)) as Did | null);
  if (!did) return null;
  // Always tag by DID so a profile save (which expires tags.actor(did)) clears
  // pages opened by handle too.
  if (!isDid) cacheTag(tags.actor(did));
  const organization = await (byDid ?? organizationOf(did));

  if (organization.success) return toActorDetail(organization.body.actor);
  if (!notFound(organization)) throw organization;
  if (profile.success) {
    return toActorDetail({ did, profile: profile.body.profile, organization: null });
  }
  // No Certified records at all: the account all the same (shown by its
  // handle, nameOf), so links from followers and endorsements don't lead to
  // "not found".
  return toActorDetail({ did, profile: null, organization: null });
}

/**
 * Where an organization is, as a place with a short name: its location
 * record (the organization view carries it), coordinates from a blob when the
 * record keeps them there, and the name from the geocoder.
 */
export async function getActorPlace(did: string): Promise<Place | null> {
  "use cache";
  publicData(tags.actor(did));
  const organization = await api.xrpcSafe(app.certified.actor.getOrganization, {
    params: { actor: did as Did },
    ...read(),
  });
  if (!organization.success) {
    if (notFound(organization)) return null;
    throw organization;
  }
  const record = organization.body.actor.location?.record;
  return record ? placeOf(record, did) : null;
}

/**
 * The account with its verified handle, skipping geocoding (`getActorPlace`).
 * Prefer this over `getActor()` whenever `place` is not displayed (metadata,
 * search, headers, settings, forms).
 */
export async function getActorWithHandle(actor: string): Promise<ActorDetail | null> {
  const core = await getActorCore(actor);
  if (!core) return null;
  const handle = await getHandle(core.did);
  return { ...core, handle };
}

/**
 * The account in full: getActorCore with its verified handle and its place.
 * Only call when `place` is actually needed (e.g. profile edit forms); every
 * other caller should use `getActorCore` or `getActorWithHandle`.
 */
export async function getActor(actor: string): Promise<ActorDetail | null> {
  const core = await getActorCore(actor);
  if (!core) return null;
  // Both outside the API, and independent: at once.
  const [handle, place] = await Promise.all([
    getHandle(core.did),
    core.isOrganization ? getActorPlace(core.did) : null,
  ]);
  return { ...core, handle, place };
}

/**
 * The indexed version of an account's profile, read past every cache. Save
 * actions poll this via `waitForIndex` to confirm the index has caught up
 * before expiring tags; a cached answer could confirm nothing.
 */
export async function getIndexedProfile(did: string): Promise<ProfileVersion | null> {
  const result = await api.xrpcSafe(app.certified.actor.getProfile, {
    params: { actor: did as Did },
    ...read(),
  });
  if (result.success) return toProfileVersion(result.body.profile);
  if (notFound(result)) return null;
  throw result;
}

/**
 * The DID a route's account segment names: itself when it is one; for a
 * handle, from the API's profile lookup (getActorCore), without checking the
 * handle both ways. For record pages, whose records are found by DID.
 */
export async function didOfSegment(segment: string): Promise<string | null> {
  if (isDidParam(segment)) return segment;
  return (await getActorCore(segment))?.did ?? null;
}

/**
 * Cards for these accounts, in their order (an account the API doesn't know
 * is left out): batched, one call per hundred, never one per account.
 */
export async function getActorCards(dids: string[]): Promise<ActorCard[]> {
  "use cache";
  cacheLife("public");
  for (const did of dids) cacheTag(tags.actor(did));
  const cards = await actorCards(dids);
  return dids.flatMap((did) => cards.get(did) ?? []);
}

// Organizations come with their profile; accounts without an organization
// record (people) need a second lookup for theirs.
export async function actorCards(dids: string[]): Promise<Map<string, ActorCard>> {
  const cards = new Map<string, ActorCard>();
  for (const batch of chunks(dids)) {
    const { organizations } = await api.call(
      app.certified.actor.getOrganizations,
      { actors: batch as Did[] },
      read(),
    );
    for (const result of organizations)
      if (result.organization) cards.set(result.actor, toActorCard(result.organization));
    const people = batch.filter((did) => !cards.has(did));
    if (people.length === 0) continue;
    const { profiles } = await api.call(
      app.certified.actor.getProfiles,
      { actors: people as Did[] },
      read(),
    );
    for (const result of profiles)
      cards.set(
        result.actor,
        toActorCard({
          did: result.actor,
          profile: result.profile,
          organization: null,
        }),
      );
  }
  const named = await withHandles([...cards.values()]);
  return new Map(named.map((card) => [card.did, card]));
}

// Workspace overview
