# Round 2 — Plan v1

Tracks are admissibility-tiered. Each carries an explicit file
ownership set so parallel execution doesn't collide. Tracks land in
roughly the order listed unless cross-dependencies force a re-order.

## Tier 1 — must ship (regression fixes + a11y blockers + test floor)

### R2-T01 — Fix lint regression: ref-during-render in `useClickOutsideClose`
Files: `src/hooks/use-click-outside-close.ts`. Move the `onCloseRef.current = onClose` write into a `useEffect`. Verify: lint loses 1 error.

### R2-T02 — Fix lint regression: `useExplore` memoization
Files: `src/hooks/use-explore.ts`. The 4 react-compiler errors at line 318 + the 2 exhaustive-deps warnings are the same root cause: `loadMore` and the load effect capture `excludeCertLabels` / `includeCertLabels` / `excludeOrgLabels` / `includeOrgLabels` via closure without listing them as deps. Solution: thread the labels through a ref OR list them as deps. Verify: lint loses 4 errors + 2 warnings.

### R2-T03 — Fix ref-during-render in `src/app/create/page.tsx`
Files: `src/app/create/page.tsx`. Same shape as T01 but in a component body. Move into useEffect.

### R2-T04 — AppDialog focus trap
Files: `src/components/ui/app-dialog.tsx`. Add a simple focus trap: on mount, save the previously-focused element; on close, restore it. Track focusable elements inside the dialog; Tab/Shift-Tab wrap. Native `<dialog>` provides part of this but not in all browsers. Keep the existing `onClose` API.

### R2-T05 — Drop unneeded `"use client"` directives
Files: `src/components/ui/cert-icon.tsx`, `src/components/ui/loading-spinner.tsx`. Drop the directive and confirm both still render. RSC-correctness win.

### R2-T06 — Segment error boundaries: /home, /explore, /profile/[handle], /endorsements (if exists)
Files: `src/app/home/error.tsx` (new), `src/app/explore/error.tsx` (new), `src/app/profile/[handle]/error.tsx` (new). Each renders a small "couldn't load this page" surface with a Retry button. Common helper in `src/components/ui/error-boundary-fallback.tsx`.

### R2-T07 — Test: `parseActivityUri`
Files: `src/lib/atproto/__tests__/activity-uri.test.ts` (new). Cover: well-formed URIs, malformed (bad prefix, wrong parts count, missing did/rkey), the `parseActivityUri` vs `parseAtUri` alias path, `activityDetailHrefFromUri` collection guard.

### R2-T08 — Test: `getInitials`
Files: `src/lib/utils/__tests__/initials.test.ts` (new). Round-1 extracted this without tests. Cover: multi-word, single-word, empty, null DID fallback, DID-only fallback.

### R2-T09 — Test: `useUrlParam` 
Files: `src/hooks/__tests__/use-url-param.test.tsx` (new). Cover the M1 fix (empty-string semantics when defaultValue is non-nullish vs nullish), defaultValue drop, push vs replace mode override. First hook test in the repo.

## Tier 2 — promote if time allows

### R2-T10 — Test: `extractAwardSubjectDid`
Files: `src/lib/atproto/__tests__/badges.test.ts` (new). Cover the three union shapes + null/malformed.

### R2-T11 — Test: `parseSubjectInput` already exists — verify and grow if gaps
Files: `src/lib/utils/__tests__/parse-subject-input.test.ts`. Audit for missed edge cases (Bluesky URLs, did:web, leading whitespace).

### R2-T12 — URL-drive home-feed quality + evaluator filters
Files: `src/components/home/home-feed.tsx`. Replace `useState` for `includedTiers` and `selectedEvaluators` with `useUrlParam`-backed state. Filter selections become shareable. Behaviour must match: omitted param = default state.

### R2-T13 — Standardize prop API on extracted shells
Files: `src/components/profile/endorse-reason-modal.tsx`, `src/components/leaflet/link-dialog.tsx`. Rename `onCancel` → `onClose` to match `AppDialog` + the other modals.

### R2-T14 — Surface error state in HomeFeed
Files: `src/components/home/home-feed.tsx`, `src/hooks/use-home-feed.ts`. The hook already has `error` in state; the renderer ignores it. Add a small "couldn't load feed" inline error path.

## Tier 3 — investigate, may decline

### R2-T15 — Drop `@tabler/icons-react`
Files: `src/components/ui/cert-icon.tsx`, `package.json`. Replace single Tabler icon import with the closest Lucide equivalent. Decision point: does Lucide have a comparable cert/seal icon, and is the visual close enough? If yes, ~43KB win.

### R2-T16 — Test: `swap-drafts` (`computeDirtyFields` / `shallowEqual`)
Files: `src/lib/utils/__tests__/swap-drafts.test.ts` (new). Per round-1 H11.

### R2-T17 — Test: `saveWithSwap`
Files: `src/lib/atproto/__tests__/save-with-swap.test.ts` (new). 40-50 lines. Big test surface — mocks needed for the underlying agent.

## Out of scope

- `saveWithSwap` test (T1) and `ensureEndorsementDefinition` test
  (T2 from findings) are tracked but Tier 3 due to scope. May land
  T-17 if time; T2 likely deferred.
- 49 `react-hooks/set-state-in-effect` warnings: deferred again,
  same rationale as round 1.
- 10 `@next/next/no-img-element` warnings: deferred, same rationale.
- 700–1200 LOC file splits: deferred, same rationale.
