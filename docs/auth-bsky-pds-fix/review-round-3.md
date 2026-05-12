# Review round 3 — auth-bsky-pds-fix

Two focused reviewers ran in parallel against `plan.md` after round 2's 16 edits were integrated:

- **R3-Consistency** (post-integration sweep: line-number drift, internal references, step-ordering, executability of new acceptance rows) → `ship-then-fix-nits`
- **R3-Regex** (correctness of the final redaction patterns, run-order, over/under-redaction) → `ship-then-fix-nits`

No reviewer raised a Critical / blocking item. R3-Regex confirmed the redaction set is leak-free: no catastrophic-backtracking paths, no ordering vulnerabilities, the try/catch failsafe is correctly shaped.

## Accepted

| # | Source | Severity | Item | Action |
|---|---|---|---|---|
| C1 | R3-Consistency #1 | Important | The B1 acceptance row ("Trigger a `getRecord` against a non-existent foreign DID") doesn't actually exercise the new `logSafe` catch — `resolvePdsUrl` returning null short-circuits at the 404 *before* the try block at `route.ts:121`. | Rewrite the row to trigger a fetch failure inside the try block: target a foreign DID whose PDS *does* resolve (so it gets past the null check) but is unreachable. Concrete option: a synthetic `did:web:` whose serviceEndpoint resolves to a real-looking but dead host, or any DID whose serviceEndpoint times out. The path then enters the try, the fetch fails, and the new `logSafe("[xrpc] foreign-pds upstream", err)` fires. |
| C2 | R3-Consistency #2 | Important | Step 14 begins "Manual verification recipe *before requesting review*" but follows step 13 "Mark PR ready for review." Reordering broke the sequence. | Swap: run the 3× back-to-back smoke (current step 14) *before* marking PR ready (current step 13). |
| C3 | R3-Consistency #3 | Important | Acceptance Criteria line cites "Implementation order step 4.0" — orphaned after B8's linear renumbering. Tsc-baseline is now step 3. | Update the cross-reference to "step 3". |
| C4 | R3-Consistency #4 | Nit | B7 acceptance row says "delete the session blob from Upstash Redis" with no how-to. Engineer has to spelunk `src/lib/auth/stores.ts` to learn the key shape. | Append the key shape and a copy-paste REST recipe: key is `oauth:session:<did>`; deletion via `curl -X POST "$UPSTASH_REDIS_REST_URL/del/oauth:session:<did>" -H "Authorization: Bearer $UPSTASH_REDIS_REST_TOKEN"`. |
| C5 | R3-Consistency #5 | Nit | Commit-1 isolation smoke (step 7, pushes to preview) runs *before* local tsc/build/lint (step 9). Inverts cheap-checks-first; burns a preview cycle on a broken build. | Insert a "local verify after commit 1" mini-step between commit 1 (step 6) and the preview push (step 7). Step 9's full local verification then re-runs after commit 2 lands. |
| N1 | R3-Regex Finding #1 | Nit | JWT third segment charset `[A-Za-z0-9_=-]+` includes `=`, so a JWT immediately followed by `=trailing` is greedy-eaten as one match. Over-redacts (safe direction) but messy. | Restrict `=` to trailing-padding only — mirror the form-encoded pattern: `/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+=*/g`. |
| N2 | R3-Regex Finding #2 | Nit | JWK alternation `(d\|k\|p\|q\|dp\|dq\|qi)` lists single-char alternatives before multi-char ones. JS regex tries leftmost first, so `"dp"` matches `d`, backtracks, retries. Still linear time but wasted work. | Reorder longest-first: `(dp\|dq\|qi\|d\|k\|p\|q)`. |

## Rejected

| # | Source | Severity | Item | Rationale |
|---|---|---|---|---|
| Z1 | R3-Regex #3 | — | Header / email regexes over-redact (consume `}`/`,` boundaries, grab preceding text into emails) | Confirmed deliberate. Over-redaction is the safe direction for security-observability. No action. |
| Z2 | R3-Regex #4–6 | — | Try/catch failsafe, run-order safety, no-catastrophic-backtracking | All three verified correct. No action. |

## Round 4?

Per the workflow rule: "Run a follow-up round only if round 1 surfaced ≥5 substantive items — otherwise stop." (Applied per round.)

Round 3 substantive (Important): **3** (C1, C2, C3). Below the threshold. **Stopping.**

A round 4 against the C1–N2 edits would be nit-picking. The plan is implementation-ready.
