// The Certified Group Service (CGS): shared repositories for organizations,
// with members, roles and an audit log. Calls go straight to the configured
// CGS, as its integration guide recommends (not proxied through the user's
// PDS). Each call carries a single-use service-auth token that the user's PDS
// mints for exactly that method: `aud` is the CGS DID and `lxm` the method;
// the organization is named by `repo` in the call itself.
import "server-only";

import { Client, type l, XrpcError } from "@atproto/lex";
import type { OAuthSession } from "@atproto/oauth-client-node";
import { app } from "@hypercerts-org/certified-group-service";
import { com } from "@/lexicons";
import { jsonStore } from "@/lib/auth/stores";
import { logError } from "@/lib/log";

export const CGS_URL = new URL(process.env.CGS_URL || "https://groups.certified.app");
if (
  CGS_URL.protocol !== "https:" &&
  !["127.0.0.1", "[::1]", "localhost"].includes(CGS_URL.hostname)
) {
  // Service-auth tokens are bearer tokens: never send them in the clear.
  throw new Error("CGS_URL must use https (http only on a loopback address).");
}
// The DID CGS gives itself unless its deployment sets SERVICE_DID: did:web
// of its hostname, without a port (CGS src/config.ts). Tokens must match it.
export const CGS_DID = process.env.CGS_DID || `did:web:${CGS_URL.hostname}`;

/** Unauthenticated: each call passes its own token (see cgsAuth). */
export const cgs = new Client({
  service: CGS_URL,
  // Looked up per call, and bounded: a hung CGS must not hold a Server Action.
  fetch: (input, init) =>
    fetch(input, {
      ...init,
      redirect: "error",
      signal: AbortSignal.any([
        AbortSignal.timeout(15_000),
        ...(init?.signal ? [init.signal] : []),
      ]),
    }),
});

/** The user's PDS didn't mint a service-auth token, so CGS was never called. */
export class CgsAuthError extends Error {
  constructor(cause: unknown) {
    // The PDS's error name (never a token) says why: auth, scope, rate limit.
    const code = cause instanceof XrpcError ? `: ${cause.error}` : "";
    super(`Could not get a service-auth token for CGS${code}`, { cause });
    this.name = "CgsAuthError";
  }
}

/**
 * Headers authorizing one call to `method` on CGS as the session's user. Pass
 * the same lexicon namespace as to `cgs.call`, so the token's `lxm` matches.
 */
export async function cgsAuth(session: OAuthSession, method: { $lxm: l.NsidString }) {
  try {
    // CGS verifies service-level methods (membership.list, register, import)
    // against the bare service DID without a `#service_id` fragment, and
    // accepts the bare service DID on all group-scoped methods too.
    const { token } = await new Client(session).call(com.atproto.server.getServiceAuth, {
      aud: CGS_DID,
      lxm: method.$lxm,
    });
    return { authorization: `Bearer ${token}` };
  } catch (err) {
    throw new CgsAuthError(err);
  }
}

export type Membership = Pick<
  app.certified.groups.membership.list.GroupMembership,
  "groupDid" | "role"
>;

/** Admins and owners may edit an organization's profile in this app. */
export const manages = ({ role }: Membership) => role === "admin" || role === "owner";

/** More than anyone plausibly belongs to; a guard against a looping cursor. */
const MAX_PAGES = 10;

/** Every organization the session's user belongs to on CGS, with their role. */
export async function listMemberships(session: OAuthSession): Promise<Membership[]> {
  const list = app.certified.groups.membership.list;
  const memberships: Membership[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await cgs.call(
      list,
      { limit: 100, cursor },
      { headers: await cgsAuth(session, list) },
    );
    memberships.push(...result.groups.map(({ groupDid, role }) => ({ groupDid, role })));
    if (!result.cursor || result.cursor === cursor) break;
    cursor = result.cursor;
  }
  return memberships;
}

// Memberships for display (the account menu, pages, acting as), kept in Valkey
// for five minutes per user, so showing them doesn't cost a service-auth token
// and a CGS call on every request. Decisions about what the user may do never
// read it: canEdit asks CGS, and CGS checks the role again on every write. A
// change made elsewhere shows within five minutes; signing out clears it.
const membershipCache = jsonStore<Membership[]>("cgs:memberships:", 5 * 60);
const groupMembersCache = jsonStore<GroupMember[]>("cgs:group-members:", 5 * 60);

/**
 * The memberships cached for `did`, without asking CGS (no OAuth session
 * needed), or undefined when none are cached. memberships.ts reads them so
 * pages can remember them per session.
 */
export async function readCachedMemberships(did: string): Promise<Membership[] | undefined> {
  return membershipCache.get(did);
}

/** The user's memberships for display: up to five minutes old. */
export async function listMembershipsForDisplay(session: OAuthSession): Promise<Membership[]> {
  // The cache is an optimization: if Valkey fails, ask CGS.
  const cached = await membershipCache.get(session.did).catch((err) => {
    logError("[cgs] membership cache read failed", err);
    return undefined;
  });
  if (cached) return cached;
  const memberships = await listMemberships(session);
  await membershipCache
    .set(session.did, memberships)
    .catch((err) => logError("[cgs] membership cache write failed", err));
  return memberships;
}

/** Drops the user's cached memberships (on sign-out). */
export async function forgetMemberships(did: string): Promise<void> {
  await membershipCache.del(did);
}

/**
 * Whether the session's user belongs to `did`: their own account, or any
 * organization they are a member of on CGS (asked live, never cached).
 */
export async function isMember(session: OAuthSession, did: string): Promise<boolean> {
  if (did === session.did) return true;
  return (await listMemberships(session)).some((m) => m.groupDid === did);
}

/**
 * Whether the session's user may edit profile `did`: their own, or an
 * organization they manage.
 */
export async function canEdit(session: OAuthSession, did: string): Promise<boolean> {
  if (did === session.did) return true;
  return (await listMemberships(session)).some((m) => m.groupDid === did && manages(m));
}

export type GroupMember = {
  did: string;
  role: "member" | "admin" | "owner" | string;
  addedBy?: string;
  addedAt: string;
};

/** Registers a new group account on CGS with the signed-in user as owner. */
export async function registerGroup(
  session: OAuthSession,
  input: { handle: string; email?: string },
) {
  const register = app.certified.group.register;
  return cgs.call(
    register,
    {
      handle: input.handle,
      ownerDid: session.did,
      ...(input.email && { email: input.email }),
    },
    { headers: await cgsAuth(session, register) },
  );
}

/** Lists every member of group `groupDid` (requires membership). */
export async function listGroupMembers(
  session: OAuthSession,
  groupDid: l.DidString,
): Promise<GroupMember[]> {
  const list = app.certified.group.member.list;
  const members: GroupMember[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await cgs.call(
      list,
      { repo: groupDid, limit: 100, cursor },
      { headers: await cgsAuth(session, list) },
    );
    members.push(
      ...result.members.map(({ did, role, addedBy, addedAt }) => ({
        did,
        role,
        addedBy,
        addedAt,
      })),
    );
    if (!result.cursor || result.cursor === cursor) break;
    cursor = result.cursor;
  }
  return members;
}

/** Cached member list for `groupDid` (without asking CGS), or undefined on miss. */
export async function readCachedGroupMembers(groupDid: string): Promise<GroupMember[] | undefined> {
  return groupMembersCache.get(groupDid);
}

/** A group's member list for display: cached in Valkey for five minutes. */
export async function listGroupMembersForDisplay(
  session: OAuthSession,
  groupDid: l.DidString,
): Promise<GroupMember[]> {
  const cached = await groupMembersCache.get(groupDid).catch((err) => {
    logError("[cgs] group members cache read failed", err, { groupDid });
    return undefined;
  });
  // Only serve the shared cache when the caller is actually in that cached
  // roster; non-members (or newly added members) fall through to live CGS.
  if (cached?.some((m) => m.did === session.did)) return cached;
  const members = await listGroupMembers(session, groupDid);
  await groupMembersCache
    .set(groupDid, members)
    .catch((err) => logError("[cgs] group members cache write failed", err, { groupDid }));
  return members;
}

/** Drops the cached member list for `groupDid` after a membership change. */
export async function forgetGroupMembers(groupDid: string): Promise<void> {
  await groupMembersCache.del(groupDid);
}

/** Adds `memberDid` to group `groupDid` with `role` (requires admin or owner). */
export async function addGroupMember(
  session: OAuthSession,
  groupDid: l.DidString,
  memberDid: l.DidString,
  role: "member" | "admin",
) {
  const add = app.certified.group.member.add;
  return cgs.call(
    add,
    { repo: groupDid, memberDid, role },
    { headers: await cgsAuth(session, add) },
  );
}

/** Removes `memberDid` from group `groupDid` (requires admin or owner). */
export async function removeGroupMember(
  session: OAuthSession,
  groupDid: l.DidString,
  memberDid: l.DidString,
) {
  const remove = app.certified.group.member.remove;
  await cgs.call(
    remove,
    { repo: groupDid, memberDid },
    { headers: await cgsAuth(session, remove) },
  );
}

/** Changes `memberDid`'s role in group `groupDid` (owner only). */
export async function setGroupMemberRole(
  session: OAuthSession,
  groupDid: l.DidString,
  memberDid: l.DidString,
  role: "member" | "admin",
) {
  const setRole = app.certified.group.role.set;
  return cgs.call(
    setRole,
    { repo: groupDid, memberDid, role },
    { headers: await cgsAuth(session, setRole) },
  );
}

export type GroupAuditEntry = {
  id: string;
  actorDid: string;
  targetDid?: string;
  action: string;
  collection?: string;
  rkey?: string;
  result: string;
  detail?: Record<string, unknown>;
  createdAt: string;
};

export type OwnershipTransferStatus = {
  groupDid: string;
  pending: boolean;
  proposedOwner?: string;
  proposedBy?: string;
  createdAt?: string;
  expiresAt?: string;
};

/**
 * Promotes the signed-in account into a CGS group using an app password for
 * that account. CGS requires `iss === groupDid`, so the imported account is
 * always `session.did`.
 */
export async function importGroup(
  session: OAuthSession,
  input: { appPassword: string; ownerDid?: l.DidString },
) {
  const method = app.certified.group.import;
  return cgs.call(
    method,
    {
      groupDid: session.did,
      appPassword: input.appPassword,
      ownerDid: input.ownerDid ?? session.did,
    },
    { headers: await cgsAuth(session, method) },
  );
}

/** Removes a group from CGS (owner only). The underlying PDS account stays intact. */
export async function destroyGroup(session: OAuthSession, groupDid: l.DidString) {
  const method = app.certified.group.destroy;
  return cgs.call(method, undefined, {
    params: { repo: groupDid },
    headers: await cgsAuth(session, method),
  });
}

/** Queries a page of a group's audit log on CGS (admin or owner). */
export async function queryGroupAuditLog(
  session: OAuthSession,
  groupDid: l.DidString,
  options?: { limit?: number; cursor?: string },
): Promise<{ entries: GroupAuditEntry[]; cursor?: string }> {
  const query = app.certified.group.audit.query;
  const result = await cgs.call(
    query,
    {
      repo: groupDid,
      limit: options?.limit ?? 50,
      ...(options?.cursor && { cursor: options.cursor }),
    },
    { headers: await cgsAuth(session, query) },
  );
  return {
    cursor: result.cursor,
    entries: result.entries.map((entry) => ({
      id: entry.id,
      actorDid: entry.actorDid,
      targetDid: entry.targetDid,
      action: entry.action,
      collection: entry.collection,
      rkey: entry.rkey,
      result: entry.result,
      detail: entry.detail as Record<string, unknown> | undefined,
      createdAt: entry.createdAt,
    })),
  };
}

/** Reports any pending ownership transfer visible to the caller (owner or proposed recipient). */
export async function getOwnershipTransferStatus(
  session: OAuthSession,
  groupDid: l.DidString,
): Promise<OwnershipTransferStatus> {
  const status = app.certified.group.ownershipTransfer.status;
  const result = await cgs.call(
    status,
    { repo: groupDid },
    { headers: await cgsAuth(session, status) },
  );
  return {
    groupDid: result.groupDid,
    pending: result.pending,
    proposedOwner: result.proposedOwner,
    proposedBy: result.proposedBy,
    createdAt: result.createdAt,
    expiresAt: result.expiresAt,
  };
}

/** Proposes transferring group ownership to an existing member (owner only). */
export async function proposeOwnershipTransfer(
  session: OAuthSession,
  groupDid: l.DidString,
  newOwner: l.DidString,
) {
  const propose = app.certified.group.ownershipTransfer.propose;
  return cgs.call(
    propose,
    { repo: groupDid, newOwner },
    { headers: await cgsAuth(session, propose) },
  );
}

/** Accepts a pending ownership transfer (proposed owner only). */
export async function acceptOwnershipTransfer(session: OAuthSession, groupDid: l.DidString) {
  const accept = app.certified.group.ownershipTransfer.accept;
  return cgs.call(accept, { repo: groupDid }, { headers: await cgsAuth(session, accept) });
}

/** Cancels or declines a pending ownership transfer (owner or proposed owner). */
export async function cancelOwnershipTransfer(session: OAuthSession, groupDid: l.DidString) {
  const cancel = app.certified.group.ownershipTransfer.cancel;
  return cgs.call(cancel, { repo: groupDid }, { headers: await cgsAuth(session, cancel) });
}
