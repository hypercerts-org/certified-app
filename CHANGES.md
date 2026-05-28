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
green within the item's scope, the change is reverted and the item is logged under **Blocked**.

Legend: each implemented entry links its `REVIEW.md` id, the commit, a one-line justification, and how
it was verified.

---

## Implemented

<!-- Phase 2 appends one block per committed item below this line. -->

---

## Blocked

<!-- Items reverted because the gate could not be made green in scope; reason recorded. -->

_(none yet)_

---

## Held — not auto-implemented

These are excluded from auto-implementation because they change external behavior, a public
API/contract, a data schema, dependency choices, or architecture — or are coupled to a held judgment
item. They are listed for Holke's decision; see the matching section in `REVIEW.md`.

- **judgment-001 … judgment-010** — all 10 judgment items (see `REVIEW.md` § "Judgment — held for your decision").
- **risk-005** — drop client-supplied `validate:false` on own-repo writes. Changes the write-envelope
  contract; verifier rated it low-confidence optional hardening. Held.
- **risk-007** — add a rate limiter to `/api/resolve-did`. Duplicate of **judgment-002** (broad
  rate-limit rollout is an ops/behavior decision). Held under judgment-002.
- **risk-009** — give `deleteFollow` a `targetDid` param + add a DELETE handler to the group follow
  route. Adds new API surface (API/contract change). Held; the behavior-preserving doc note may be
  applied in Phase 2.
- **quality-024** — add `autoprefixer` to the PostCSS chain. Identical change to **judgment-007**
  (dependency + build change). Held under judgment-007.
- **quality-042** — `useProfilePds` IIFE-style alignment. The underlying bug claim was refuted; the
  report itself recommends skipping. Skipped (no behavioral benefit).
