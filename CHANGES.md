# CHANGES — overnight-review

Running log of every discretionary change made on the `overnight-review` branch during the two-phase
auto-review. Source of findings: [`REVIEW.md`](./REVIEW.md). Created from `feat/positioning-redesign`
HEAD; `main` untouched; branch left unmerged.

**Baseline at branch creation:** vitest `291 passing`, `tsc --noEmit` `0 errors`, `npm run lint`
`0 errors / 69 warnings`.

**Commit gate (every implemented item):** the change is committed only if, after it, the full
vitest suite is green **and** `tsc --noEmit` reports 0 errors **and** lint introduces no new errors.
For testable behavior, a failing test is written first (and confirmed red) before the fix. Existing
tests are never modified to make a change pass; new tests may be added. If the gate can't be made
green within the item's scope, the change is reverted and the item is logged with status `BLOCKED`.

---

## Held — not auto-implemented

Excluded from auto-implementation because they change external behavior, a public API/contract, a data
schema, dependency choices, or architecture — or are coupled to a held judgment item. Listed for
Holke's decision; see the matching section in `REVIEW.md`.

- **judgment-001 … judgment-010** — all 10 judgment items (see `REVIEW.md` § "Judgment — held for your decision").
- **risk-005** — drop client-supplied `validate:false` on own-repo writes. Changes the write-envelope
  contract; verifier rated it low-confidence optional hardening. Held.
- **risk-007** — add a rate limiter to `/api/resolve-did`. Duplicate of **judgment-002**. Held under judgment-002.
- **risk-009** — give `deleteFollow` a `targetDid` param + add a DELETE handler to the group follow
  route. Adds new API surface. The behavior-preserving doc note may be applied; the API change is held.
- **quality-024** — add `autoprefixer` to the PostCSS chain. Identical change to **judgment-007**. Held under judgment-007.
- **quality-042** — `useProfilePds` IIFE alignment. Underlying bug refuted; report recommends skipping. Skipped.

---

## Log

One entry per item, in implementation order. Status is `IMPLEMENTED` or `BLOCKED`.

### bug-001 — Context-update attachment href scheme allowlist · IMPLEMENTED
- **Why it's an improvement:** Closes a stored XSS — a federated PDS author could plant a `javascript:` uri that executed on click in the certified.app origin.
- **Change:** `resolveAttachment` now rejects a uri attachment unless `safeHttpUrl(entry.uri)` is non-null, returning the normalized http(s) value; fixes all three render sinks at the source.
- **Test:** src/lib/atproto/__tests__/context-attachment.test.ts — fails before (javascript:/data: resolved), passes after.
- **Gate:** vitest green · tsc 0 errors · lint 69 warnings

### bug-002 — OG/Twitter share image references a non-existent certified-hero file on 5 pages · IMPLEMENTED
- **Why it's an improvement:** The most-shared landing URL (/welcome) and four legal pages served a 404 OG image, so social unfurls rendered with no preview; now they point at the real on-disk asset.
- **Change:** Replaced the five `certified-hero-1200x630.png` strings with `certs-hero-1200x630.png` in welcome/terms/privacy/dsa/imprint, matching the file on disk plus layout.tsx and about/page.tsx.
- **Test:** src/app/__tests__/metadata-og-image.test.ts — asserts every OG/Twitter image in each page's exported metadata resolves under public/; fails before (5 red), passes after.
- **Gate:** vitest green · tsc 0 errors · lint 69 warnings

### bug-003 — InvalidSwap detection is dead for the group BFF write path · IMPLEMENTED
- **Why it's an improvement:** Group admins' inline cert/project edits that lose a CID-precondition race now reach the conflict-rebase + drafts-recovery machinery instead of failing generically and silently dropping unsaved edits.
- **Change:** `extractRouteError` now surfaces the atproto discriminator (`XRPCError.error`) as `code`, and the group activity/project routes echo it as `{ error, code }` — mirroring the XRPC proxy — so `writeToRepo` re-raises `InvalidSwapError`.
- **Test:** src/lib/utils/__tests__/api.test.ts (extractRouteError surfaces `code: "InvalidSwap"`) — fails before, passes after; plus src/lib/atproto/__tests__/repo-write.test.ts (group-route InvalidSwap body → InvalidSwapError).
- **Gate:** vitest green · tsc 0 errors · lint 69 warnings

### bug-004 — Inline-edit Save during in-flight avatar/banner upload dropped the new image · IMPLEMENTED
- **Why it's an improvement:** Saving mid-upload no longer silently re-persists the stale `base.avatar`/`base.banner` while the UI shows the new image as saved.
- **Change:** `handleSave` now tracks the in-flight avatar/banner upload promises in refs and awaits them before composing the record, then writes the freshly-resolved blob instead of the (stale) closed-over state.
- **Test:** src/hooks/__tests__/use-profile-inline-edit.test.tsx — never-resolving `uploadAvatar`: asserts `putProfile` is never called with the stale `OLD_AVATAR` and Save can't complete; fails before, passes after. (Plus a resolve-path case asserting the NEW blob is persisted.)
- **Gate:** vitest green · tsc 0 errors · lint 69 warnings

### bug-005 — Project location strongRef now resolves + displays · IMPLEMENTED
- **Why it's an improvement:** The project Location meta row now renders the place name instead of silently disappearing (and never leaks `[object Object]`).
- **Change:** In project-detail.tsx, resolve the `location` strongRef like the edit page (parse at:// → getRecord via authFetch → `splitLocationName(value.name)`) into a resolved label used by the meta row + `hasAnyMeta`, keeping the legacy inline-string path.
- **Test:** src/components/project/__tests__/project-detail-location.test.tsx — fails before, passes after.
- **Gate:** vitest green · tsc 0 errors · lint 69 warnings

### bug-006 — Audit-log result pill allowlist matches actual permitted/denied values · IMPLEMENTED
- **Why it's an improvement:** Audit result chips now get their `--permitted`/`--denied` color class instead of always falling through to the unstyled `--unknown`.
- **Change:** In org-settings.tsx, replaced the stale `["success","failure","error"]` allowlist with an exported `auditResultClassSuffix` helper mapping `AuditEntry.result` ("permitted"|"denied") to the matching class suffix (else "unknown").
- **Test:** src/components/groups/__tests__/org-settings.test.ts — asserts permitted→permitted, denied→denied, other→unknown; fails before, passes after.
- **Gate:** vitest green · tsc 0 errors · lint 69 warnings

### bug-007 — /endorsements Received tab hides rejected endorsements with no way to un-reject · IMPLEMENTED
- **Why it's an improvement:** The owner's own inbox now surfaces already-rejected endorsements (with Accept/Reject controls), so a rejected award no longer vanishes with no way to un-reject it.
- **Change:** In endorsements/page.tsx, `ReceivedEndorsementsList` now calls `useReceivedEndorsements(did, { includeRejected: true })` — matching the profile owner surface; §22.21 privacy holds since foreign viewers never reach this page.
- **Test:** src/app/__tests__/endorsements-received-rejected.test.tsx — mocks the hook to honor `includeRejected` and asserts the rejected row is absent before / renders after the fix; fails before, passes after.
- **Gate:** vitest green · tsc 0 errors · lint 69 warnings

### bug-008 — Blob/image upload errors swallowed on cert/project forms · IMPLEMENTED
- **Why it's an improvement:** A failed image upload now surfaces an error and clears the stale preview, so a cert/project can no longer publish silently without the previewed image.
- **Change:** Wrapped each `uploadBlob` call (create, project/new, project edit, project-detail inline-edit) in try/catch that sets the page's error state and clears+revokes the dangling preview/blob.
- **Test:** src/app/__tests__/create-image-upload-error.test.tsx — fails before (unhandled rejection, no error surfaced), passes after.
- **Gate:** vitest green · tsc 0 errors · lint 69 warnings

### bug-009 — Banner picker shows no live preview after selecting a file · IMPLEMENTED
- **Why it's an improvement:** The banner control now previews the picked image immediately instead of showing the stale saved banner, matching AvatarUpload's behavior in the same form.
- **Change:** BannerUpload self-previews via an object URL on pick (revoked on error/unmount), falling back to currentBannerUrl; this also fixes the group edit page, which uses BannerUpload directly.
- **Test:** src/components/profile/__tests__/banner-upload-preview.test.tsx — fails before, passes after.
- **Gate:** vitest green · tsc 0 errors · lint 69 warnings

### bug-010 — Feed PreviewCard MapPin never renders when a date period is also present · IMPLEMENTED
- **Why it's an improvement:** A cert with both a date period and locations now shows the location pin next to its "N locations" text, instead of dropping the pin whenever any other meta item is present.
- **Change:** CertPreview now pushes a ReactNode meta entry (`<><MapPin/> N locations</>`) and PreviewCard's `meta` prop became `ReactNode[]` with `withLocationIcon` removed, mirroring ExploreListRow / CertListRow.
- **Test:** src/components/home/__tests__/cert-preview-location-icon.test.tsx — fails before, passes after.
- **Gate:** vitest green · tsc 0 errors · lint 69 warnings

### bug-011 — useUserActivities.loadMore appends stale-DID records after a profile switch · IMPLEMENTED
- **Why it's an improvement:** After switching profiles, an in-flight loadMore for the previous DID no longer appends that DID's records to the reset list, and overlapping cursor-boundary edges no longer produce duplicate rows.
- **Change:** Added a `generationRef` bumped on each initial load; `loadMore` captures its generation, bails when superseded, and dedups appended records by `uri` via a `seen` Set (mirrors use-explore / use-home-feed).
- **Test:** src/hooks/__tests__/use-user-activities.test.tsx — fails before, passes after.
- **Gate:** vitest green · tsc 0 errors · lint 69 warnings

### risk-001 — XRPC proxy echoes un-redacted 4xx upstream messages to the client · IMPLEMENTED
- **Why it's an improvement:** A 4xx from createRecord/putRecord/updateEmail/etc. can embed a JWT/DPoP/Bearer fragment in its message; the proxy now redacts it before returning to the browser, matching the canonical extractRouteError posture.
- **Change:** In `xrpcError`, the 4xx branch now returns `redactSecrets(rawMessage)` instead of the raw upstream string (route.ts:111); 5xx/empty still collapse to "Internal server error".
- **Test:** src/app/api/xrpc/[...method]/__tests__/xrpc-error.test.ts — fails before, passes after (asserts Bearer/JWT fragments are redacted in echoed 4xx; clean 4xx still echoed; 5xx still generic; discriminator preserved).
- **Gate:** vitest green · tsc 0 errors · lint 69 warnings

### risk-002 — groups/register logs raw atproto error on org-limit path · IMPLEMENTED
- **Why it's an improvement:** stops DPoP/Bearer tokens (on `err.cause`/`.stack`/`.message`) from leaking into logs on the org-limit check failure path.
- **Change:** replaced `console.error("Org creation limit check failed:", err)` with `logSafe("[groups/register] org-limit check failed", err)`; kept the 503.
- **Test:** src/app/api/groups/register/__tests__/org-limit-log-safe.test.ts — fails before, passes after.
- **Gate:** vitest green · tsc 0 errors · lint 69 warnings

### risk-004 — groups/register does not server-side sanitize handle and forwards email unvalidated · IMPLEMENTED
- **Why it's an improvement:** enforces AGENTS.md §17.6/§24.5 sanitize-at-the-boundary defense-in-depth so invisible-char/over-length handles and malformed emails can't be forwarded verbatim to the group service.
- **Change:** run `sanitizeHandle(rawHandle)` and re-check the 253 cap on the sanitized result; validate the optional email with feedback/route.ts's regex + 254-char cap, rejecting with 400 on failure; forward the sanitized handle/validated email.
- **Test:** src/app/api/groups/register/__tests__/register-sanitize.test.ts — fails before, passes after (ZWSP/leading-@ stripped; sanitized-handle 253 cap; invalid email rejected/omitted; valid email forwarded unchanged).
- **Gate:** vitest green · tsc 0 errors · lint 69 warnings

### risk-003 — Profile inline-edit save orphans a location record on retry · IMPLEMENTED
- **Why it's an improvement:** a first-time location add followed by a failed marker write no longer re-mints a fresh orphan location record on each Save retry; the retry overwrites the same record in place.
- **Change:** in `handleSave`, capture the rkey minted by the first `putLocationRecord` (createRecord) into a session-scoped `mintedLocationRkeyRef`, and reuse it as the `existingRkey` fallback when the marker has no persisted strongRef; cleared on edit-click / cancel / successful save.
- **Test:** src/hooks/__tests__/use-profile-inline-edit-location-retry.test.tsx — fails before, passes after (putOrgMarker rejects once; asserts the retry's putLocationRecord reuses the minted rkey and allocates no new mint).
- **Gate:** vitest green · tsc 0 errors · lint 69 warnings

### risk-006 — App-only surfaces crawlable (missing robots disallow) · IMPLEMENTED
- **Why it's an improvement:** Keeps authenticated/app shells out of search indexes per AGENTS §18, while leaving public /profile and /project indexable.
- **Change:** Added /home, /explore, /search, /activity, /activity/* to the robots.ts disallow array.
- **Test:** src/app/__tests__/robots-app-only-disallow.test.ts — fails before, passes after.
- **Gate:** vitest green · tsc 0 errors · lint 69 warnings

### risk-008 — saveWithSwap `read` callbacks use raw `fetch` instead of `authFetch` · IMPLEMENTED
- **Why it's an improvement:** the conflict re-read now routes through `authFetch`, so a 401 on the session-bearing `/api/xrpc/.../getRecord` route fires the `onUnauthorized` interceptor instead of being silently swallowed.
- **Change:** swapped raw `fetch(` → `authFetch(` in the `read` callback of both project save flows (project-detail.tsx and the project edit page); `authFetch` was already imported in both.
- **Test:** src/app/project/[did]/[rkey]/edit/__tests__/save-reread-authfetch.test.tsx — fails before, passes after (drives a 409 write → conflict re-read 401 → asserts onUnauthorized fires).
- **Gate:** vitest green · tsc 0 errors · lint 69 warnings

### quality-001 — UserFeed component is dead code (never imported) · IMPLEMENTED
- **Why it's an improvement:** removes ~30 lines of unreachable code that also masked bug-011's only reachable path and would have rendered broken bylines (empty `did`) if ever wired.
- **Change:** deleted src/components/feed/user-feed.tsx after confirming 0 repo-wide importers (the only mention is a prose doc comment in feed-layout.tsx, untouched).
- **Test:** refactor; no natural test — full suite green.
- **Gate:** vitest green · tsc 0 errors · lint 69 warnings

### quality-002 — cert-context.ts dead module (304 lines) — delete · BLOCKED
- **Reason:** escalate-to-judgment: the Recommendation's explicit precondition ("confirm no in-flight branch reintroduces the Explore aggregate first") fails — four in-flight branches (origin/feat/88-follower-events-feed, /89-feed-enhancements, /quality-pass-rebased, /wider-sidebar-and-navbar-border) reintroduce the Explore aggregate via src/hooks/use-cert-context.ts + src/components/explore/* and import fetchAllCertContext / CertContextItem from this exact module; deleting now would conflict with that in-flight work.

### quality-003 — fetchAllCertContext pagination · IMPLEMENTED
- **Why it's an improvement:** `listAndFilter` now follows the listRecords cursor, so it sees every record on the author's PDS instead of only the first 50 — matches that live past page one are no longer silently dropped, honoring the "All"/"every" naming.
- **Change:** rewrote `listAndFilter` to walk the cursor in a `while (true)` loop (limit 100, same 400/404→empty handling), filtering + normalizing each page, mirroring `fetchTypedLists` / `listEndorsementListCollections`.
- **Test:** refactor; no natural test (module is dead today — quality-002 — and tsconfig excludes __tests__) — full suite green.
- **Gate:** vitest green · tsc 0 errors · lint 69 warnings

### quality-005 — Dead EndorseShortcut + inert received-grid optimistic overlay · IMPLEMENTED
- **Why it's an improvement:** removes ~140 lines of unreachable code and a false comment from the largest profile file; `EndorseShortcut` was never rendered and the optimistic overlay was permanently inert (its only setters were never wired to any child), so deleting it eliminates dead state and a misleading claim about sidebar handoff.
- **Change:** removed `EndorseShortcut`, the `optimisticAdds`/`optimisticHides` state + the de-dup `displayReceived` memo (collapsed `displayReceived` to `received.endorsements`), the unused `handleEndorsed`/`handleRevoked` callbacks, and the misleading "exported to the sidebar" comment.
- **Test:** refactor; no natural test (testable=false; pure dead-code deletion) — full suite green.
- **Gate:** vitest green · tsc 0 errors · lint 69 warnings

### quality-011 — Dead exports in workspace.ts · IMPLEMENTED
- **Why it's an improvement:** removes never-imported public API, including a `@deprecated` function carrying a known filter-inversion bug, shrinking the surface callers can misuse.
- **Change:** deleted `fetchOrganizationDids`, the `@deprecated fetchOrganizationDidsForSet`, and the now-unused `OrganizationDidsGraphQLResponse` type (all zero importers).
- **Test:** refactor; no natural test (testable=false; pure dead-code deletion) — full suite green.
- **Gate:** vitest green · tsc 0 errors · lint 69 warnings

### quality-049 — CertHeadlineByline dead — delete · IMPLEMENTED
- **Why it's an improvement:** Removes dead, unimported code that duplicates author-byline logic now living inline in ActivityDetail (CertHeadlineColumns).
- **Change:** Deleted src/components/feed/cert-headline-byline.tsx (0 importers; shared CSS classes left intact as they're used by activity-detail.tsx).
- **Test:** refactor; no natural test — full suite green.
- **Gate:** vitest green · tsc 0 errors · lint 69 warnings

### quality-050 — LocationCard dead code · IMPLEMENTED
- **Why it's an improvement:** Removes an unused component and fixes a comment that referenced it, reducing dead code and doc drift.
- **Change:** Deleted src/components/feed/location-card.tsx and dropped the stale `+ LocationCard` mention from the doc comment in cert-locations-map.tsx.
- **Test:** refactor; no natural test — full suite green
- **Gate:** vitest green · tsc 0 errors · lint 69 warnings

### quality-051 — FeedLayout stale doc comments · IMPLEMENTED
- **Why it's an improvement:** JSDoc now names the real consumers instead of phantom GlobalFeed/PersonalFeed/UserFeed components that no longer exist, so future readers aren't misled.
- **Change:** Rewrote the FeedLayout component JSDoc and the getDid prop comment to reference profile-certs and project-detail; dropped the non-existent feed-source names.
- **Test:** refactor; no natural test — full suite green
- **Gate:** vitest green · tsc 0 errors · lint 69 warnings

### quality-009 — Add CI workflow (ci.yml) · IMPLEMENTED
- **Why it's an improvement:** Enforces the documented lint/tsc/test baseline on every PR into staging/main, so regressions Vercel's `next build` can't catch are now gated.
- **Change:** Added `.github/workflows/ci.yml` running `npm ci` → `npm run lint` → `npx tsc --noEmit` → `npm test` on pull_request into staging and main, with Node pinned to 20.9.0 (aligns with quality-018).
- **Test:** refactor; no natural test (new CI config file, testable=false) — full suite green
- **Gate:** vitest green · tsc 0 errors · lint 69 warnings

### quality-010 — tsconfig excludes test files from tsc · IMPLEMENTED
- **Why it's an improvement:** The main tsc gate never type-checked the 33 `__tests__` files, so tests could call renamed/removed exports and still report "0 errors"; a dedicated test typecheck makes those errors visible.
- **Change:** Added `tsconfig.test.json` (extends base, un-excludes `src/**/__tests__/**`) and a `typecheck:test` npm script; the main `tsconfig.json` exclude is left intact so `npx tsc --noEmit` stays the 0-error production gate. Per the coordination note, the new step surfaces 12 pre-existing test-file type errors (across 6 files) that quality-009's CI should triage before gating on it.
- **Test:** refactor; no natural test (config + npm script, testable=false) — full suite green
- **Gate:** vitest green · tsc 0 errors · lint 69 warnings

### quality-018 — No Node version pin (engines/.nvmrc) · IMPLEMENTED
- **Why it's an improvement:** Pins the Node runtime so contributors/CI match Vercel's runtime (Next 16 requires Node >=20.9.0), avoiding "works on my machine" build discrepancies.
- **Change:** Added `"engines": { "node": ">=20.9.0" }` to package.json and a `.nvmrc` pinned to `20.9.0`.
- **Test:** refactor; no natural test (config files, testable=false) — full suite green
- **Gate:** vitest green · tsc 0 errors · lint 69 warnings

### quality-019 — config-5: No `typecheck` npm script · IMPLEMENTED
- **Why it's an improvement:** The `tsc --noEmit` gate no longer depends on memory; it's an invokable, CI-wireable script.
- **Change:** Added `"typecheck": "tsc --noEmit"` to package.json scripts.
- **Test:** refactor; no natural test — full suite green.
- **Gate:** vitest green · tsc 0 errors · lint 69 warnings

### quality-020 — lint script `--ext` no-op under flat config · IMPLEMENTED
- **Why it's an improvement:** Removes a dead/misleading flag that does nothing under ESLint 9 flat config, where file selection is governed by `files`/`ignores`.
- **Change:** Changed the `lint` script in package.json from `eslint src/ --ext .ts,.tsx` to `eslint src/`.
- **Test:** refactor; no natural test — full suite green.
- **Gate:** vitest green · tsc 0 errors · lint 69 warnings

### quality-021 — lint scope is `src/` only; root configs/scripts unlinted · IMPLEMENTED
- **Why it's an improvement:** Root configs (next.config.ts, scripts/*.mjs, build configs) are now linted, not just `src/`.
- **Change:** `lint` script now runs `eslint .`; flat-config `ignores` widened to `**/.next/`, `**/node_modules/`, `**/coverage/`, `.claude/` (the new anonymous-default-export warning on the config was cleared by naming the export).
- **Test:** refactor; no natural test — full suite green.
- **Gate:** vitest green · tsc 0 errors · lint 69 warnings

### quality-022 — audit scripts disagree on dev-server port · IMPLEMENTED
- **Why it's an improvement:** all three audit scripts now point at the same default dev-server origin, so audit-screenshots no longer silently skips every route against a default `next dev` (:3000).
- **Change:** unified the port default to `process.env.BASE || "http://localhost:3000"` — fixed audit-screenshots' :3001 default, replaced recapture-landing's three hardcoded :3000 URLs with a BASE constant, and made capture-divergence-sheet honor BASE (file:// fallback preserved when unset).
- **Test:** refactor; no natural test (scripts are dev-only Playwright tooling, testable=false) — full suite green.
- **Gate:** vitest green · tsc 0 errors · lint 69 warnings

### quality-023 — .gitignore `core` pattern unanchored · IMPLEMENTED
- **Why it's an improvement:** Bare `core` ignored any file/dir named `core` at any depth; a future `src/lib/core/` or `core.ts` would be silently untracked.
- **Change:** Anchored the pattern to `/core` so it only matches the root coredump file.
- **Test:** refactor; no natural test — full suite green.
- **Gate:** vitest green · tsc 0 errors · lint 69 warnings

### quality-025 — saveWithSwap untyped cross-shape contract · IMPLEMENTED
- **Why it's an improvement:** Constrains `TDrafts extends Partial<TSnapshot>` so a draft key that collides with the snapshot under an incompatible type is a compile error instead of being silently excluded from conflict detection and auto-rebased over a concurrent server change.
- **Change:** Tightened the `TDrafts` generic bound and removed the `as Record<string, unknown>` casts in the conflict-detection block; documented the `read().value`-shape invariant.
- **Test:** src/lib/atproto/__tests__/save-with-swap.test.ts — type-contract case fails before (TS2578 unused `@ts-expect-error` under tsconfig.test.json), passes after; runtime conflict/rebase cases lock behavior.
- **Gate:** vitest green · tsc 0 errors · lint 69 warnings

### quality-026 — unify the two divergent shallowEqual implementations · IMPLEMENTED
- **Why it's an improvement:** the dirty-set step and the conflict step in the same save flow now share one array-guarded comparator, so an array-vs-object edge can never be classified inconsistently between them.
- **Change:** exported the array-guarded `shallowEqual` from `swap-drafts.ts` and imported it into `save-with-swap.ts`, deleting that file's unguarded copy.
- **Test:** src/lib/atproto/__tests__/save-with-swap.test.ts — refactor (dedup); no natural red-before test since both copies already agreed on observable output, so the added case is a regression guard asserting cross-step agreement; full suite green.
- **Gate:** vitest green · tsc 0 errors · lint 69 warnings

### quality-027 — resolveCanonicalEndorsementDef treats missing createdAt as earliest · IMPLEMENTED
- **Why it's an improvement:** a malformed endorsement def lacking `createdAt` can no longer win canonical and schedule the well-formed defs for background deletion; the self-heal logic now keeps the real def.
- **Change:** the canonical sort now treats a missing/empty `createdAt` as latest (sorts to the END) instead of as `""` (earliest); exported the helper so it is directly testable.
- **Test:** src/lib/atproto/__tests__/badges.test.ts — added `resolveCanonicalEndorsementDef` cases; the two malformed-def cases fail before, pass after.
- **Gate:** vitest green · tsc 0 errors · lint 69 warnings

### quality-028 — location.ts uses shared strict parseAtUri · IMPLEMENTED
- **Why it's an improvement:** A single, tested at:// parser is used everywhere; malformed URIs with trailing segments are now rejected consistently instead of being silently accepted.
- **Change:** Deleted the private lenient `parseAtUri` (and its `ParsedAtUri` type) in location.ts and imported the shared strict parser from `@/lib/atproto/activity-uri`.
- **Test:** src/lib/atproto/__tests__/location.test.ts — fails before, passes after (4-segment uri → `readLocationStrongRef` returns null, no fetch).
- **Gate:** vitest green · tsc 0 errors · lint 69 warnings

### quality-029 — parseNotificationsPage trusts indexer node shape · IMPLEMENTED
- **Why it's an improvement:** A partial indexer edge no longer surfaces as a fully-typed Notification with `count: undefined`, which fed NaN row text and a `.includes` throw in NotificationRow.
- **Change:** Extended the malformed-edge guard to also require `count` (number), `latestRecordUri`, `latestRecordCid`, and `latestAuthor`; such edges are skipped with the existing console warning.
- **Test:** src/lib/atproto/__tests__/notifications.test.ts — fails before, passes after.
- **Gate:** vitest green · tsc 0 errors · lint 69 warnings

### quality-030 — resolveHandle returns alsoKnownAs verbatim · IMPLEMENTED
- **Why it's an improvement:** A non-handle (e.g. `example.com/some/path` from an attacker-controllable did:web doc) no longer leaks through as a handle.
- **Change:** After stripping `at://`, resolveHandle now rejects values that are empty, lack a dot, or contain a slash/whitespace, returning null instead.
- **Test:** src/lib/atproto/__tests__/resolve-handle.test.ts — fails before, passes after.
- **Gate:** vitest green · tsc 0 errors · lint 69 warnings

### quality-006 — useOrgProfile module-level cache · IMPLEMENTED
- **Why it's an improvement:** The hook is mounted in 4 layout components on every authenticated page; a shared cache + in-flight map collapses 3-4 concurrent identical fan-outs (incl. an off-app plc.directory resolve) per navigation into one.
- **Change:** Added a module-level bounded cache keyed by `activeOrg.groupDid` plus an in-flight `Map` (mirroring use-org-marker / use-author-info); state is seeded from cache and refetch() stays as a cache-evicting force path. Behavior-preserving for the only consumed output (`orgAvatarUrl`).
- **Test:** refactor; no natural test (testable=false) — full suite green.
- **Gate:** vitest green · tsc 0 errors · lint 69 warnings

### quality-037 — useOrgProfile.refetch exposes fetchData directly · SKIPPED
- **Reason:** Already fixed by quality-006 (commit fde4b18) — `refetch` is now a no-arg `useCallback(async (): Promise<void> => …, [groupDid])` that calls `fetchOrgProfileData(groupDid)` only; the typed return is `() => Promise<void>` and no MouseEvent can reach getOrgProfile's AbortSignal param. Applying the literal Recommendation would drop quality-006's cache-eviction/refresh-tick logic (a regression), so no production change is warranted; a test-first guard could not go red.

### quality-031 — useHomeFeed INVALID_CURSOR recovery controller now tracked · IMPLEMENTED
- **Why it's an improvement:** Prevents a setState-after-unmount when the hook unmounts during an INVALID_CURSOR recovery reload.
- **Change:** Store the recovery `AbortController` in a ref that the effect cleanup aborts (aborting any prior recovery first), instead of an untracked local.
- **Test:** src/hooks/__tests__/use-home-feed-invalid-cursor.test.tsx — fails before, passes after.
- **Gate:** vitest green · tsc 0 errors · lint 69 warnings

### quality-032 — window-focus revalidation handlers now pass an abortable signal · IMPLEMENTED
- **Why it's an improvement:** A focus event near unmount could setState on an unmounted hook because the focus fetch carried no signal, so the existing `if (signal?.aborted)` guard was dead code.
- **Change:** Each focus handler (useReceivedEndorsements, useProfileResponses, useBlueskyFollows) now owns a ref'd AbortController aborted on next focus and on effect cleanup/unmount, and passes its signal into the fetch path.
- **Test:** src/hooks/__tests__/focus-revalidate-abort.test.tsx — fails before, passes after.
- **Gate:** vitest green · tsc 0 errors · lint 69 warnings

### quality-033 — useBskyPosts.loadMore can append a superseded page on handle change · BLOCKED
- **Reason:** Could not reproduce the race in a faithful failing test: on every handle change the effect synchronously clears the cursor (blocking a new loadMore via the `!cursor` guard) and calls fetchPage, bumping the shared requestIdRef past any in-flight loadMore, so a stale loadMore's fetchPage returns null and never appends — both interleavings probed stay green. Per the LOW-CONFIDENCE coordination note, blocking rather than making a speculative change.

### quality-034 — useEndorsementLists mutation callbacks read stale lists via closure · IMPLEMENTED
- **Why it's an improvement:** A concurrent refetch landing during a mutation's await is no longer clobbered by an optimistic merge built from a pre-await snapshot.
- **Change:** Added a `listsRef` mirror; mutation callbacks now read the current list from `listsRef.current` and build update/remove merges off the live state inside the functional updater, and `lists` was dropped from their deps.
- **Test:** src/hooks/__tests__/use-endorsement-lists-stale-closure.test.tsx — fails before, passes after.
- **Gate:** vitest green · tsc 0 errors · lint 69 warnings

### quality-035 — useExploreData loadMore passes signal:null · IMPLEMENTED
- **Why it's an improvement:** A filter change now cancels the in-flight loadMore page instead of fetching-then-discarding it, saving wasted network on this network-heavy route.
- **Change:** loadMore now passes the current generation's AbortController signal into loadPage (via a controllerRef the initial-fetch effect populates) instead of `null`; the effect cleanup's existing abort cancels it.
- **Test:** refactor; no natural test (testable: false) — full suite green.
- **Gate:** vitest green · tsc 0 errors · lint 69 warnings

### quality-036 — Promoted object-URL preview never revoked after save · IMPLEMENTED
- **Why it's an improvement:** The avatar/banner blob: preview promoted into the local mirror on save no longer leaks for the page lifetime; it is revoked once the canonical CDN URL catches up or on unmount.
- **Change:** Track promoted localAvatarUrl/localBannerUrl in refs via coordinated tracked setters; clear+revoke the mirror in effects keyed on the avatarUrl/bannerUrl props (refetch caught up) and revoke any held blob URL on unmount.
- **Test:** refactor; no natural test (testable: false) — full suite green.
- **Gate:** vitest green · tsc 0 errors · lint 69 warnings

### quality-038 — usePendingAwardsCount returns 0 not null when logged out · IMPLEMENTED
- **Why it's an improvement:** Aligns the hook with its JSDoc contract so a future consumer that distinguishes null (hide) from 0 (loaded-but-empty) won't misbehave.
- **Change:** The logged-out / no-did early return now yields `null` instead of `0`, matching the cold-cache and loading branches.
- **Test:** src/hooks/__tests__/use-pending-awards-count-logged-out.test.tsx — fails before, passes after.
- **Gate:** vitest green · tsc 0 errors · lint 69 warnings

### quality-039 — useBottomSheetDrag visualViewport styles not reset on cleanup · IMPLEMENTED
- **Why it's an improvement:** A reused/reopened sheet node no longer flashes a stale clamped maxHeight/bottom until the next resize event.
- **Change:** The visualViewport effect cleanup now resets `maxHeight=''` and `bottom=''` (capturing the node in a local to satisfy exhaustive-deps).
- **Test:** refactor; no natural test (testable=no) — full suite green.
- **Gate:** vitest green · tsc 0 errors · lint 69 warnings

### quality-040 — useBottomSheetDrag dismiss timeout can fire after unmount · IMPLEMENTED
- **Why it's an improvement:** Prevents the drag-to-dismiss onClose callback from firing 250ms after the sheet unmounts, removing a sharp edge for non-state callers.
- **Change:** Store the dismiss setTimeout id in a `dismissTimeout` ref and clearTimeout it in an unmount cleanup effect.
- **Test:** refactor; no natural test (testable=false) — full suite green.
- **Gate:** vitest green · tsc 0 errors · lint 69 warnings

### quality-041 — useOrgMarker.refresh stale value during concurrent fetch · IMPLEMENTED
- **Why it's an improvement:** A post-save refresh on a page with a concurrent in-flight mount can no longer re-read the pre-save record.
- **Change:** On refresh (refreshTick > 0) the effect now also `inFlight.delete(did)` alongside `cache.delete(did)`, so the stale in-flight promise can't satisfy the refetch.
- **Test:** src/hooks/__tests__/use-org-marker-refresh-inflight.test.tsx — fails before, passes after.
- **Gate:** vitest green · tsc 0 errors · lint 69 warnings

### quality-012 — Extract shared PersonCard + name-cache hook · IMPLEMENTED
- **Why it's an improvement:** removes a copy-pasted PersonCard and two duplicate module-scoped name caches across the profile endorsements/followers tabs, leaving one source of truth.
- **Change:** extracted the superset PersonCard into `src/components/profile/person-card.tsx` (note?/listTitle? optional) and the duplicated `useAuthorNamesMap` batch hook into `src/hooks/use-author-names-map.ts`; both profile tabs now import the shared versions (pure, behavior-preserving).
- **Test:** `src/components/profile/__tests__/person-card.test.tsx` — fails before (no module), passes after; asserts name/handle/date rows match with and without the optional note/list rows.
- **Gate:** vitest green · tsc 0 errors · lint 69 warnings

### quality-043 — ProjectItemRow permanent skeleton on load failure · IMPLEMENTED
- **Why it's an improvement:** a failed/404 project no longer shows an eternal grey skeleton; viewers get a terminal fallback row and owners can still remove the dangling reference.
- **Change:** gated the skeleton on `isLoading`; when `!project && !isLoading`, render a fallback `ItemRowShell` (URI rkey tail or "Project unavailable", remove button preserved for owners).
- **Test:** src/components/profile/__tests__/project-item-row.test.tsx — fails before, passes after.
- **Gate:** vitest green · tsc 0 errors · lint 69 warnings

### quality-044 — replace hand-rolled outside-click/Escape with useClickOutsideClose · IMPLEMENTED
- **Why it's an improvement:** Removes three duplicated mousedown/keydown effects in favor of the shared hook, gaining its onClose-ref optimization (no listener re-attach on re-render).
- **Change:** Replaced the inline outside-click + Escape effects in profile-endorsements.tsx (sort + filter dropdowns) and endorsement-lists.tsx (sort dropdown) with `useClickOutsideClose` anchored on each existing `*__sort-wrap` div.
- **Test:** refactor; no natural test — full suite green.
- **Gate:** vitest green · tsc 0 errors · lint 69 warnings

### quality-045 — three near-identical CreateListModal / bulk-paste modals duplicated · BLOCKED
- **Reason:** escalate-to-judgment — the two CreateListModals diverge in user-visible behavior (focus+select vs focus, silent-return vs "Title is required", maxLength 120/500 vs 256/1000, separate CSS class families) and the two paste modals have entirely different state machines + action rows (PasteProgress vs showCloseOnly/showTryAgain), so a single shared dialog/shell cannot be a pure behavior-preserving extraction; it would either change behavior on one surface or require a large flag surface that doesn't reduce complexity.

### quality-046 — createdAt comparators never return 0 (unstable sort) · IMPLEMENTED
- **Why it's an improvement:** Same-timestamp lists no longer shuffle their relative order between renders — the createdAt sort is now stable.
- **Change:** Routed `sortLists`' created-desc / created-asc comparators in endorsement-lists.tsx through a three-way `compareString` (returns 0 on equality), matching profile-endorsements.tsx; exported `sortLists` for unit testing.
- **Test:** src/components/profile/__tests__/endorsement-lists-sort.test.ts — fails before (sortLists not exported), passes after.
- **Gate:** vitest green · tsc 0 errors · lint 69 warnings

### quality-047 — Raw at-URI used as the accessible label for item checkboxes · IMPLEMENTED
- **Why it's an improvement:** Screen readers no longer announce the full DID+collection+rkey at-URI for each select checkbox; they get a concise positional label instead.
- **Change:** In profile-lists.tsx the item checkbox `aria-label` now uses the 1-based row index (`Select item ${index + 1}`) rather than the raw at-URI.
- **Test:** refactor; no natural test (testable=false) — full suite green.
- **Gate:** vitest green · tsc 0 errors · lint 69 warnings

### quality-048 — sidebar EndorseButton snaps back to Endorse on list-append failure · IMPLEMENTED
- **Why it's an improvement:** A failed list-append no longer rolls back the already-persisted award's optimistic "Endorsed" state, removing a duplicate-endorsement nudge.
- **Change:** Extracted the reason-confirm orchestration into `runEndorseReasonConfirm`, which refetches the given set before the list-append and, on append failure, keeps optimistic=true while surfacing only the attribution error.
- **Test:** src/components/profile/__tests__/endorse-reason-confirm.test.ts — fails before, passes after.
- **Gate:** vitest green · tsc 0 errors · lint 69 warnings

### quality-007 — Security-critical sanitize.ts has no unit tests · IMPLEMENTED
- **Why it's an improvement:** Locks in the pinned invisible-char regex and whitespace/@/lowercase rules at the login/feedback boundary, so a future regex edit that narrows the allowlisted code-point ranges fails CI instead of silently regressing.
- **Change:** Added a co-located test file for `stripInvisible`/`sanitizeEmail`/`sanitizeHandle`; no production change.
- **Test:** src/lib/utils/__tests__/sanitize.test.ts — pure test addition (no defect to fix); asserts current correct behavior, full suite green.
- **Gate:** vitest green · tsc 0 errors · lint 69 warnings

### quality-014 — search-actors logs raw error via logSafe · IMPLEMENTED
- **Why it's an improvement:** Adopts the repo-wide logSafe convention so the catch-all error log is redaction-safe and won't leak if the upstream becomes authenticated.
- **Change:** Replaced `console.error("[search-actors]", err)` with `logSafe("[search-actors] upstream error", err)` and added the import.
- **Test:** refactor; no natural test — full suite green
- **Gate:** vitest green · tsc 0 errors · lint 69 warnings

### quality-015 — notifications upstream error log includes up to 500 chars of the response body · IMPLEMENTED
- **Why it's an improvement:** Stops writing the user's own notification data (DIDs, record URIs) into server logs — removes a PII-in-logs smell.
- **Change:** Changed the non-2xx `console.warn` to log only `upstream.status`, dropping the `responseBody.slice(0, 500)` argument.
- **Test:** refactor; no natural test (testable: no) — full suite green
- **Gate:** vitest green · tsc 0 errors · lint 69 warnings

### quality-016 — xrpcError clamps upstream status to valid HTTP range · IMPLEMENTED
- **Why it's an improvement:** An out-of-range upstream status (0, -1, 1000, non-integer) no longer throws a RangeError inside the terminal catch and collapses to a clean masked 500 instead of an opaque framework 500.
- **Change:** In `xrpcError` (route.ts), clamp the resolved status inline — `Number.isInteger(s) && s>=200 && s<=599 ? s : 500` — before it reaches `NextResponse.json(..., { status })`.
- **Test:** src/app/api/xrpc/[...method]/__tests__/xrpc-error.test.ts — new case "clamps out-of-range upstream statuses to 500 (quality-016)"; fails before, passes after.
- **Gate:** vitest green · tsc 0 errors · lint 69 warnings

### quality-017 — indexer body-size cap measures UTF-16 length not bytes · IMPLEMENTED
- **Why it's an improvement:** The documented 32KB body cap is now enforced in bytes, so a multi-byte body can no longer slip ~3x the byte limit past the post-read check.
- **Change:** Replaced `text.length > MAX_BODY_SIZE` with `Buffer.byteLength(text, "utf8") > MAX_BODY_SIZE` in the indexer route's post-read size check.
- **Test:** src/app/api/indexer/__tests__/route.test.ts — new case posts >32KB of multi-byte chars with no Content-Length and asserts 413; fails before (200), passes after.
- **Gate:** vitest green · tsc 0 errors · lint 69 warnings

### quality-008 — Popover content uses --z-popover token, not z-[40] · IMPLEMENTED
- **Why it's an improvement:** Restores token-driven stacking so re-tiering the z-map can't silently break every popover consumer (CLAUDE.md hard rule 5).
- **Change:** Swapped the hardcoded `z-[40]` for `z-[var(--z-popover)]` in `PopoverContent`'s className.
- **Test:** refactor; no natural test — full suite green.
- **Gate:** vitest green · tsc 0 errors · lint 69 warnings

### quality-013 — onboarding step-profile creates object URLs in render without revoking · IMPLEMENTED
- **Why it's an improvement:** Stops StepProfile leaking a fresh avatar+banner blob URL on every re-render (e.g. each keystroke); blob URLs are now revoked on change/unmount.
- **Change:** Moved `URL.createObjectURL` for replacement avatar/banner into `useMemo` keyed on the File and added cleanup effects that revoke the previous URL, mirroring use-profile-inline-edit / avatar-upload.
- **Test:** refactor; no natural test (testable=false) — full suite green.
- **Gate:** vitest green · tsc 0 errors · lint 69 warnings

<!-- PHASE2-LOG-APPEND-POINT -->
