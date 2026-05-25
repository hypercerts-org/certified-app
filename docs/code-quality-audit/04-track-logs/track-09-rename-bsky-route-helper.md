# Track T09 — rename route-local getBlueskyProfile

Commit: `e715967`

The route-local helper in `src/app/api/resolve-did/route.ts` that fetched
from the public Bluesky AppView (`/xrpc/app.bsky.actor.getProfile`) shared
its name with the exported `getBlueskyProfile` in
`src/lib/atproto/profile.ts` (which reads `app.bsky.actor.profile` from a
user's OWN PDS). Two different operations with the same name.

Renamed the route-local helper to `fetchBskyAppViewProfile` and updated
the (sole, local) call site. Added JSDoc clarifying the distinction.

Files (1): `src/app/api/resolve-did/route.ts`. Diff: +8/-3.

Verification: all four gates passed.
