// Who may publish a new record to an account: the account itself, or any
// member of an organization (CGS lets every member create records; editing
// someone else's needs an admin).
import "server-only";

import { getMemberships } from "@/lib/memberships";

/** May the signed-in user (`sessionDid`) publish to `repo`? */
export async function mayPublish(sessionDid: string, repo: string): Promise<boolean> {
  if (repo === sessionDid) return true;
  const memberships = await getMemberships();
  return Array.isArray(memberships) && memberships.some((m) => m.groupDid === repo);
}
