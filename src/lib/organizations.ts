import "server-only";

import type { OAuthSession } from "@atproto/oauth-client-node";
import { listMembershipsForDisplay, manages } from "@/lib/cgs";
import { getActor } from "@/lib/hypercerts/queries";
import { getHandle } from "@/lib/identity";

/** An organization the signed-in user belongs to, as the app shows it. */
export type Organization = {
  did: string;
  name: string;
  avatarUrl: string | null;
  /** Its handle, verified both ways, or null. */
  handle: string | null;
  /** "Member", "Admin" or "Owner". */
  roleLabel: string;
  /** Admins and owners may edit its profile in this app. */
  manages: boolean;
};

const ROLE_LABEL: Record<string, string> = { member: "Member", admin: "Admin", owner: "Owner" };

/**
 * Every organization the session's user belongs to, for display: memberships
 * from the Certified Group Service (up to five minutes old, see
 * listMembershipsForDisplay), names and avatars from the index (an
 * organization without an indexed profile shows its DID), handles resolved. Not for deciding
 * what the user may do: use canEdit.
 */
export async function listOrganizations(session: OAuthSession): Promise<Organization[]> {
  const memberships = await listMembershipsForDisplay(session);
  return Promise.all(
    memberships.map(async (membership) => {
      const [actor, handle] = await Promise.all([
        getActor(membership.groupDid),
        getHandle(membership.groupDid),
      ]);
      return {
        did: membership.groupDid,
        name: actor?.displayName ?? membership.groupDid,
        avatarUrl: actor?.avatarUrl ?? null,
        handle,
        roleLabel: ROLE_LABEL[membership.role] ?? membership.role,
        manages: manages(membership),
      };
    }),
  );
}
