// Production CGS at `https://groups.certified.app` (Railway-hosted).
// The misleadingly-named `atproto-group-gate-staging.up.railway.app` is a
// separate, older Railway service with its own database — different
// memberships, different group records. Always default to the production
// host so a redeploy without explicit env vars routes to the right CGS.
export const GROUP_SERVICE =
  process.env.NEXT_PUBLIC_GROUP_SERVICE_URL ||
  "https://groups.certified.app"

export const GROUP_SERVICE_DID =
  process.env.NEXT_PUBLIC_GROUP_SERVICE_DID ||
  "did:web:groups.certified.app"

export const ORG_MARKER_COLLECTION = "app.certified.actor.organization"

export const MAX_SELF_CREATED_ORGS = 5

/**
 * Single source of truth for the group role allowlists used by the BFF
 * write routes (authz-repo-3). Keep these arrays as the only place the
 * role sets are enumerated so the two routes can't drift:
 *   - `ORG_ROLES`            — every valid role, accepted by role PUT
 *                              (`/api/groups/[groupDid]/role`).
 *   - `ORG_ASSIGNABLE_ROLES` — roles a member can be ADDED with via members
 *                              POST (`/api/groups/[groupDid]/members`).
 *                              Derived from `ORG_ROLES` minus `owner`:
 *                              ownership is conferred only by the
 *                              owner-gated role.set path, never on add.
 * Mirrors the `OrgRole` union in `./types`.
 */
export const ORG_ROLES = ["member", "admin", "owner"] as const

export const ORG_ASSIGNABLE_ROLES = ORG_ROLES.filter(
  (role) => role !== "owner"
)

export function isOrgRole(value: unknown): value is (typeof ORG_ROLES)[number] {
  return (
    typeof value === "string" &&
    (ORG_ROLES as readonly string[]).includes(value)
  )
}

export function isAssignableRole(value: unknown): boolean {
  return (
    typeof value === "string" &&
    (ORG_ASSIGNABLE_ROLES as readonly string[]).includes(value)
  )
}
