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

<!-- PHASE2-LOG-APPEND-POINT -->
