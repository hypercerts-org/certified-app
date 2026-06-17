# Contributor Board — discovery

Investigation notes behind the plan. Two codebases, one access wrinkle.

## Two hyperboards: copy the new one

- **Old (do NOT copy):** `hypercerts-org/hyperboards` (default branch `develop`, last commit 2025-03-05). Token-centric: Supabase + wallet/SIWE + on-chain hypercert fractions + registries/blueprints/marketplace + Chakra. This is what a first clone of "hyperboards" lands on.
- **New (the reference):** `GainForest/hyperboards`, package **`hyperboards-v2`** — Next.js 16 + React 19 + `@atproto/api` + `d3` + Tailwind 4, **no Supabase**. Cloned locally at `/workspace/hyperboards`. Renders a **weighted treemap** ("tile sizes reflect contribution weights"), AT-Protocol-native, with avatars, board cosmetics, drag-to-resize, iframe embed, share links, "Sign in with your ATProto handle".
- **Access wrinkle:** `GainForest/hyperboards` is private/404 for the `hb-agent` GitHub account (anon + authed). The user provided the local clone; the lexicon + live site corroborate it.

## Authoritative data model (`hypercerts-org/hypercerts-lexicon`)

- `org.hyperboards.board` (rkey tid, in the creator's PDS): `subject` (strongRef → activity/collection), `config` (`#boardConfig`), `contributorConfigs[]` (`#contributorConfig`), `createdAt`. **No weight field** — tile size comes from the activity's `contributors[].contributionWeight`.
- `#boardConfig`: backgroundType (image/iframe), backgroundImage, backgroundIframeUrl, backgroundGrayscale (default true), backgroundOpacity (0–100), backgroundColor, borderColor, grayscaleImages (default false), imageShape (circular/square), aspectRatio (16:9/4:3/1:1).
- `#contributorConfig` (embedded in the board): `contributor` (strongRef → contributorInformation, or a contributorIdentity), `override`, displayName, image, video, hoverImage, hoverIframeUrl, url.
- `org.hyperboards.displayProfile` (rkey `self`, in the **contributor's own** PDS): self-declared displayName/image/video/hoverImage/hoverIframeUrl/url. Marked deprecated in v2's own code, but the user wants it kept — it is the displayed user's own appearance, used **in addition to** their `app.certified.actor.profile`.
- Reference record creation: `fundingthecommons/impactful-events` creates a minimal `subject`+`createdAt` board.

## Render precedence (per display field)

`contributorConfig(override)` → `displayProfile` → `actor.profile` → `contributorConfig(fallback)` → `contributorInformation` → generated initials.

`contributorConfig` = the board owner's per-board styling (e.g. an image for someone who has none); `displayProfile` = the displayed person's own global appearance. Both apply, with `override` letting the board owner force a value.

## certified-app reuse (confirmed)

- Tabs are URL-driven (`?tab=`) from `src/lib/detail-tabs.ts`; `desktop-top-bar.tsx` renders them; `activity-detail.tsx` switches panels. The activity's `contributors[]` (with `contributionWeight`) is already in scope.
- Record writes: `writeToRepo` / `putCertRecord` → the `/api/xrpc/...` proxy (own-repo), `uploadBlob` for images, `saveWithSwap`/`InvalidSwapError` for conflicts. The proxy's `ALLOWED_WRITE_COLLECTIONS` gates writable collections (we added the three `org.hyperboards.*` / contributorInformation NSIDs).
- The XRPC GET proxy **already** federates `getRecord` AND `listRecords` to any PDS (public reads) — so finding the author's board (`listRecords` + subject match) and the embed's public reads need no new route.
- `d3` was not a dependency; we added `d3-hierarchy` (treemap only).
- certified-app has no relational DB by design — everything is AT-Protocol records, which is exactly the v2 model.

## Decisions / scoping

- **Board editing is own-repo only** (viewer's session DID === the activity repo DID). No group BFF route exists for `org.hyperboards.board` / contributorInformation, so group-owned board editing is a documented follow-up; those boards render read-only.
- Images are stored as `org.hypercerts.defs#smallImage` blob refs (kept alive by the referencing record) — so we skip v2's separate `org.hyperboards.blob` pin record.
- Dropped (don't fit a per-activity in-app tab): "My Hyperboards" dashboard, 5s live auto-refresh, CSV/GitHub bulk import, and the old registries/blueprints/marketplace/on-chain machinery (already gone in v2).
