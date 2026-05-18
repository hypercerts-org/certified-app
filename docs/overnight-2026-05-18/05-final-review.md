# 05 — Final re-review

Fresh-eyes pass over the 17 commits between `ad6668c` and HEAD on
`feat/positioning-redesign`. I have not read the earlier reviewer
passes' calibrations; what follows is from reading the diffs and code
under cwd, not from believing what was said.

---

## Per-commit walk

1. **`b85d45f` docs(env): declare missing env vars** — Adds `INDEXER_URL`,
   `INDEXER_DID`, `NEXT_PUBLIC_INDEXER_URL`, `NEXT_PUBLIC_STADIA_API_KEY`,
   and the group-service pair to `.env.local.example`. Docs-only. No
   runtime change. **Risk: none.**

2. **`65630f3` chore(lint): clear baseline** — `useMergedDidsMap` collapses
   to `useMemo(() => mergeMaps(a, b), [a, b])`; `useSocialGraphSync`
   destructures `useFollowing` / `useBlueskyFollows` and drops a dead
   `bluesky ? Promise.resolve() : Promise.resolve()` ternary. Hook return
   contract is unchanged (same field names + types in the returned
   object). I checked the call sites: `sync-social-graph-section.tsx`
   only reads `stats`, `isLoading`, `error`, `refetch`, `importDids`,
   `certifiedCount`, `blueskyCount` — all preserved. **Risk: low.**

3. **`e43edba` fix(leaflet) scheme-allowlist user-controlled URLs** —
   Seven files touched, applying `safeHttpUrl` at every emit/persist
   point. Renderer fallbacks degrade to `<span>` on rejection (content
   stays visible, no one-click attack). Editor's `insertContent` path
   now mirrors what TipTap's `setLink` validates. Writer + reader both
   defend, so a malicious foreign record neither persists into the
   user's repo on save nor renders as an active anchor on read. CSS
   adds a new `.link-dialog__error` matching the existing hint style.
   No other render path emits user-controlled `href`: I grepped for
   `href={` across `src/components/leaflet/`, `feed/`, `profile/` —
   the only non-`<Link>` `<a href>` in the changed feature surfaces is
   `location-card.tsx`'s `osmUrl(coords)` which is server-built from
   numeric coords. Iframe `src=` on lines 250 / 80 of the two
   leaflet files is reached only after `isAllowedEmbedHost`
   (hostname allowlist) passes — `javascript:` has no hostname and is
   rejected. **Risk: low; this is purely tightening.**

4. **`94ba191` fix(api) extractRouteError 4xx + clamp** — 4xx now echoes
   `err.message` (passed through a local Bearer/DPoP/JWT redactor)
   instead of a generic string; status clamped to `[200,599]` else
   500. Touches one helper used by 14 routes (see grep output). I
   checked downstream string-equality consumers: only
   `use-org-marker.ts:79` does `body?.error === "RecordNotFound"`, and
   that catches an *upstream* xrpc error (which gets echoed verbatim
   under the new policy — better, not worse). No caller depends on
   the old generic `"Bad request"` / `"Not found"` text. The
   redactor's regexes are anchored on token shapes, not status text,
   so they don't strip legitimate validation messages. **Risk: low.**

5. **`eee165d` fix(api) drop duplicate console.error** — Three group
   routes (`profile`, `metadata`, `upload-blob`) drop their bare
   `console.error(label, err)` and pass a route-tagged prefix to
   `extractRouteError` instead, so `logSafe` (with redaction) handles
   the logging. Behavior change: error logs are slightly shorter and
   one redaction-bypass path closed. **Risk: none.**

6. **`89da494` fix(api/groups/activity) allowlist** — `ALLOWED_ACTIVITY_FIELDS`
   pulled from the `ClaimActivity` lexicon, routed through the
   existing `pickAllowedFields` helper. Field set looks complete
   against `src/lib/atproto/activity-types.ts`. If the cert-edit form
   ever sends a key not in the list it'll be silently dropped — I'd
   flag this as the highest-attention spot for the next manual smoke
   pass (try editing and saving a cert in every supported field).
   **Risk: low if the lexicon list is faithful; medium if a field
   was missed — would silently drop on save.**

7. **`048855b` fix(api/geocode)** — Adds `getSessionDid()` gate (returns
   401 anonymously). Replaces `parseInt` with `Number()+isInteger` on
   the limit. Replaces `Upstream returned ${status}` body with a
   generic message, with the status moved into `logSafe`. Replaces
   bare `console.error` with `logSafe`. Also adds `logSafe` to the
   silent `client.restore` failure in `proxy-agent.ts`. The only
   caller is `src/lib/locations/geocode.ts`. **Risk: low.**

8. **`c404817` fix(api/indexer) mutation gate + prod warn** —
   `isLikelyMutation()` strips leading whitespace and `#` line
   comments, then checks the first 8 chars. Defeats the obvious
   smuggling vector. Caveats worth noting: a multi-operation document
   `query A { … } mutation B { … }` with `operationName: "B"` would
   bypass the prefix check; the GraphQL spec then requires
   `operationName` for execution, but a non-strict upstream might
   default to the first op. The commit body explicitly defers the full
   allowlist restructure. Acceptable as a bare-minimum guard.
   **Risk: low; not a complete mutation block, but the comment says so.**

9. **`24a8084` fix(leaflet/editor) preserve cursor** — Compares
   `toInitialDoc(value)` against `editor.getJSON()` rather than a
   stored ref. `shallowEqual` is `JSON.stringify` equality. Concern:
   if `linearDocumentToTipTap` ever emits a doc that is semantically
   identical to what the editor currently holds but differs in some
   default attr (e.g. `attrs: { level: 1 }` vs absent), `shallowEqual`
   reports inequality and `setContent` fires unnecessarily. For typed
   text this round-trips cleanly. External replacements (parent
   resets `value` to a wholly different doc) still flow through —
   `current` is the old typed text, `next` is the new doc, they
   differ, setContent runs. **Risk: low for the common path; an
   asymmetric round-trip is the lurking risk and would be visible as
   a still-resetting cursor in some narrow case (e.g. headings).
   Worth a manual smoke pass.**

10. **`ac72a8c` fix(hooks/use-session) clear on sign-out** — Three
    `setX(null)` calls added to the sign-out branch. Correct fix for
    a real bug. **Risk: none.**

11. **`fc4d746` fix(locations) authFetch for geocode** — Three sites in
    `geocode.ts` switched from `fetch` to `authFetch` so the new 401
    from commit 7 surfaces through the expiry UI. **Risk: none.**

12. **`1fd99c6` fix(activity-detail) revoke object URLs** — Save path
    revokes prior `localImageUrl` before promotion. Unmount cleanup
    uses refs (`pendingImagePreviewUrlRef.current = …` reassigned
    every render, then the unmount-only effect closes over the
    current value). The refs are *written* during render — under React
    19 strict mode the render may run twice, but assignment is
    idempotent and the refs are unmount-scoped, so no leak / no double
    revoke. The `b !== a` guard prevents double-revoke when pending
    was promoted to local before unmount. **Risk: low.**

13. **`a0479be` fix(api/groups/follow) preserve client createdAt** —
    Additive (optional `createdAt` on body, validated via `Date.parse`).
    `createFollow` plumbs the param through. **Note: latent — the sole
    consumer that would benefit (`useSocialGraphSync.importDids`) does
    not pass `createdAt` because `useBlueskyFollows` only returns a
    `Set<string>` of DIDs, no timestamps.** The plumbing is correct
    and ready for the day Bluesky follow records carry through with
    their `createdAt`. **Risk: low; latent value.**

14. **`a2dc45e` fix(leaflet) ordered nested lists** — Writer splits
    nested `bulletList` → `children` vs `orderedList` →
    `orderedListChildren.children`, mirroring the reader's existing
    asymmetric branch. Type-checked against
    `src/lib/leaflet/types.ts:ListItem`. **Risk: low.**

15. **`402fde2` fix(hooks/social-graph-sync) abort + isWriting** —
    `importDids` takes `opts?: { signal? }`, checks `signal.aborted`
    between iterations. `SyncModal` owns an `AbortController`,
    aborts on unmount. `setIsWriting(false)` moves into `finally`
    so a refetch failure no longer leaves the modal stuck. The hook
    return-type expansion (`importDids` now `(dids, opts?) => …`) is
    additive — the existing single-arg call site in
    `sync-social-graph-section.tsx` is updated; no other callers exist
    (grep confirms). **Risk: low.**

16. **`122965a` fix(styles) `--color-error` + drop `100vw` + merge dup
    rule** — 16 replacements of `var(--danger, #d44)` with
    `var(--color-error)`. `--danger` was undeclared so `#d44`
    dark-mode-broken color was always used; new behavior gets proper
    theming. `100vw` → `100%` in `.long-description-modal`. Duplicate
    `.cert-detail__image` merged. **Semantic concern: 14 of the 16
    replacements are clearly error/destructive (revoke, remove,
    failed, error). Two are `--counter--warn` classes
    (`endorse-people-modal__reason-counter--warn` and
    `endorse-reason-modal__counter--warn`) on character-count
    "approaching limit" UI — semantically a warning, not an error. The
    project has a `--color-warning` token (`tokens.css:87`,
    light `#F5A623` / dark `#fbbf24`).** This was wrong with `--danger`
    too, but the rename cements the wrong semantic and makes the
    "this is meant to be a warning" intent harder to recover. Not a
    regression; pre-existing semantic drift. Trivial fix:
    `--counter--warn` → `var(--color-warning)`.

17. **`952a343` chore(deps) Next 16.2.3 → 16.2.6** — Patch-within-minor.
    The commit body correctly identifies that none of the patched
    advisories (CSP-nonce XSS, cache poisoning, middleware bypass)
    map onto this app's surface (no middleware, no CSP nonces, no
    Image Optimization disk cache). Verified `npm audit` drops to
    3 moderate (all postcss-via-next), tsc clean, lint baseline
    unchanged, build green. **Risk: low.**

18. **`08e0691` chore(atproto/follow) extractError** — Two inline
    `data.error || ${fallback}: ${res.status}` blocks in
    `createFollow`, plus the one in `deleteFollow`, replaced with
    `await extractError(res, fallback)`. Splits "transport failure"
    from "upstream returned no record reference" into distinct
    throws so log greps can tell them apart. **Risk: none.**

---

## New issues introduced this night?

Two minor items, both pre-existing in nature but worth flagging.

- **F-A (low, semantic):** Commit 16 (CSS rename) sweeps two
  `--counter--warn` classes into `var(--color-error)` along with the
  legit error classes. These are character-counter "approaching the
  limit" UI; the project already has `--color-warning` tokens for
  exactly this. Two-line fix in `profile-endorsements.css:1073` and
  `:1368`. The previous `var(--danger, #d44)` was equally wrong;
  this commit didn't introduce the drift, it just cemented it.

- **F-B (informational):** Commit 13 (`createdAt` plumbing through
  `createFollow` and the group BFF) is fully wired API-side but the
  only consumer that would care (`useSocialGraphSync.importDids`)
  doesn't pass a timestamp because `useBlueskyFollows` returns DIDs
  without their original record timestamps. The new field is latent
  until the bluesky-follows hook surfaces `createdAt`. Not a bug;
  just a "completed plumbing for a downstream change that hasn't
  landed yet."

I looked for these specifically and did not find:

- Any newly-introduced `<a href={userControlled}>` outside the
  guarded leaflet sites.
- Any hook-return contract drift in commits 2 or 15.
- Any caller that breaks on the `extractRouteError` message change.
- A stale closure on the object-URL refs in commit 12.
- Any consumer of `/api/geocode` not updated to `authFetch`.
- A breaking change in Next 16.2.4-6 that touches this codebase.

---

## Verification: gates green?

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | **PASS** (exit 0, no output) |
| `npm run lint` | **38 problems: 0 errors, 38 warnings** — matches the target |
| `npm run build` | **PASS** (with dummy `.env.local`, all 27 API routes + static pages built) |
| `npm audit` | 0 high, 3 moderate (all postcss-via-next; documented as deferred) |

Gates match the brief's target exactly. Lint went from `45 / 6 errors`
to `38 / 0 errors`; no new warnings introduced.

---

## Scoring: before vs. after

- **Problem framing:** **before 7 / after 8.** The orientation+findings
  docs framed the work crisply: each finding has a site, a severity,
  a proposed direction, and a "what I'd want a reviewer to focus on"
  trail. The commits read the same way — each message has a
  before-and-after explanation a reviewer can follow without context.

- **Approach:** **before 7 / after 8.** Chose defense-in-depth on the
  XSS (renderer + editor + (de)serializer + dialog) rather than
  patching only the most-visible site. Chose the minimum
  mutation-block on the indexer rather than the full restructure
  (and said so in the commit body). Chose to use `useMemo` rather
  than disable the lint rule, and to use refs-not-deps on the
  unmount-only object-URL cleanup with an explanation of why a
  deps array would be wrong. All of these are real engineering
  choices made the right way.

- **Code quality:** **before 7 / after 8.** Helpers reused
  (`safeHttpUrl`, `pickAllowedFields`, `extractError`,
  `extractRouteError`, `logSafe`); shared token used
  (`--color-error`). Comments explain the why of every non-obvious
  change. Two small drag points: (a) the `--counter--warn` semantic
  drift noted above; (b) the `shallowEqual = JSON.stringify`
  comparison in the cursor-preservation fix is correct for the
  common case but doesn't survive `attrs`-default asymmetries
  between TipTap's emit and `linearDocumentToTipTap`'s output. Neither
  is bug-shaped today; both are the next reviewer's nit pile.

- **Robustness:** **before 6 / after 8.** Concrete steps up: XSS
  closed at the boundary AND on the write/read paths; group BFF
  activity route no longer mass-assigns; geocode no longer leaks
  Nominatim quota; indexer no longer accepts trivial mutation
  smuggling; geocode 401 surfaces through the expiry UI; object URLs
  no longer leak through the page lifetime; sign-out no longer leaks
  stale identity to long-lived consumers; ordered nested lists no
  longer round-trip as bullets; abort path on social-graph sync;
  `extractRouteError` no longer hides actionable upstream messages
  or emits non-standard status codes.

- **Evolvability:** **before 6 / after 7.** The dual-path
  `writeToRepo` helper (F-11) was considered and deferred with a
  written rationale (call sites diverge in body shape such that one
  helper would burn complexity for shallow savings) — the minimum
  slice landed as `extractError` normalization on follow.ts. That's
  a defensible call. Activity field allowlist is now grep-able and
  the obvious "where do I add a new activity field" lives in one
  array. The leaflet renderer/editor split now has a single
  scheme-allowlist seam (`safeHttpUrl`) that any future code
  adding `<a>` to user content can grep for. Negative: no test
  suite was introduced, so all of these are still un-pinned
  against regression. That's a known operator-decision, not a
  reviewer finding.

---

## Verdict

A tight, honest night's work. The 17 commits cluster around one
critical (leaflet XSS) closed across all the right sites, two
operability holes patched (geocode auth, indexer mutation gate), a
handful of real bugs fixed (cursor reset, object-URL leak, stale
session identity, ordered-list round-trip, abort-on-unmount), and a
broad set of small hygiene improvements (extractRouteError policy,
console.error → logSafe, CSS token reuse, mass-assignment
allowlist, ordered-nested lists). Every commit has a clear scope, a
before/after explanation, and respects the documented conventions
(`Co-Authored-By`, no emojis in code, `safeHttpUrl` at the boundary,
`logSafe` over bare console.error, `--color-error` over hard-coded
hex). Gates match the brief's target (tsc clean, 38/38 lint with
0 errors, build green, audit 0 high).

Two minor things worth landing as a follow-on if the operator has
budget: (a) `--counter--warn` classes should be `var(--color-warning)`
not `var(--color-error)`; (b) the `createdAt` plumbing through
`createFollow` is latent until `useBlueskyFollows` surfaces the
original timestamp. Neither blocks merge.

My recommendation: this is mergeable into staging as-is; the human
reviewer's attention is best spent on (1) manually exercising the
cert-edit form to confirm the activity field allowlist isn't dropping
anything legitimate, and (2) typing a paragraph plus a heading in the
leaflet editor to confirm the cursor-preservation fix holds across
node types.
