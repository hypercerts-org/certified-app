# Full review & refactor prompt — certified-app (2026-07-02)

This document is the executable prompt for a full-codebase review and refactor of
certified-app. It is written to be handed to an orchestrated multi-agent review
harness: each numbered dimension below becomes one reviewer's charter, every finding
is adversarially verified before it is believed, and only confirmed, worthwhile
findings are implemented.

## Mission

Review the entire certified-app codebase across security, performance, usability,
correctness, code quality, design-system conformance, testing, and Next.js
architecture. Then implement the confirmed, high-value, low-regression-risk
improvements directly on the `staging` branch, one commit per logical track.
Findings that are real but too large or risky for this pass are documented and
deferred, not silently dropped.

## Context the reviewers must know

- Next.js App Router app (React 19, TypeScript), the client for an ATProto-based
  hypercerts stack. Talks to a PDS, a group service (CGS), and a magic-indexer
  service (separate repos). Auth is ATProto OAuth + app-password flows; group
  ("org") accounts are operated via server-held sessions (`src/lib/auth/group-account-session.ts`,
  `src/lib/groups/proxy-agent.ts`).
- Scale: ~595 TS/TSX files (~118k lines), 31 CSS files, 44 API route handlers,
  108 test files / 937 tests.
- Verified baselines on `staging` @ `6788152` (2026-07-02):
  - `npx tsc --noEmit` — clean.
  - `npm run lint` — 64 warnings, 0 errors (mostly `react-hooks/*`).
  - `npm test` — 937/937 pass in ~18 s.
- Largest files (prime refactor/perf suspects): `src/components/feed/activity-detail.tsx`
  (2282), `src/components/explore-page/explore.tsx` (2111), `src/app/api/indexer/route.ts`
  (1817), `src/hooks/use-explore.ts` (1586), `src/components/project/project-detail.tsx`
  (1504), `src/components/profile/profile-endorsements.tsx` (1486),
  `src/components/profile/profile-lists.tsx` (1433), `src/lib/atproto/indexer.ts` (1385),
  `src/components/home/home-feed.tsx` (1372).
- Heavy client deps that should not be in shared bundles: `react-force-graph-2d`,
  `leaflet`/`react-leaflet`, TipTap (`@tiptap/*`), `d3-hierarchy`.

## Hard constraints (from CLAUDE.md / DESIGN.md — violations are review findings)

1. `border-radius` only `var(--radius)`, `999px`, `50%`.
2. No raw hex/rgb outside `tokens.css` and `landing.css`.
3. Breakpoints 800/1100/1300 only.
4. Shadows/z-index only via tokens.
5. Headings use `text-h1..h4` + `font-headline`.
6. Modals via `<AppDialog>`; no hand-rolled backdrops.
7. Icon-only buttons: `<Button size="icon" aria-label>`.
8. Dark mode (`data-theme="dark"`) must work everywhere.
9. Prefer `src/components/ui/` primitives over new one-off components/classes.
10. Desktop ≥1300 px is the visual baseline — do not change what it looks like
    except where a reviewer confirms an actual defect.

## Review dimensions

Each reviewer works read-only, cites `file:line` evidence for every finding, proposes
a concrete fix, and rates severity (critical/high/medium/low), effort (S/M/L), and
regression risk (low/medium/high). Cap at the 12 highest-impact findings per
dimension; note anything dropped by the cap.

1. **Security — API authentication & authorization.** Audit all 44 route handlers
   under `src/app/api/`. For each: is the caller authenticated, is authorization
   (group role/membership) enforced server-side, can `groupDid`/`actor`/DID
   parameters be substituted to act on another account? Pay attention to the group
   account-management routes (`account/email`, `account/handle`, `account/session`,
   `password-reset`), the indexer proxy, `upload-blob`, and the xrpc passthrough.
   Check the auth/session core: cookie flags, token storage, expiry, logout.
2. **Security — injection, SSRF, XSS, secrets, abuse.** The indexer proxy
   (`src/app/api/indexer/route.ts`) forwards client-supplied queries — what exactly
   can a client make the server fetch or execute? Check redirect/callback URL
   validation in the OAuth flow, `dangerouslySetInnerHTML`/`href` injection, blob
   upload content-type/size handling, email templating (resend), rate limiting on
   unauthenticated endpoints, secrets in client bundles (`NEXT_PUBLIC_`), and
   error responses leaking internals.
3. **Performance — rendering & client-side.** The giant components above: identify
   re-render hot spots (context misuse, unstable props, missing memoization where
   lists re-render), state design flaws, effect misuse (the 64 `react-hooks` lint
   warnings are a map — triage which are latent bugs vs. noise), unnecessary
   `"use client"` at page level, and lists without virtualization that can grow
   unbounded.
4. **Performance — data fetching, caching, bundle.** Request waterfalls and N+1
   patterns against the indexer/PDS (client hooks in `src/hooks/`, server code in
   `src/lib/atproto/`), missing `next/dynamic` for the heavy deps, cache headers /
   `revalidate` / Redis usage, duplicate fetches of the same resource per page,
   `next.config` opportunities (bundle analysis, image config).
5. **Correctness.** Race conditions and stale closures in hooks, unhandled promise
   rejections, error swallowing (`catch {}`), optimistic-update rollback, session
   refresh edge cases, pagination cursors, timezone/date handling, `JSON.parse`
   without guards on external data.
6. **Usability & accessibility.** Keyboard navigation and focus management in
   dialogs/menus/comboboxes, `aria-*` correctness, form validation and error
   recovery, loading/empty/error states for every data surface, touch targets and
   mobile ergonomics (≤799 px), dark-mode contrast, motion-reduction. Cite WCAG
   criterion where applicable.
7. **Code quality — duplication, dead code, size.** Dead exports/files/CSS,
   copy-pasted fetch/error/formatting logic that should be a shared helper,
   components duplicating `src/components/ui/` primitives, oversized files that
   should be decomposed along natural seams (only where the seam is clean —
   decomposition for its own sake is not a finding), `any`/unsafe casts on
   external-data boundaries.
8. **Design-system conformance.** Run the five CLAUDE.md grep checks; sweep for
   token drift (raw colors, radii, shadows, z-index, breakpoints, heading classes)
   and hand-rolled modal/backdrop patterns outside the sanctioned files.
9. **Testing & CI gaps.** Map test coverage against risk: which of the security- and
   money-adjacent paths (group account routes, auth callback, indexer proxy) lack
   tests? Which recent regressions had no covering test? Propose the 5–10 tests
   with the best risk-reduction per line.
10. **Next.js architecture.** Client/server component boundaries (data fetched
    client-side that could be RSC), route-handler idioms (validation, error shape
    consistency, `NextResponse` usage), metadata/SEO on public pages, middleware
    opportunities, build config correctness.

## Verification protocol

Every finding is handed to independent skeptics who try to refute it against the
actual code (does the claimed defect exist at the cited lines? is it reachable? is
severity inflated?). Critical/high findings need two skeptics with different lenses
(reachability, impact); medium/low need one. A finding survives only if not refuted.
Refuted and uncertain findings are recorded but not implemented.

## Prioritization rubric for implementation

Implement now, in this order:
1. Confirmed security defects (any effort).
2. Confirmed correctness bugs with user-visible impact.
3. Performance fixes with measurable wins and low regression risk (bundle splits,
   query dedup, render fixes).
4. Usability/a11y fixes that don't change the ≥1300 px visual baseline (or fix a
   confirmed defect in it).
5. Code-quality and conformance cleanups that are mechanical and testable.

Defer (document in the plan with rationale): large decompositions of the giant
components beyond clean seams, anything requiring cross-repo changes
(magic-indexer, CGS, lexicon), risky behavioral rewrites without test cover, new
product behavior.

## Implementation rules

- Work directly on `staging` (project convention). One commit per logical track,
  conventional scope tags, no emojis.
- Parallel implementers get **disjoint file ownership** — the plan must partition
  files explicitly; no two tracks touch the same file.
- Implementers do not run git commands; the orchestrator commits.
- Gates before each commit and at the end: `npx tsc --noEmit` clean; `npm run lint`
  ≤ 64 warnings (no new ones — fewer is a goal); `npm test` 937+ passing (new tests
  welcome, no failures); the five CLAUDE.md grep checks silent; dark mode and
  ≤799 px behavior spot-checked for touched surfaces.
- Security fixes ship with a regression test whenever the harness can express one.

## Deliverables

1. `docs/full-review-2026-07/findings.md` — all findings with verdicts (confirmed /
   refuted / uncertain), including deferred items with rationale.
2. `docs/full-review-2026-07/plan.md` — the implementation plan actually executed:
   tracks, file ownership, acceptance criteria.
3. Commits on `staging`, one per track, all gates green.
4. A final summary: what changed, measured effects (lint delta, bundle/size deltas
   where cheap to measure), what was deferred and why.
