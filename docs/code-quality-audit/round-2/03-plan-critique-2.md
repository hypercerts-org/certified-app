# Round 2 — Plan v2 critique

Second review pass. Looking for issues that a v3 should address.

## C9: T01 fix shape — `useEffect` vs `useLayoutEffect`

The latest-ref pattern is `useEffect(() => { ref.current = value })`. The effect runs after paint. There's a microsecond window between a render that changed `onClose` and the effect that updates the ref where a synchronous event could call a stale callback. **Microsecond is not "shipping risk"** — popover clicks aren't sub-frame events. Going with `useEffect`. If we wanted to be perfectly synchronous, `useLayoutEffect` works too. Either is correct.

## C10: T05 needs the build gate to catch RSC failures

Dropping `"use client"` from `cert-icon.tsx` and `loading-spinner.tsx` could fail at build time if either's transitive imports (`@tabler/icons-react`, `lucide-react`) emit `"use client"` themselves. The build will surface this. **No code change needed in the plan — just verify before commit.**

## C11: T19 verification — is `useClickOutsideClose` already used here?

The explore-page popover is the one called out by A1 in findings. `useClickOutsideClose` IS used by other popovers in the redesign. If the explore popover is NOT using it, the fix is to adopt it (one-liner). If it IS using it, then the agent's finding is wrong and the popover already has Escape. **Verify first; fix only if real.**

## C12: T13 — onCancel → onClose rename. Are there callers I might break?

The rename is across the dialog's public prop. Every caller passing `onCancel={...}` becomes a TypeScript error. **TS will catch this**; updating callers is mechanical. Should be one commit.

## C13: T06 — what does `error.tsx` look like in Next.js 16?

Next.js 16 segment error boundary spec: must be a Client Component, receives `{ error, reset }`, renders a fallback UI. The `reset` callback re-renders the segment. The shared fallback should accept a title, an error string (extracted from error.message), and a reset callback. **Plan's helper component is correctly scoped.**

## C14: Net-new risks

- None of the Tier-1 tracks change observable behavior aside from
  T04a (focus-restore). T04a's risk is "after closing a modal, focus
  doesn't return to the right place" — easy to test manually.
- Tests added in T07-09 can't regress prod behavior, only catch
  regressions.

## Net judgement

The plan is shippable as-is. v3 adopts these clarifications inline
but no structural changes. **Promote v2 to v3.**

## v3 = v2 plus

1. T01 uses `useEffect` for the latest-ref pattern (not layout).
2. T05 will be reverted per-file if RSC build catches an issue.
3. T19 verified before changes — fix only if real.
4. T13 includes caller-side TS sweep.
5. T06's shared fallback signature: `{ title, message, onReset }`.
