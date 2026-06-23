# App-password management over OAuth — transient elevated password session

Implements GitHub issue **#223** ("Enable in-app app-password management over OAuth").
The issue body is the authoritative spec; this file records the implementation
shape and the decisions that diverge from / sharpen the issue.

## Problem (one line)

certified-app is OAuth-only, but atproto's `com.atproto.server.{list,create,revoke}AppPassword`
reject OAuth credentials (403). They need a password-based `createSession`. So
Settings → App passwords 403s for every user, and the group-import flow has no
in-app way to mint an app password.

## Shape

A short-lived **elevated session**: user unlocks once with their account
password (+ emailed code if 2FA is on); the server runs `createSession`, stores
`{ accessJwt, refreshJwt, pdsUrl }` in Redis under `apppw:elev:{did}` (TTL ~600s),
and list/create/revoke run server-side through that stored Bearer-JWT session.
Lock (or TTL expiry) → `deleteSession` + Redis `del`. Tokens never reach the browser.

Password-session calls use **Bearer JWT (no DPoP)** — plain `fetch` with
`Authorization: Bearer <jwt>`.

### Files

Create:
- `src/lib/auth/app-password-session.ts` — `establish` / `getElevated` / `end` / `callPds`.
- `src/app/api/account/app-passwords/session/route.ts` — POST unlock / DELETE lock.
- `src/app/api/account/app-passwords/route.ts` — GET list / POST create.
- `src/app/api/account/app-passwords/revoke/route.ts` — POST revoke.
- `src/components/settings/unlock-app-passwords-dialog.tsx` — shared unlock UI (password + 2FA).
- `src/components/settings/create-app-password-dialog.tsx` — unlock→create→reveal for the import shortcut.

Modify:
- `src/lib/atproto/app-passwords.ts` — point at the new routes; add unlock/lock.
- `src/components/settings/app-passwords-section.tsx` — locked gate + unlock + manage.
- `src/components/settings/import-as-group-section.tsx` — "Create one" shortcut.

## Decisions / divergences from the issue text

1. **Gate order is auth → rate-limit(by DID) → CSRF → parse → validate → execute**,
   not the issue's literal "rate-limit → CSRF → auth". Rate-limiting is keyed by the
   session DID, which is only known *after* auth. This matches the working template
   `src/app/api/groups/register/route.ts` (whose comment explains the same ordering).
2. **Unlock route returns HTTP 200 with `{ status: "ok" | "twoFactorRequired" | "invalid" }`.**
   "invalid" is a *result*, not an auth failure of our own session, so a 200 + discriminator
   is cleaner for the client than a 401. Genuine failures (no session cookie, unexpected
   upstream) still return real error statuses.
3. **List/create/revoke return `401 { error: "locked" }`** when there is no elevated
   session (or when the PDS rejects the stored token mid-window — in which case we also
   `end()` to clear the dead session). The client maps this to "drop back to locked".
4. **Shared unlock dialog + a create-dialog wrapper.** Rather than duplicate the
   password/2FA/error UI, `unlock-app-passwords-dialog.tsx` owns it; the import
   shortcut composes it inside `create-app-password-dialog.tsx`, which first *tries*
   `createAppPassword` and only shows the unlock step if the server says `locked`
   (so an already-unlocked user isn't re-prompted).
5. **`establish` verifies `createSession`'s returned `did` equals the caller's** —
   defence-in-depth so a stored session is always for the caller's own account.

## Security invariants

- Never log password or tokens (`logSafe` redaction; we never pass them to a logger).
- Short TTL (~10 min); `deleteSession` on lock; DID-scoped (only the caller's own account).
- Redis-only token storage, never serialized to the browser. Mirrors how OAuth
  sessions are already stored.
- CSRF on every mutating route; rate-limit keyed by DID; tighter limiter on unlock
  to bound guessing.

## Verification

- Vitest route + helper tests (see `src/app/api/account/app-passwords/__tests__/`
  and `src/lib/auth/__tests__/app-password-session.test.ts`).
- `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`.
- CLAUDE.md UI grep checks (radii / breakpoints / modal backdrops) stay clean.
