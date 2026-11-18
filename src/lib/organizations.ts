import "server-only";

import { type Membership, manages } from "@/lib/cgs";
import { getActorCards } from "@/lib/hypercerts/queries";

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

/** The organizations of these memberships, as the app shows them. */
export async function toOrganizations(memberships: Membership[]): Promise<Organization[]> {
  // Names, avatars and handles for all of them at once (getActorCards).
  const cards = new Map(
    (await getActorCards(memberships.map((m) => m.groupDid))).map((card) => [card.did, card]),
  );
  return memberships.map((membership) => {
    const card = cards.get(membership.groupDid);
    return {
      did: membership.groupDid,
      name: card?.displayName ?? membership.groupDid,
      avatarUrl: card?.avatarUrl ?? null,
      handle: card?.handle ?? null,
      roleLabel: ROLE_LABEL[membership.role] ?? membership.role,
      manages: manages(membership),
    };
  });
}
