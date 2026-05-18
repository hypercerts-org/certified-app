# Issue #67 — Project detail: ActivityCards + inline editing

Source: <https://github.com/hypercerts-org/certified-app/issues/67>

## Larger goal

Make project detail visually + interactively consistent with the rest
of the app's record-detail surfaces. Today the project detail page is
an outlier on two axes:

1. The certs in a project render as a dense, custom one-line row, not
   as the full `<ActivityCard>` used everywhere else certs appear.
2. There's no UI to edit a project. Project records can only be
   modified by writing the PDS by hand.

Cert detail already established the inline-edit pattern (title /
shortDesc / description / image, sticky `<EditBanner>`, save handler).
Projects should adopt the same pattern so the editing model is
consistent across record types.

## Scope (this PR)

In rough commit order — each commit lands green on `tsc`, `eslint`,
`next build`:

1. **Render certs as ActivityCards.** Replace `ProjectCertRow` with
   `<FeedLayout>` + `<ActivityCard>` inside the certs section of
   `src/components/project/project-detail.tsx`. Strip dead
   `.project-cert-*` CSS.
2. **Extract a shared `<ImageEditOverlay>`** from
   `activity-detail.tsx`'s inline `CertImageEditOverlay`. Move to
   `src/components/feed/image-edit-overlay.tsx`. Both cert detail
   and project detail consume it. Component takes a `variant: "single" | "with-remove"` prop — cert keeps the single-pill cert variant; project hero gets the two-pill cluster (Change + Remove) per review B6.
3. **Allowlist `org.hypercerts.collection`** in
   `src/app/api/xrpc/[...method]/route.ts:ALLOWED_WRITE_COLLECTIONS`.
4. **Add `putProjectRecord` write helper** at
   `src/lib/atproto/project.ts` mirroring `putCertRecord`. Dual-path:
   own-DID via XRPC, group via the new BFF route.
5. **Add the group BFF route** at
   `src/app/api/groups/[groupDid]/project/route.ts` mirroring
   `groups/activity/route.ts` but with a real `pickAllowedFields`
   allowlist AND a read-modify-write step that server-pins
   `createdAt`, `type`, and `items` from the stored record (per
   review B1 / B2 / B5).
5a. **Retrofit `groups/activity/route.ts`** with `pickAllowedFields`
   in the same PR (per review B4 — same CS-005 fix shape, sibling
   route was missed when the audit landed). Adds `ACTIVITY_FIELDS`
   constant + swaps the mass-assignment spread. Activity route does
   not get the read-modify-write step in this PR (cert detail
   doesn't rely on it yet); flagged as a follow-up if needed.
6. **Wire inline-edit chrome into project-detail.tsx.** Same state
   machine as cert detail: edit drafts (`title`, `shortDescription`,
   `description`), pending image blob, optimistic local mirror,
   sticky `<EditBanner>` above the article when editing. Edit button
   renders only when the viewer can edit. Save handler strips
   `items` from the write payload (server pins it). Plus three fixes
   landed here that benefit cert detail too (one set of shared code,
   two callsites):
   - **Description preserve-mode** for strongRef descriptions
     (review B3). Banner reads "This project's description is hosted
     on an external record — editing here will replace it" with an
     "edit anyway" button that swaps to an empty leaflet doc.
   - **Focus management** on enter / exit edit mode (review M5).
     Title input gets focus on Edit; Edit button receives focus back
     on Cancel / Save.
   - **Certs section deferral signal** in edit mode (review B7).
     Subtitle: "Cert list editing — coming soon. Manage individual
     certs from their detail pages." Cards stay clickable.

### Files added

- `docs/issue-67/plan.md` (this file)
- `docs/issue-67/review-round-1.md` (plan review consolidation)
- `docs/issue-67/review-round-2.md` (after implementation review, if needed)
- `src/components/feed/image-edit-overlay.tsx`
- `src/lib/atproto/project.ts`
- `src/app/api/groups/[groupDid]/project/route.ts`

### Files modified

- `src/components/project/project-detail.tsx` (substantial)
- `src/components/feed/activity-detail.tsx` (swap inline overlay → import; add focus management + strongRef preserve banner)
- `src/app/api/xrpc/[...method]/route.ts` (one-line allowlist add)
- `src/app/api/groups/[groupDid]/activity/route.ts` (CS-005 retrofit per B4)
- `src/app/styles/project-detail.css` (remove dead cert-row classes; add edit-mode chrome — `.project-detail__hero--editing`, `.project-detail__head-row`)
- `src/app/styles/cert-detail.css` (whatever shared overlay extraction needs)

## Alternatives considered

### A1 — Cert render shape on project detail

**Chosen: full `<ActivityCard>` via `<FeedLayout>`.**

- **A1.a (chosen)**: `<ActivityCard>`. Visual consistency with profile
  Certs tab and the global feed. Skeletons, infinite-scroll mechanics,
  empty state — all already in `FeedLayout` so they ride for free.
- A1.b: Keep the compact `ProjectCertRow`. Rejected — that's the
  exact problem the issue is fixing. The dense treatment makes a
  project that lists 3 certs feel like a different app than the
  Certs tab listing the same 3.
- A1.c: A third design — `<ActivityCard>` but in a 2-column dense
  grid. Rejected — diverges from `FeedLayout`'s single-column
  pattern; adds CSS that the rest of the app doesn't carry. If we
  later want a denser project-list view, it should be a global
  ActivityCard variant, not a project-only one.

### A2 — Image edit overlay sharing strategy

**Chosen: extract shared `<ImageEditOverlay>` now.** (Per round-1
review M4: dropped the "Hero" prefix — the cert image is a 1:1
thumbnail, not a hero, so the original name was misleading.)

- **A2.a (chosen)**: Extract `CertImageEditOverlay` →
  `<ImageEditOverlay>` in `src/components/feed/`. Both cert detail
  and project detail import it. Takes a `variant: "single" | "with-remove"`
  prop — cert keeps the single-pill treatment (square 1:1 thumb);
  project hero uses the two-pill cluster (Change + Remove) per
  review B6 because a single 32px pill in the bottom-right of a
  wide hero is too easy to miss. ~40 LOC moved.
- A2.b (issue's stated v1): Copy-paste the JSX into
  `project-detail.tsx`. Rejected — copy-paste leaves us with two
  places to fix the next time the upload affordance changes. Extract
  is cheap (the component is already isolated as
  `CertImageEditOverlay`); we'd just be moving + renaming.
- A2.c: Wait for a third caller. Rejected — the "rule of three" is
  about avoiding premature generalisation. There's no generalisation
  here, just a rename. Two known callers is the right time.

### A3 — Default image field on uploads

**Chosen: write to `banner` on new uploads; preserve existing field
if the record already has `image` populated.**

- **A3.a (chosen)**: `banner` for new uploads. Matches the lexicon
  (the lexicon defines `banner` as the canonical large image; `image`
  isn't in the lexicon at all — see "Lexicon notes" below). When
  loading an existing record with `image` set, the edit flow
  preserves the `image` field on save unless the user uploads a new
  image, in which case the new blob lands in `banner` and the legacy
  `image` is removed.
- A3.b: `image` (matches cert's field name). Rejected — the lexicon
  doesn't define `image` for collections; writing there ships
  non-lexicon fields.
- A3.c: Write to both. Rejected — duplication is data-shape
  pollution and would confuse downstream consumers.

### A4 — Field allowlist on the BFF route

**Chosen: lexicon fields + the small set of legacy-but-in-production
fields, with `pickAllowedFields`, AND server-pinned `createdAt` /
`type` / `items` via read-modify-write.** (Refined after round-1
review B1 / B2 / B5.)

Per AUDIT_REPORT.md CS-005, BFF routes must use `pickAllowedFields`
to prevent mass assignment via the `{...body, $type}` shape. The
existing `groups/activity/route.ts` gets the same retrofit in this
PR (commit 5a per review B4).

**Client-supplied allowlist** (the fields the BFF accepts from the
request body):

```ts
const PROJECT_FIELDS = [
  // Lexicon-defined, client-editable
  "title",
  "shortDescription",
  "shortDescriptionFacets",
  "description",
  "avatar",
  "banner",
  "location",
  // Legacy fields some production records carry but aren't in the
  // current lexicon. Keep so saves preserve them rather than
  // silently dropping data.
  "name",
  "image",
  "startDate",
  "endDate",
  "contributors",
] as const
```

**Server-pinned fields** (the BFF reads the existing record and
forces these from the stored value — client can't influence them):

- `createdAt` — review B1. Prevents back/forward-dating the record.
- `type` — review B2. A project rkey stays a project; can't morph
  into "favorites" / "portfolio" / etc.
- `items` — review B5. The inline-edit flow doesn't touch items;
  pinning prevents a stale-client save from clobbering a concurrent
  "add cert to project" write. A future flow that DOES edit items
  will use a different route or a different request shape.

**Read-modify-write sequence** in the BFF:

1. `getRecord(repo: groupDid, collection: "org.hypercerts.collection", rkey)` to fetch the stored value.
2. Build `record = { $type, ...pickAllowedFields(body, PROJECT_FIELDS) }`.
3. Force-override server-pinned fields: `record.createdAt = stored.createdAt`, `record.type = stored.type ?? "project"`, `record.items = stored.items`.
4. `app.certified.group.repo.putRecord` with the merged record.

This adds one round-trip per save (the `getRecord`). Acceptable cost
for the security + correctness gain on what is a low-frequency
operation (project edits, not feed scrolls).

- **A4.a (chosen, above)**: Allowlist + server-pin. Preserves user
  data; rejects unknown keys; prevents semantic-reshape attacks.
- A4.b: Strict lexicon only (no legacy fields). Rejected — silently
  drops legacy fields on a "save title" round-trip, which is data
  loss the user didn't ask for.
- A4.c: Pass-through everything (mass assignment). Rejected — that's
  what CS-005 explicitly forbids.
- A4.d: Allowlist without server-pin. Rejected — round-1 reviews
  flagged this as a real security + correctness gap.

### A5 — BFF route URL

**Chosen: `/api/groups/[groupDid]/project`.**

- **A5.a (chosen)**: `/project`. Matches the issue, readable, and
  reflects that the BFF semantically handles project (not generic
  collection) writes.
- A5.b: `/collection` (matches the NSID). Rejected — slightly more
  precise on the NSID but reads weirdly in the URL and would tempt
  callers to use it for non-project collections (favorites,
  portfolio, program) where the field allowlist doesn't fit.

### A6 — Write helper file

**Chosen: new `src/lib/atproto/project.ts`.**

- **A6.a (chosen)**: New file. Mirrors `cert.ts`. Single
  responsibility, easy to find.
- A6.b: Extend `src/lib/atproto/collection.ts`. Rejected — that file
  is read-side helpers (`fetchCollections`, `CollectionRecord`). Mixing
  write semantics into a read-side helper module is the kind of drift
  that bites later.

## Lexicon notes

Source: `lexicons/org/hypercerts/collection.json` on
`hypercerts-org/hypercerts-lexicon` main.

- **Required**: `title`, `createdAt`.
- **Defined**: `type`, `title`, `shortDescription`, `shortDescriptionFacets`,
  `description`, `avatar`, `banner`, `items`, `location`, `createdAt`.
- **NOT in the lexicon** but read by existing client code (and likely
  present in production records): `name`, `image`, `startDate`,
  `endDate`, `contributors`. We preserve these on writes (A4) but
  don't add new write paths that produce them.

### Validation boundary (per round-1 review M2)

Structural / shape validation of nested objects — union refs in
`description`, blob refs in `avatar` / `banner`, strongRefs in
`location` and `items[]` — is **delegated entirely to the PDS /
group-service lexicon validator**. The BFF `pickAllowedFields`
allowlist is field-name-level only; it shallow-copies values and
does not inspect nested `$type`, blob refs, or strongRef shapes.
This matches the contract for the existing profile / metadata
routes. The defense-in-depth call here is that the upstream is
the lexicon's home; trying to duplicate its validation in the BFF
would drift.

### Image resolver compatibility (per round-1 review A1)

`resolveActivityImageUrl` is reused across both the activity
`#smallImage` union and the collection `#largeImage` union. Both
wrap their blob ref under `.image`, so the resolver works for
either shape unchanged. Confirmed in `src/lib/atproto/activity.ts`
and the existing `project-detail.tsx` rendering.

## Acceptance criteria

- [ ] Foreign viewer: project page renders certs as full ActivityCards
      (matches profile Certs tab visual). No Edit button.
- [ ] Own profile: Edit button visible in the project header, next to
      the title (mirroring cert detail).
- [ ] Click Edit → title becomes input, shortDescription becomes
      textarea, description becomes a `<LeafletEditor>`, hero image
      gets a dashed-edit outline + Change/Remove pills. Sticky
      `<EditBanner>` appears with Cancel / Save.
- [ ] **Focus on Edit**: title input receives focus when entering edit
      mode (per review M5). **Focus on Cancel/Save**: Edit button (or
      its restored position) receives focus when exiting.
- [ ] **strongRef-description preserve banner**: when the existing
      description is a strongRef, the editor shows the preserve-mode
      banner with "edit anyway" affordance (per review B3). Save without
      "edit anyway" leaves the strongRef untouched.
- [ ] **Certs section deferral signal** while editing: subtitle reads
      "Cert list editing — coming soon. Manage individual certs from
      their detail pages." Cards remain clickable (per review B7).
- [ ] Save with new title → page returns to read-only with the new
      title displayed.
- [ ] Save with a fresh image → new image renders. Re-edit, change
      again → no orphan blob URLs (manual DevTools Memory profile).
- [ ] **Hero image: Remove pill works** (per review B6). After save,
      record's `banner` (or `image` if legacy) is dropped; placeholder
      renders.
- [ ] Save with a new leaflet description → round-trips on reopen,
      list/blockquote/headings preserved.
- [ ] Group admin viewing a group-owned project: Edit visible; save
      routes through `/api/groups/<did>/project`. Non-admin member:
      Edit hidden.
- [ ] BFF route rejects keys not in `PROJECT_FIELDS` allowlist (manual
      curl test).
- [ ] **BFF server-pins `createdAt`**: send a body with a future-dated
      `createdAt` → response's record has the stored `createdAt` (per B1).
- [ ] **BFF server-pins `type`**: send a body with `type: "favorites"` →
      stored record still reads `type: "project"` (per B2).
- [ ] **BFF server-pins `items`**: send a body that omits `items` (or
      with an empty array) → stored record's `items` survives (per B5).
- [ ] BFF route validates `rkey` matches `^[A-Za-z0-9._:~-]{1,512}$`
      per atproto spec (per review L1). Returns 400 for malformed.
- [ ] BFF route validates `did` is a well-formed DID.
- [ ] **Activity-route CS-005 retrofit** (commit 5a): `groups/activity/route.ts`
      uses `pickAllowedFields` against `ACTIVITY_FIELDS` constant; cert
      detail's existing inline-edit flow still works end-to-end (manual
      smoke test).
- [ ] **NSID upstream smoke test** (per review N4): manually verify the
      group service accepts `app.certified.group.repo.putRecord` with
      `collection: "org.hypercerts.collection"`.
- [ ] `npx tsc --noEmit`, `npx eslint src/`, `npx next build` all green.

## Out of scope

- Editing `contributors`, `items[]`, `startDate`/`endDate`,
  `location`. Cert detail's v1 inline edit covers title /
  shortDescription / description / image only; project edit matches
  that surface.
- Project creation flow (`/project/new` is still the coming-soon
  placeholder from the prior commit).
- Concurrent-edit (swapRecord / CID precondition). The race window
  exists today on cert + profile inline edit; same deferral here.
  Project records carry an `items[]` array, so this race is more
  likely to be hit in practice (an "add cert to project" flow
  colliding with a title edit) — flagged but not fixed.
- ~~Retrofitting the `groups/activity/route.ts` with~~
  ~~`pickAllowedFields` (CS-005 follow-up). Same fix shape; deserves a~~
  ~~separate PR.~~ **Moved in-scope** per review B4 (commit 5a).
- Server-pinning `createdAt` / `type` on the activity route. Same
  threat model as the project route but the cert detail UI doesn't
  expose `createdAt` editing today; deferring until the next time
  someone touches the activity route or an actual abuse is observed.
- Migrating `useProjectItems` from per-item PDS `getRecord` to a
  single indexer batch query (now possible via
  `appCertifiedHypercertsCollection.items` array-element where —
  PR #91 / issue #88). Pure perf win; separate change.
- Cross-DID `/api/groups/[groupDid]/project` validation that the
  authenticated user actually has `owner|admin` on the group. The
  upstream `app.certified.group.repo.putRecord` enforces this
  server-side (matches the activity route's contract); we mirror.

## Rollback

- Revert the implementation commit. Each of the 5 commits is atomic.
- `ALLOWED_WRITE_COLLECTIONS` add is forward-compatible: removing
  it just re-blocks writes; no data shape change.
- The new BFF route has no read side; deleting the file removes
  the endpoint with no consumer beyond the new helper.
- The new `<HeroImageEditOverlay>` doesn't change behaviour — both
  callers worked before with the inline component.

## Open questions for the operator

1. Should `<ImageEditOverlay>` live under `src/components/feed/`
   (where its first caller is) or `src/components/ui/` (more
   generic)? Defaulting to `feed/`. Happy to move on request.
2. ~~CS-005 retrofit on `groups/activity/route.ts`.~~ Resolved
   in round-1 review B4: folded into this PR as commit 5a.
3. ~~`shortDescriptionFacets` in the allowlist.~~ Resolved
   in round-1 review N3: keep it; harmless, future-proof.
