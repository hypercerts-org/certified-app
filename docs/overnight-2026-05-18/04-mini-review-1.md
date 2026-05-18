# 04 — Mini re-review #1 (after commit 5)

Five commits in. Check-back per the plan's checkpoint cadence.

## Diff snapshot

```
b85d45f docs(env): declare missing env vars in .env.local.example
65630f3 chore(lint): clear baseline by replacing ref-during-render and broken memoization
e43edba fix(leaflet): scheme-allowlist user-controlled URLs in renderer + editor
94ba191 fix(api): echo 4xx upstream messages and clamp status in extractRouteError
eee165d fix(api): drop duplicate console.error in three group routes; rely on extractRouteError logSafe
```

## Mini-review questions

1. **Did `npm run lint` count change unexpectedly?** Yes, expectedly: from `45 problems (6 errors, 39 warnings)` to `38 problems (0 errors, 38 warnings)`. The 6 errors are eliminated (commit 2). One warning dropped — likely a related react-hooks/refs warning on the same line as the eliminated error.

2. **Does `npm run build` still complete?** Yes. Compiled in 3.5s; 41/41 static pages.

3. **Did any of the just-committed files cross-affect a hook or component I didn't touch?**
   - `extractRouteError` is consumed by every group BFF route, the geocode route, and the notifications route. The 4xx-echo policy change is semantically broader behavior across all of them — users now see actionable upstream validation messages instead of generic strings. Inspected each consumer briefly; no caller assumes the old generic strings.
   - `safeHttpUrl` was already an internal helper; introducing six new call sites doesn't widen its API.
   - The two lint commits touched two hooks; the destructuring in `use-social-graph-sync` changed the closure shape but no public API.

4. **Did I inadvertently widen any security surface?** No. Three commits are tightening (XSS allowlist, 4xx clamp/redact, logSafe coverage). Two are docs / lint. The 4xx echo could be argued to leak more upstream detail, but it passes through `redactSecrets` and is exactly what AGENTS.md §17 #7 prescribes.

5. **Are the commit messages atomic and accurate?** Yes. Each commit does one named thing. The XSS commit is the largest (7 files) but the surface is conceptually unified — every site where user-controlled URLs cross the renderer/editor boundary.

## Cross-effects worth a second look

- The 4xx echo change interacts with the `geocode` route's planned commit 7 — that commit will use the helper too. No conflict; the helper improvement is upstream.
- The `safeHttpUrl` integration touches both directions of the linearDocument codec; commit 13 (preserve ordered nested lists) will touch the writer side. No conflict.

## Verdict

On track. Lint baseline is now clean, the critical XSS is closed, and the most consequential API helper has been tightened. Continuing with commits 6-8 next.
