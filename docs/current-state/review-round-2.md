# Review round 2 — additional-links editor + type selector + profile detail simplification (PR #57)

A second round of three reviewers ran in parallel against the five commits added on top of round 1: label rename (`2958a34`), additional-links editor (`72e8b94`), type selector with Other (`2ecd575`), inline type descriptions / radio-card list (`5514de6`), and profile detail simplification (`c04850a`). Lenses: functional/behavior, code quality/conventions, atproto data-model.

## Reviewer verdicts

| Reviewer | Lens | Verdict |
|---|---|---|
| A | Functional / behavior | ship-then-fix-nits (no critical findings) |
| B | Code quality / conventions | ship-then-fix-nits (no critical findings) |
| C | Atproto / data-model correctness | ship-then-fix-nits (1 critical) |

## Accepted

1. **Per-link forward-compat on save.** (C critical #1.) The save loop reconstructed each item as `{url}` or `{url, label}` from scratch, dropping any per-item extras a future writer adds (`verified`, `addedAt`, etc.). Same risk class as the round-1 metadata-level fix, at the link level. Each row now carries a `loadedRef` to the original item; the save spreads it under the new url/label, and uses `label: undefined` (JSON-stringify drops it) so cleared labels still leave the wire payload field-free.
2. **Stable React keys for link rows.** (A nit #4 + C suggestion #2.) `key={i}` caused inputs to reuse DOM nodes across mid-row removals, leading to focus/selection misalignment. Each row now has an `id` generated via a ref-counter (`row-1`, `row-2`, …); used as both the React key and the basis for the per-row map operations.
3. **Trash button respects `isSaving`.** (B nit #4.) Add link already had `disabled={isSaving}`; trash now matches, with `disabled:opacity-50 disabled:cursor-not-allowed` for visual parity.
4. **Comment on `typeOtherText` preservation when toggling Other → preset.** (A nit #2.) Save logic ignores stale `typeOtherText` when the radio isn't on Other, but a future reader could reasonably ask why we don't clear it. Inline comment now explains: preserves user work for toggle-back, no leakage risk because the save branches on selection.
5. **Drop redundant `editHref &&` inner guard in profile-client.** (B nit #6.) The outer `(hasDetails || editHref)` guarantees `editHref` is truthy in the empty branch. Refactored to a clean ternary `hasDetails ? <details-card/> : editHref ? <add-cta-card/> : null` — TypeScript also narrows correctly.
6. **Inventory doc refresh.** (B nit #1.) Removed `urls` from the gaps row and from the planning seed since `72e8b94` shipped the editor. `location` remains, plus a new gap row for the "no way to clear `organizationType`" issue surfaced this round.

## Rejected

1. **Trash button → existing BEM (`.org-members__remove-btn` / `.wallet-card__delete`).** (B nit #2.) Both candidate classes are scoped to other concerns and have different sizing (32 px vs 44 px). Extracting a shared `.icon-btn--remove` is design-system work that affects more than this PR's scope; do it as a follow-up sweep alongside the round-1 orphan-CSS sweep.
2. **Radio-card pattern → BEM block in globals.css.** (B nit #3.) New layout-pattern; AGENTS.md §11 rule 2 does say new structure goes in globals.css. Right call long-term, but this is exactly *one* use site (org type picker). Extracting now reads as premature; revisit when a second use site lands. Track as a separate "promote to BEM" follow-up.
3. **Type predicate for `PRESET_ORG_TYPES` derivation** instead of `as readonly string[]` cast at the use site. (B nit #5.) Purely cosmetic; one cast at one site is acceptable.
4. **Read view diverges with multi-value records** (`organizationType.join(", ")` shows all; editor shows only the first). (A nit #5.) Read view is intentionally lossless. Diverging from the editor is the *correct* behavior for legacy multi-value records — it preserves visibility of data the editor doesn't yet model.
5. **Render-side scheme validation for `urls[i].url`.** (B nit #7.) Pre-existing risk for any user-controlled `href` path; tracked in `AGENTS.md` §12 as a known follow-up. The new urls renderer reuses the existing pattern; introducing a shared `validateHref(s)` helper is the right fix and belongs in its own commit.
6. **Display Name still showing under Account Details (user report).** Reviewer A traced exhaustively: no source path renders "Display Name" as a Details row anywhere — only as editor inputs (`/settings/edit-profile`, group editors, group create). Most likely cause is a stale build / preview deploy that hasn't picked up `c04850a`, or confusing the editor input on `/settings/edit-profile` with the Account Details card on `/profile/<did>`. Asked the user for the URL where they see it; pending their reply. Not actionable without reproduction.

## Outstanding follow-ups (tracked, not in this PR)

- **No way to clear `organizationType` from the UI** — needs an explicit "Clear selection" affordance (or a "Prefer not to say" radio that resolves to `undefined`). Tracked in `feature-inventory.md` §15.
- **Trash + radio-card → BEM** (B nits #2 and #3 combined) — a small CSS-extraction PR alongside the round-1 orphan-CSS sweep would resolve all three together.
- **`location` field has no UI** — surfacing was started in `72e8b94` for `urls`; same approach could land for `location` (which is `{ uri: string; cid: string }` — a typed-ref shape).
- **Render-side `href` scheme validation** (`AGENTS.md` §12) — pre-existing follow-up; relevant to the new urls renderer.
- **Display Name report** — pending user clarification on the exact URL.
