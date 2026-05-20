# Impl review — round 2

Two parallel reviewers: functional correctness on the new write paths, and code-quality + smoke. Findings below are integrated into the implementation in a follow-up commit unless marked Rejected.

## Accepted (HARD)

| # | Source | Finding | Resolution |
| --- | --- | --- | --- |
| H1 | correctness | **Race-double-add creates duplicate awards.** `addSubjectToList` calls `createEndorsementAward` unconditionally (TID-keyed creates), then `appendItemToList` dedupes on award URI. If the modal's `alreadyEndorsedDids` set races (concurrent same-tab clicks; cross-tab adds), the second call mints a fresh award URI that the dedupe can't catch — the same subject appears twice in the list with two distinct awards. Plan acceptance #2 ("Re-adding the same subject is a no-op") doesn't hold. | Reviewed option (a) — short-circuit before the award create when the list's existing items already include an award for that subject. Cheaper than an inflight Map and also closes the cross-tab race the Map can't help with. Fix applied in `addSubjectToList`. |
| H2 | code-quality | Stale comment in `src/components/profile/endorsement-lists.tsx:86-89` claims awards land under "THIS list" — wrong under the new model. | Rewritten. |
| H3 | code-quality | Stale reference to deleted `updateListDefinition` in `src/lib/atproto/badges.ts` JSDoc. | Removed. |
| H4 | code-quality | Stale reference to deleted `createListAward` in `src/lib/atproto/badges.ts` `writeBadgeAward` JSDoc. | Reworded to describe the surviving callers only. |
| H5 | code-quality | Stale reference to deleted `createListAward` in `src/components/profile/endorse-people-modal.tsx:37`. | Reworded. |

## Accepted (would-be-nice)

| # | Source | Finding | Resolution |
| --- | --- | --- | --- |
| W1 | code-quality | Test gap: no assertion that `updateEndorsementListCollection` preserves `items[]` and `createdAt` across a metadata-only update. The most likely future regression (someone trims the spread). | Added a test. |

## Rejected

| # | Source | Finding | Reason |
| --- | --- | --- | --- |
| R1 | code-quality | Add tests for `purgeAwardFromLists` swallowing per-list errors and `appendItemToList` throwing on a deleted list. | Behaviour is documented and the code paths are straightforward (try/catch around `removeItemFromList`; `if (!existing) throw`). The marginal coverage cost a small failure surface that's well-isolated to one helper each. Worth adding if a regression actually appears. |
| R2 | code-quality | Strip the two banner-comment dividers (`// ---` lines) in `collection.ts` and `endorsement-lists.tsx`. | Section dividers in long files aid navigation; CLAUDE.md's "no comments unless WHY non-obvious" rule targets inline why-comments. Keeping. |
| R3 | correctness | Compensate the orphan-award scenario in Scenario 1 (create award succeeds, collection put fails). | Recoverable manually via the Given panel; adding a compensating delete would itself fail and double the surface area. Documented behaviour per plan §"Lifecycle" + §"Migration / backward compat" implies-no-cleanup; the orphan-item read-path drop makes the orphan invisible on the lists side already. |

## Verdict

GREEN to ship after H1–H5 and W1 land.
