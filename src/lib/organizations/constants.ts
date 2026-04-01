export const GROUP_SERVICE =
  process.env.NEXT_PUBLIC_GROUP_SERVICE_URL ||
  "https://atproto-group-gate-staging.up.railway.app"

export const GROUP_SERVICE_DID =
  process.env.NEXT_PUBLIC_GROUP_SERVICE_DID ||
  "did:web:atproto-group-gate-staging.up.railway.app"

export const ORG_MEMBERSHIP_COLLECTION = "app.certified.actor.membership"
export const ORG_PROFILE_COLLECTION = "app.certified.actor.profile"
export const ORG_MARKER_COLLECTION = "app.certified.actor.organization"

export const MAX_SELF_CREATED_ORGS = 5
