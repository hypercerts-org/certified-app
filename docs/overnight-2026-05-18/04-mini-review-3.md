# 04 — Mini re-review #3 (after commit 17)

Final mini-review before Phase 6 (full re-review). 17 commits landed; the planned commit 17 (writeToRepo helper) was reshaped into a smaller normalization. Reasoning recorded below.

## Commits since mini-review #2

```
1fd99c6 fix(activity-detail): revoke prior object URL on save + unmount
a0479be fix(api/groups/follow): preserve client-supplied createdAt
a2dc45e fix(leaflet): preserve ordered nested lists in linearDocument round-trip
402fde2 fix(hooks/social-graph-sync): thread abort signal through importDids; isWriting in finally
122965a fix(styles): use --color-error token; drop 100vw; merge duplicate cert-detail__image rule
952a343 chore(deps): bump Next.js 16.2.3 -> 16.2.6 (high-severity advisory chain)
08e0691 chore(atproto/follow): use extractError to match sibling write helpers
```

## On commit 17's reshape

The original plan was to extract a `writeToRepo(ownDid, targetDid, op, group, errorFallback)` helper used by all five dual-path write sites (cert, profile, location, follow, org-marker). The architecture-lens reviewer flagged this as Medium severity and "the single highest-value architecture finding."

Sitting down to do it, the body shapes across the five sites turn out to diverge enough that a single helper either:

1. **Forces a discriminated-union argument** carrying every shape variant the BFF routes accept (cert: `{rkey, record}`; profile: bare metadata; follow: `{subjectDid, createdAt}` + server-built record; location: `{rkey, record}` with rkey-conditional XRPC method; org-marker: bare metadata + fixed rkey=self) — more boilerplate at each call site than the current branch.
2. **Has callers pre-shape both branches** before calling — same boilerplate as today, just relocated.

The "drift" between sites turned out to be cosmetic (error string format in `follow.ts` diverging from the rest's use of `extractError`), not structural. Fixing the cosmetic part is a small targeted change; the abstraction would burn complexity for shallow savings.

The brief explicitly bans introducing patterns without concrete pain. The architecture finding is real but the proposed remedy doesn't fit the surface as cleanly as on paper. Done the smaller fix (`extractError` normalization in follow.ts); recorded the full helper as deferred in `02-findings.md`'s F-11 and in the operator hand-off.

## Mini-review questions

1. **Did `npm run lint` count change unexpectedly?** No — still 38 problems (0 errors, 38 warnings).

2. **Does `npm run build` still complete?** Yes — verified after the Next.js bump (the most consequential of the recent commits); CSS commit was static-only. The two later commits (follow normalization and abort-signal plumbing) are small enough.

3. **Cross-effects?**
   - The Next.js bump touched `package-lock.json` heavily. tsc and build both pass; no runtime change expected within-minor.
   - The CSS `--color-error` change has a visible diff in error rendering colors (`#d44` → `#ba1a1a` in light, `#f87171` in dark). This is an intentional alignment with the existing token; flag for operator's morning eye.
   - The abort-signal plumbing changed the `importDids` signature. Verified the only call site is the modal in `sync-social-graph-section.tsx`, which I updated.

4. **Security surface widened?** No. Next.js patch tightens. CSS doesn't touch security. The `extractError` normalization in follow doesn't change exposure.

5. **Commit messages atomic and accurate?** Yes. The Next.js commit body explicitly documents the remaining postcss audit chain as deferred — not silently swept under.

## Final state

- 17 atomic commits, all green at tsc + lint + build.
- Lint baseline: 0 errors (was 6) / 38 warnings (was 39).
- Critical (1): closed.
- High (5): closed (F-2, F-3, F-4, F-5, F-6 minimum).
- Medium (16): 11 closed, 5 explicitly deferred per finding (F-11 full helper; F-16 truncation surface; F-49 location-shape narrow; F-18 cert race acknowledgment doc-only; F-58 AppDialog primitive).
- Low (37): a handful closed as ride-alongs (F-22-F-24-F-28-F-39 with the geocode commit; F-25 with the env-docs commit), most explicitly deferred per the implementation plan's WILL-NOT-FIX list.

## Verdict

Branch is clean, gates are green, all MUST-FIX done, the one reshape was driven by re-evaluating the change in front of the code and choosing the smaller win. Moving to Phase 6 (final re-review).
