# Review round 1 — app-password elevated session (issue #223)

Adversarial multi-agent review (4 dimensions: security, correctness, react-ui,
tests+protocol; each finding independently verified against the code). 16 raw
findings → 9 confirmed real. All 9 were addressed. Decisions below.

| # | Sev | Finding | Decision |
|---|-----|---------|----------|
| 1 | med | Unlock rate-limiter fails **open** on a Redis error (shared `enforceRateLimit` swallows errors → `null`), removing the app-side brake on password guessing. | **Fixed.** The unlock POST now calls `checkHttpRateLimit` directly and fails **closed** (503) if the limiter throws. Kept per-DID keying and documented *why* it's correct here: `did` is the caller's own session DID, so a caller can only ever spend budget against the account they're already signed in as — there is no cross-account targeting to defend with an IP layer. |
| 2 | med | A wrong/expired **2FA email code** comes back from atproto as HTTP **400 `InvalidToken`/`ExpiredToken`** (not 401), so `establish` threw it as a generic error and the dialog showed a misleading "service unreachable" banner. | **Fixed.** Added an `invalidCode` outcome through the whole stack (`establish` → route → lib `UnlockResult` → unlock fields). The code field stays up with inline "That code wasn't accepted" copy (distinct from the wrong-*password* copy). New unit + route tests cover it. |
| 3 | med | `CreateAppPasswordDialog` swapped between **two different `<dialog>` elements** (the standalone unlock dialog vs. its own AppDialog), re-playing the slide-up animation and bouncing focus on each phase change. | **Fixed.** Extracted `useUnlockAppPasswords` + `UnlockAppPasswordFields` (new `unlock-app-passwords-fields.tsx`). The create dialog now renders one AppDialog for all phases with the unlock fields inline; the standalone dialog reuses the same hook+fields. One modal stays open across unlock→create. |
| 4 | low | `refresh()`'s locked branch set `status="locked"` without clearing the one-time `created` secret (which `goLocked()` does), so it could resurface across a lock/unlock cycle. | **Fixed.** Locked branch now routes through `goLocked()`. |
| 5 | low | Literal `✓` glyph used as a status marker (read aloud verbatim by SRs; off the lucide icon vocabulary). | **Fixed.** Replaced with `<Check size={14} aria-hidden>`. |
| 6 | low | Gate **order** never asserted — tests checked each gate in isolation, so a CSRF-before-rate-limit reordering would pass. | **Fixed.** Added both-fail order tests (rate-limit+CSRF → 429 wins; auth+rate-limit → 401 wins) on session and create routes, plus a rate-limit-denied test for create. |
| 7 | low | No test that the one-time **created secret** never reaches the logs (the secret is not a JWT/email shape, so `redactSecrets` wouldn't scrub a regression). | **Fixed.** Added a create-path `console.error` spy test asserting the secret never appears. |
| 8 | low | The session "never logs the password" test was near-vacuous (the password is never near a logger, so it couldn't fail). | **Fixed.** Reworked it to reject with an error message embedding a JWT and assert the JWT is **redacted** — exercising the real `logSafe`/`redactSecrets` path — while still asserting the password never appears. |
| 9 | low | No test for the `establish` defence-in-depth 502 branch when a 200 `createSession` omits the tokens. | **Fixed.** Added a missing-`accessJwt` case asserting a 502 reject and no Redis write. |

## Not changed (considered, rejected)

- **IP-layer on the unlock limiter** (raised under #1): rejected. The unlock route only ever
  acts on `getSessionDid()` — the caller's own DID — so an attacker cannot target a victim's
  account without already holding the victim's session cookie (at which point app-password
  guessing is moot). Per-DID keying is the correct identifier; an IP layer would add friction
  without closing a real path. Documented inline at the limiter.

## Result

`tsc --noEmit`, `typecheck:test`, `lint` (0 errors; 0 new warnings vs. baseline), and the full
Vitest suite (797 passing, incl. 55 for this feature) all green.
