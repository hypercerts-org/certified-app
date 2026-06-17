# Contributor Board — plan

A new **"Contributor Board"** tab on the activity detail page that reproduces
GainForest's AT-Protocol-native hyperboard (`hyperboards-v2`) natively inside
certified-app: a weighted treemap of an activity's contributors, viewable by
anyone, editable by the author, embeddable/shareable. See `discovery.md` for
the reference inventory and `org.hyperboards.*` data model.

## Decisions (from the user)

1. Native re-implementation (no iframe of the external app; no Supabase/wallet/on-chain).
2. Reference = the local `/workspace/hyperboards` (`hyperboards-v2`) + the live site.
3. Show the **activity author's** board (the `org.hyperboards.board` whose `subject` is this activity); only the author edits; everyone else views; default treemap from `contributors[]` when no board record exists.
4. Edits write to the activity's `contributors[]` (canonical) plus the board record + contributorInformation records.
5. Features: weighted treemap, add/remove people, edit weights, drag-to-resize, per-contributor rich media (video/hover/url), board cosmetics, public embed + share link, and the `displayProfile` editor.
6. Precedence: `contributorConfig(override)` → `displayProfile` → `actor.profile` → `contributorConfig(fallback)` → `contributorInformation` → generated.

## Files

**Track 1 — data & writes**
- `src/lib/atproto/hyperboard-types.ts` — record + entry types, NSIDs.
- `src/lib/atproto/hyperboard.ts` — `fetchBoardForActivity`, `fetchContributorInfoMap`, `fetchDisplayProfile`, `buildBoardEntries` (precedence), `createContributorInformation`, `createBoardRecord`, `putBoardRecord`, `putDisplayProfile`, image/weight helpers.
- `src/hooks/use-hyperboard.ts`, `src/hooks/use-display-profile.ts`.
- `src/app/api/xrpc/[...method]/route.ts` — add `org.hyperboards.board`, `org.hyperboards.displayProfile`, `org.hypercerts.claim.contributorInformation` to `ALLOWED_WRITE_COLLECTIONS`. (Foreign `listRecords`/`getRecord` already proxied.)

**Track 2 — render + tab**
- `package.json` — add `d3-hierarchy` + `@types/d3-hierarchy`.
- `src/lib/contributor-board/treemap.ts` — squarify layout + tile sizing.
- `src/components/contributor-board/contributor-board.tsx` (container + background + video lightbox), `contributor-tile.tsx` (avatar/label/hover/video/link), `activity-contributor-board.tsx` (tab wrapper + edit toggle).
- `src/app/styles/contributor-board.css` + import in `globals.css`.
- `src/lib/detail-tabs.ts` (+ tab), `src/components/feed/activity-detail.tsx` (union + branch + page title).

**Track 3 — edit / embed / displayProfile**
- `src/components/contributor-board/editable-contributor-board.tsx` (drag-resize + composite save), `add-edit-contributor-dialog.tsx`, `board-settings-dialog.tsx`, `display-profile-dialog.tsx`, `share-embed-dialog.tsx`.
- `src/app/embed/board/[...slug]/page.tsx` + `embed-board-client.tsx` (public, bare).
- `app-shell.tsx` / `desktop-top-bar.tsx` / `navbar.tsx` / `bottom-nav.tsx` — extend the existing bare-route short-circuit to `/embed`.

## Permissions

- View: anyone (public reads). Edit: own-repo only (`isCreator && sessionDid === did`); first edit creates the board record. displayProfile: any signed-in user edits their own (rkey `self`).
- Group-owned board editing is out of scope (no group BFF route for these collections) — those boards render read-only.

## Verification

- `npx tsc --noEmit` (0 new errors over the 6-error `.next` baseline); `npm run lint` (0 errors, 65 warnings = baseline); `npm run build` (green); `npm run test` (700 passing incl. 16 new).
- Unit tests: `buildBoardEntries` precedence, `parseWeight`, `parseBoardRecord`, `fetchBoardForActivity` subject match, `layoutTreemap`.
- Manual (staging): view (treemap sized by weight, cosmetics, dark mode, read-only for non-authors, default board when none); author edit (add via ATProto + manual w/ image, drag-resize → weight persists, cosmetics, rich media, displayProfile); embed route renders bare; share link + iframe snippet.
