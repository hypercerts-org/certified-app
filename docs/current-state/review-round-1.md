# Review round 1 — feat/dashboard-cleanup + organizationType field (PR #57)

Three reviewers ran in parallel against PR #57 (`staging → main`) with distinct lenses: functional/behavior, code quality, and atproto/data-model correctness. All three returned a `ship` or `ship-then-fix-nits` verdict — no critical findings on the code itself. The one "critical" item flagged by Reviewer B was that the inventory doc landed referring to its own pre-merge tree (the four removed components plus the resolved `organizationType` gap). Items below are tracked as accepted (acted on this round) or rejected (with rationale).

## Reviewer verdicts

| Reviewer | Lens | Verdict |
|---|---|---|
| A | Functional / behavior | ship |
| B | Code quality / conventions | ship-then-fix-nits |
| C | Atproto / data-model correctness | ship-then-fix-nits |

## Accepted

1. **Inventory doc + AGENTS.md stale-on-merge.** (B critical, A nit, also surfaced by user.) Inventory listed the four deleted components as "Unverified — possibly retired" and `organizationType` as a gap; AGENTS.md file map still listed the four `.tsx` files. Resolved both. Also dropped the "Dashboard cleanup" planning seed and the `organizationType` row from the gaps table — both resolved by this PR.
2. **Forward-compat metadata spread.** (C suggestion #1: "single highest-leverage fix"; A nit #5.) The metadata-build in `edit-profile/page.tsx` picked named fields (`urls`, `location`, `foundedDate`) rather than spreading the loaded record. Any unknown forward-compat field a CLI or future feature added would be silently dropped on every save. **Pre-existing** — not introduced by this PR — but cheap to fix once already in the file. Changed to `{ ...(metadata ?? {}), createdAt, organizationType, foundedDate }` with `undefined` to clear, which JSON-stringify drops on the wire so `putRecord` correctly replaces the record without the field.
3. **Casing comment on dedupe.** (B nit #2.) Added "first-seen casing wins" to the parser comment so future readers don't have to puzzle out the dedupe behavior. One-line edit.
4. **"Groups are in beta" banner reference in AGENTS.md.** (Out-of-band user instruction, came in mid-review.) The banner has been removed from the UI; AGENTS.md §21 still mentioned it. Removed the banner sentence; kept the staging-server caveat. Swept the rest of the repo — only stray reference was the unrelated brand-level `navbar__beta-label` badge, which is product-wide and not group-specific.

## Rejected

1. **Orphan CSS sweep (~115 lines)** — `.dash-card__stat*`, `.dash-card__activity*`, `.dash-card__preview*`, `.connected-apps__status*`, `.connected-apps__dot` in `globals.css`. Both A and B explicitly said "follow-up, not blocking." Mixing CSS dedupe into this PR widens scope past the user's request. Track separately. Per CLAUDE.md: "Don't add features, refactor, or introduce abstractions beyond what the task requires."
2. **Per-token Type validation** (B nit #3, A nit #4). The `maxLength={256}` caps the joined string, not individual entries. None of the three reviewers blocked. Consistent with how `foundedDate` is handled. Lexicon-level constraints belong on the PDS, not the form; if the lexicon enforces them the PDS will reject and surface in `saveError`.
3. **Extract `parseTypes(input: string): string[]` helper** (B nit #4). Pure cosmetic; one use site; would be premature abstraction. `src/lib/utils/` has no comparable list-parser, and pulling one in for a 12-line inline parser is over-engineering.
4. **`Array.isArray` + `typeof === "string"` filter on read** (A nit #3). Hardens against malformed server records (e.g., a non-string entry). Edge case only; the lexicon enforces the shape server-side. If we encounter it in the wild, we file then.
5. **`hasChanges` dirty-tracking on the group edit form** (A nit #5). The form unconditionally rewrites profile + metadata records on save. A blind-overwrite risk if `getOrgMetadata` partially fails. **Pre-existing** — not introduced by this PR. The forward-compat fix above mitigates the worst case (unknown fields no longer dropped). Track as a separate issue.
6. **Title-case canonicalization on dedupe output** (C suggestion #3). Some downstream consumer might expect canonical capitalization (e.g., "Foundation"). The profile view today just `.join(", ")`s whatever ships, so first-seen casing is fine. If a canonical form is needed later it should live in the lexicon or in the consumer.

## Outstanding follow-ups (tracked, not in this PR)

- Orphan CSS sweep (~115 lines) — accepted as a separate cleanup.
- Confirm the lexicon for `app.certified.actor.organization` constrains `organizationType` per-element length / total array length.
- Consider `hasChanges` dirty-tracking on the group edit form to guard against blind overwrites when load partially fails.
