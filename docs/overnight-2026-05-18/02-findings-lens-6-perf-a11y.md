# 02 — Findings (Lens 6: Performance + Accessibility)

This is the thin sequential lens I run myself (per `01-review-plan.md`). It complements the five parallel reviewer agents (Security, Correctness, Architecture, Reuse/Consistency, API/Operations). My deliberate scope: things I can validate from code only, without a browser, profiler, or screen reader.

## P-1: `useFocusTrap` is **not** required on the new `<dialog>` modals (non-finding)

- **Lens:** Accessibility
- **Location:** `src/components/leaflet/{embed-dialog,link-dialog,long-description-modal}.tsx`, `src/components/profile/{endorse-people-modal,endorse-reason-modal}.tsx`, `src/components/profile/endorsement-lists.tsx`, `src/components/settings/sync-social-graph-section.tsx`
- **Severity:** none (would otherwise be high)
- **Problem:** None — flagging in case a future reviewer worries about it.
- **Evidence:** The new modals on this branch use the native `<dialog>` element and call `dialog.showModal()` in an effect. `showModal()` provides browser-native focus trap, background inertness, and Escape-close. The pre-existing `useFocusTrap` is only needed for `<div>`-based modals (sign-in, feedback, membership-sync, add-org), which are unchanged.
- **Action:** None.

## P-2: Profile page composes ~32 stateful hooks at top level

- **Lens:** Performance / readability
- **Location:** `src/app/profile/[handle]/page.tsx` (top of file, declarations)
- **Severity:** low
- **Problem:** The page declares ~32 useState/useEffect/useMemo/useCallback/useRef at the top. Each tab unmounts/remounts on switch (assuming current tab gating) but the state-management surface is wide. Any single setState in the page re-renders all 32 closures.
- **Evidence:** `grep -cE "useState|useEffect|useMemo|useCallback|useRef" src/app/profile/[handle]/page.tsx` → 32.
- **Proposed direction:** Not tonight. Would benefit from extracting per-tab orchestration into colocated hooks, but that's a large architecture-lens decision. Architecture agent owns the call.
- **Effort:** M-L. **Risk:** medium (load-bearing file). **Reversibility:** hard once split.
- **Action:** Deferred — defer to architecture lens.

## P-3: `mergeMaps` is recomputed each render when refs flip — the "useMemo would do this" path

- **Lens:** Performance
- **Location:** `src/hooks/use-user-indexer-activities.ts:178-202` (function `useMergedDidsMap`)
- **Severity:** medium (paired with C-? from correctness agent — the same code is a lint error site)
- **Problem:** Same code as the known lint error. The custom "useState + useRef compare-and-update during render" pattern reimplements `useMemo` with referential dependency tracking. The `useMemo` version is shorter, lint-clean, semantically identical, and React Compiler-friendly.
- **Evidence:** Current:
  ```ts
  const [merged, setMerged] = useState<Map<string, string>>(() => mergeMaps(a, b))
  const lastRef = useRef<{ a: typeof a; b: typeof b } | null>({ a, b })
  if (lastRef.current?.a !== a || lastRef.current?.b !== b) {
    lastRef.current = { a, b }
    setMerged(mergeMaps(a, b))
  }
  return merged
  ```
  Cleaner:
  ```ts
  return useMemo(() => mergeMaps(a, b), [a, b])
  ```
- **Proposed direction:** Replace with `useMemo`. Resolves all 5 lint baseline errors in this file at the same time. Behavior identical (both recompute when either reference flips).
- **Effort:** S. **Risk:** low. **Reversibility:** easy.
- **Action:** MUST FIX (also covered by Correctness lens; this is a duplicate intentional surfacing so the implementation phase remembers the cross-lens consensus).

## P-4: Dead ternary in `useSocialGraphSync` `refetch`

- **Lens:** Performance / dead code (the actual lint error)
- **Location:** `src/hooks/use-social-graph-sync.ts:77-79`
- **Severity:** medium
- **Problem:** `refetch` reads `bluesky` only to feed a ternary whose two branches are identical (`Promise.resolve()`). The closure capture of `bluesky` is what trips the React Compiler memoization-preservation check at line 77:31. Removing the dead branch unblocks compiler memoization and removes the (correct) lint error.
- **Evidence:**
  ```ts
  const refetch = useCallback(async () => {
    await Promise.all([certified.refetch(), bluesky ? Promise.resolve() : Promise.resolve()])
  }, [certified])
  ```
- **Proposed direction:** Drop the ternary and the `bluesky` capture:
  ```ts
  const refetch = useCallback(() => certified.refetch(), [certified])
  ```
  Comment explaining why `bluesky` has no refetch is already in place (lines 80-83); preserve it.
- **Effort:** S. **Risk:** low. **Reversibility:** trivial.
- **Action:** MUST FIX (also surfaced by Correctness; duplicate intentional).

## P-5: CSP `script-src 'unsafe-inline'` — known and pre-existing (non-finding for this branch)

- **Lens:** Performance / security (light)
- **Location:** `next.config.ts:36-44`
- **Severity:** none for this branch
- **Problem:** None — the branch's CSP change touches only `frame-src` (adds YouTube/Vimeo). `'unsafe-inline'` in `script-src` and `style-src` is unchanged and pre-existing. Not in scope tonight.
- **Action:** None.

## P-6: `<img>` use is exactly one tag, with `alt=""` for decorative

- **Lens:** Accessibility / performance (Next/Image vs raw img)
- **Location:** `src/components/profile/profile-projects.tsx:277`
- **Severity:** none (informational)
- **Problem:** The codebase uses `next/image` for all non-decorative images. The single `<img>` is decorative (`alt=""`) with `loading="lazy"` and an error fallback. That's correct.
- **Action:** None.

## P-7: Hardcoded 10 000-record cap in `listFollowing` truncates silently

- **Lens:** Correctness / UX edge case
- **Location:** `src/lib/atproto/follow.ts:~148` (`listFollowing` safety cap)
- **Severity:** low (most users won't approach this; the value is generous)
- **Problem:** When the cap is hit, the function returns the truncated list with no indicator. The UI doesn't render a "showing first 10k" hint. Bluesky users with high follow counts could be affected.
- **Evidence:** The cap is hardcoded; no surfaced flag in the returned shape.
- **Proposed direction:** Make the function return `{ subjects, isTruncated: boolean }` and surface the flag in `useFollowing`. Display a small notice in the consumer UI when truncated. Not tonight unless a free-rider.
- **Effort:** M (touches hook return shape and consumers). **Risk:** med. **Reversibility:** easy.
- **Action:** Defer unless free rider.

## Lens summary

- 0 critical, 0 high, 2 medium (P-3, P-4 — both reinforce Correctness findings), 1 low (P-7), 3 non-findings (P-1, P-5, P-6).
- Performance and accessibility on the new code are **well-handled**. The native `<dialog>` choice is a clean answer to the focus-trap requirement. Memoization is used appropriately in the heavy components. The only real issues are the two lint baseline sites, both of which are also Correctness findings and both of which are S-effort, low-risk fixes.
- I will not implement P-2 (page.tsx split) or P-7 (truncation surfacing) tonight unless a stronger architectural finding pulls them in.
