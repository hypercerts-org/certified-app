# Overnight Review — certified-app (branch overnight-review)

This review consolidates an 18-module + 6-lens pass (90 raw findings), each independently verified. After merging duplicates (OG-image 404, context-update XSS, safeRedirect NODE_ENV drift, dead `forwardGeocode`) and dropping the items a verifier refuted, **86 distinct findings remain**: 11 bugs, 9 risks, 56 quality items, and 10 judgment calls held for you. The highest-signal cluster is a handful of confirmed user-facing defects: a stored-XSS sink in context-update attachments (no `safeHttpUrl` scheme gate), broken OG/Twitter share images on the landing + four legal pages, a group-write conflict path where `InvalidSwap` detection is dead (silent edit loss), avatar/banner uploads that can be silently dropped on Save, and a project `location` written as a strongRef but read as a string so it never renders. Most remaining items are consolidation/dead-code/token-compliance hygiene plus a large untested-utility surface and a fully-absent CI gate. Two refuted items were dropped after verification. Many low-stakes findings carry verifier verdict "unverified (deferred to the Phase-2 test gate)"; they are kept because they are cheap, test-gated, and low-risk to implement.

## Counts

| Tag | Critical | High | Medium | Low | Total |
|---|---|---|---|---|---|
| bug | 0 | 3 | 4 | 4 | 11 |
| risk | 0 | 1 | 3 | 5 | 9 |
| quality | 0 | 0 | 9 | 47 | 56 |
| judgment | 0 | 0 | 4 | 6 | 10 |
| **Total** | **0** | **4** | **20** | **62** | **86** |

## How to read this

Four tags, three of them auto-implemented in Phase 2 and one held for you:

- **bug** — code that produces incorrect behavior against its own stated/implemented contract (wrong output, data loss, dead detection path, broken UI state). Auto-implemented in Phase 2.
- **risk** — defense-in-depth / latent-exposure gaps: a thing that is not provably exploited today but diverges from a safer established pattern (un-redacted error echo, missing scheme allowlist, raw-error logging, missing rate limiter). Auto-implemented in Phase 2.
- **quality** — maintainability: dead code, duplication, token/aria drift, missing tests, naming/contract mismatches. No external behavior change. Auto-implemented in Phase 2.
- **judgment** — anything that changes external behavior, a public API/contract, a data schema/lexicon, dependency choices, or architecture. **HELD for Holke to decide** — not auto-implemented.

**Phase 2 mechanics:** each bug + risk + quality item is implemented as one test-gated commit. If implementing an item turns the test suite red and the fix can't be made green cleanly, that commit is reverted and the item is logged as blocked. Judgment items are never auto-implemented; they wait for your call below.

---

## Bugs

### bug-001 — Context-update URI attachment rendered as `<a href>` with no scheme allowlist (stored javascript: XSS)
- **Severity:** high
- **Confidence:** high (confirmed by two independent agents: `context-1`, `xss-1`)
- **Files:** src/components/context/context-updates.tsx:358, :401, :425; src/lib/atproto/context-attachment.ts:210-216
- **Evidence:** `resolveAttachment` validates only `typeof entry.uri === "string" && entry.uri.length > 0` — no scheme check — then three render sinks emit `href={attachment.uri}` / `href={uri}` verbatim. Records come from a federated PDS via the XRPC read proxy (`fetchContextAttachments`), so a record author can set `uri: "javascript:alert(document.cookie)"`; a viewer click executes script in the certified.app origin. The codebase's canonical guard `safeHttpUrl` (src/lib/utils/safe-url.ts) is applied in every sibling renderer (leaflet-document, leaflet-iframe-node, rich-text) but never imported under src/components/context/. Mandated by AGENTS.md §17.6 / §22.11 / §12.
- **Recommendation:** Reject the uri in `resolveAttachment` unless `safeHttpUrl(entry.uri)` is non-null (fixes all three sinks at the source), or compute `const href = safeHttpUrl(uri)` per tile and render a `<span>` when null. Import from `@/lib/utils/safe-url`.
- **Testable:** yes — unit-test `resolveAttachment({ $type: "org.hypercerts.defs#uri", uri: "javascript:alert(1)" })` returns null; a normal https uri still resolves.
- **Risk of change:** low
- **Note:** Original tag was `risk` on both reports; a verifier on `context-1` suggested `bug`/`high`. Promoted to bug because it is a concrete, reachable security defect with a tested in-repo guard available.

### bug-002 — OG/Twitter share image references a non-existent file on /welcome + 4 legal pages
- **Severity:** high
- **Confidence:** high (confirmed by two independent agents: `landing-og-1`, `approot-og-image-404`)
- **Files:** src/app/welcome/page.tsx:20, :34; src/app/terms/page.tsx:14; src/app/privacy/page.tsx:14; src/app/dsa/page.tsx:14; src/app/imprint/page.tsx:14 (correct refs for comparison: src/app/layout.tsx:50, :61; src/app/about/page.tsx:16)
- **Evidence:** Five pages set the OG/Twitter image to `…/assets/certified-hero-1200x630.png`, but the only asset on disk is `public/assets/certs-hero-1200x630.png` (verified via `find`). Root layout and /about correctly reference `certs-hero`. No rewrite/redirect rescues the `certified-` path, so the most-shared landing URL and four legal pages serve a 404 image — unfurls render with no preview. AGENTS.md §18/§20 document the name as `certified-hero`, so the docs are stale, not authoritative.
- **Recommendation:** Change the five `certified-hero-1200x630.png` strings to `certs-hero-1200x630.png` (lowest-risk; matches the file + layout + about). Add a test asserting every metadata image path resolves to a file under `public/`.
- **Testable:** yes — assert each `images` URL in the exported `metadata` of welcome/terms/privacy/dsa/imprint resolves via `fs.existsSync` under `public/`.
- **Risk of change:** low

### bug-003 — InvalidSwap detection is dead for the group BFF write path (group-record swap saves silently lose edits)
- **Severity:** high
- **Confidence:** high (confirmed)
- **Files:** src/lib/atproto/repo-write.ts:89-111; src/app/api/groups/[groupDid]/project/route.ts:270-273; src/app/api/groups/[groupDid]/activity/route.ts:125,174; src/lib/utils/api.ts:19-31; src/lib/atproto/save-with-swap.ts:108-114
- **Evidence:** `writeToRepo` detects a CID-precondition failure via `data.code === "InvalidSwap" || data.error === "InvalidSwap"`. That shape is produced only by the own-DID XRPC proxy. The group routes return `{ error: message }` with NO `code` field (the discriminator is dropped by `extractRouteError`, which never reads `e.error`), and `message` is the redacted human string — never literally "InvalidSwap". So for group writes the detection never fires, `writeToRepo` throws a generic Error, and `saveWithSwap` re-throws past the conflict-rebase + drafts-recovery machinery. The user's unsaved edits are not persisted and they get a generic failure instead of the conflict banner. Reachable via `putCertRecord`/`putProjectRecord` whenever a group admin's inline edit races another writer. The in-code comment claiming the group routes "surface the discriminator in data.code" is factually false.
- **Recommendation:** Make the group BFF routes preserve the discriminator — return `{ error: message, code: err.error }` (or map InvalidSwap → HTTP 409 / a stable `code`), mirroring the XRPC proxy. Alternatively treat HTTP 409 as InvalidSwap inside `writeToRepo`.
- **Testable:** yes — in repo-write.test.ts, with `targetDid !== ownDid`, mock authFetch to resolve the group route's actual `{ error: "Record was modified" }` body and assert `writeToRepo` rejects with `InvalidSwapError`.
- **Risk of change:** medium

### bug-004 — Inline-edit Save while an avatar/banner upload is in-flight silently drops the new image
- **Severity:** high
- **Confidence:** high (confirmed)
- **Files:** src/hooks/use-profile-inline-edit.ts:483-516, :556-576, :674-688; src/app/profile/[handle]/page.tsx:316-322; src/components/ui/edit-banner.tsx:73
- **Evidence:** `handleAvatarFile`/`handleBannerFile` set the object-URL preview synchronously but only set `pendingAvatarBlob` after the upload resolves. `handleSave` reads `pendingAvatarBlob`; if it is still null it falls back to the OLD `base?.avatar`, so the new image is not written. The post-save mirror keys off `pendingAvatarPreviewUrl` (which IS set), promoting the preview to read-mode display — so the UI shows the new avatar as saved while the PDS has the old one. The EditBanner Save button is gated only on `isSaving`; `hasPendingAvatar/Banner` never gate Save, and no upload-in-flight state is tracked. On the next resolve-did refetch the old image reappears.
- **Recommendation:** Gate Save while an upload is pending — await the in-flight upload Promise inside `handleSave`, or pass `canSave={!(previewUrl && !blob)}` to EditBanner (EditBanner already supports `canSave`).
- **Testable:** yes — mock `uploadAvatar` as a never-resolving promise, pick a file, call `handleSave`, assert `putProfile` is not called with the stale `base.avatar` (or that Save is disabled/awaits).
- **Risk of change:** low

### bug-005 — Project `location` is written as a strongRef object but read as a string — never displays
- **Severity:** medium  *(downranked below the high bugs; high-confidence)*
- **Confidence:** high (confirmed)
- **Files:** src/components/project/project-detail.tsx:325, :1024; src/app/project/new/page.tsx:303; src/app/project/[did]/[rkey]/edit/page.tsx:489
- **Evidence:** Both create and edit persist `location` as `{ uri, cid }`. The detail view reads it with `asString(...)`, which returns null for an object, so the Location meta row never renders and `hasAnyMeta` never counts it (even bypassing `asString`, `{location}` would print `[object Object]`). The edit page's own hydration parses the strongRef + resolves the name correctly, confirming the intended shape.
- **Recommendation:** In project-detail.tsx, resolve the strongRef like the edit page (parse at:// → getRecord → `splitLocationName(value.name)`), or at minimum guard the object shape so `[object Object]` never renders. Keep the legacy string path.
- **Testable:** yes — render `<ProjectDetail>` with `value.location = { uri, cid }`, mock getRecord → `{ value: { name: "Berlin" } }`, assert a Location row appears and `[object Object]` never does.
- **Risk of change:** low

### bug-006 — Audit-log result pill never gets its color class (result allowlist mismatches the actual values)
- **Severity:** medium
- **Confidence:** high (confirmed)
- **Files:** src/components/groups/org-settings.tsx:588, :591
- **Evidence:** `safeResult = ["success","failure","error"].includes(entry.result) ? entry.result : "unknown"`, but `AuditEntry.result` is typed `"permitted" | "denied"` (types.ts:82) and the only CSS classes are `--permitted`/`--denied` (pages.css:587,592). Neither domain value is in the allowlist, so `safeResult` is always `"unknown"` → `org-audit__result--unknown`, a class with no CSS. Every result chip renders unstyled; the raw text masks the breakage.
- **Recommendation:** `const safeResult = ["permitted","denied"].includes(entry.result) ? entry.result : "unknown"`. Keep type + CSS in sync.
- **Testable:** yes — render OrgSettings with stubbed `{ result: "permitted" }` / `{ result: "denied" }` and assert the element carries `--permitted` / `--denied`, not `--unknown`.
- **Risk of change:** low

### bug-007 — /endorsements Received tab hides rejected endorsements with no way to un-reject
- **Severity:** medium
- **Confidence:** high (confirmed)
- **Files:** src/app/endorsements/page.tsx:149, :134; src/hooks/use-received-endorsements.ts:373
- **Evidence:** `ReceivedEndorsementsList` is the viewer's own management inbox (it renders Accept/Reject controls) but calls `useReceivedEndorsements(did)` without `{ includeRejected: true }`, so the hook strips every award with `responseState === "rejected"`. Already-rejected endorsements are invisible, and once an indexer re-scan joins the rejected state the row vanishes with no UI to bring it back. The profile owner surface correctly passes `includeRejected: viewerIsOwner` (per §22.21) — this page is the inconsistent owner surface. (Verifier note: the row does not vanish *immediately* on click, only after the 5-min cache refresh; the steady-state outcome is as described.)
- **Recommendation:** Pass `{ includeRejected: true }` and render rejected rows (or add the same hide/only-rejected/show-all filter the profile surface uses).
- **Testable:** yes — mock the hook to return one award with `responseState: "rejected"`; assert the row is absent today and renders after the fix.
- **Risk of change:** medium

### bug-008 — Blob/image upload errors are swallowed — cert/project can publish without the previewed image
- **Severity:** medium
- **Confidence:** high (confirmed)
- **Files:** src/app/create/page.tsx:320; src/app/project/new/page.tsx:205; src/app/project/[did]/[rkey]/edit/page.tsx:327; src/components/project/project-detail.tsx:553
- **Evidence:** `handleImageFile`/`handleBannerFile` `await uploadBlob(...)` with NO try/catch; `ImageEditOverlay.handleChange` uses try/finally with NO catch, so a rejection becomes an unhandled promise rejection (no global handler exists). The optimistic preview is already shown but `pendingImageBlob` stays null, and `record.image` is only attached when the blob exists — so the record publishes without the previewed image. `canSubmit` also doesn't wait on an in-flight upload, so Publish can fire before the upload resolves.
- **Recommendation:** Wrap each `uploadBlob` call in try/catch: set the page's `error` state and clear/revoke the dangling preview + blob. Optionally add an `isUploadingImage` flag to `canSubmit`. (create and project/new already render `<ErrorMessage>` from `error` state.)
- **Testable:** yes — mock `uploadBlob` to reject, fire `onFile`, assert an error surfaces and the preview is cleared rather than leaving a submittable form.
- **Risk of change:** low

### bug-009 — Banner picker in ProfileEditForm shows no live preview after selecting a file
- **Severity:** medium
- **Confidence:** high (confirmed)
- **Files:** src/components/profile/profile-edit-form.tsx:344-348; src/components/profile/banner-upload.tsx:35-99; src/app/settings/edit-profile/page.tsx:202-203; src/app/groups/[groupDid]/edit-profile/page.tsx:198-202
- **Evidence:** `BannerUpload` renders only from `currentBannerUrl`; its doc-comment says the parent owns the object-URL preview, but neither consumer creates one — `currentBannerUrl` is passed straight from the saved record. After picking a banner the image area keeps showing the OLD banner; the only feedback is the button label flipping to "Replace banner". The avatar self-previews (AvatarUpload creates an object URL), so the two controls behave inconsistently in the same form. The save path still persists correctly — this is a UX feedback gap, not data loss.
- **Recommendation:** In ProfileEditForm create+revoke an object URL on banner pick and pass it as `currentBannerUrl` (falling back to saved), or make BannerUpload self-preview like AvatarUpload. Apply to the group edit page too.
- **Testable:** yes — fire a change on the banner input with a File and assert the rendered `<img src>` becomes a blob:/object URL.
- **Risk of change:** low

### bug-010 — Location MapPin in feed PreviewCard never renders when a date period is also present
- **Severity:** low
- **Confidence:** high (confirmed)
- **Files:** src/components/home/home-feed.tsx:1129-1138, :966-981
- **Evidence:** The pin gate `i === 0 && withLocationIcon && i === meta.length - 1` is only satisfiable when meta has exactly one entry. CertPreview builds `meta = [period, "N locations"]`, so when a cert has both a period and locations the pin renders nowhere; it only appears when location is the sole meta item. Cosmetic — the "N locations" text still renders.
- **Recommendation:** Push a ReactNode meta entry (`<><MapPin/> {n} locations</>`) and drop `withLocationIcon`, mirroring ExploreListRow / CertListRow which already do exactly this.
- **Testable:** yes — render PreviewCard with `meta={["Jan–Mar 2025","3 locations"]}` + `withLocationIcon` and assert a MapPin svg appears next to "3 locations".
- **Risk of change:** low

### bug-011 — useUserActivities.loadMore appends stale-DID records after a profile switch and has no URI dedup
- **Severity:** low  *(verifier downgraded from medium — latent/unreachable today)*
- **Confidence:** medium (confirmed at the function level; no reachable live caller)
- **Files:** src/hooks/use-user-activities.ts:52, :57
- **Evidence:** `loadMore()` calls `fetchActivities(did, cursor, 20)` with no AbortSignal and no generation guard, then `setActivities((prev) => [...prev, ...data.records])` with no dedup. An in-flight loadMore for profile A can resolve after a switch to B and append A's rows to B's reset list; sibling hooks (use-explore, use-home-feed) gate on a generation token and dedup by URI. **Live impact is latent:** the only consumer that threads `loadMore` is `UserFeed`, which is dead code (see quality-001); the two mounted consumers never call `loadMore`.
- **Recommendation:** Thread an AbortController/generation token through loadMore like use-explore, bail when superseded, and dedup appended records by `uri` (mirror use-home-feed's `seen` Set). Coordinate with quality-001 (delete UserFeed) — fixing or deleting both resolves the latent path.
- **Testable:** yes — resolve page 1 for did=A, delay loadMore, switch to B, then resolve A's loadMore; assert `activities` contains only B's records and no duplicate URIs.
- **Risk of change:** low

---

## Risks

### risk-001 — XRPC proxy echoes un-redacted 4xx upstream messages to the client
- **Severity:** medium
- **Confidence:** high (confirmed)
- **Files:** src/app/api/xrpc/[...method]/route.ts:110-111, :123
- **Evidence:** In `xrpcError`, the 4xx message returned to the client is the raw upstream string; `redactSecrets` is applied only to the server log, not the returned value (lines 388-391 GET / 579-582 POST echo it as `{ error: message }`). The canonical `extractRouteError` does the opposite — `redactSecrets(e.message)` for 4xx — and that posture is pinned by api.test.ts. atproto error messages have been observed to embed JWTs/DPoP proofs, so a 400/401/403 on createRecord/putRecord/updateEmail/resetPassword can surface secret-shaped fragments to the browser.
- **Recommendation:** `const message = status >= 500 || !rawMessage ? "Internal server error" : redactSecrets(rawMessage)`. `redactSecrets` is already imported.
- **Testable:** yes — call `xrpcError({ status: 400, message: "bad token Bearer eyJabc.def.ghi" })` and assert the returned message is redacted.
- **Risk of change:** low

### risk-002 — groups/register logs the raw atproto error (DPoP/Bearer leak) on the org-limit check failure path
- **Severity:** medium
- **Confidence:** high (confirmed)
- **Files:** src/app/api/groups/register/route.ts:129
- **Evidence:** `console.error("Org creation limit check failed:", err)` logs the raw error from `getServiceAuth(...)` (an authenticated OAuth/DPoP Agent call). Per log-safe.ts, the atproto SDK attaches the upstream Request (DPoP proofs + Bearer tokens) on `err.cause`, and stack traces serialize the same Request; `logSafe` exists to drop `.cause`/`.stack` and redact `.message`. Every sibling route uses logSafe/extractRouteError; this line is the outlier.
- **Recommendation:** `logSafe("[groups/register] org-limit check failed", err)` (already imported). Keep the 503.
- **Testable:** yes — pass an Error with `Bearer eyJ…` in `.message` and a `.cause` Request; assert the emitted payload is redacted and omits cause/stack.
- **Risk of change:** low

### risk-003 — Profile inline-edit save is a non-atomic multi-write; mid-sequence failure orphans/partially persists with no rollback
- **Severity:** low  *(verifier downgraded from medium — orphans are harmless records in the user's own repo, not data loss)*
- **Confidence:** medium (confirmed; "dataloss" framing overstated)
- **Files:** src/hooks/use-profile-inline-edit.ts:595, :630, :659, :697
- **Evidence:** `handleSave` does up to three sequential PDS writes (`putProfile` → `putLocationRecord` → `putOrgMarker`) with no transaction. If `putLocationRecord` mints a new location record (first-time add, no rkey) but `putOrgMarker` then throws, the location record is orphaned and re-minted on each retry. The catch reverts in-memory mirrors, leaving a transient profile/marker divergence that self-heals on the next successful save. No data is lost.
- **Recommendation:** Reuse a stable rkey for the location record so retries overwrite rather than orphan (putLocationRecord already supports this), or mint the location record only after the referencing marker write succeeds. On partial success, surface which part failed.
- **Testable:** yes — mock putProfile resolve / putOrgMarker reject; assert no second orphan location record is created on retry.
- **Risk of change:** medium

### risk-004 — groups/register does not server-side sanitize handle and forwards email unvalidated
- **Severity:** low
- **Confidence:** medium (confirmed)
- **Files:** src/app/api/groups/register/route.ts:31-50, :151
- **Evidence:** The route validates only `handle.length > 253` and `ownerDid === auth.did`; it never runs `sanitizeHandle`/`stripInvisible` on handle nor validates email, and forwards `{ handle, ownerDid, email }` verbatim. AGENTS.md §17.6/§24.5 mandate sanitizing at the boundary even when the client also does; the create UI does not sanitize either. The group service is expected to validate, so this is a defense-in-depth gap. (Email path is practically unreachable today — `registerGroup`'s email arg has no caller.)
- **Recommendation:** `sanitizeHandle(handle)` (re-check the 253 cap on the result) and validate email with feedback/route.ts's regex + 254-char cap before forwarding; drop/reject on failure.
- **Testable:** yes — POST a handle with a zero-width space and assert the forwarded value is stripped; POST `email: "not-an-email"` and assert 400 or email omitted.
- **Risk of change:** medium

### risk-005 — XRPC proxy passes createRecord/putRecord body verbatim — no allowlist on envelope fields (validate, swapCommit, rkey)
- **Severity:** low
- **Confidence:** low  *(verifier judged the original framing inverted; kept as a low-confidence consistency note, not the refuted security claim)*
- **Files:** src/app/api/xrpc/[...method]/route.ts:431-505
- **Evidence:** After enforcing `repo === did` + collection allowlist, the proxy forwards the raw client body, so a client can set `validate:false`, `swapCommit`, or an arbitrary `rkey`. **Verifier:** this is confined to the user's OWN repo (no cross-tenant break) and is the documented write boundary; the group routes' `pickAllowedFields` defends the inner record (mass-assignment), not the envelope, so the "parity" argument is inverted. The only residual is a user seeding lexicon-invalid records into their own repo that downstream readers must already tolerate.
- **Recommendation:** Optional hardening only — drop client-supplied `validate:false` so a user can't store lexicon-invalid records. Otherwise document the intentional own-repo trust (already in AGENTS.md §10).
- **Testable:** yes — POST createRecord with `validate:false` + a record missing required fields; assert the proxy strips `validate` or upstream rejects.
- **Risk of change:** medium

### risk-006 — Authenticated/dynamic surfaces are crawlable: /home, /search, /activity/* missing from robots disallow and lack per-page noindex
- **Severity:** medium
- **Confidence:** high (confirmed)
- **Files:** src/app/robots.ts:8-9; src/app/home/page.tsx:1; src/app/search/layout.tsx:3; src/app/activity/[did]/[rkey]/page.tsx:1
- **Evidence:** robots.ts disallows /settings,/create,/endorsements,/notifications,/groups,/oauth,/api but not /home,/explore,/search,/activity. No page sets `robots: { index:false }`. Auth is fully client-side (no middleware), so the unauthenticated `/home` shell renders a 200 sign-in CTA that Googlebot can index; `/search` even ships a canonical inviting indexation. AGENTS.md §18 mandates authenticated pages set `robots:{index:false,follow:false}` — this is the §22.12 robots/sitemap drift pitfall. Index/SEO hygiene, not private-data exposure.
- **Recommendation:** Per page, add `export const metadata = { robots: { index:false, follow:false } }` to app-only surfaces (home, activity detail, search, notifications) and/or extend robots.ts disallow with /home,/explore,/search,/activity. Keep genuinely public surfaces (/profile, /project) indexable.
- **Testable:** yes — invoke robots.ts default export and assert the disallow array includes the app-only routes; or assert each page's `metadata.robots.index === false`.
- **Risk of change:** low

### risk-007 — resolve-did is an unauthenticated 3-fetch outbound fan-out with no rate limiter
- **Severity:** low  *(see judgment-002 — a verifier reclassified this as a judgment/consistency call; retained here as the lower-severity risk framing)*
- **Confidence:** medium (confirmed technically; intentionally incremental per prior audit)
- **Files:** src/app/api/resolve-did/route.ts:168-194
- **Evidence:** GET /api/resolve-did is unauthenticated and issues up to 3 outbound fetches (resolveHandle, getCertsProfile → resolvePdsUrl + getRecord, fetchBskyAppViewProfile) per request. Its siblings resolve-handle and search-actors are explicitly IP/DID rate-limited with egress-quota comments; this one is not. A DID-doc cache (5-min TTL) and the SSRF allowlist mitigate, and a prior audit examined this exact file and chose not to flag it — hence the judgment overlap.
- **Recommendation:** Add an IP+DID limiter mirroring search-actors (`makeLimiter("resolve-did", 60, 60)`), or document the intentional omission inline. **This duplicates judgment-002 — implement only if you (Holke) approve the broader rate-limit rollout.**
- **Testable:** no
- **Risk of change:** low

### risk-008 — saveWithSwap `read` callbacks use raw `fetch` instead of `authFetch`
- **Severity:** low  *(verifier: original risk rationale refuted; survives as a quality/consistency note — see also moved to quality)*
- **Confidence:** low (uncertain — needs human/runtime check)
- **Files:** src/components/project/project-detail.tsx:692; src/app/project/[did]/[rkey]/edit/page.tsx:535
- **Evidence:** Both conflict-resolution `read` callbacks use raw `fetch('/api/xrpc/.../getRecord')` instead of `authFetch`, bypassing the 401 `onUnauthorized` interceptor. **Verifier:** the described session-expiry failure mode is effectively unreachable — read() only runs on the InvalidSwap conflict path (the write's authFetch already fires onUnauthorized on a real 401), and getRecord is a public-read method that won't 401 here. So this is a low-value consistency nit, not a session-expiry risk. Retained at low confidence; the verifier suggested tag `quality`.
- **Recommendation:** Swap raw `fetch` → `authFetch` (both already imported) for convention consistency. No happy-path change.
- **Testable:** yes (low value) — mock getRecord 401 during save and assert onUnauthorized fires with authFetch.
- **Risk of change:** low

### risk-009 — deleteFollow cannot target a group repo — group-aware unfollow mis-targets the personal repo
- **Severity:** low  *(verifier downgraded from bug/medium — latent, no reachable group-context caller and the group route has no DELETE handler)*
- **Confidence:** medium (confirmed observation; tag changed bug→risk)
- **Files:** src/lib/atproto/follow.ts:105, :65; src/hooks/use-social-graph-sync.ts:158
- **Evidence:** `createFollow` is group-aware via `targetDid`, but `deleteFollow(ownDid, rkey)` has no `targetDid` and always POSTs deleteRecord with `repo=ownDid` (the proxy enforces `repo===session`), so a follow written to a group repo has no delete path. Today no group-context caller exists, the group follow route exports only POST (no DELETE), and both deleteFollow call sites are personal-context — so it's a latent API-completeness gap, not an active mis-target.
- **Recommendation:** Add `opts?: { targetDid?: string }` to `deleteFollow` mirroring `createFollow`, routing through the group BFF when set (requires adding a DELETE handler to /api/groups/[groupDid]/follow). Until then, document that group follows can't be removed via this helper.
- **Testable:** yes (after adding the param) — `deleteFollow(ownDid, rkey, { targetDid: groupDid })` hits `/api/groups/<groupDid>/...`, not the personal proxy.
- **Risk of change:** low

---

## Quality

### quality-001 — UserFeed component is dead code (never imported)
- **Severity:** medium  *(highest-value dead-code item: also masks bug-011)*
- **Confidence:** high (confirmed dead; corroborated by hooks-fetch-1's verifier)
- **Files:** src/components/feed/user-feed.tsx:16
- **Evidence:** No repo-wide importer of UserFeed; FeedLayout's real consumers import it directly. It also feeds an empty `did` (`getDid={() => authorDid ?? ""}`) which would render broken bylines if wired. It is the only consumer of useUserActivities.loadMore (bug-011).
- **Recommendation:** Delete user-feed.tsx (resolves bug-011's reachable path), or wire it into the profile route with a real DID.
- **Testable:** no
- **Risk of change:** low

### quality-002 — Whole module src/lib/atproto/cert-context.ts (304 lines) is dead — zero importers
- **Severity:** medium
- **Confidence:** high
- **Files:** src/lib/atproto/cert-context.ts:27, :35, :65, :271
- **Evidence:** All four exports have zero external references; the referenced `use-cert-context.ts` hook does not exist and `fetchContextUpdates` lives in a different module. (Also the home of bug-candidate `atproto-records-2` below — fix or delete together.)
- **Recommendation:** Delete the module (confirm no in-flight branch reintroduces the Explore aggregate first).
- **Testable:** no
- **Risk of change:** low

### quality-003 — fetchAllCertContext reads only the first 50 records per lexicon and never walks the cursor
- **Severity:** low  *(originally bug/medium; the module is currently dead code — see quality-002 — so no live impact)*
- **Confidence:** medium (confirmed correctness gap, dead today)
- **Files:** src/lib/atproto/cert-context.ts:226-261, :271-304
- **Evidence:** `listAndFilter` issues one `listRecords` with `limit:"50"` and never follows the cursor, then filters in-memory, despite the "All"/"every" naming. Sibling readers (fetchTypedLists, listEndorsementListCollections) walk the cursor. Currently no caller, so latent.
- **Recommendation:** Paginate via the cursor like the sibling readers, or rename/document the single-page cap. If quality-002 deletes the module, this resolves itself.
- **Testable:** yes — first page of 50 non-matching + cursor, second page with the match; assert the match is returned.
- **Risk of change:** low

### quality-004 — src/config/trusted-evaluators.ts is dead in app code and duplicates the live list with a divergent DID set
- **Severity:** medium
- **Confidence:** high
- **Files:** src/config/trusted-evaluators.ts:22, :30, :33; src/lib/atproto/trusted-evaluators.ts:22
- **Evidence:** The config `TRUSTED_EVALUATORS` is referenced only by its own test; `ALL_EVALUATOR_DIDS`/`ALL_EVALUATORS_STABLE_KEY` have zero references. The live module (used by home-feed + use-evaluator-endorsements) has 4 DIDs; the dead config has 3. The config's "authoritative source of truth" comment is false.
- **Recommendation:** Pick one source of truth: delete the config module + its test, OR have the lib import from it and reconcile the 3-vs-4 DID divergence. Removing the module requires removing its test.
- **Testable:** yes — assert the two arrays are identical if both kept (fails today).
- **Risk of change:** low

### quality-005 — Dead code: EndorseShortcut + the received-grid optimistic-overlay state machine
- **Severity:** medium
- **Confidence:** high (confirmed dead by two agents: `profile-lists-endorse-1`, `dataloss-priv-1`)
- **Files:** src/components/profile/profile-endorsements.tsx:976-1075, :135-186, :445-456
- **Evidence:** `EndorseShortcut` is never rendered; `handleEndorsed`/`handleRevoked` (the only setters of `optimisticAdds`/`optimisticHides`) are never passed to any child, so the optimistic overlay in `displayReceived` is permanently inert. The comment at :447-450 claiming the handlers are "exported to the sidebar" is false — the sidebar's EndorseButton has its own optimistic state. ~140 lines of dead code in the largest profile file plus a misleading comment.
- **Recommendation:** Delete the overlay machinery + EndorseShortcut and collapse `displayReceived` to `received.endorsements`; remove the misleading comment. (Or wire the handlers into the sidebar if optimistic Received-grid update is actually wanted — confirm intent.)
- **Testable:** yes (negative) — assert displayReceived never diverges from received.endorsements under current wiring.
- **Risk of change:** medium

### quality-006 — useOrgProfile has no module-level cache and is mounted in 4 layout components
- **Severity:** medium
- **Confidence:** high (confirmed)
- **Files:** src/hooks/use-org-profile.ts:25-64; navbar.tsx:36; mobile-sidebar.tsx:35; desktop-left-rail.tsx:81; desktop-top-bar.tsx:140
- **Evidence:** The hook fetches getOrgProfile + getOrgMetadata + resolvePdsUrl on every mount with no shared cache (unlike useOrgMarker/useProfilePds/useAuthorInfo). It is instantiated in 4 layout components that all render on every authenticated page → 3-4 concurrent identical fan-outs (one being an off-app plc.directory resolvePdsUrl) per navigation, just to derive orgAvatarUrl.
- **Recommendation:** Add a module-level cache keyed by `activeOrg.groupDid` + in-flight Map (mirror use-org-marker / use-author-info); keep refetch() as a cache-evicting force path.
- **Testable:** no
- **Risk of change:** low

### quality-007 — Security-critical sanitize.ts has no unit tests despite AGENTS.md pinning its exact regex
- **Severity:** medium
- **Confidence:** high
- **Files:** src/lib/utils/sanitize.ts:5, :13, :17
- **Evidence:** `stripInvisible`/`sanitizeEmail`/`sanitizeHandle` are pure, security-relevant (login/feedback boundary), and untested, while every sibling pure util has tests. A future regex edit could silently narrow the allowlisted code-point ranges undetected.
- **Recommendation:** Add sanitize.test.ts covering ZWSP/ZWJ/BOM/soft-hyphen removal, leading-@ strip, whitespace stripping for email/handle, lowercase for email, internal-whitespace preservation, and clean-string passthrough.
- **Testable:** yes
- **Risk of change:** low

### quality-008 — Popover content hardcodes z-[40] instead of the --z-popover token
- **Severity:** medium
- **Confidence:** high
- **Files:** src/components/ui/popover.tsx:179
- **Evidence:** `z-[40]` duplicates `--z-popover: 40` (tokens.css:159), violating CLAUDE.md hard rule 5 / AGENTS §11.5 on the canonical primitive that replaced the four ad-hoc menus. Renders identically today but breaks stacking for every consumer if the z-map is re-tiered.
- **Recommendation:** `z-[var(--z-popover)]` (or `zIndex:"var(--z-popover)"` in the inline style).
- **Testable:** no
- **Risk of change:** low

### quality-009 — config-1: No CI workflow exists — the documented test/type/lint baseline is never enforced
- **Severity:** medium
- **Confidence:** high
- **Files:** .github/CODEOWNERS:1; package.json:5
- **Evidence:** `.github/` contains only CODEOWNERS; no workflows. CLAUDE.md references "make CI green" and a 291-test/0-tsc baseline, but nothing runs lint/tsc/vitest on push/PR. Vercel's `next build` does not run vitest, so test regressions are unguarded.
- **Recommendation:** Add `.github/workflows/ci.yml` running `npm ci` → `npm run lint` → `npx tsc --noEmit` → `npm test` on PRs into staging/main, with a pinned Node version (quality-018).
- **Testable:** no
- **Risk of change:** low

### quality-010 — config-2: tsconfig excludes all test files, so `tsc --noEmit` never type-checks the 17 __tests__ files
- **Severity:** medium
- **Confidence:** high
- **Files:** tsconfig.json:38-41
- **Evidence:** `"exclude": ["node_modules","src/**/__tests__/**"]` removes test files from the program; vitest doesn't type-check either. Tests can call renamed/removed exports and still pass while "0 tsc errors" reports clean — the baseline covers production code only.
- **Recommendation:** Stop excluding `src/**/__tests__/**`, or add a `tsconfig.test.json` / `vitest run --typecheck` step wired into CI (quality-009).
- **Testable:** no
- **Risk of change:** low

### quality-011 — Dead exported helpers in workspace.ts: fetchOrganizationDids + @deprecated fetchOrganizationDidsForSet
- **Severity:** low
- **Confidence:** high
- **Files:** src/lib/atproto/workspace.ts:77, :352
- **Evidence:** Both have zero references; `fetchOrganizationDidsForSet` is explicitly `@deprecated` in favor of `fetchDidsByKindInSet` (which is used). The deprecated complement-based function carries its own filter-inversion-bug warning.
- **Recommendation:** Delete both plus now-unused helper types (e.g. `OrganizationDidsGraphQLResponse`).
- **Testable:** no
- **Risk of change:** low

### quality-012 — PersonCard + fetchName/useAuthorNamesMap copy-pasted across profile-endorsements.tsx and profile-followers.tsx
- **Severity:** medium
- **Confidence:** high
- **Files:** src/components/profile/profile-endorsements.tsx:885, :1089; src/components/profile/profile-followers.tsx:548, :617
- **Evidence:** `PersonCard` is defined locally in both files (followers is a strict subset of endorsements); the name-cache helper differs only in comments. Two module-scoped caches for the same `/api/resolve-did` resolution that `useAuthorInfo` already centralizes. AGENTS §15a refers to "the shared row," implying one component.
- **Recommendation:** Extract one `PersonCard` (superset props, `note?`/`listTitle?` optional) into person-card.tsx; replace the duplicated name-cache with the existing `useAuthorInfo` batch hook.
- **Testable:** yes — render the shared PersonCard with/without note/listTitle and assert the rows match.
- **Risk of change:** medium

### quality-013 — onboarding step-profile creates object URLs in render body without revoking (memory leak)
- **Severity:** medium
- **Confidence:** high
- **Files:** src/components/onboarding/steps/step-profile.tsx:50, :53; src/components/onboarding/onboarding-modal.tsx:151
- **Evidence:** `previewAvatarUrl`/`previewBannerUrl` call `URL.createObjectURL(...)` directly in the render body; StepProfile re-renders on every keystroke, so a fresh blob URL is allocated for avatar+banner each render and never revoked. The rest of the codebase pairs createObjectURL with revokeObjectURL.
- **Recommendation:** Compute the preview in `useMemo`/`useEffect` keyed on the File and revoke the previous URL on change/unmount, mirroring use-profile-inline-edit / avatar-upload.
- **Testable:** no
- **Risk of change:** low

### quality-014 — api-misc-3: search-actors logs the raw error object instead of using logSafe
- **Severity:** low
- **Confidence:** high
- **Files:** src/app/api/search-actors/route.ts:103
- **Evidence:** `console.error("[search-actors]", err)` vs the repo-wide logSafe convention. Here `err` is from an unauthenticated public fetch (no secret to leak), so lower-risk than risk-002 — but it would silently start leaking if swapped to an authenticated agent call.
- **Recommendation:** `logSafe("[search-actors] upstream error", err)`.
- **Testable:** no
- **Risk of change:** low

### quality-015 — api-misc-4: notifications upstream error log includes up to 500 chars of the GraphQL response body
- **Severity:** low
- **Confidence:** medium
- **Files:** src/app/api/notifications/route.ts:228
- **Evidence:** On non-2xx, `console.warn(..., responseBody.slice(0,500))` writes the user's own notification data (DIDs, record URIs) to logs — PII-in-logs smell, not a credential leak, and bounded by the slice.
- **Recommendation:** Log only `upstream.status`, or route through logSafe.
- **Testable:** no
- **Risk of change:** low

### quality-016 — api-trust-2: xrpcError does not clamp the upstream status to the valid HTTP range
- **Severity:** low
- **Confidence:** medium
- **Files:** src/app/api/xrpc/[...method]/route.ts:108-109, :386-392
- **Evidence:** `status` accepts any upstream number (0, -1, 1000) and is passed straight to `NextResponse.json(..., { status })`; an out-of-range status throws RangeError inside the terminal catch → opaque framework 500. The sibling `clampHttpStatus` exists for exactly this.
- **Recommendation:** Reuse `clampHttpStatus` (or inline `Number.isInteger(s) && s>=200 && s<=599 ? s : 500`).
- **Testable:** yes — `xrpcError({ status: 0 })` returns 500 and the handler doesn't throw.
- **Risk of change:** low

### quality-017 — api-trust-3: indexer body-size cap measures UTF-16 string length, not byte length
- **Severity:** low
- **Confidence:** medium
- **Files:** src/app/api/indexer/route.ts:1426-1432, :1416-1422
- **Evidence:** The post-read check uses `text.length` (UTF-16 code units) while MAX_BODY_SIZE is documented as 32KB bytes; multi-byte bodies (or a falsified Content-Length) can carry ~3-4x the byte limit. Defense-in-depth, so small practical exposure, but the "32KB" guarantee is inaccurate.
- **Recommendation:** `Buffer.byteLength(text, "utf8") > MAX_BODY_SIZE`, or read via `arrayBuffer()`.
- **Testable:** yes — POST >32KB of multi-byte chars with no Content-Length and assert 413.
- **Risk of change:** low

### quality-018 — config-7: No Node version pin (engines/.nvmrc) despite Next 16 requiring Node >=20.9.0
- **Severity:** low
- **Confidence:** high
- **Files:** package.json:2
- **Evidence:** No `engines`, no `packageManager`, no `.nvmrc`. Contributors/CI can run a Node version diverging from Vercel's runtime → "works on my machine" build discrepancies. Compounds quality-009.
- **Recommendation:** Add `"engines": { "node": ">=20.9.0" }` + `.nvmrc`; surface in the CI matrix.
- **Testable:** no
- **Risk of change:** low

### quality-019 — config-5: No `typecheck` npm script
- **Severity:** low
- **Confidence:** high
- **Files:** package.json:5
- **Evidence:** No `typecheck` script; the documented `npx tsc --noEmit` gate depends on memory, and with no CI it never runs automatically.
- **Recommendation:** Add `"typecheck": "tsc --noEmit"` and invoke from CI.
- **Testable:** no
- **Risk of change:** low

### quality-020 — config-3: lint script's `--ext .ts,.tsx` is a no-op under ESLint 9 flat config
- **Severity:** low
- **Confidence:** high
- **Files:** package.json:9
- **Evidence:** Flat config governs file selection via `files`, not `--ext`; both invocations lint the same 363 files. The flag is dead/misleading legacy.
- **Recommendation:** `"lint": "eslint src/"`; scope via flat-config `files`/`ignores`.
- **Testable:** no
- **Risk of change:** low

### quality-021 — config-4: lint scope is `src/` only — root configs and scripts/*.mjs never linted
- **Severity:** low
- **Confidence:** high
- **Files:** package.json:9; scripts/audit-screenshots.mjs:1; next.config.ts:1; eslint.config.mjs:1
- **Evidence:** next.config.ts (CSP/redirects), eslint.config.mjs, vitest/tailwind/postcss configs, and the three audit scripts (Playwright logic) are never linted; e.g. an unused `(e)` catch in audit-screenshots.mjs:62 goes unflagged.
- **Recommendation:** `eslint .` with flat-config `ignores` for `.next/`/`node_modules/`/`coverage/`; recheck the warning baseline.
- **Testable:** no
- **Risk of change:** medium

### quality-022 — config-8: audit scripts disagree on dev-server port (3001 vs hardcoded 3000)
- **Severity:** low
- **Confidence:** high
- **Files:** scripts/audit-screenshots.mjs:14; scripts/recapture-landing.mjs:21; scripts/capture-divergence-sheet.mjs:10
- **Evidence:** audit-screenshots defaults BASE to :3001 (env-overridable); recapture-landing hardcodes :3000 with no override; `next dev` defaults to 3000. So audit-screenshots silently skips every route against a default dev server.
- **Recommendation:** All three read `process.env.BASE` with a single default `http://localhost:3000`.
- **Testable:** no
- **Risk of change:** low

### quality-023 — config-9: .gitignore `core` pattern is unanchored (shadows any file/dir named core)
- **Severity:** low
- **Confidence:** high
- **Files:** .gitignore:44
- **Evidence:** Bare `core` ignores any `core` file/dir at any depth — a future `src/lib/core/` or `core.ts` would be silently untracked. (The coredump it targets is at root and untracked — not a leak.)
- **Recommendation:** Anchor to `/core`.
- **Testable:** no
- **Risk of change:** low

### quality-024 — config-6: Tailwind v3 PostCSS chain has no autoprefixer; vendor prefixes hand-maintained across 39+ sites
- **Severity:** low
- **Confidence:** medium
- **Files:** postcss.config.mjs:3-4; package.json:49
- **Evidence:** PostCSS chain is only `{ tailwindcss: {} }`; autoprefixer is absent from the chain and Tailwind v3.4 doesn't run it. The codebase hand-writes `-webkit-*` prefixes in 39+ places; a new prefixed property could silently ship unprefixed in Safari. (Overlaps judgment-007 — the doc-vs-config disagreement is the judgment half.)
- **Recommendation:** Add `autoprefixer` devDep + plugin entry. Verify prefix output and no visual regression. (See judgment-007 — confirm intent first.)
- **Testable:** no
- **Risk of change:** medium

### quality-025 — atproto-records-3: saveWithSwap relies on an untyped cross-shape contract with no guard
- **Severity:** low
- **Confidence:** medium
- **Files:** src/lib/atproto/save-with-swap.ts:92-149, :123-132
- **Evidence:** `computeDirtyFields(mountSnapshot, drafts)` across two unrelated generics, then casts and compares `mountSnapshot[key]` vs `fresh.value[key]`, assuming all three key sets coincide. A renamed/UI-only draft key would be excluded from conflict detection and silently auto-rebase over a concurrent server change.
- **Recommendation:** Constrain `TDrafts extends Partial<TSnapshot>`, or accept explicit `dirtyKeys` from the caller; document the read().value-shape invariant.
- **Testable:** yes — drafts whose key differs from snapshot for a field the server also changed; assert conflict is detected.
- **Risk of change:** medium

### quality-026 — atproto-records-4: two near-duplicate shallowEqual implementations with divergent semantics
- **Severity:** low
- **Confidence:** medium
- **Files:** src/lib/atproto/save-with-swap.ts:156-166; src/lib/utils/swap-drafts.ts:160-174
- **Evidence:** Both are used in the same save flow; the swap-drafts version guards `Array.isArray(a) !== Array.isArray(b)`, save-with-swap's omits it — an array-vs-object edge could be classified inconsistently between the dirty-set step and the conflict step.
- **Recommendation:** Export one shared shallowEqual and reuse it in both.
- **Testable:** yes — `[]` vs `{}` through both paths; assert agreement.
- **Risk of change:** low

### quality-027 — atproto-records-5: resolveCanonicalEndorsementDef treats missing createdAt as earliest, so a malformed def could win canonical
- **Severity:** low
- **Confidence:** medium
- **Files:** src/lib/atproto/badges.ts:336-348
- **Evidence:** Ascending sort with `(a.value.createdAt ?? "") < ...` makes a def lacking createdAt sort first → chosen as canonical, scheduling well-formed defs for background deletion. Latent (default def always writes createdAt) but the self-heal logic would do the wrong thing.
- **Recommendation:** Sort missing createdAt to the end (treat as +Infinity) or filter unparseable defs before selecting canonical.
- **Testable:** yes
- **Risk of change:** low

### quality-028 — social-2: location.ts ships a private parseAtUri that diverges from the shared strict parser
- **Severity:** low
- **Confidence:** high
- **Files:** src/lib/atproto/location.ts:448, :404; src/lib/atproto/activity-uri.ts:15
- **Evidence:** Private `parseAtUri` uses `parts.length < 3` and drops trailing segments; the canonical shared parser uses `!== 3` and rejects extras (with a test). A malformed `at://did/coll/rkey/garbage` parses here where the shared one rejects.
- **Recommendation:** Import `parseAtUri` from activity-uri.ts and delete the private copy (already imported at the top of the read section).
- **Testable:** yes — `readLocationStrongRef` with a 4-segment uri returns null.
- **Risk of change:** low

### quality-029 — social-3: parseNotificationsPage trusts indexer node shape after only spot-checking three fields
- **Severity:** low
- **Confidence:** medium
- **Files:** src/lib/atproto/notifications.ts:51, :7
- **Evidence:** Validates only reason/sortAt/id then pushes the raw node as a fully-typed Notification; count/reasonSubject/latestAuthor/etc. are declared present but unchecked, so a partial edge surfaces as `count: undefined` while TS believes it's populated.
- **Recommendation:** Validate the remaining load-bearing fields, or mark the unchecked fields optional in the type.
- **Testable:** yes
- **Risk of change:** low

### quality-030 — social-4: resolveHandle returns the alsoKnownAs value verbatim without validating it's a handle
- **Severity:** low
- **Confidence:** medium
- **Files:** src/lib/atproto/did.ts:217
- **Evidence:** Strips `at://` from the first `alsoKnownAs` entry and returns the remainder unchanged; a did:web doc (attacker-controllable) with `at://example.com/some/path` yields `example.com/some/path` shown as a handle. Text-only, no injection, but a non-handle leaks through.
- **Recommendation:** After stripping, sanity-check it looks like a handle (non-empty, has a dot, no slash/whitespace) else return null.
- **Testable:** yes
- **Risk of change:** low

### quality-031 — hooks-fetch-2: useHomeFeed INVALID_CURSOR recovery creates an untracked AbortController that can setState after unmount
- **Severity:** low
- **Confidence:** medium
- **Files:** src/hooks/use-home-feed.ts:354
- **Evidence:** The catch-branch recovery `load()` uses a local controller never stored/aborted by effect cleanup; an unmount mid-flight leaves it uncancelled and setState fires after unmount. Other fetches in the hook abort via cleanup.
- **Recommendation:** Store the recovery controller in a ref the unmount cleanup aborts (or reuse the effect's controller).
- **Testable:** yes
- **Risk of change:** low

### quality-032 — hooks-fetch-3: window-focus revalidation handlers fire fetches without an AbortController
- **Severity:** low
- **Confidence:** medium
- **Files:** src/hooks/use-received-endorsements.ts:346; src/hooks/use-profile-responses.ts:177; src/hooks/use-bluesky-follows.ts:137
- **Evidence:** Focus listeners call the fetch path with no signal, so the `if (signal?.aborted)` guard is always false; a focus event near unmount can setState after unmount (useReceivedEndorsements/useBlueskyFollows call component setState directly). Inconsistent with §25's AbortController discipline.
- **Recommendation:** Give the focus handler its own ref'd AbortController aborted on cleanup/next focus, or guard with an `aliveRef`.
- **Testable:** yes
- **Risk of change:** low

### quality-033 — hooks-fetch-4: useBskyPosts.loadMore can append a superseded page when the handle changes mid-fetch
- **Severity:** low
- **Confidence:** low
- **Files:** src/hooks/use-bsky-posts.ts:266, :230
- **Evidence:** `requestIdRef` is shared across initial-load and loadMore; loadMore reads cursor/hasMore from closure and appends without re-checking the handle still matches, so a stale loadMore finishing between two initial fetches can mis-attribute. `aliveRef` covers unmount but not handle-change-while-mounted.
- **Recommendation:** Capture the handle at call time and compare before setPosts, or clear posts + bump the token atomically on handle change.
- **Testable:** yes
- **Risk of change:** low

### quality-034 — hooks-fetch-5: useEndorsementLists mutation callbacks read possibly-stale `lists` via closure
- **Severity:** low
- **Confidence:** low
- **Files:** src/hooks/use-endorsement-lists.ts:276, :294, :332, :464
- **Evidence:** update/delete/add callbacks close over `lists` and call `lists.find(...)` against the closure snapshot rather than the functional updater; an await before the optimistic merge means a concurrent refetch can be clobbered. No `listsRef` mitigation, and every mutation rebinds all callbacks.
- **Recommendation:** Read current list inside the functional updater (or a `listsRef`), drop `lists` from deps.
- **Testable:** yes
- **Risk of change:** medium

### quality-035 — hooks-fetch-6: useExploreData loadMore passes signal:null, so a filter change can't cancel the in-flight page
- **Severity:** low
- **Confidence:** low
- **Files:** src/hooks/use-explore.ts:361-362
- **Evidence:** The generation guard prevents bad state, but loadMore passes `signal: null`, so a filter change during loadMore fetches-then-discards rather than cancelling — wasted network on a network-heavy route.
- **Recommendation:** Pass an AbortSignal tied to generation into loadMore's loadPage. Low priority.
- **Testable:** no
- **Risk of change:** low

### quality-036 — hooks-state-2: promoted object-URL preview is never revoked after save
- **Severity:** low
- **Confidence:** medium
- **Files:** src/hooks/use-profile-inline-edit.ts:674-688, :690-691
- **Evidence:** On save the preview URL is promoted to localAvatarUrl/localBannerUrl and the preview refs nulled without `revokeObjectURL`; once the resolve-did refetch returns the CDN URL, `effectiveAvatarUrl` still resolves to localAvatarUrl (never cleared), so the blob URL leaks for the page lifetime. handleCancelEdit revokes correctly; the save path doesn't.
- **Recommendation:** Revoke the prior local blob URL on a fresh refetch/unmount and clear localAvatarUrl once the canonical prop changes.
- **Testable:** no
- **Risk of change:** low

### quality-037 — hooks-state-4: useOrgProfile.refetch exposes fetchData directly (onClick passes the event as an AbortSignal)
- **Severity:** low
- **Confidence:** medium (confirmed; tag changed bug→quality)
- **Files:** src/hooks/use-org-profile.ts:25-58, :75
- **Evidence:** `refetch: fetchData` whose first param is `signal?`; an `onClick={refetch}` would pass the MouseEvent as the signal. Harmless today (no caller), but fragile vs useProfile.refetch which wraps to take no args. Verifier: latent/harmless → quality, not bug.
- **Recommendation:** `const refetch = useCallback(() => fetchData(), [fetchData])`.
- **Testable:** yes
- **Risk of change:** low

### quality-038 — hooks-state-6: usePendingAwardsCount returns 0 (not null) when logged out, contradicting its JSDoc contract
- **Severity:** low
- **Confidence:** high
- **Files:** src/hooks/use-pending-awards-count.ts:62, :30-35
- **Evidence:** JSDoc says it returns null when logged out; implementation returns 0. Both consumers treat 0 and null as "hide," so no current defect, but a future consumer distinguishing them would misbehave.
- **Recommendation:** Return null when logged out (or update the JSDoc to say 0). Prefer null for consistency with the cold-cache/loading branches.
- **Testable:** yes
- **Risk of change:** low

### quality-039 — hooks-state-7: useBottomSheetDrag visualViewport effect mutates inline styles but never resets them on cleanup
- **Severity:** low
- **Confidence:** medium
- **Files:** src/hooks/use-bottom-sheet-drag.ts:56-79
- **Evidence:** The resize handler writes maxHeight/bottom; cleanup only removes the listener. Because the node is reused across open/close, a reopened sheet can briefly show a stale clamped height/offset until the next resize.
- **Recommendation:** Reset `maxHeight=''` and `bottom=''` in cleanup.
- **Testable:** no
- **Risk of change:** low

### quality-040 — hooks-state-8: useBottomSheetDrag setTimeout(onClose, 250) can fire after unmount
- **Severity:** low
- **Confidence:** low
- **Files:** src/hooks/use-bottom-sheet-drag.ts:108-111
- **Evidence:** The dismiss timeout id is not stored/cleared; if the component unmounts within 250ms, onClose (an arbitrary caller callback) still fires. Benign for React state but a sharp edge for non-state callbacks.
- **Recommendation:** Store the id in a ref and clearTimeout in cleanup.
- **Testable:** no
- **Risk of change:** low

### quality-041 — hooks-state-9: useOrgMarker.refresh can return a stale value when a concurrent fetch is in-flight
- **Severity:** low
- **Confidence:** medium
- **Files:** src/hooks/use-org-marker.ts:159-187, :52-58
- **Evidence:** refresh deletes the cache entry but not the inFlight map entry; if another mount has a fetch in flight, fetchOrgMarker returns the pre-existing promise resolving to the pre-refresh value. The editor's post-save refreshOrgMarker could observe the pre-save record on a concurrent-mount page.
- **Recommendation:** On refresh, also `inFlight.delete(did)` (or force a no-cache fetch ignoring the dedupe).
- **Testable:** yes
- **Risk of change:** low

### quality-042 — hooks-state-5: useProfilePds in-flight dedupe note (kept as a stylistic alignment; the bug claim was refuted)
- **Severity:** low
- **Confidence:** low (the duplicate-fetch claim was refuted; only an IIFE-style alignment remains)
- **Files:** src/hooks/use-profile-pds.ts:40-57
- **Evidence:** `inflight.get(did) ?? resolvePdsUrl(did)` eagerly evaluates resolvePdsUrl. Verifier refuted the concurrency claim (React effects flush sequentially; the lower-layer `fetchDidDocument` dedupes the network call anyway, and the hook has a single call site). No observable defect.
- **Recommendation:** Optional only — mirror fetchOrgMarker's register-before-await IIFE for readability. No behavioral benefit. *(Consider skipping in Phase 2.)*
- **Testable:** yes (low value)
- **Risk of change:** low

### quality-043 — profile-lists-endorse-2: ProjectItemRow shows a permanent skeleton when a project fails to load
- **Severity:** low  *(originally bug/low; treated as quality terminal-UI gap — verifier confirmed)*
- **Confidence:** high (confirmed)
- **Files:** src/components/profile/profile-lists.tsx:629-646; src/hooks/use-project.ts:95
- **Evidence:** The render gate `if (!project)` returns the loading skeleton, but useProject resolves to `{project:null, isLoading:false, error}` on 404/error. The row renders the skeleton forever with no error fallback; non-owners get a permanent grey bar. Cert/account variants fall back to "Untitled cert"/"Unknown".
- **Recommendation:** Gate the skeleton on `isLoading`, render a fallback row when `!project && !isLoading` (URI tail or "Project unavailable", remove button still available to owners).
- **Testable:** yes
- **Risk of change:** low
- **Note:** Original tag bug/low; kept as quality because it is a missing terminal-UI state, behavior-preserving to fix.

### quality-044 — profile-lists-endorse-3: duplicated outside-click + Escape dropdown handler instead of useClickOutsideClose
- **Severity:** low
- **Confidence:** high
- **Files:** src/components/profile/profile-endorsements.tsx:205-223, :228-246; src/components/profile/endorsement-lists.tsx:121-139; src/hooks/use-click-outside-close.ts:23-61
- **Evidence:** Three hand-rolled mousedown/keydown+ref effects exist while the repo ships `useClickOutsideClose` (whose docstring calls itself the drop-in replacement). The inline copies miss the onClose-ref optimization and re-attach listeners on re-render.
- **Recommendation:** Replace each with `useClickOutsideClose` anchored on the existing `*__sort-wrap` div.
- **Testable:** no
- **Risk of change:** medium

### quality-045 — profile-lists-endorse-4: three near-identical CreateListModal / bulk-paste modals duplicated across the two list files
- **Severity:** low
- **Confidence:** medium
- **Files:** src/components/profile/profile-lists.tsx:721-826, :854-1060; src/components/profile/endorsement-lists.tsx:702-813, :1000-1282
- **Evidence:** Each file defines its own create/edit dialog and bulk-paste modal with parallel parse-row state machines, the same `split(/[\s,]+/)` parser, and shared `profile-lists__paste-*` classes. CLAUDE.md rule 10 warns against exactly this drift.
- **Recommendation:** Extract a shared create/edit dialog + bulk-paste shell (parameterized by resolve fn + status-label map). *(Pure-extraction is behavior-preserving; if caller signatures must change it becomes judgment.)*
- **Testable:** no
- **Risk of change:** medium

### quality-046 — profile-lists-endorse-5: createdAt comparators never return 0, making the sort unstable for equal timestamps
- **Severity:** low
- **Confidence:** medium
- **Files:** src/components/profile/endorsement-lists.tsx:1289-1293; src/components/profile/profile-endorsements.tsx:148, :1216-1218
- **Evidence:** `(a,b) => a.createdAt > b.createdAt ? -1 : 1` returns 1 on equality, so same-second items can shuffle between renders. A correct three-way `compareString` already exists in the same path.
- **Recommendation:** Use the three-way `compareString` (return 0 on equality) for all createdAt comparators.
- **Testable:** yes
- **Risk of change:** low

### quality-047 — profile-lists-endorse-6: raw at-URI used as the accessible label for item checkboxes
- **Severity:** low
- **Confidence:** medium
- **Files:** src/components/profile/profile-lists.tsx:454
- **Evidence:** `aria-label={`Select ${uri}`}` reads the full DID+collection+rkey to screen readers; the surrounding row already resolves a human title.
- **Recommendation:** Pass the resolved title (or row index) to the label.
- **Testable:** no
- **Risk of change:** low

### quality-048 — dataloss-priv-4: sidebar EndorseButton clears optimistic state and rethrows when list-append fails
- **Severity:** low
- **Confidence:** medium
- **Files:** src/components/profile/profile-sidebar.tsx:814, :825, :833
- **Evidence:** The award is created first; if the optional list-append throws, the catch does `setOptimistic(null)` and rethrows before `ownGiven.refetch()`, so the button snaps back to "Endorse" even though the award succeeded — nudging a duplicate endorsement.
- **Recommendation:** Run `ownGiven.refetch()` before the list-append; on append failure keep optimistic=true and surface only the list-attribution error.
- **Testable:** yes
- **Risk of change:** low

### quality-049 — feed-deadcode-2: CertHeadlineByline is dead code (superseded by inline CertHeadlineColumns)
- **Severity:** low
- **Confidence:** high
- **Files:** src/components/feed/cert-headline-byline.tsx:31
- **Evidence:** Zero importers; ActivityDetail uses an inline CertHeadlineColumns. Stale duplication of author-byline logic.
- **Recommendation:** Delete the file (or extract one shared byline cell).
- **Testable:** no
- **Risk of change:** low

### quality-050 — feed-deadcode-3: LocationCard is dead code (only referenced in a comment)
- **Severity:** low
- **Confidence:** high
- **Files:** src/components/feed/location-card.tsx:30
- **Evidence:** Only reference is a prose comment in cert-locations-map.tsx; cert detail renders all locations via the consolidated CertLocationsMap.
- **Recommendation:** Delete location-card.tsx and fix the inaccurate comment.
- **Testable:** no
- **Risk of change:** low

### quality-051 — feed-staledoc-1: FeedLayout doc comments reference non-existent GlobalFeed/PersonalFeed
- **Severity:** low
- **Confidence:** high
- **Files:** src/components/feed/feed-layout.tsx:31; src/components/feed/user-feed.tsx:13
- **Evidence:** JSDoc cites GlobalFeed/PersonalFeed/UserFeed; only the dead UserFeed exists. Real consumers are profile-certs.tsx and project-detail.tsx.
- **Recommendation:** Update the comments to the real consumers; drop the phantom names. (Coordinate with quality-001.)
- **Testable:** no
- **Risk of change:** low

### quality-052 — feed-img-state-1: ActivityCard never resets imageFailed when imageUrl changes
- **Severity:** low
- **Confidence:** medium
- **Files:** src/components/feed/activity-card.tsx:27, :40
- **Evidence:** imageFailed is only set true and never reset on imageUrl change; ActivityDetail solved the same with `useEffect(()=>setImageFailed(false),[baseImageUrl])`. Masked today by `key={record.uri}`, but breaks on instance reuse with a mutated record.
- **Recommendation:** Add `useEffect(() => setImageFailed(false), [imageUrl])`.
- **Testable:** yes
- **Risk of change:** low

### quality-053 — feed-news-key-1: News post images use array index as React key
- **Severity:** low
- **Confidence:** medium
- **Files:** src/components/right-rail/news-section.tsx:104, :111
- **Evidence:** `images.slice(0,4).map((img,i)=> <img key={i} .../>)` — index keys, the antipattern the module's `contributorKey()` exists to avoid. Static today, breaks on reorder/filter.
- **Recommendation:** `key={img.thumb}` (unique CDN URL).
- **Testable:** no
- **Risk of change:** low

### quality-054 — feed-map-modal-resize-1: expanded locations map height computed once from window.innerHeight
- **Severity:** low
- **Confidence:** medium
- **Files:** src/components/feed/cert-locations-map.tsx:286
- **Evidence:** Modal map height is a one-shot `window.innerHeight*0.7` read with no resize subscription; rotating/resizing while open leaves a stale height. Minor UX.
- **Recommendation:** Drive height from a vh-based CSS container, or comment that it's intentionally fixed at open time.
- **Testable:** no
- **Risk of change:** low

### quality-055 — feed-card-perf-1: ActivityCard not memoized; every loadMore re-renders all existing cards
- **Severity:** low
- **Confidence:** medium
- **Files:** src/components/feed/feed-layout.tsx:123; src/components/feed/activity-card.tsx:21
- **Evidence:** loadMore replaces the activities array (new identity), so all prior plain-function ActivityCards re-render. Reconciliation cost only (author info is module-cached), but avoidable on long lists; props are stable per uri.
- **Recommendation:** Wrap ActivityCard in React.memo.
- **Testable:** no
- **Risk of change:** low

### quality-056 — Remaining low-stakes quality items (token/aria/doc-drift cluster)
- **Severity:** low
- **Confidence:** mixed (each verified; all low-stakes, Phase-2 test-gated)
- **Files:** consolidated; see per-item below
- **Evidence:** A cluster of individually-small, behavior-preserving cleanups, each kept as its own Phase-2 commit:
  - **auth-redirect-1 / sec-session-csrf-1 (merged):** `safeRedirect` gates http: on `NODE_ENV === "development"` while the module uses `!== "production"` — fail-closes http loopback under NODE_ENV="test". Fix: `!== "production"`. (auth-context.tsx:30-37) — testable yes.
  - **auth-session-fixation-1:** callback-handler swallows deleteSession failure before createSession; add a one-line comment that createSession overwrites the cookie so a failed delete can only orphan a TTL'd Redis key. (callback-handler/route.ts:30-34) — testable yes.
  - **auth-csrf-doc-1:** CSRF code rejects missing Origin AND Referer (stricter than AGENTS §8); keep the code, add a comment noting the deliberate divergence so it isn't "fixed" back. (csrf.ts:20-24) — testable yes.
  - **api-trust-5:** AGENTS §17.9/§22.5 say "the four" ALLOWED_WRITE_COLLECTIONS but the array has 11; update the doc (and confirm `app.certified.badge.response` write-enablement is intended). (xrpc route:24-48) — doc.
  - **cert-5:** `countGraphemes` duplicated verbatim across 4 pages → extract to src/lib/utils. (create:281, project/new:173, project edit:300, activity edit) — testable yes.
  - **cert-6:** own-certs quick-pick fetch duplicated between /project/new and project edit → extract `useOwnCerts`. — no test.
  - **cert-7:** project-detail reads activity-only meta (startDate/endDate/contributors) the project forms never write; drop or document. (project-detail.tsx:318-333) — no test.
  - **map-3:** dead theme reactivity in ThemeReactiveTiles (useTheme/key-by-URL no-op because tile URLs are constant); drop the subscription + misleading comment. (map.tsx:176-208; tiles.ts:36-55) — no test.
  - **map-4 / deadcode-5 (merged):** `forwardGeocode` is a dead single-hit export; delete (callers use `suggestForwardGeocode`). (geocode.ts:31) — no test.
  - **map-5:** raw hex in map.tsx polygon pathOptions + `#000` in leaflet.css:137 vs tokens (rule 2). Tokenize the CSS hit; comment/justify the JS literals (Leaflet can't read CSS vars from JS). — no test.
  - **ui-primitives-2:** ProviderRedirectOverlay hardcodes `zIndex: 9999` vs `--z-skip-nav`/`--z-feedback`; tokenize or pick a dedicated token. (provider-redirect-overlay.tsx:7) — no test.
  - **ui-primitives-3:** Skeleton text variant omits `aria-hidden` and ignores the documented `width` prop; add aria-hidden, document/honor width, move `...style` before computed width. (skeleton.tsx:57,67) — testable yes.
  - **ui-primitives-4:** Button renders spinner + icon child for `size="icon"` loading, and has no default `type`; hide children when `loading && size==="icon"`, default `type="button"`. (button.tsx:58,64,70) — testable yes.
  - **explore-1:** `?attrs=` filter is read+applied but never written by any UI; wire a control or delete the read + filter blocks. (explore.tsx:228-232, 1144-1230) — no test.
  - **explore-3:** Sort + quality popover triggers omit `aria-haspopup` (sub-dropdown and home-feed buttons have it). (explore.tsx:674-744) — testable yes.
  - **groups-3:** Leave Group modal is hand-rolled (`signin-modal__backdrop`) instead of `<ConfirmDialog>` (hard rule 7 / §22.16): no focus trap/Esc/scroll-lock. Replace with ConfirmDialog (already used in org-settings). (groups/page.tsx:255-256) — testable yes.
  - **groups-4:** AddOrgModal + MembershipSyncModal are dead code; delete. (add-org-modal.tsx:21; membership-sync-modal.tsx:22) — no test.
  - **groups-5:** AddOrgModal inline styles use invariant `--color-primary` + landing `--color-mid-gray` on an app surface (breaks dark mode); resolves if groups-4 deletes it, else use `--fg-primary`/`--fg-muted`. — no test.
  - **groups-6:** add-members loop leaves already-added members staged on partial failure; set `pendingMembers` to only the failures. (org-settings.tsx:183-190) — testable yes.
  - **profile-edit-2:** BannerUpload `onRemove` is dead in the edit flow (banner non-removable); wire a `bannerRemoved` flag or drop the unused branch. (banner-upload.tsx:121-132; profile-edit-form.tsx:344-348) — testable yes.
  - **profile-edit-3:** edit-form inputs fork raw `<input>`/`<textarea>` (no `aria-describedby` to the error `<p>`) vs the Input/Textarea primitives. Migrate or add aria-describedby. (profile-edit-form.tsx:372-506) — testable yes.
  - **profile-edit-4:** avatar overlay uses raw `bg-black`/`bg-opacity-50`/`text-white` vs overlay tokens. (avatar-upload.tsx:104,108) — no test.
  - **profile-edit-5:** BannerUpload `hasPending` write-once boolean can desync from the displayed image; lift to parent alongside the preview URL. (banner-upload.tsx:42,65-81) — testable yes.
  - **landing-deadcode-1:** orbiting-logos.tsx (354 lines) is dead and embeds raw rgba/box-shadow/zIndex; delete (or tokenize + TODO if planned). (orbiting-logos.tsx:1,229-230) — no test.
  - **landing-darkmode-1:** legal/marketing pages use raw `text-blue-600/-800`/`text-gray-500` (don't flip in dark mode) vs theme tokens; the inert `prose-navy` classes provide nothing. (about/terms/privacy/dsa/imprint:26-34) — no test.
  - **approot-sitemap-public-gap:** /welcome and /apps (public, indexable) are absent from sitemap.ts + robots allow-list (§22.12 drift); add them (confirm /welcome-vs-/ canonical with judgment-005). (sitemap.ts:4) — testable yes.
  - **approot-global-error-tokens:** global-error.tsx uses raw hex + `border-radius:6px` (escapes the styles/ grep guard). Keep inline (tokens unavailable in the root error boundary) but use `2px` + add a justifying comment. (global-error.tsx:14,39,53) — no test.
  - **approot-agents-dep-version-drift:** AGENTS §2 lists stale @atproto versions and omits tiptap/leaflet/next-themes; doc-only update. (package.json; AGENTS.md:95) — no test.
  - **authz-repo-3:** members POST role allowlist {member,admin} and role PUT {member,admin,owner} are bare arrays in two files; derive both from one ORG_ROLES constant. (members/route.ts:77-82; role/route.ts:44-49) — testable yes.
  - **authz-repo-4:** register's MAX_SELF_CREATED_ORGS check fails closed on CGS error and walks every member of every group (availability/perf smell, fail-closed is the safe direction). (register/route.ts:61-134) — testable yes.
  - **notif-row-1:** notification-row duplicates `truncateDid` (4 files) and hand-rolls initials instead of `getInitials`. (notification-row.tsx:16,52) — no test.
  - **deadcode-4:** dead exports in labeller.ts: `pickKnownLabel`, `DEFAULT_SELECTED_FILTERS`, `FilterValue` (+ `ALL_LABELS` once pickKnownLabel goes). (labeller.ts:27,36,46) — no test.
  - **deadcode-6:** dead exports `getBlobRefLinkFromBlob`, `clearRecentlyViewed`, `ORG_PROFILE_COLLECTION`. (types.ts:39; recently-viewed.ts:92; constants.ts:15) — no test.
  - **quality-overexport-1:** pervasive over-exporting of internal-only helpers (rate-limit.ts, post-signin.ts, etc.); de-export where not used externally (confirm test intent first). — no test.
  - **utils-tests-2:** did.ts validators (`isValidDid`/`isDid`) untested despite gating ~10 security-sensitive route guards; add did.test.ts. — testable yes.
  - **utils-tests-3:** bounded-cache, format-date, ip (`clientIp`), recently-viewed lack tests despite branchy/security-relevant logic; add focused tests. — testable yes.
- **Recommendation:** Implement each as its own small Phase-2 commit per the rules above; doc-only items (api-trust-5, approot-agents-dep-version-drift) edit AGENTS.md.
- **Testable:** mixed (per sub-item)
- **Risk of change:** low

---

## Judgment — held for your decision

### judgment-001 — login route forwards unvalidated `prompt` to client.authorize (allows prompt=none / arbitrary values)
- **What it changes:** external OAuth authorization behavior based on unvalidated input. `prompt` is typed `"login" | "create"` but never validated at runtime and is spread straight into `client.authorize`, so a caller can pass `prompt: "none"` / `"select_account"`. (login/route.ts:55-96)
- **Recommendation:** Add an allowlist guard mirroring the `mode` check, or coerce non-allowlisted values to undefined.
- **Holke decides:** Should the login route hard-reject any `prompt` outside {login, create} (changing the observable OAuth contract for callers that pass other values)?

### judgment-002 — resolve-did has no rate limiter (broader rate-limit rollout decision)
- **What it changes:** external behavior / ops posture — adds throttling to an unauthenticated public endpoint. A prior audit explicitly deferred broad rate-limiting as an infra decision and chose not to flag this exact file. (resolve-did/route.ts:168-194) *(Same issue as risk-007.)*
- **Recommendation:** Add an IP+DID limiter mirroring search-actors, or document the intentional omission.
- **Holke decides:** Do you want to extend the HTTP rate limiter to resolve-did (and the broader BFF read surface) now, or keep it deferred as an infra decision?

### judgment-003 — Group BFF routes perform no local role check — all member/admin/owner authz delegated to the group service
- **What it changes:** architecture / trust boundary. Every group write route verifies only a valid session + syntactic DID; role enforcement is entirely the group service's job (the BFF is an open door if the CGS ever ships a method that trusts the proxy). This is the documented design (§15/§22.6/§22.20) but provides no defense-in-depth. (members/role/profile/activity routes)
- **Recommendation:** Confirm + document the CGS per-method role-enforcement contract; consider a lightweight membership check in the BFF for the highest-impact mutations (role.set, member.remove).
- **Holke decides:** Is the "CGS is the sole role authority" contract verified end-to-end, and do you want defense-in-depth role checks in the BFF for role.set/member.remove?

### judgment-004 — UsernameCard custom-domain flow ignores groupDid and writes the handle to the personal repo (§22.20 class)
- **What it changes:** behavior/API of a group-aware write path. UsernameCard is group-aware (`groupDid`) but the CustomDomainModal it renders POSTs unconditionally to the personal XRPC `updateHandle`. Latent today (UsernameCard is only wired into personal settings; org-settings shows handle read-only), but it fires the moment UsernameCard is used in a group surface. (username-card.tsx:297; custom-domain-modal.tsx:97)
- **Recommendation:** Thread `groupDid` into CustomDomainModal and route handleVerify to `/api/groups/[groupDid]/handle` when set; until then, don't wire UsernameCard with `groupDid` into any group surface (or hide the custom-domain buttons when groupDid is set).
- **Holke decides:** Should CustomDomainModal be made group-aware now, or should the custom-domain affordance be gated off whenever `groupDid` is set?

### judgment-005 — /welcome canonical does not match its sitemap entry (/) 
- **What it changes:** SEO canonicalization / indexing contract. welcome/page.tsx self-canonicals to /welcome while sitemap.ts lists / (a client redirector to /welcome) as priority-1; robots allows / but not /welcome explicitly. Mixed signal to crawlers. (welcome/page.tsx:10; sitemap.ts:5)
- **Recommendation:** Pick one canonical landing URL and align robots + sitemap + canonical (option a: /welcome everywhere; option b: / everywhere). Coordinate with approot-sitemap-public-gap.
- **Holke decides:** Is the canonical landing URL `/` or `/welcome`?

### judgment-006 — Profile inline-edit save writes the full profile record with no swapRecord (lost-update without swap)
- **What it changes:** write contract / concurrency behavior. `handleSave` builds `next` from the mount-time snapshot and calls `putProfile` with no `swapRecord`, so a concurrent cross-device/tab profile edit is silently overwritten. The TODO documents that swap isn't plumbed because the record CID isn't surfaced. The repo's `saveWithSwap` helper exists but the profile path bypasses it. (use-profile-inline-edit.ts:581-595; profile.ts:79; save-with-swap.ts:92)
- **Recommendation:** Surface the profile/org-marker record CIDs, capture them at edit-open as the mountSnapshot/initialCid, and route putProfile/putOrgMarker through `saveWithSwap` so concurrent edits produce a conflict UX instead of a silent overwrite.
- **Holke decides:** Do you want to invest in plumbing the profile/org-marker CIDs to enable swap-protected profile saves (conflict UX), or accept last-writer-wins for profile edits for now?

### judgment-007 — postcss.config.mjs has no autoprefixer; AGENTS.md/file-map states "tailwindcss + autoprefixer"
- **What it changes:** build/dependency choice + cross-browser CSS output. autoprefixer is neither in the PostCSS chain nor a dependency; Tailwind v3.4 doesn't run it, so hand-written CSS ships unprefixed unless prefixes are hand-maintained. Doc and config disagree. *(Implementation half tracked as quality-024.)* (postcss.config.mjs:3; package.json:48)
- **Recommendation:** Either add autoprefixer (install + plugin entry) to match the documented intent, or update AGENTS.md §20 to state it was intentionally dropped after a browserslist review.
- **Holke decides:** Add autoprefixer to the PostCSS chain (dependency + build change), or formally record that it was intentionally dropped?

### judgment-008 — explore-4: local hand-rolled Popover duplicates the unused canonical src/components/ui/popover
- **What it changes:** shared UI primitive / focus + click-outside behavior. explore.tsx and home-feed.tsx hand-roll three bespoke popovers while the canonical `<Popover>` (the §12 primitive) has zero importers. Consolidating changes focus/click-outside/ARIA behavior. (explore.tsx:1044-1100; home-feed.tsx:308-473)
- **Recommendation:** Decide whether to migrate these to the canonical `<Popover>` (gaining standardized behavior) or formally retire the ui/popover primitive — don't add a fourth bespoke popover.
- **Holke decides:** Migrate the bespoke popovers onto the canonical `<Popover>`, or retire the unused primitive?

### judgment-009 — api-trust-4: foreign-PDS getBlob stream has no size cap and forwards upstream Cache-Control
- **What it changes:** caching behavior for foreign blobs + resource posture. The unauthenticated foreign-DID getBlob branch streams `upstream.body` with no size cap and forwards the upstream PDS's own Cache-Control, so an allowlisted-but-hostile PDS controls the CDN cache directive for an attacker-chosen DID's blob. SSRF is bounded by the host allowlist; §17.10 only mandates caps on uploadBlob. (xrpc route:350-359)
- **Recommendation:** Consider capping/short-circuiting on an oversized upstream Content-Length and replacing the forwarded Cache-Control with a server-controlled value — consciously, since it changes foreign-blob caching.
- **Holke decides:** Should the foreign-blob read path enforce a size cap and override upstream Cache-Control (changing caching behavior), or is the current passthrough acceptable?

### judgment-010 — sec-session-csrf-2: /api/auth/session returns the DID without Cache-Control: no-store
- **What it changes:** response headers on the canonical identity endpoint. The DID-returning session route sets no Cache-Control, unlike the sibling session-bearing routes (xrpc getSession, notifications) that set no-store. Verifier: the payload is a public DID (not sensitive PII like email), Next.js route handlers are dynamic so no CDN caching, and no documented rule requires no-store here — so this is a consistency/judgment observation, not a confirmed risk. (auth/session/route.ts:6-38)
- **Recommendation:** Optionally add `Cache-Control: no-store` to all returns for convention parity with the other session-bearing routes.
- **Holke decides:** Add `no-store` to /api/auth/session for header parity, or treat the public-DID response as not needing it?

---

## Dropped after verification

- **hooks-state-5 (useProfilePds in-flight dedupe is racy)** — REFUTED. React passive effects flush sequentially with no await between `get` and `set`, and the lower-layer `fetchDidDocument` dedupes the network call regardless; the hook also has a single call site. No observable defect. *(A no-op stylistic alignment is retained at the bottom of Quality as quality-042, not as a bug.)*
- **authz-repo-1 (XRPC proxy passes write body verbatim — no envelope allowlist)** — REFUTED as a security risk. The framing is inverted: `pickAllowedFields` in the group routes defends the inner record (mass-assignment), not the envelope, and the named fields (validate/swapCommit/rkey) only affect the user's OWN repo (no cross-tenant break) — behavior the user can already perform directly against their PDS. It is the documented write boundary (AGENTS §10). *(Retained only as a low-confidence optional-hardening note, risk-005.)*
