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

export const ORG_MEMBERSHIP_COLLECTION = "app.certified.actor.membership"
export const ORG_PROFILE_COLLECTION = "app.certified.actor.profile"
export const ORG_MARKER_COLLECTION = "app.certified.actor.organization"

export const MAX_SELF_CREATED_ORGS = 5
