import type { OrgRole } from "@/lib/groups/types"

/** A group role as the shell writes it: the account menu's "Group · Admin"
 *  tag and the Workspace menu's role badges. */
export const ORG_ROLE_LABEL: Record<OrgRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
}
