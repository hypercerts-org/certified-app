// Who may publish a new record to an account: the account itself, or any
// member of an organization (CGS lets every member create records; editing
// someone else's needs an admin). Always asks CGS live — never cached display
// memberships.
import "server-only";

import type { OAuthSession } from "@atproto/oauth-client-node";
import { isMember } from "@/lib/cgs";

/** May the signed-in user (`session`) publish to `repo`? */
export async function mayPublish(session: OAuthSession, repo: string): Promise<boolean> {
  return isMember(session, repo);
}
