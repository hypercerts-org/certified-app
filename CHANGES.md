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

<!-- PHASE2-LOG-APPEND-POINT -->
