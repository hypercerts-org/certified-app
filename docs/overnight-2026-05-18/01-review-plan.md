# 01 — Review plan

**Time budget for tonight:** ~8 hours wall clock. Phase 0 spent ~45 min. Remaining ~7h 15min.
- Phase 1 (this doc): 20 min.
- Phase 2 (diagnostic): 90 min — parallel reviewer agents.
- Phase 3 (triage and plan): 30 min.
- Phase 4 (implement + verify): 4h 30min.
- Phase 6 (final re-review): 60 min.
- Phase 7 (Draft PR, make checks green): 30 min.

If diagnostic comes in fast I will spend it on implementation; if findings are heavier than expected I will spend it cutting MUST FIX scope rather than slipping implementation time.

---

## What I am reviewing

The full 79-commit delta of `feat/positioning-redesign` vs. `staging`. Inside that, the highest-risk surface (from orientation §10):

- The five new API routes added on this branch (`/api/geocode`, `/api/groups/[groupDid]/{activity,follow,location,handle}`, plus extensions to existing routes).
- The dual-path write routing (`targetDid !== ownDid → CGS BFF` vs. `XRPC proxy`) repeated across six lib files.
- The four largest UI files (page.tsx, profile-endorsements, profile-overview, profile-sidebar, activity-detail).
- The TipTap leaflet editor + linearDocument conversion (URL/embed parsing, sanitization).
- Social graph sync write path (`use-social-graph-sync.ts`, `sync-social-graph-section.tsx`).
- The two known lint-baseline errors (use-user-indexer-activities, use-social-graph-sync) — they signal real correctness issues that the React 19 lint rules caught.
- The Next.js advisory (16.2.3 → 16.2.6 patch).
- The `.env.local.example` drift (STADIA, INDEXER, INDEXER_DID undeclared).
- CSP headers — newly extended for YouTube/Vimeo iframes; verify no regression in `connect-src`/`img-src`/`script-src` for the leaflet upload + geocode flows.

---

## Lenses, with rationale

I will apply six lenses. The first five run in **parallel** as five reviewer agents in Phase 2; the sixth is a thinner sequential pass that I run myself.

### 1. Security (parallel agent A) — must apply

Justification specific to this codebase:
- The branch adds new mutating routes (`/api/groups/[groupDid]/{activity,follow,location}`) and a new `/api/geocode` route. AGENTS.md §17 lists 11 mandatory server-side rules (CSRF first, HMAC verify, session-fixation defense, Redis try/catch, input double-sanitize, 5xx error sanitization, repo-ownership enforcement on writes, collection allowlist, blob limits, service-auth token scoping). Every new route must obey them; the lens checks coverage.
- The TipTap editor accepts user-supplied URLs and embed sources. AGENTS.md pitfall #11 explicitly calls out `javascript:` URLs as a one-click XSS — verify scheme allowlist on all `<a href>` and embed-iframe `src` assignments in the new leaflet code.
- CSP frame-src was extended to `https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com`. Verify the rest of CSP wasn't relaxed in the process; verify `connect-src` covers the new `/api/geocode` upstream (Nominatim, Stadia, or whatever it actually calls).
- The Next.js 16.2.3 → 16.2.6 advisory covers a middleware bypass, cache poisoning, and an XSS in CSP-nonce App Router. We use App Router, we don't appear to use CSP nonces (verify), but the cache-poisoning advisory matters because we cache nothing explicitly — also verify.

### 2. Correctness & robustness (parallel agent B) — must apply

Justification specific to this codebase:
- Hand-written type guards everywhere (no Zod). The orientation surfaced specific narrowing sites: `extractAwardSubjectDid`, `resolveActivityImageUrl`, location parsing. Are any of the guards in the *new* code missing a typeof check, ignoring a union arm, or trusting a server shape it shouldn't?
- The two known lint-baseline errors (`use-user-indexer-activities.ts:188`, `use-social-graph-sync.ts:77`) are red ESLint flags from the React 19 ruleset. These are not nits; they signal real bugs (ref read during render, lost memoization). Both have to be diagnosed.
- Pagination + safety caps in `follow.ts:148` and `useReceivedEndorsements:101` hardcode 10K. If a user crosses that, the UI silently truncates. Is the truncation flagged anywhere?
- Concurrent-edit windows: `mergeProfile()` in `profile.ts` is read-modify-write without CID swap (acknowledged in PR #63 body as "race window is small and acceptable for v1"). Are there other write paths added on this branch with the same window that are not similarly acknowledged?
- AbortController usage in the new hooks (use-social-graph-sync, use-cert-projects, use-project-items, use-org-marker, use-followers, use-following, use-rights) — does every fetch in an effect actually accept and check `signal.aborted` before `setState`?

### 3. Architecture & coupling (parallel agent C) — must apply

Justification specific to this codebase:
- The **`targetDid !== ownDid` dual-path write** is the same six-line block repeated in `badges.ts:28`, `cert.ts:28`, `follow.ts:69`, `location.ts:323`, `profile.ts:74` (approximate), and `org-marker.ts:?`. AGENTS.md pitfall #20 references one variant of it. Is a shared helper worth introducing tonight (scope: yes if ≤80 lines + 6 file touches; no if it ripples into hook tests/snapshots)?
- The **profile orchestration page** (`src/app/profile/[handle]/page.tsx`, 1145 lines) is composing too many subsystems. Tonight is not the night for a structural refactor, but is there a 50-line extraction (e.g., tab-resolver, hash-router) that genuinely reduces complexity?
- The **`use-received-endorsements.ts` N+1** (one indexer query + N PDS queries for definitions) is documented as a known limitation in the orientation. Is there a viable batch-fetch alternative *without* changing the indexer schema?

### 4. Reuse & consistency (parallel agent D) — must apply

Justification specific to this codebase:
- Lens (3) looks at deep coupling; this lens looks at shallow duplication and inconsistency.
- 18 plain-CSS files; per-feature naming. Are there two CSS rules doing the same thing under different selectors (e.g., the same border-radius value hard-coded instead of the `--radius-modal` token; the same paddings; AGENTS.md pitfall #16 explicitly warns about chunky-modal regressions)?
- Modal class adherence (AGENTS.md §11.383) — every modal needs both `signin-modal` and `app-modal` classes. The new `link-dialog.tsx`, `embed-dialog.tsx`, `long-description-modal.tsx`, `endorse-people-modal.tsx`, `endorse-reason-modal.tsx` are candidates to check.
- `smart-link.tsx` exists as a shared primitive with URL-scheme validation. Are user-controlled URLs in the new code rendering through `<SmartLink>` or via raw `<a href={url}>`? Pitfall #11 again.
- Optimistic-state pattern (AGENTS.md §15a, pitfall #17) — clear via parent-value-caught-up effect, not in `finally`. Does the social graph sync follow this? Do follower/following toggles?

### 5. API contract & operations (parallel agent E) — must apply

Justification specific to this codebase:
- The new API routes (`/api/geocode`, `/api/groups/[groupDid]/{activity,follow,location}`) — do they follow the AGENTS.md §24 checklist? (method-appropriate handler, CSRF first, auth second, body shape validation, sanitize input, allowlists, try/catch JSON parse, sanitize 5xx errors, log with route-tagged prefix, return-shape consistency).
- `.env.local.example` drift: `NEXT_PUBLIC_STADIA_API_KEY`, `NEXT_PUBLIC_INDEXER_URL`, `INDEXER_URL`, `INDEXER_DID` referenced but undeclared. Is each load-bearing for a code path? If yes, declare. If a route silently fails when the env is missing, document the failure mode.
- Logging consistency — does every new route use `console.error("[Route] …", err)` with a route-tagged prefix per AGENTS.md §25?
- Error contracts — every successful response is either `{ success: true }` or domain data; every error is `{ error: string }`. Are the new routes shape-consistent?

### 6. Performance & accessibility (my own sequential pass, agent F) — apply lighter

Justification specific to this codebase:
- I can't load-test or profile tonight. But I can flag obvious wins: avoidable N+1s in the new hooks; heavy synchronous parsing in render paths; un-memoized callbacks across the largest components; missing `aria-*` on the new modals.
- AGENTS.md §25 has firm a11y conventions (Input/Textarea via `useId` for label binding, modals use `useFocusTrap`, dropdowns have `aria-haspopup`+`aria-expanded`, icon-only buttons need `aria-label` or `title`). I will check every modal added on this branch.
- I keep this lens lighter so I don't manufacture findings I cannot validate.

### Lenses I am **not** running tonight

- **Heavy UX / visual design** — I have no browser; the redesign decisions were already operator-driven. The brief tonight is code-quality, not product judgment.
- **Test coverage** — there are no tests in this repo. Introducing a test framework would blow the scope ceiling (Vitest + jsdom + RTL + initial fixtures + CI wiring + first non-trivial suite). I will note "tests are absent" as a deferred operator decision, not implement them tonight.
- **Documentation** — AGENTS.md is already extremely thorough. I'll only flag if new code *contradicts* documented conventions, not if new code is undocumented (the project's bias is to document via AGENTS.md, and that update belongs with the operator).
- **Bundle size / Core Web Vitals deep analysis** — out of scope without metrics infra running locally.
- **GraphQL schema review of the indexer** — that's a different repo entirely.
- **Wallet / EIP-712 attestation flow** — not on the changed surface this branch.

---

## Order of operation

1. **Diagnostic, parallel (Phase 2)** — five reviewer agents (Security, Correctness, Architecture, Reuse/Consistency, API/Operations) launched together. They read independently and produce a structured findings list per lens.
2. **Diagnostic, sequential (Phase 2, my pass)** — Performance/a11y review, informed by what the architecture lens surfaces.
3. **Consolidate (Phase 2 end)** — I merge the findings into `02-findings.md`, dedupe, recalibrate severity, sort.
4. **Triage (Phase 3)** — MUST FIX / IF TIME / WON'T FIX, with full deep-flow plans (with alternatives) for each MUST FIX.
5. **Implement (Phase 4)** — atomic commits, lowest-risk first, independent before dependent, shared-surface last. Run `tsc + lint + build` after every commit. Mini-re-review every 3–5 commits.
6. **Final re-review (Phase 6)** — fresh framing over the full diff. Update the score on the standard five dimensions.
7. **Draft PR (Phase 7)** — open into `staging`, write the body, fix CI until green.

---

## Stopping rule

Stop and freeze the diff when **any** of these is true (whichever first):

- All MUST FIX items are implemented and have passed at least one re-review with no new criticals.
- Implementation time budget (~4h 30min) is spent. Any in-progress non-atomic change gets reverted to a clean state; the branch must end the night green.
- A full review pass produces only nits — diminishing returns; move to final re-review.
- I hit something I cannot resolve without operator input. Document it as a deferred decision and move on; do not push through a guess.

I will **not** start a new MUST FIX item if I cannot complete and verify it before the budget closes. Better to leave it deferred than to leave the branch half-broken.

---

## Calibration: what counts as each severity tonight

- **Critical** — actively exploitable security issue, data corruption, write to wrong repo, auth bypass, or anything that would break a user's PDS if shipped.
- **High** — real bug or hardening gap that lands in production today; user-facing failure mode that isn't covered by an error path; pre-existing lint error in committed code; security rule violation per AGENTS.md §17.
- **Medium** — worth fixing, won't hurt to defer; correctness improvement; consistency violation; missing input validation that's defended at another layer.
- **Low / nit** — style, naming, comment, micro-perf. **I will not implement these tonight** unless they ride along with a larger change in the same file.

I will be honest about which lenses produced nothing. The brief explicitly accepts that as a valid outcome.
