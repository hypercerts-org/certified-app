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

<!-- PHASE2-LOG-APPEND-POINT -->
