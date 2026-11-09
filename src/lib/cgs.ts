// The Certified Group Service (CGS): shared repositories for organizations,
// with members, roles and an audit log. Calls go straight to the configured
// CGS, as its integration guide recommends (not proxied through the user's
// PDS). Each call carries a single-use service-auth token that the user's PDS
// mints for exactly that method: `aud` is the CGS DID and `lxm` the method;
// the organization is named by `repo` in the call itself.
import "server-only";

import { Client, type l } from "@atproto/lex";
import type { OAuthSession } from "@atproto/oauth-client-node";
import { app, com } from "@/lexicons";

const CGS_URL = new URL(process.env.CGS_URL || "https://groups.certified.app");
if (
  CGS_URL.protocol !== "https:" &&
  !["127.0.0.1", "[::1]", "localhost"].includes(CGS_URL.hostname)
) {
  // Service-auth tokens are bearer tokens: never send them in the clear.
  throw new Error("CGS_URL must use https (http only on a loopback address).");
}
// did:web of CGS's host, unless the deployment sets its own SERVICE_DID.
const CGS_DID = process.env.CGS_DID || `did:web:${CGS_URL.host.replace(":", "%3A")}`;

/** Unauthenticated: each call passes its own token (see cgsAuth). */
export const cgs = new Client({
  service: CGS_URL,
  // Looked up per call, and bounded: a hung CGS must not hold a Server Action.
  fetch: (input, init) =>
    fetch(input, {
      ...init,
      redirect: "error",
      signal: AbortSignal.any([
        AbortSignal.timeout(10_000),
        ...(init?.signal ? [init.signal] : []),
      ]),
    }),
});

/** The user's PDS didn't mint a service-auth token, so CGS was never called. */
export class CgsAuthError extends Error {
  constructor(cause: unknown) {
    super("Could not get a service-auth token for CGS", { cause });
    this.name = "CgsAuthError";
  }
}

/**
 * Headers authorizing one call to `method` on CGS as the session's user. Pass
 * the same lexicon namespace as to `cgs.call`, so the token's `lxm` matches.
 */
export async function cgsAuth(session: OAuthSession, method: { $lxm: l.NsidString }) {
  try {
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

/**
 * Whether the session's user may edit profile `did`: their own, or an
 * organization they manage.
 */
export async function canEdit(session: OAuthSession, did: string): Promise<boolean> {
  if (did === session.did) return true;
  return (await listMemberships(session)).some((m) => m.groupDid === did && manages(m));
}
