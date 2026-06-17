# Contributor Board — implementation review round 1

Three reviewer agents (correctness/write-paths, design-rule/dark-mode, React/integration). Accepted items fixed in a follow-up commit; rejected items recorded with rationale.

## Accepted & fixed

- **`--color-error-text` is undefined** (all four dialogs/editor) → the inline error text never rendered red and was theme-invisible. Switched to the canonical `--color-error` (defined for light + dark). [HIGH]
- **Edit-during-load could create a duplicate board** — the "Edit board" button mounted the editor with `boardRef=null` before the load resolved, so a save took the create-board branch. Gated the button on `!isLoading`. [MAJOR]
- **`useDisplayProfile.reload()` stale-write race** — it fired a second, unguarded fetch. Reworked to bump a `reloadTick` the single cancellation-guarded effect depends on. [MAJOR]
- **Drag-to-resize listener leak** — `pointermove`/`pointerup` weren't removed if the component unmounted mid-drag. Added an unmount cleanup ref + `setPointerCapture` so a drag that leaves the window can't strand listeners. [MAJOR]
- **Partial-save integrity + swap messaging** — the save now runs in three phases: create identities (then demote new drafts so a retry never re-creates them), write the activity with a swap guard (advancing the committed CID), then write the board. A board-write failure keeps edit mode with a "contributors saved — click Save to retry" message; a swap conflict shows a reload hint instead of a raw error. [MAJOR]
- **Treemap recomputed every render/drag tick** → wrapped `layoutTreemap` in `useMemo`. [MINOR]
- **Tile image had no error fallback** → falls back to initials on load error (tracked by errored-URL, no effect). [MINOR]
- **Click-through URL not scheme-checked** → only `http(s)` links are followed (`safeHttpUrl`), blocking `javascript:`. [MINOR]
- **Resize handle a11y** → marked `aria-hidden`; the numeric Weight field in the edit dialog is the keyboard path. [MINOR]

## Rejected / not changed (with rationale)

- **Round-trip a non-override board `displayName`** — flagged as possible data loss. Not applicable: this code only ever writes `contributorConfig.displayName` under `override`, so a non-override board display name can't be produced; persisting the merged/resolved name as a fallback would instead introduce staleness. Documented as: set a board-specific name via override.
- **Editing an existing manual person doesn't update their `contributorInformation` record** — by design; per-board edits live in `contributorConfig` (override) so the shared identity record isn't mutated from one board.
- **Fallback image for an atproto contributor with an actor avatar never shows** — spec-correct precedence (the person's own profile wins over a board fallback).
- **Share/embed available before the first board save** — acceptable; the embed renders the default board from the activity's contributors even with no board record.
- **No tile cap / virtualization** — acceptable for v1 board sizes; noted as a future perf item.
- **Generic-host video iframe blocked by CSP** — acceptable; YouTube/Vimeo/Instagram (the common cases) are handled, other hosts fail closed.
- **Readonly share `<input>`/`<textarea>` and settings checkboxes are hand-rolled** — token-compliant; no `Checkbox` primitive exists and the readonly fields are trivial. Advisory only.
