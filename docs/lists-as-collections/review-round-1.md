# Plan review — round 1

Three parallel reviewers: lexicon correctness, build/typing surface, UX impact. All returned YELLOW. Findings below are integrated into `plan.md` v2 unless marked Rejected.

## Accepted

| # | Source | Finding | Resolution |
| --- | --- | --- | --- |
| A1 | lexicon | `org.hypercerts.collection` is **already** in `ALLOWED_WRITE_COLLECTIONS` (`xrpc/[...method]/route.ts:48`). Plan's "add if missing" wording is misleading. | Plan updated: "already present, no XRPC route change needed." |
| A2 | lexicon | Indexer support for `orgHypercertsCollection` exists ONLY for the Projects counts query. There's no `Lists` GraphQL op. | Plan updated: explicit "no indexer-side list query in v1; lists are PDS-read only." |
| A3 | typing | `profile-endorsements.tsx` reads `endorsement.listTitle` and passes it to `<PersonCard listTitle?: string>`. NOT in the original plan's file list. | Plan updated to drop list-decoration on Given panel for v1 (simpler than `lists: string[]` overload). `listTitle?` field stays on `GivenEndorsement` for prop-shape continuity but is always `undefined` post-PR. Future follow-up can repopulate as `lists: string[]` once chip-row UX is designed. `profile-endorsements.tsx` stays untouched. |
| A4 | typing + UX | Orphan-item rule: when collection `items[i].itemIdentifier.uri` doesn't resolve to a fetched award (revoked endorsement, foreign-PDS race), the item must not render. Inverse: when an award is revoked from the Given panel, every list that referenced it must drop that item or the next read renders ghost rows. | Plan updated: (a) read-side: skip unresolved items silently; (b) write-side: `deleteEndorsementAward` now scans the issuer's lists and removes matching items before deleting the award. Optimistic UI in the Given panel mirrors the change. |
| A5 | UX | `RevokeListItemButton` confirm copy at `endorsement-lists.tsx:822-823` currently asserts award deletion. Now FALSE under the new model. | Plan updated: confirm copy becomes "Remove from list? Their endorsement from you stays — only the list membership is removed." |
| A6 | UX | `EndorsePeopleModal` subtitle when used from a list should make the "endorse + add" dual action explicit. | Plan updated: when the modal is opened from a list, subtitle becomes "They'll be endorsed (if not already) and added to '<list-title>'." Default flow (not from a list) keeps existing copy. |
| A7 | UX | "List delete" confirm copy clarification. | Already in v1 plan ("Your endorsements are not removed"). No additional change. |

## Accepted-with-modification

| # | Source | Finding | Resolution |
| --- | --- | --- | --- |
| M1 | UX | UX review asked for an additional "To unendorse, use the × on the Given panel" affordance somewhere in the list-detail view. | Deferred. The corrected `RevokeListItemButton` copy already says "endorsement stays"; a second hint risks copy noise. If user confusion shows up post-ship, add a small hint at the list-detail header in a follow-up. Noted in plan §"Out of scope". |
| M2 | UX | UX review asked for multi-list chips spec on the Given panel. | Resolved by A3 (drop list-decoration on Given panel for v1). No chip-row work in this PR. |

## Rejected

| # | Source | Finding | Reason |
| --- | --- | --- | --- |
| R1 | typing | Reviewer suggested keeping `deletedAwards: number` on `deleteList` return for API compat. | Clean break is fine — the field has no external consumer and lying about "0 awards deleted" reinforces stale semantics. Return type drops to `void`. |

## Updated file list

Final files touched by this PR (`plan.md` updated to match):

**Service layer**
- `src/lib/atproto/collection.ts` — extend with list helpers + narrowed `EndorsementListCollectionValue` type.
- `src/lib/atproto/badges.ts` — remove `createListDefinition`, `updateListDefinition`, `deleteListAndAwards`, `createListAward`. Add cross-list cleanup hook in `deleteEndorsementAward` (or expose a `purgeAwardFromLists` helper called alongside).

**Hooks**
- `src/hooks/use-endorsement-lists.ts` — full refactor.
- `src/hooks/use-endorsements.ts` — drop `listTitle` population; type field stays for prop shape.

**UI**
- `src/components/profile/endorsement-lists.tsx` — rewire create/add/remove/delete; copy fixes for delete + revoke-item.
- `src/components/profile/endorse-people-modal.tsx` — subtitle prop accepting per-context copy override (default vs. from-a-list).

**Server**
- *No* server changes — XRPC allowlist already covers `org.hypercerts.collection` (A1).
- `src/lib/auth/rate-limit.ts` — add `"org.hypercerts.collection" → "endorsement-list-write"` (new scope, 30/hour, 100/day).

**Tests**
- `tests/atproto/collection.test.ts` (new) — unit tests for collection helpers.

**Not touched** (explicitly out of scope this PR):
- `src/components/profile/profile-endorsements.tsx` (per A3).
- `src/app/api/indexer/route.ts` (per A2).
- `src/app/api/xrpc/[...method]/route.ts` (per A1).
- `src/hooks/use-received-endorsements.ts`.

## Verdict

GREEN after the above modifications land in `plan.md`. Proceed to implementation.
