// The Certified Group Service (CGS): role-based access to organization
// repositories. Calls go straight to the configured CGS, as its integration
// guide recommends (not proxied through the user's PDS). Each call carries a
// single-use service-auth token that the user's PDS mints for exactly that
// method: `aud` is the CGS DID and `lxm` the method; the organization is
// named by `repo` in the call itself.
import "server-only";

import { Client, type l } from "@atproto/lex";
import type { OAuthSession } from "@atproto/oauth-client-node";
import { app, com } from "@/lexicons";

const CGS_URL = new URL(process.env.CGS_URL ?? "https://groups.certified.app");
/** A CGS deployment's DID is always did:web of its host. */
const CGS_DID = `did:web:${CGS_URL.host.replace(":", "%3A")}`;

export const cgs = new Client(CGS_URL);

/** The user's PDS didn't mint a service-auth token, so CGS was never called. */
export class CgsAuthError extends Error {
  constructor(cause: unknown) {
    super("Could not get a service-auth token for CGS", { cause });
    this.name = "CgsAuthError";
  }
}

/** Headers authorizing one call to method `lxm` on CGS as the session's user. */
export async function cgsAuth(session: OAuthSession, lxm: l.NsidString) {
  try {
    const { token } = await new Client(session).call(com.atproto.server.getServiceAuth, {
      aud: CGS_DID,
      lxm,
    });
    return { authorization: `Bearer ${token}` };
  } catch (err) {
    throw new CgsAuthError(err);
  }
}

export type Role = "member" | "admin" | "owner";
export type Membership = { groupDid: string; role: Role };

/** Roles that may edit an organization's profile. */
const MANAGING_ROLES: ReadonlySet<string> = new Set<Role>(["admin", "owner"]);

export const manages = (membership: Membership) => MANAGING_ROLES.has(membership.role);

/** Every organization the session's user belongs to on CGS, with their role. */
export async function listMemberships(session: OAuthSession): Promise<Membership[]> {
  const list = app.certified.groups.membership.list;
  const memberships: Membership[] = [];
  let cursor: string | undefined;
  do {
    const page = await cgs.call(
      list,
      { limit: 100, cursor },
      { headers: await cgsAuth(session, list.$lxm) },
    );
    for (const { groupDid, role } of page.groups) {
      memberships.push({ groupDid, role: role as Role });
    }
    cursor = page.cursor;
  } while (cursor);
  return memberships;
}

/** Whether the session's user may edit organization `did`'s profile. */
export async function canManage(session: OAuthSession, did: string): Promise<boolean> {
  return (await listMemberships(session)).some((m) => m.groupDid === did && manages(m));
}
