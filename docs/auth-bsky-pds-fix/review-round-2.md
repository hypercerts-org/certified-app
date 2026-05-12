# Review round 2 — auth-bsky-pds-fix

Three reviewers ran in parallel against `plan.md` after Decision 1 was reverted from SPLIT → BUNDLE by user direction:

- **R2-Consistency** (integrated edits, cross-section coherence, standalone readability) → `ship-then-fix-nits`
- **R2-Security** (redaction-pattern correctness, failure modes of the observability path) → `ship-then-fix-nits`
- **R2-Ops** (revert granularity under bundle, acceptance procedure, risk register) → `ship-then-fix-nits`

No reviewer raised a Critical / blocking item. All three verdicts: ship after addressing the items below.

## Accepted

| # | Source | Severity | Item | Action |
|---|---|---|---|---|
| B1 | R2-Consistency #2 + R2-Security #3 | Important | The foreign-PDS GET catches at `route.ts:135, 197, 263` (`getRecord`, `listRecords`, `sync.getBlob` to foreign PDSes) still swallow upstream errors silently. The bundle's whole rationale is "don't ship blind." | Expand commit 2 to replace those three `catch {}` with `catch (err) { logSafe("[xrpc] foreign-pds upstream", err, { method: methodName, pds: targetPds }) }`. Update File ownership table + Acceptance to reflect. Also remove the misleading "Changes to the public XRPC proxy paths" line from Out of scope. |
| B2 | R2-Security #1 | Important | Cookie/header regex `/(Authorization\|DPoP\|Cookie\|Set-Cookie):\s*\S+/gi` — `\S+` stops at the first whitespace, so `Cookie: a=1; b=2; c=3` redacts only `a=1;` and leaks `b=2; c=3`. | Anchor to end-of-line: `/(Authorization\|DPoP\|Cookie\|Set-Cookie):[^\r\n]*/gi → '$1: <redacted>'`. |
| B3 | R2-Security #2 | Important | JSON token regex `"[^"]+"` stops at the first quote, including escaped `\"` inside a stringified body — common in `util.inspect` of an Error containing a re-stringified JSON response. | Replace with `"(access_token\|refresh_token\|id_token)"\s*:\s*"(?:[^"\\]\|\\.)*"`. Same shape for the JWK `"d"` field. Add `"k"` (symmetric keys) to the JWK pattern; RSA CRT params (`"p"`, `"q"`, `"dp"`, `"dq"`, `"qi"`) are belt-and-suspenders since atproto uses ES256/P-256, but cheap. |
| B4 | R2-Security #4 + R2-Ops #2 (R9) | Important | If a `redactSecrets` regex catastrophic-backtracks on pathological input (giant error message), it throws inside the error-handling path. Original raw string could propagate or response could crash. | Wrap `redactSecrets`'s body in `try { … } catch { return "<redaction-failed>" }`. `logSafe` itself must never throw; if redaction errors, fall back to logging `name + status` only with no payload. |
| B5 | R2-Ops #2 | Important | Risk register did not absorb redaction-specific risks introduced by the bundle. | Add R7 (regex throws on pathological input), R8 (future secret format leaks past redaction), R9 (observability path itself fails silently). Mitigations in B4 + drop-cause-stack + recurring redaction-smoke on SDK bumps. |
| B6 | R2-Ops #1 | Important | If commit 2's `redactSecrets` throws inside the error path, it can mask a successful commit-1 fix — a green/red smoke is then misattributed. | Add a sub-step: after commit 1, push and run only the *Bsky-PDS handle write* + *Vercel function logs clean of `expected non-null body source`* acceptance rows. Confirm green, then land commit 2 and run the full Acceptance Criteria. One extra ~5-min preview cycle. |
| B7 | R2-Consistency #3 | Important | Acceptance Criteria are commit-1-heavy. Only "Log redaction smoke" + "Log content survives redaction" exercise commit 2. Nothing checks the OAuth-restore catch path that the bundle promised to make visible. | Add one Acceptance row: "Force `client.restore(did)` to fail (delete session blob in Redis); confirm `[xrpc] oauth restore failed` appears redacted in function logs, and the client still sees 401." |
| B8 | R2-Consistency #4 | Nit | Implementation order steps `4`, `4.0`, `5`, `5a` are illegible. | Renumber linearly 1..N. `4.0` becomes a real step ("npm install"); commit-1 and commit-2 become their own steps; the new B6 sub-step inserts cleanly. |
| B9 | R2-Consistency #5 | Nit | Node 24.x check appears in Acceptance Criteria but not as a pre-smoke gate in Implementation order. | Prepend the smoke step with "Confirm Vercel project Node version is 24.x for this preview before smoking." |
| B10 | R2-Consistency #8 | Nit | Commit 2 changes `xrpcError`'s body but the plan describes it in prose, not a diff. Engineer would have to guess. | Add a 10-line snippet block under Decision 1 showing the `xrpcError` signature change and one example `catch (err) { logSafe(...) }` call site. |
| B11 | R2-Security #5 | Nit | JWT regex doesn't tolerate `=` padding in the third segment. Most JWTs in atproto are unpadded, but adding `=` to the third-segment charset costs nothing and avoids partial matches on padded variants. | Update the JWT regex to `/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_=-]+/g`. |
| B12 | R2-Security #6 | Nit | Order of redactions: email regex runs last, doesn't match inside placeholders. Worth a comment so future maintainers don't reorder it. | One-line code comment: `// Email last — earlier patterns already replaced their secrets with placeholders that contain no '@'.` |
| B13 | R2-Security #7 | Nit | Plan calls redaction "defense in depth" but Vercel logs are project-member-gated and there's no third-party log drain. Redaction is the single barrier to function-log surface, not a secondary layer. | Reword to: "Redaction is the single barrier to the function-log surface; access to that surface is gated by Vercel team membership. Defense-in-depth value is against future log exports, drains, or expanded read access." |
| B14 | R2-Ops #4 | Nit | "Deliberately trigger an upstream 4xx" is too vague for a smoke step. | Append a concrete recipe to the Log redaction smoke row: a `curl` POST against `/api/xrpc/com.atproto.repo.putRecord` with a missing-required-field body, returning a 400 from the PDS without needing real malformed data. |
| B15 | R2-Security #8 | Nit | "Visual inspection" of function logs is fragile and won't catch a regression on a future plan edit. | Optional: a one-shot `tsx scripts/redaction-fixture.ts` against fixture strings (each regex's worst case + cookie-list + escaped-quote + a moderate-size string for backtracking). Lightweight; no vitest needed. Document but mark as optional since `tests/` doesn't have a runner. |
| B16 | R2-Ops #6 | Nit | `review-round-1.md` was written when A8 said "split"; the plan now says "bundle". A reader of round-1 in isolation sees a contradiction with no pointer back. | Add a one-line preservation note at the top of `review-round-1.md`. |

## Rejected

| # | Source | Severity | Item | Rationale |
|---|---|---|---|---|
| Y1 | R2-Consistency #7 | Nit | Optional PR description appendix in the plan | Defer to PR-open time. The plan already lists what links the PR body should include; rendering the body in advance adds drift surface. |
| Y2 | R2-Consistency #6 | — | No-fix items (A1 canary, A14 staging→main, A6 empty-body comment) all verified present | Acknowledged — no action needed. |
| Y3 | R2-Ops #3 | — | "Commit disjointness for clean revert" — verified `xrpcError` is local to `route.ts` only | Acknowledged — no action needed. |
| Y4 | R2-Ops #7 | — | Engineer-facing reminders intact | Acknowledged — no action needed. |
| Y5 | R2-Ops #8 | — | ESLint compatibility — no `max-len`, `no-useless-escape` won't fire on these patterns | Acknowledged — `npm run lint` will catch any miss anyway. |
| Y6 | R2-Ops #9 | — | End-to-end coherence is fine post-bundle | Acknowledged — no action needed. |
| Y7 | R2-Ops #10 | — | Plan size acceptable | Acknowledged — under the "break it up" threshold. |

## Round 3?

Per workflow rule: ≥5 substantive items in round 2 → round 3 is technically warranted. **Skipping.**

Rationale: round 2's substantive items (B1–B7) are all mechanical edits to the plan or to specific regex strings — they are not design questions, and R2-Ops explicitly recommended not running round 3. A round-3 pass against integrated edits would surface nits only (typo polish, line-numbering after renumbering, etc.). Stop here; surface to the user instead.
