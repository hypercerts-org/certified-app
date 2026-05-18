# 03 — Implementation plan

Phase 3 triage of `02-findings.md`. Per the deep-flow convention, each MUST-FIX item below carries a brief plan with **alternatives considered** and rationale. The rules of engagement set in `01-review-plan.md`:

- Atomic commits, scope ceiling 400 lines / 8 files.
- Lowest-risk-highest-value first, independent before dependent, shared-surface last.
- After every commit: `npx tsc --noEmit` + `npm run lint` + `npm run build`. Never carry red.
- Mini re-review every 3-5 commits → `04-mini-review-N.md`.
- Stop when budget closes or all MUST-FIX done. Don't start what won't finish.
- Lint baseline before any commit: `tsc` clean, `npm run lint` = 45 problems (6 errors, 39 warnings), `npm run build` green.

---

## Triage

### MUST FIX TONIGHT (17 commits, in commit order)

These are the items I plan to land tonight. Order is per the rule "lowest-risk-highest-value first, shared-surface last."

| # | Finding(s) | Commit subject (draft) | Risk | Size |
|---|---|---|---|---|
| 1 | F-4 | `docs(env): declare missing INDEXER_URL, INDEXER_DID, NEXT_PUBLIC_STADIA_API_KEY in example` | none | tiny |
| 2 | F-2 + F-7 | `chore(lint): replace ref-during-render and dead ternary with useMemo` | low | small |
| 3 | F-1 (5+ findings) | `fix(leaflet): scheme-allowlist user-controlled URLs in renderer + editor (XSS)` | low | medium |
| 4 | F-9 + F-10 | `fix(api): echo 4xx upstream messages and clamp status in extractRouteError` | low | small |
| 5 | F-12 | `fix(api): replace bare console.error with logSafe in three group routes` | none | tiny |
| 6 | F-8 | `fix(api/groups/activity): allowlist record fields on PUT` | low | small |
| 7 | F-3 + F-22-24 + F-28 + F-39 | `fix(api/geocode): require session, sanitize 5xx, tighten input parsing` | low | small |
| 8 | F-6 (minimum) + F-4 prod-warn | `fix(api/indexer): reject mutation operations; warn on missing INDEXER_URL in prod` | low | small |
| 9 | F-5 | `fix(leaflet/editor): preserve cursor when external value catches up to editor` | medium | small |
| 10 | F-14 | `fix(hooks/use-session): clear handle/email/error on sign-out` | low | tiny |
| 11 | F-13 | `fix(activity-detail): revoke prior object URL on save + unmount` | low | small |
| 12 | F-21 | `fix(api/groups/follow): preserve client-supplied createdAt` | low | small |
| 13 | F-15 | `fix(leaflet): preserve ordered nested lists in linearDocument round-trip` | low | small |
| 14 | F-17 + F-34 (R-15) | `fix(hooks/social-graph-sync): abort importDids; isWriting in finally` | low | small |
| 15 | F-19 + F-20 + F-35 | `fix(styles): use --color-error token; remove 100vw; dedupe selector` | low | small |
| 16 | F-29 | `chore(deps): bump Next.js 16.2.3 → 16.2.6 (advisory chain)` | low | tiny |
| 17 | F-11 (+ ride-alongs: F-53, F-56) | `refactor(atproto): extract writeToRepo seam for dual-path writes` | medium | medium |

**Expected duration:** ~4h.

### WILL FIX TONIGHT IF TIME PERMITS

Small, clean wins not on the critical path. Each is a single self-contained commit if I have margin after #17.

- F-16 — `listFollowing` truncation flag. ~25 LOC across 3-4 files; touches hook return shape.
- F-31 — `extractAwardSubjectDid` validate with `isValidDid`. Tiny.
- F-32 — Preserve empty paragraphs (hard-break-only blocks) in `from-tiptap`. Tiny.
- F-33 — `useSession.fetchSession` `cancelled` sentinel. Tiny.
- F-30 — `useAuthorNamesMap` cache.delete on transient failure. Tiny.
- F-26 — Update AGENTS.md §17 #9 "four" → "the collections listed in `ALLOWED_WRITE_COLLECTIONS`". Doc-only.
- F-25 — Add Stadia referer-allowlist note to `.env.local.example` (ride F-4 if not already done).
- F-18 — Add "race window acknowledged" comment to `cert.ts` paralleling `mergeProfile`. Doc-only.

### WILL NOT FIX TONIGHT (explicit deferrals)

| Item | Reason |
|---|---|
| F-6 full restructure (server-held GraphQL queries) | Tonight's commit #8 does the minimum (`mutation` reject). Restructure is M+ effort, would change feed semantics — operator decision. |
| F-46 — fixed-rkey for default endorsement definition | Requires verifying lexicon allows fixed rkey on `badge.definition` (`key: "tid"` may be enforced). High-effort verification + irreversible scheme choice. Operator. |
| F-49 — narrow `location` body shape in group route | M-effort with downstream UI surface; defer to follow-up. |
| F-51, F-52 — profile page / activity-detail inline-edit extraction | Architecture agent recommends defer; not bug-shaped; surface area is wide. |
| F-54 — `useContributorInformation` rename | Naming-only; no bug; defer. |
| F-57 — `useFocusTrap` on 8 new `<dialog>` modals OR AGENTS.md update | Native `<dialog>.showModal()` provides focus containment; the AGENTS.md update is the smallest change but is operator copy. Defer with a doc note. |
| F-58 — extract `<AppDialog>` primitive | Substantial; touches 8 files; defer to focused PR. |
| F-40, F-41 — hook return-shape harmonization | Cosmetic; defer. |
| F-37 — `--overlay-image{,-strong}` tokens | Defer; 6 hard-coded sites are tolerable until tokenization sprint. |
| F-42 — `border-radius: 14px` → token | Designer call; defer. |
| F-43, F-44 — handle shape regex on routes | The PDS rejects malformed handles; missing route-level pre-check is a UX nit. Defer. |
| F-45 — `parseLocationCoords` extra-comma input | Real but narrow; defer. |
| F-47 — `useFollowing.refetch` abort signal | Real but mostly invisible; defer unless rides with F-14/F-17. |
| F-48 — `inflightEnsure` result-cache TTL | Optimisation; no bug; defer. |
| F-50 — `setContent` invalid JSONContent | Risk is narrow; defer. |
| F-55 — `useReceivedEndorsements` add `refetch` | Real gap but defers cleanly. |
| F-38 — `<ErrorMessage>` adoption in 4 new sites | Visual diff; defer until designer review. |
| F-36 — Delete stale `profile.css` BEM blocks | Tempting ride-along but the *override is correct today*; deleting risks visual regression if any selector path was missed. Defer. |
| F-27 — Document group BFF role-check delegation | Operator copy in AGENTS.md; defer. |
| `core` 4.5 GB dump file | Per safety rules: no destructive ops without operator approval. Listed in April audit as F-026. Skip. |
| Adding tests / test framework | Out of scope per project. |
| Rate-limiting infra | Requires Upstash rate-limit + per-route wiring; infra decision. |

---

## Plans for each MUST-FIX commit

Each plan follows the deep-flow shape: goal, scope, alternatives considered with rationale, acceptance criteria.

### Commit 1 — `docs(env): declare missing env vars in example`

- **Goal:** Stop new operators from booting a deploy that silently routes at the dev indexer (F-4).
- **Scope:** `.env.local.example` only.
- **Alternatives considered:**
  - Add the vars + leave the `||` chain in the indexer route untouched. *Chosen* — the route warn comes in commit #8, separating doc and behavior changes.
  - Remove `NEXT_PUBLIC_INDEXER_URL` alias entirely. *Rejected* — risks breaking any operator using it; mark as deprecated in a comment instead.
- **Acceptance:** All four vars appear in `.env.local.example` with comments explaining failure modes and the Stadia bundle-public note (F-25).

### Commit 2 — `chore(lint): replace ref-during-render and dead ternary with useMemo`

- **Goal:** Clear all 6 ESLint baseline errors (F-2 5×, F-7 1×). Establish "no new lint errors" as a meaningful claim.
- **Scope:** `src/hooks/use-user-indexer-activities.ts` (replace `useMergedDidsMap` with `useMemo`), `src/hooks/use-social-graph-sync.ts` (drop dead ternary, narrow dep on `certified.refetch`).
- **Alternatives for F-2:**
  - Use `useSyncExternalStore`. *Rejected* — gigantic API surface for two-map merge.
  - Move merge to a `useState`/`useEffect` pair. *Rejected* — same problem the original code tried to avoid (extra render).
  - `useMemo` (chosen). Identical semantic for "stable reference unless inputs change." Lint-clean. Three lines.
- **Alternatives for F-7:**
  - Convert refetch to plain async function (no `useCallback`). *Rejected* — callers depend on stable identity.
  - Refactor `useFollowing` to return a memoized object literal. *Rejected* — touches a different file with broader consumer surface.
  - `useCallback(() => certified.refetch(), [certified.refetch])` (chosen).
- **Acceptance:** `npm run lint` reports `0 errors` (was 6). Warnings stay at 39 or drop.

### Commit 3 — `fix(leaflet): scheme-allowlist user-controlled URLs in renderer + editor (XSS)`

- **Goal:** Close the F-1 XSS class. Use the **existing** `safeHttpUrl()` helper at every site where user-controlled URLs become DOM `href`s, or get serialized to / deserialized from a `pub.leaflet.*` record.
- **Scope (5 files, ~50 LOC):**
  - `src/components/leaflet/leaflet-document.tsx` — wrap the iframe-fallback `<a>` and the facet-link `<a>` with `safeHttpUrl()`. When null, render plain text (no anchor).
  - `src/components/leaflet/nodes/leaflet-iframe-node.tsx` — same iframe-fallback fix as above.
  - `src/components/leaflet/leaflet-editor.tsx` — gate `handleLinkConfirm` on `safeHttpUrl()` before BOTH `setLink` and `insertContent` branches; show an inline error if rejected.
  - `src/lib/leaflet/from-tiptap.ts` (`marksToFeatures`) — skip the FEATURE_LINK when `safeHttpUrl()` is null (defense in depth on write).
  - `src/lib/leaflet/to-tiptap.ts` (`featureToMark`) — drop the link mark when `safeHttpUrl()` is null (defense in depth on read).
- **Alternatives considered:**
  - **Add an editor-only validator** (TipTap `Link.configure({ validate })`). *Rejected* — `insertContent` bypasses `Link.setLink`'s validation (verified in C-2), and the renderer would still trust foreign records. The renderer is the load-bearing site.
  - **Strip on the API write boundary** (`/api/xrpc/.../putRecord`). *Rejected* — XRPC proxy is content-agnostic and shouldn't grow lexicon-shaped validation.
  - **Render-only fix** (skip writer / reader). *Rejected* — defense-in-depth on the writer prevents re-propagation under the user's identity from a malicious foreign source ↘ editor ↘ save.
  - Helper choice: `safeHttpUrl()` accepts `http:`/`https:` only. The renderer's existing anchor opens in a new tab with `noreferrer`; `mailto:`/`tel:` would not work in that pattern anyway and the only documented use today is web links. (Chosen.)
- **Acceptance:**
  - `<LeafletDocument>` rendering a foreign record with a `javascript:` facet link renders plain text, not an anchor.
  - The link dialog rejects a typed `javascript:alert(1)` URL with an inline error.
  - Round-trip (foreign malicious record → edit → save) strips the malicious link mark.
  - Build + lint + tsc still green.

### Commit 4 — `fix(api): echo 4xx upstream messages and clamp status in extractRouteError`

- **Goal:** Honor AGENTS.md §17 #7 (4xx may echo upstream) — currently the helper returns generic strings for ALL statuses. Also clamp arbitrary upstream status integers into valid HTTP range.
- **Scope:** `src/lib/utils/api.ts` only (the function `extractRouteError`).
- **Alternatives:**
  - Per-route 4xx-echo logic. *Rejected* — duplicates the policy; the helper is the canonical seam.
  - Pass a `{ echoOn4xx?: boolean }` option per call site. *Rejected* — every route would set it true; defaulting it makes the API trivial.
  - **Always echo, clamp by helper** (chosen). 4xx echo of `err.message` after `redactSecrets`; 5xx stays generic.
- **Acceptance:** Calling the helper with a 400 carrying `err.message = "Handle must be at least 3 characters"` returns `{ status: 400, message: "Handle must be at least 3 characters" }`. With status 700 (or 0, or -1), returns 500. With status 503, returns 503 + generic message.

### Commit 5 — `fix(api): replace bare console.error with logSafe in three group routes`

- **Goal:** Stop leaking JWT/DPoP/Authorization tokens via the atproto SDK's `err.cause` chain into Vercel logs (F-12).
- **Scope:** `src/app/api/groups/[groupDid]/{profile,metadata,upload-blob}/route.ts`.
- **Alternatives:** none — the helper exists and is used elsewhere; this is a one-line edit per file.
- **Acceptance:** No `console.error(label, err)` calls in any group BFF route handler. Where `extractRouteError` already logs, the bare line is removed entirely (avoid duplicate log entries).

### Commit 6 — `fix(api/groups/activity): allowlist record fields on PUT`

- **Goal:** Close the mass-assignment regression vs. April audit's CS-005 (F-8). The activity route is the only group BFF write that doesn't field-allowlist.
- **Scope:** `src/app/api/groups/[groupDid]/activity/route.ts` only.
- **Alternatives:**
  - **`pickAllowedFields` against an `ALLOWED_ACTIVITY_FIELDS` set** (chosen). Mirrors `metadata/route.ts` and `location/route.ts` patterns.
  - Allowlist the entire lexicon. *Rejected* — current cert-edit form writes only `title`, `shortDescription`, `image`, `description` per `activity-detail.tsx:622-665`. Wider allowlist invites future drift.
  - Approach: set the allowlist to what the form actually writes today + the immutable record-shape fields (`createdAt`). The cert-create flow may write more; verify against `src/app/create/page.tsx` before fixing the allowlist.
- **Acceptance:** Caller-supplied `record` body keys outside the allowlist are silently dropped (matching sibling routes' behavior). All existing cert-create / cert-edit happy paths still succeed (no regressions).

### Commit 7 — `fix(api/geocode): require session, sanitize 5xx, tighten input parsing`

- **Goal:** Close F-3 (open-internet abuse), F-22 (5xx echoing upstream status), F-23/F-24 (no `logSafe`), F-28 (`parseInt` non-strict), F-39 (silent oauth-restore failure in `getAuthenticatedAgent` — relevant since geocode will now require a session).
- **Scope:** `src/app/api/geocode/route.ts` + `src/lib/groups/proxy-agent.ts:164` (one logSafe).
- **Alternatives for F-3:**
  - **Require session** (chosen). Geocode UI is auth-gated; legitimate users unaffected.
  - Same-origin Referer check only. *Rejected* — Referer can be missing and shouldn't be required to fall through; less explicit than the auth gate.
  - Upstash rate-limit on IP. *Rejected* — infra decision; defer.
- **Acceptance:** Anonymous `GET /api/geocode?q=…` returns 401. Authenticated request still resolves Nominatim. 5xx responses no longer carry upstream status in body. `parseInt` replaced with `Number()` + `Number.isInteger`. `getAuthenticatedAgent` logSafe on the catch.

### Commit 8 — `fix(api/indexer): reject mutation operations; warn on missing INDEXER_URL in prod`

- **Goal:** F-6 minimum + F-4 production-warn.
- **Scope:** `src/app/api/indexer/route.ts`.
- **Alternatives for mutation reject:**
  - **Reject any body whose JSON-parsed `query` starts with `mutation`** (after trim/leading-comment strip — chosen as minimum).
  - Server-held queries + operation-name allowlist (the right answer). *Deferred* — restructure; tonight does the minimum.
- **Alternatives for warn:**
  - **Module-load `console.warn` when `NODE_ENV === "production"` and no INDEXER_URL set** (chosen). Mirrors notifications/route.ts:34.
  - Throw at module load. *Rejected* — would brick local dev / preview builds where the dev URL is genuinely the right answer.
- **Acceptance:** `query: "mutation { … }"` returns 400 from the proxy. Production deploy without `INDEXER_URL` logs a loud warn at boot.

### Commit 9 — `fix(leaflet/editor): preserve cursor when external value catches up to editor`

- **Goal:** Fix cursor reset on every keystroke (F-5).
- **Scope:** `src/components/leaflet/leaflet-editor.tsx` value-sync effect only.
- **Alternatives:**
  - Compare `next` against `editor.getJSON()`. *Chosen* — direct fix; the editor is the source of truth for current content, not `lastExternalRef`.
  - Update `lastExternalRef.current` from `onUpdate`. *Considered* — also works, but ties the ref update to editor lifecycle, which is more brittle.
  - Skip the effect when `tiptapToLinearDocument(editor.getJSON())` already shallow-matches `value`. *Rejected* — round-trip cost on every keystroke; the direct compare is cheaper.
- **Acceptance:** Manually exercise: type a sentence in a leaflet field on cert edit; verify cursor stays at the typing position; verify external content (e.g. switching certs) still loads the new content.

### Commit 10 — `fix(hooks/use-session): clear handle/email/error on sign-out`

- **Goal:** F-14. Long-lived components must observe a sign-out promptly.
- **Scope:** `src/hooks/use-session.ts` (the `isAuthenticated → false` branch).
- **Alternatives:** none material; setHandle(null) + setEmail(null) + setError(null).
- **Acceptance:** A component mounted before sign-out, still mounted after, reads `null` handle/email.

### Commit 11 — `fix(activity-detail): revoke prior object URL on save + unmount`

- **Goal:** F-13. Object URL leak.
- **Scope:** `src/components/feed/activity-detail.tsx` only.
- **Alternatives:**
  - Track both `pending` and `local` URLs and revoke the latter on next pick + on unmount (chosen).
  - Move image lifecycle into a hook. *Rejected* — premature; the file already has tight image lifecycle.
- **Acceptance:** Manual: open cert edit, pick image A, save, re-edit, pick image B, save → no DOM `Blob`s remain for image A. Unmounting during edit revokes the current pending URL.

### Commit 12 — `fix(api/groups/follow): preserve client-supplied createdAt`

- **Goal:** F-21. Social-graph sync should preserve original Bluesky follow times.
- **Scope:** `src/app/api/groups/[groupDid]/follow/route.ts` + caller `src/lib/atproto/follow.ts` (`createFollow` accepts `createdAt?` and passes through for group writes).
- **Alternatives:**
  - Accept an optional ISO-8601 `createdAt` on the body, validate format, pass through. (Chosen.)
  - Always pass through; reject if missing. *Rejected* — breaks current callers that don't supply.
- **Acceptance:** Body with valid `createdAt: "2024-…"` writes that value to the group repo. Missing/invalid → fall back to server time (current behavior preserved).

### Commit 13 — `fix(leaflet): preserve ordered nested lists in linearDocument round-trip`

- **Goal:** F-15. Data-loss bug on edit.
- **Scope:** `src/lib/leaflet/from-tiptap.ts` (writer-side switch between `children` and `orderedListChildren`).
- **Alternatives:** none; the writer is asymmetric and the reader already handles both fields.
- **Acceptance:** Author a nested ordered list in a leaflet, save, reopen → still an ordered list.

### Commit 14 — `fix(hooks/social-graph-sync): abort importDids; isWriting in finally`

- **Goal:** F-17 + F-34 (R-15). Prevent loop continuation after modal close; prevent `isWriting` leak on refetch error.
- **Scope:** `src/hooks/use-social-graph-sync.ts` + the modal caller in `src/components/settings/sync-social-graph-section.tsx`.
- **Alternatives:** the modal wraps the import call in an `AbortController` tied to its lifecycle; `importDids` accepts `{ signal? }` and checks between iterations.
- **Acceptance:** Closing the modal during import stops further writes (verified by adding a `for` loop trace in dev). `isWriting` is always cleared via `finally`, including when the post-loop `refetch()` throws.

### Commit 15 — `fix(styles): use --color-error token; remove 100vw; dedupe selector`

- **Goal:** F-19 + F-20 + F-35.
- **Scope:**
  - 16 sites across 3 CSS files: replace `var(--danger, #d44)` with `var(--color-error)`.
  - `src/app/styles/leaflet.css:466`: replace `100vw` with `100%`.
  - `src/app/styles/cert-detail.css:75,116`: merge duplicate `.cert-detail__image` blocks.
- **Alternatives for F-19:**
  - Declare `--danger` in tokens.css. *Rejected* — adds a parallel token; AGENTS.md §11 rule 3 says reuse, not invent.
  - Leave as `var(--danger, #d44)` and accept the dark-theme bug. *Rejected* — designer convention is theme-responsive errors.
- **Acceptance:** Dark mode renders errors in `#f87171`; light mode renders in `#ba1a1a`. No `100vw` in any CSS under `src/app/styles/`. `.cert-detail__image` defined exactly once.

### Commit 16 — `chore(deps): bump Next.js 16.2.3 → 16.2.6 (advisory chain)`

- **Goal:** F-29. Patch within minor, closes the published advisory chain.
- **Scope:** `package.json` + `package-lock.json` only.
- **Alternatives:** none material — patch version is the minimum-risk choice.
- **Acceptance:** `npm audit` shows 0 high advisories on Next.js. `npm run build` still green.

### Commit 17 — `refactor(atproto): extract writeToRepo seam for dual-path writes`

- **Goal:** F-11. Single shared seam for "target vs. own → CGS BFF vs. XRPC" across the 5 lib helpers.
- **Scope (6 files, ~80-120 LOC added / ~130-160 removed = net ~-40 LOC):**
  - New: `src/lib/atproto/repo-write.ts` — exports `writeToRepo(ownDid, targetDid, op, group, errorFallback)`.
  - Edit: `src/lib/atproto/cert.ts` (`putCertRecord`).
  - Edit: `src/lib/atproto/profile.ts` (`putProfile`).
  - Edit: `src/lib/atproto/location.ts` (`putLocationRecord`).
  - Edit: `src/lib/atproto/follow.ts` (`createFollow`, `deleteFollow`).
  - Edit: `src/lib/groups/org-marker.ts` (`putOrgMarker`).
- **Alternatives considered:**
  - **Thin helper that takes XRPC op + group route spec** (chosen — architecture agent's proposed signature).
  - **Per-collection helpers** (`writeProfile`, `writeFollow`, …) over a shared registry of routes. *Rejected* — would introduce a separate parallel API to maintain.
  - **Defer entirely** until a forcing function lands. *Rejected* — error-extraction and parameter-shape divergence is already a real maintenance cost across 5 files; the helper is within scope.
  - Return shape: helper always returns `{uri, cid} | null` from the upstream — callers can ignore (`putProfile` does today). Strictly additive.
- **Acceptance:**
  - All five call sites compile and pass tsc.
  - Manual: write a personal profile, write a group profile, write a personal cert, write a group cert, follow a user as self, follow a user as group, write a personal location, write a group location, write an org marker. Each should succeed against the same upstream as before.
  - Build/lint/tsc green.
  - `follow.ts` no longer reimplements its own error-parsing; uses shared `extractError`.

---

## Mini-re-review checkpoints

After commits **5**, **10**, and **15**, run a mini re-review (per the brief): did anything I just did introduce a new problem, regress a test, contradict an earlier fix? Capture in `04-mini-review-N.md`.

Mini-review questions to answer at each checkpoint:
- Did `npm run lint` count change unexpectedly?
- Does `npm run build` still complete?
- Did any of the just-committed files cross-affect a hook or component I didn't touch (search for new imports)?
- Did I inadvertently widen any security surface (CSP, allowlist, env)?
- Are the commit messages atomic and accurate?

---

## Stopping plan

I will pause and re-evaluate after **commit 8** (~half the list). If implementation is on track for ~4h, I'll continue with commits 9-17. If it has slipped past ~3h elapsed implementation, I'll prune the back-half: skip the IF-TIME items entirely, evaluate dropping commit 17 (the largest) and noting it for follow-up.

I will not start commit 17 (the dual-path refactor) if there is less than 75 minutes of budget remaining — it needs full attention and a quality re-review of each of the 5 call sites.
