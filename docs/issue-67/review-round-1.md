# Plan review — round 1

Three parallel reviewer agents on `docs/issue-67/plan.md`:

- **Security / BFF** — authorization, mass-assignment, CSRF, rate-limiting, audit-report follow-up state.
- **UX consistency** — edit chrome translation from cert detail to project layout, image-edit affordance on wide hero, items-deferral signal, focus management.
- **ATProto / lexicon shape** — image union resolver, items round-trip, description union edge cases, server-pinning of `createdAt` / `type`, NSID upstream support.

Decisions below are recorded with severity, the reviewer's recommendation, the resolution (Accept / Modify / Reject), and a one-line rationale. Where accepted, the plan file is updated in place.

---

## Blockers + Highs

### B1 — Server-pin `createdAt` (was: client-supplied via allowlist) — **High → Accept**

**Lens**: atproto reviewer (finding §6). Security reviewer also flagged in their §7 "Other".

**Issue**: The plan accepts `createdAt` from the client body via `pickAllowedFields`. The PDS doesn't constrain the value, so a buggy / malicious client can rewrite `createdAt` on every save and reorder feeds.

**Resolution**: Accept. The BFF route will `getRecord` the existing rkey first, extract `createdAt` from the stored value, and force-override `record.createdAt` server-side. `createdAt` drops out of the client-supplied allowlist. The cert-detail save path has the same hole; retrofitting it is tracked under "Out of scope, follow-up" in the plan but worth a note that the project route ships the fix and the activity route doesn't yet.

### B2 — Server-pin `type` (project rkey can't morph into another collection kind) — **Medium → Accept**

**Lens**: atproto reviewer (finding §7). Security reviewer also (§2).

**Issue**: Lexicon `knownValues` is non-restrictive, so accepting `type: "favorites"` on a project rkey would semantically reshape the record. Downstream filters (`type === "project"` in `useUserProjects`) silently drop it.

**Resolution**: Accept. Same shape as B1 — read existing `type` from the stored record server-side, force `record.type = existing.type ?? "project"`. Drop `type` from the client-supplied allowlist. Strict: a project rkey stays a project.

### B3 — `description` strongRef silently overwritten on save — **High → Accept (with documented behaviour)**

**Lens**: atproto reviewer (finding §4).

**Issue**: If the existing description is a `com.atproto.repo.strongRef`, opening the editor renders an empty leaflet doc (because `asLinearDocument` returns null for strongRefs). On save, the strongRef is overwritten with a linearDocument. Silent data loss.

**Resolution**: Accept the fix shape: when `effectiveValue.description` is a strongRef OR is unrecognized, the editor enters "preserve" mode — the strongRef passes through untouched on save unless the user actively types into the editor. UI affordance: a small banner above the editor when in preserve mode ("This project's description is hosted on an external record — editing here will replace it") with a button to "edit anyway" that swaps to the empty leaflet doc. Matches cert detail behaviour going forward; cert detail gets the same fix in the same PR (one helper, two callers) because the bug is identical.

### B4 — Retrofit `groups/activity/route.ts` with `pickAllowedFields` in this PR — **High → Modify**

**Lens**: Security reviewer (finding §6).

**Issue**: The new project route is being built *because of* CS-005, while the sibling activity route still uses `{...rawRecord, $type}` mass-assignment. Shipping both in the same PR while leaving the violation in place is half-measure security.

**Resolution**: Modify. Add the retrofit as commit #5a of the implementation sequence (between BFF route landing and inline-edit chrome). Same shape: define `ACTIVITY_FIELDS` allowlist, swap to `pickAllowedFields(body.record, ACTIVITY_FIELDS, ACTIVITY_COLLECTION)`. Field list cross-checked against `org.hypercerts.claim.activity` lexicon (title, shortDescription, shortDescriptionFacets, description, image, contributors, workScope, startDate, endDate, locations, rights, createdAt, plus legacy fields if any).

### B5 — `items[]` clobber risk via inline-edit save — **High → Accept**

**Lens**: Security reviewer (§7) and atproto reviewer (§3) — same item from different angles.

**Issue**: Client-side `next = {...effectiveValue, title}` spread sends the full `items[]` back through the BFF. If `effectiveValue.items` is stale relative to a concurrent "add cert to project" write (a v2 flow), a save clobbers the new items.

**Resolution**: Accept the safety belt. Exclude `items` from the inline-edit write payload **on the client side** — the BFF allowlist keeps `items` allowed (so future flows that DO edit items can use the same route), but the inline-edit save handler strips `items` from `next` before sending. The PDS preserves the stored `items` because… wait, no. atproto `putRecord` is a whole-record overwrite; the PDS will use whatever the client sends, which without `items` would erase the array. So the BFF should fall back to the stored `items` when the request body omits the field (or when items[] is explicitly null), via the same read-modify-write step we're doing for `createdAt` / `type`. Implementing as: BFF reads existing record once → uses stored values for `createdAt`, `type`, `items` → merges client-supplied editable fields on top. Drops `items` from the client allowlist; the field is server-managed for the inline-edit flow specifically.

### B6 — UX: Render the hero overlay with Change + Remove pills (two-pill cluster) — **High → Accept**

**Lens**: UX reviewer (finding §3).

**Issue**: A single 32px Change pill in the bottom-right of a wide hero (~1200px) reads as decorative, not as "edit the image".

**Resolution**: Accept. The shared image-edit overlay renders both Change and Remove pills when used on a wide hero. Cert-detail keeps its single-pill variant. The shared component takes a `variant: "single" | "with-remove"` (or two-component split) — implementation will pick whichever is cleaner. Project edit also supports image removal (lexicon `banner` is optional).

### B7 — UX: Signal `items[]` deferral in-UI, not just docs — **Medium → Accept**

**Lens**: UX reviewer (finding §5).

**Issue**: A creator clicks Edit and sees title/short/desc/hero editable but the certs section stays inert. The implicit promise of "edit mode" is broken without a signal.

**Resolution**: Accept. While in edit mode, the certs section header gets a small subtitle: "Cert list editing — coming soon. Manage individual certs from their detail pages." Cards stay interactive (clickable into cert detail) but no add/remove affordance appears.

---

## Mediums

### M1 — Pin `type` server-side (covered by B2). — **Accept (merged with B2)**

### M2 — `pickAllowedFields` shallow-copy: nested object validation delegated to PDS — **Note → Document**

**Lens**: Security reviewer (finding §3).

**Issue**: `pickAllowedFields` doesn't introspect nested objects. `description`, `avatar`, `banner`, `location`, `items[]` all carry nested `$type` and strongRefs that pass through unchecked.

**Resolution**: Document, don't fix. The plan's "Lexicon notes" section will add: *"Structural / shape validation of nested objects (union refs in `description`, blob refs in `avatar`/`banner`, strongRefs in `location` and `items[]`) is delegated entirely to the PDS / group-service lexicon validator. The BFF allowlist is field-name-level only."* This matches the contract for the existing profile / metadata routes; making it explicit so future reviewers don't re-litigate.

### M3 — UX: Spell out `.project-detail__hero--editing` modifier + `__head` title-row flex — **Modify**

**Lens**: UX reviewer (finding §1).

**Issue**: The plan implies the overlay "mounts on the hero" but doesn't specify the new CSS classes needed (dashed-outline modifier on the hero in edit mode, flex title-row in `__head` to fit the Edit button).

**Resolution**: Accept and add explicit CSS surface to the plan. Both modifiers are one-rule additions; just naming them up front so the implementer doesn't reinvent.

### M4 — Rename `HeroImageEditOverlay` → `ImageEditOverlay` — **Accept**

**Lens**: UX reviewer (finding §2).

**Issue**: "Hero" is misleading when the cert image is a 1:1 thumbnail, not a hero.

**Resolution**: Accept. Component name is `ImageEditOverlay`, file `src/components/feed/image-edit-overlay.tsx`. Same shared callsite from both cert detail and project detail.

### M5 — Accessibility: focus management on enter/exit edit mode — **Accept**

**Lens**: UX reviewer (finding §6).

**Issue**: Cert detail (the pattern being mirrored) doesn't move focus to the title input on Edit, and doesn't return focus to the Edit button on Cancel/Save. Keyboard users get focus dropped to `<body>`.

**Resolution**: Accept and fix in shared chrome. On entering edit mode, focus moves to the title input (via `useEffect` + ref). On exiting, focus returns to the Edit button (or to the Save/Cancel cluster's parent if the Edit button isn't yet remounted). Same fix lands on cert detail in the same commit; one place to test, both surfaces benefit.

### M6 — `useProjectItems` resolution shape is already what `FeedLayout` needs — **Note → Verify**

**Lens**: atproto reviewer (finding §9).

**Issue**: Confirms `useProjectItems` already returns `{uri, cid, value}` ActivityRecord shapes; `FeedLayout` consumes them without further fetches. But the reviewer flagged "verify FeedLayout supports a pre-resolved list (vs. cursor-driven fetch)".

**Resolution**: Verify before commit #1 of the implementation. The `FeedLayout` source (`src/components/feed/feed-layout.tsx`) takes `activities` directly — no fetcher is built in; the component renders what it's given and triggers `loadMore` from a sentinel. Pre-resolved list works fine; `hasMore=false` + no-op `loadMore` keeps the sentinel from firing.

---

## Lows + Notes

### L1 — `rkey` regex validation tighter than non-empty-string — **Accept**

**Lens**: Security reviewer (§7).

**Resolution**: Accept. Use `^[A-Za-z0-9._:~-]{1,512}$` per atproto spec. Clean 400s vs. trusting upstream rejection.

### L2 — `FeedLayout` empty-state default copy is feed-flavoured — **Accept**

**Lens**: UX reviewer (finding §7).

**Resolution**: Accept. Pass a project-scoped `emptyState={<EmptyState ... />}` prop explicitly. Plan already says this; just re-confirming.

### N1 — Authorization on the BFF route — Note (solid)

Security reviewer §1: no existing pre-check pattern in the repo; upstream `app.certified.group.repo.putRecord` is the contract source-of-truth. Ship as planned.

### N2 — CSRF + rate limiting — Note (solid)

Security reviewer §4, §5. CSRF check is the first line of the existing pattern; the project route mirrors. Rate-limiting correctly omitted (project writes are own-PDS / own-group, not third-party-targeted).

### N3 — `shortDescriptionFacets` plumbing-only — Note (accepted)

ATProto reviewer §5. Allowing harmless; no producer in the codebase yet; saves a future BFF change when the editor learns to produce facets.

### N4 — Upstream NSID support — Note (verify in smoke test)

ATProto reviewer §8. The group service has already accepted three NSIDs (`actor.profile`, `actor.organization`, `claim.activity`); `org.hypercerts.collection` is consistent with the established surface. Manual smoke test as part of the acceptance criteria.

---

## Items rejected

None of the reviews were rejected outright. The closest is **N3** which would have been low-priority to fix; instead accepted-as-is because the cost of including is trivial and the cost of excluding is "we'll come back".

---

## Updates to the plan

Applied in `docs/issue-67/plan.md`:

- **A4** rewritten to drop `createdAt`, `type`, `items` from the client-supplied allowlist (server-pinned via read-modify-write).
- New "Server-pinned fields" subsection under A4 documenting the read-modify-write step.
- **A2 / A4** name change: `HeroImageEditOverlay` → `ImageEditOverlay`.
- New "M2 nested objects" note added to "Lexicon notes" section.
- "Scope" section updated to include the activity-route CS-005 retrofit as commit 5a, and the description-preserve fix as part of the inline-edit chrome commit.
- "Acceptance criteria" extended with focus-management items, strongRef-description preserve banner, type/createdAt pin verification, and tighter rkey regex.
- "Out of scope" section pruned (CS-005 retrofit moved in-scope per B4).
- "Open questions" #2 resolved (CS-005 retrofit folded in).
