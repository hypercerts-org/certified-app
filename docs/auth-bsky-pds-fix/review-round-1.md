# Review round 1 — auth-bsky-pds-fix

> **Note:** A8's recommendation to split Decision 1 was **overridden by user direction** after this review was written. The plan now bundles the redacted logging into this PR. See `plan.md` Decision 1 for the final shape and `review-round-2.md` for the round-2 pass against the bundled version. This file is preserved as-of-then; do not edit retroactively.



Three reviewers ran in parallel against `plan.md`:

- **R-Spec** (root-cause correctness, retry semantics, atproto SDK call patterns) → `ship-then-fix-nits`
- **R-Code** (TypeScript style, redaction patterns, security surface of the optional logging) → `ship-then-fix-nits`
- **R-Ops** (workflow, env vars, verification, rollback) → `ship-then-fix-nits`

No reviewer raised a Critical / blocking item. Items are tracked below as Accepted (integrated into the plan) or Rejected (with rationale).

## Accepted

| # | Source | Severity | Item | Action |
|---|---|---|---|---|
| A1 | R-Spec #2 | Important | Future-proofing: if `@atproto/oauth-client` ever invokes our `safeFetch` as `fetch.call(this, request, init)` with non-null init, we'd silently drop method/signal/body. | Replace `void init` with a dev-mode `console.warn` canary that fires if both a Request and a non-null init arrive together; production still strips init silently. |
| A2 | R-Spec #4 | Important | Plan understates the fix's reach — it also protects token-refresh and revoke, since the DPoP wrapper handles auth-server traffic and bsky's auth server also issues nonce challenges. | Add one line under "Why this works" noting refresh/revoke are covered. Clarifies the overlap with the upstream PR's "OAuth session restoration flow" item (the behavioral session-restoration change is independent; the fetch-path protection is ours). |
| A3 | R-Spec #5 | Nit | uploadBlob double-buffer estimate is too low. | Update the comment in `safeFetch` from "transient ~8MB" to "~12 MB peak, ~24 MB worst case on a nonce-retry. Well under Vercel's 1 GB limit." |
| A4 | R-Spec #6 | Nit | Bug only reproduces on Node ≥ 24.14. If staging is on Node 22, a green smoke test is a false negative. | Add explicit acceptance row: "Vercel project Node version confirmed as 24.x on the feature-branch preview before smoke test." |
| A5 | R-Code #1 + R-Spec #3 | Nit | `signal: input.signal` is always non-null; passing it back is harmless but confusing without context. Also any caller-provided `init.signal` would be intentionally dropped together with `init`. | Add a one-line comment in `safeFetch` noting both points. No code change. |
| A6 | R-Code #2 + R-Spec #1 | Important | Empty-body POST behavior worth tightening. Current `body: input.body ? buffer : undefined` is correct *in practice* (a no-body Request has `body === null`, an explicitly-empty Request has `body` non-null and we forward 0-byte buffer preserving Content-Length: 0). | Keep code as written but add a comment explaining the two cases. Optionally add a one-time manual check on `com.atproto.server.requestEmailUpdate` (no-body authenticated POST) during smoke. |
| A7 | R-Code #3 | Important | `redactSecrets` (Decision 1) has blind spots: OAuth callback `state=`/`code=` query params; JSON-shape tokens (`"refresh_token":"…"` vs only `refresh_token=…`); private JWK `"d"` field if ever stringified. | When the Decision 1 PR is implemented (now split out — see A8), extend redaction with: `/[?&](code\|state)=[^&\s]+/gi`, `/"(access_token\|refresh_token\|id_token)"\s*:\s*"[^"]+"/gi`, `/"d"\s*:\s*"[A-Za-z0-9_-]+"/g`. |
| A8 | R-Ops #8 | Important | Decision 1 (bundle redaction-aware upstream logging) — reviewer pushed back on bundling. Splitting gives the surgical fix a clean review and the redaction code (which all three reviewers found has gotchas) gets its own security-focused pass. | **Flip Decision 1 from "include" to "split into follow-up PR".** This PR ships only the `safeFetch` change in `src/lib/auth/oauth-client.ts`. The logging follow-up is tracked as a separate todo. |
| A9 | R-Ops #1 + #7 | Important | Acceptance criteria need: (a) explicit human smoke-tester named, (b) token-refresh path coverage, (c) Vercel function log inspection, (d) header/origin inspection in browser devtools, (e) Certified-hosted control row. | Rewrite the Acceptance Criteria section with all five additions. |
| A10 | R-Ops #2 | Important | `node_modules` isn't installed yet. Plan reads as if `tsc --noEmit` / `npm run build` will Just Work. | Add explicit step 4.0: `npm install` against the lockfile on `staging` HEAD. |
| A11 | R-Ops #3 | Important | TS baseline mechanism underspecified. "Same count" can mask a same-count-different-codes regression. | Specify: capture `npx tsc --noEmit 2>&1 | tee docs/auth-bsky-pds-fix/tsc-baseline.txt` on `staging` HEAD before branching. Verification is `diff baseline.txt post-change.txt`, not eyeballing counts. |
| A12 | R-Ops #4 | Important | Preview env vars are per-branch on Vercel; new feature branch needs them copied before the first build. The Step 7 wording "wait for staging deploy" is ambiguous about which preview. | Add a "Preview env vars" pre-implementation section listing the seven required vars. Reword Step 7 to "wait for the *feature-branch* preview deploy". |
| A13 | R-Ops #5 | Nit | Warm-lambda `clientPromise` singleton may briefly serve the post-revert old closure until lambda recycles. | One-line note in Rollback: "no manual cache flush needed; allow normal lambda recycle (≤ minutes)." |
| A14 | R-Ops #10 | Important | Several engineer-facing reminders missing: re-run smoke against `staging.certs.social` (not just preview) after merge to staging; do NOT auto-open the `staging → main` PR; verify `git config user.email` matches Vercel team membership; note that the redacted server-only logging is compliant with AUDIT_REPORT.md / AGENTS.md (will matter once Decision 1's follow-up lands). | Add a "Pre-push checklist" + "Post-merge verification" + "What not to do" section. |
| A15 | R-Ops #9 | Nit | Defer of `@atproto/api` 0.13 → 0.19 is genuinely safe (the agent doesn't itself construct Request objects passed to the OAuth client's fetch), but should be tracked so it doesn't drift. | Add a line under Open Questions: "follow-up: bump `@atproto/api` to 0.19.x once this fix is in, tracked separately." |
| A16 | R-Code #4 + #5 | Nit | Drop `err.cause` / `err.stack` is the right call (cause carries serialized request state). `logSafe` is strictly better than silent `catch {}`. | Already captured in the plan (Decision 1). When the follow-up lands, add a one-line comment in `xrpcError` explaining the cause/stack drop. No change to *this* plan beyond the split. |
| A17 | R-Code #6 | Nit | Project uses 2-space indent, double quotes, no semicolons. The plan's code snippet uses semicolons. | Rewrite the `safeFetch` snippet in the plan to match house style. |
| A18 | R-Code #8 | Nit | No automated tests in the project. Acceptance is human smoke only. | Add a manual verification recipe: a `curl` loop hitting an authenticated write on the bsky-PDS handle three times in a row, expected `200 / 200 / 200` (exercises DPoP nonce + retry + token still valid path). |

## Rejected

| # | Source | Severity | Item | Rationale |
|---|---|---|---|---|
| X1 | R-Spec #7 | Nit | `bindFetch` wrapping consideration | `safeFetch` is `async (input, init) => …` with no `this` dependency, so `bindFetch` is a no-op. Reviewer flagged this only because it surfaced during review. Nothing to do. |
| X2 | R-Spec #8 | Nit | If `safeFetch` ever received a Request with consumed body, `arrayBuffer()` would throw | Can't happen with `@atproto/oauth-client@0.6.0` as verified by R-Spec's source reading (the retry path in the wrapper bails before re-invoking). Surrounding `try/catch` in the route would convert any future regression to a 500 anyway. Accept as-is. |
| X3 | R-Code #9 | Nit | Add a "verify `Content-Length: 0` preserved on empty-body POST" line to the test plan | Subsumed by A6's added manual check on `requestEmailUpdate`. Don't double-list. |
| X4 | R-Ops #6 | Nit | "Risk to non-bsky users — well-handled" | No action item. Already covered by A9's Certified-hosted control row. |

## Round 2?

Per the workflow rule: "Run a follow-up round only if round 1 surfaced ≥5 substantive items — otherwise stop."

Substantive items (Important): **9** (A1, A2, A6, A7, A8, A9, A10, A11, A12, A14). The threshold is met.

Plan is to: integrate all Accepted items into `plan.md` now, then ask the user whether to run a round 2 (against the updated plan) before starting implementation. Round 2 would cover: (i) review the integrated edits for consistency, (ii) re-evaluate the split decision (A8) under the new shape, (iii) check the rewritten Acceptance Criteria for gaps. I'd expect round 2 to surface a small number of nits only.
