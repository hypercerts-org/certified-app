# Review — integration / UX

Lens: does the plan plug into the redesign's component surface and nav system without producing a feed that looks wrong, mis-routes users, or asks existing components to render shapes they were never built for?

Reviewed: `discovery.md`, `plan.md`, `DESIGN.md` (TOC + nav/layout sections), `activity-card.tsx`, `project-list-row.tsx`, `endorsement-row.tsx`, `feed-layout.tsx`, `feed.css`, plus supporting reads of the nav surfaces (`navbar.tsx`, `desktop-left-rail.tsx`, `mobile-sidebar.tsx`, `site-drawer.tsx`, `bottom-nav.tsx`), `empty-state.tsx`, `activity-card-skeleton.tsx`, `activity-author.tsx`, `use-author-info.ts`, `collection.ts`, `activity-types.ts`, and the cert-list-row CSS the project row inherits.

## Integration issues / corrections

### 1. `/home` is not reachable from the primary nav (BLOCKER for the mount-point decision)

The plan asserts `/home` is the right surface ("the redesign reserved this surface for the home-timeline feed", `discovery.md:33-34`). It isn't, at least not yet. The redesign-era nav points the "feed" affordance at `/feed`, not `/home`:

- `src/components/layout/bottom-nav.tsx:30,37,42` — mobile bottom nav's "Feed" icon (Newspaper) routes to `/feed`.
- `src/components/layout/mobile-sidebar.tsx:113` — hamburger drawer "Feed" link routes to `/feed`.
- `src/components/layout/desktop-left-rail.tsx:210-222` — desktop left rail has NO "Home" item at all. Order is Profile → Explore → Endorsements → Notifications → Groups → Apps → Settings. The brandmark link goes to `/profile/<handle>` for authed users, not `/home` (lines 196-202).
- `src/components/layout/site-drawer.tsx:60` — the ONLY surface that links to `/home` is the legacy `SiteDrawer` (Home/Explore/My profile/Settings). A grep for `"/home"`/`href="/home"` across the whole repo returns exactly one match. That drawer's status is unclear; the active mobile drawer for authed users is `MobileSidebar`, not `SiteDrawer`.

Net: shipping a polished feed at `/home` is shipping a feed that nobody can find by clicking. The discovery doc's claim that "/home was reserved by the redesign" is not borne out by the components that ship the redesign.

Recommendation, in priority order:
1. **Pick one route and converge on it before implementation.** Either retire `/feed` (currently a redirector → `HomeClient`) and mount the feed at `/feed` (matching every nav surface), or rename the redesign's Feed nav targets to `/home` (touches bottom-nav, mobile-sidebar, and adds a Home item to desktop-left-rail). The former is much smaller — `/feed/page.tsx` already wraps a stub `HomeClient` (`discovery.md:35-38` calls it vestigial) and can be replaced cleanly.
2. If staying at `/home`, the plan **must** include a nav-wiring track: add Home to `desktop-left-rail.tsx` (and decide its position relative to Profile/Explore), rewrite the bottom-nav and mobile-sidebar "Feed" targets to `/home`, and decide what happens to `/feed`.
3. The "out of scope: migrating `ActivityFeed.following`" note becomes load-bearing in either direction — leaving `/feed` as `HomeClient` while the actual home feed lives at `/home` will confuse anyone who lands there via a stale link, search result, or another user's bookmark.

This is the single biggest UX risk; everything else in the plan can ship correctly and still produce zero traffic if this isn't resolved.

### 2. `EndorsementRow` is a `<li>` — `home-feed.tsx` needs a `<ul>` wrapper around endorsement events, or row layout collapses

`EndorsementRow` returns `<li className="endorsement-row">` (`endorsement-row.tsx:48`). Its CSS depends on being inside `.endorsements-list` for proper list-reset, vertical spacing, and dividers (`feed.css:1461-1479` — `list-style:none`, `padding:0`, etc. live on `.endorsements-list`, not the row). Every existing caller wraps it in `<ul className="endorsements-list">` (`src/app/endorsements/page.tsx:75-86`; the profile endorsements section does the same).

The plan's `home-feed.tsx` dispatch (`plan.md:271-282`) appears to render each event inline at the top level of `<div className="feed">`. Dropping a bare `<li>` directly inside a `<div>` is invalid HTML and will inherit no list styling — the row will still render but lose its dividers, vertical rhythm, and the careful `:last-child` border handling.

Two options, equivalent in effort:
- Wrap each endorsement event in `<ul className="endorsements-list" style={{margin:0}}>…</ul>` and put the `EndorsementRow` inside it. Ugly because each event becomes its own one-item list — kills the `:last-child` rule across endorsements (every row gets a bottom border).
- Refactor `EndorsementRow` to render a `<div>` (or accept a tag prop) and move the list-reset into the row class itself. Cleaner but touches a shared component used by `/endorsements` and the profile page — requires verifying the existing surfaces still look right.

The plan should pick one and call it out as a touched file, or refactor `EndorsementRow` upfront as part of this PR. As written, "reuse the existing component as-is" doesn't work for the home-feed shell.

### 3. Mixed cards + rows in one column will read as visual chaos

The four kinds dispatch to two visual registers that the redesign never intended to interleave:

| Kind | Renderer | Visual register |
|---|---|---|
| `cert.create` | `ActivityCard` | **Card.** Full-width 1:1 image, serif H2 title, 3-line description, meta pills, 20–24px vertical padding, hairline `border-bottom`. (`feed.css:353-577`, DESIGN.md §4 "Cards" line 158.) |
| `collection.create` | `ProjectListRow` | **Dense row.** 3-column grid (1fr 200px 84px), 40×40 thumb, 0.9rem sans title, no image, 10×14 padding, hover-wash background, 1px top-border separator. (`explore.css:420-530`.) |
| `badge.award` / `legacy.endorsement` | `EndorsementRow` | **List row.** 48px avatar, sans display name, optional note, right-aligned date. Lives inside `.endorsements-list` with its own divider rules. (`feed.css:1469-1479`.) |
| _unknown_ | `FeedEventFallbackCard` | New component, undetermined register. |

`ProjectListRow` was also designed for a bordered/elevated wrapper — `.explore__list` provides `border: 1px solid var(--border-subtle); border-radius: 8px; background: var(--bg-elevated); overflow: hidden;` and adds the row-separator via `.explore__list > li + li .cert-list-row`. Drop it into `.feed` (flex column, no background, no card chrome — `feed.css:346-349`) and the row loses its container, the hover-wash will paint the row without a visual boundary, and the rounded-corner clip disappears.

A scroll that alternates:
- huge serif title + square image
- tight 40-px-thumb 3-column grid row
- compact avatar + sans-name + date row
- huge serif title + square image

…doesn't read as one feed. It reads as four feeds someone forgot to filter.

Recommendation:
1. **Treat the home feed as a card stream.** Build adapters that render each kind in the `.feed-card` visual language (border-bottom hairline, generous vertical padding, author byline up top, content body, meta row at the bottom). For `cert.create` that's the existing `ActivityCard`. For `collection.create`, build a `CollectionFeedCard` that uses the card vocabulary (banner image, serif title, item count + location meta) — don't reuse `ProjectListRow` from the dense explore-list register. For `badge.award`/`legacy.endorsement`, build an `EndorsementFeedCard` that reads like "X endorsed Y" with both actor + subject bylines — don't reuse the audit-list `EndorsementRow`.
2. If (1) is too much for v1, at minimum **wrap each non-card kind in a feed-card shell** (`.feed-card` div with the same vertical padding + hairline) so the rhythm survives. Document the trade-off as "rows visually compress inside the card slots, revisit in v2."
3. Either way, the plan's current "compose an `ActivityRecord` / `CollectionRecord` from the payload + event metadata" instruction (`plan.md:272-279`) understates the work. It's not just shape mapping — it's deciding whether the rendered element matches the surrounding rhythm.

### 4. `ActivityCard` requires a `did` for image resolution AND a full `ActivityRecord.uri` for the detail link — composing one from the hydration payload is non-trivial

The plan says (`plan.md:273-275`): "compose an `ActivityRecord` shape from the payload + event metadata." Concretely:

- `ActivityRecord` is `{ uri, cid, value: ClaimActivity }` (`activity-types.ts:64-68`).
- `ActivityCard` reads `record.uri` to derive the detail-page href via `parseActivityUri` (`activity-card.tsx:31-32`). The card silently degrades to non-linked when `parseActivityUri` returns null.
- `ActivityCard` uses the separate `did` prop to resolve the image URL via `resolveActivityImageUrl(value.image, did)` (`activity-card.tsx:24-26`) — i.e. to construct the `getBlob` URL pointing at the author's PDS.

For the home feed:
- `event.subjectUri` is the at:// URI — fine for `record.uri`.
- `event.actor.did` is the actor DID — but the actor DID and the activity's owner DID are the same here (the indexer's `followerEvents` returns events authored by people the viewer follows), so passing `event.actor.did` to the `did` prop is correct. **Worth a sentence in the plan to nail this down**, because it'll confuse the implementer who sees both a `did` prop and an event with multiple DID-shaped fields.
- `cid` can be empty string; nothing on this code path reads it.

OK as a structural plan; the plan should just state the mapping explicitly so the implementer doesn't reach for `record.uri` from a property that doesn't exist on the payload.

### 5. `ProjectListRow` reads from raw record shape — the GraphQL `*ByUri` payload won't match without coercion

`ProjectListRow` reads via `(value as Record<string, unknown>).banner ?? value.image`, `value.items` (Array.isArray), `value.location` (string OR strongRef object with `.uri`), and `value.createdAt` from the underlying `CollectionRecord.value` (`project-list-row.tsx:41-66`). It then calls `useLocation(locationRef ?? "")` to fetch the LocationRecord by URI.

The plan's GraphQL selection (`plan.md:94`) is:
```
{ title, type, banner { ... }, items { itemIdentifier { ...ComAtprotoRepoStrongRef.uri } } }
```

Issues:
- No `createdAt` → the row's `__time` column will be empty.
- No `location` (raw value, inline OR strongRef.uri) → the row's "📍 location" meta-item won't render. Discovery flags this is desired ("only minimum fields for a headline render", `plan.md:88-89`), so visually fine, but the row was designed assuming location is present — without it the row is unbalanced (just a count, no second meta-item).
- `useLocation` will still be called with `""` and short-circuit, so no fetch — that's fine.
- `value.banner` will arrive as the GraphQL-shaped image object; `resolveActivityImageUrl` was written for the XRPC record shape (`HypercertsUri | HypercertsSmallImage` — `activity-types.ts:54`). The plan's selection deliberately matches via `...OrgHypercertsDefsUri.uri, ...OrgHypercertsDefsSmallImage.image { ref, mimeType }` — but the resolver expects a specific union, and "ref" is typically a blob-ref `{ $link }`, not a string. Highly likely the image will fail to resolve and fall through to the FolderGit2 fallback icon.

Recommendation: explicitly include `createdAt` in the GraphQL selection (or accept the gap and note it). Probe the actual image-payload shape during Phase 4 (the plan's own caveat at `plan.md:100-105` covers this) and verify `resolveActivityImageUrl` either works directly or needs an adapter — this is foreseeable enough to call out as expected-rework rather than as a hidden risk.

### 6. `EndorsementRow` has no `note` from `legacy.endorsement` and no `value.subject.did` is guaranteed

The plan dispatches both `badge.award` and `legacy.endorsement` to `EndorsementRow` (`plan.md:278-279`), but the legacy selection (`plan.md:96`) is `{ subject { did }, createdAt }` — no `note`. That's actually fine because `EndorsementRow`'s `note` prop is optional. Worth confirming in the plan that legacy endorsements just render without a note (the row collapses cleanly).

More important: `EndorsementRow` fetches author info itself via `useAuthorInfo(subjectDid)` (`endorsement-row.tsx:40`), which is correct re: the question asked. It does NOT, however, surface the **actor** anywhere — the row only shows the subject's avatar+name+note+date. In the home-feed context, the user wants to know "who endorsed whom." Without the actor, the row reads as "{subject} got endorsed at {date}" with no signal of which followed person caused this to appear in the feed.

This is the deepest version of point (3): `EndorsementRow` literally cannot render the byline the feed needs without modification. Either:
- Add a prop like `byline?: ReactNode` and pass an `<ActivityAuthor did={event.actor.did} />` so the row shows "{actor avatar+name} endorsed {subject avatar+name}." This is a small additive change.
- Build the `EndorsementFeedCard` shell from (3) that renders both lines.

Pick one in the plan, not at implementation time.

### 7. Skeleton mismatch is a real layout-shift problem

The plan uses `3× ActivityCardSkeleton` regardless of kind (`plan.md:271`). `ActivityCardSkeleton` renders a 1:1 image block + title + 2 text lines + 2 pills (`activity-card-skeleton.tsx`), heights summing to roughly 380px on mobile. When real data lands:

- `cert.create` → matches (this is the card whose skeleton this is).
- `collection.create` → ProjectListRow is ~64px tall (10px padding + 40px thumb + 10px padding). Each replaced skeleton collapses by ~315px.
- `badge.award` / `legacy.endorsement` → `endorsement-row` is ~70px tall. Each collapses by ~310px.
- Fallback → unknown height; depends on what gets built.

If the feed loads 20 events and 12 of them are non-cert, the visible viewport will reflow violently as cards swap in. The skeleton's premise (3 placeholders ≈ what the first page will look like) is wrong unless the page is dominated by cert.creates.

Options:
1. **Use a generic line-skeleton** sized to the smallest renderer (~70px), repeated 8–10× to fill the viewport. Reduces shift even if the first page is all certs (cards just expand each from 70px → 380px, a single downward shift on first paint vs. per-event upward jolts).
2. **Wait until the first page is fetched before rendering skeletons**, then render a skeleton matched to each event.kind. Adds one fetch's worth of latency before any visual feedback — probably bad.
3. **Drop the skeleton entirely**, use a centered `LoadingSpinner`. Matches the redesign's quieter loading states (see `endorsements-loading` in `feed.css:1428-1432`).

Recommend (1) or (3); call out the decision in the plan so it doesn't become an implementation accident.

### 8. Empty state needs three variants, not one

The plan lists one empty state — Users icon, "Follow people to see their activity here." (`plan.md:264-265`). The feed has at least three distinct empty conditions, each meriting its own copy:

- **Signed out** (`useAuth().did === null`). The plan partly handles this by saying "polling pauses when authors is empty / signed out" — but doesn't say what's rendered. Should be a sign-in CTA, not "Follow people."
- **Signed in, zero follows** (the plan's "authors is empty" case). The Users-icon + "Follow people" copy fits here.
- **Signed in, follows present, but no events from them yet**. Different copy — "Your follows haven't created anything yet. Try following more people." or similar. The plan implicitly treats this as the same "Users icon, follow people" message, which is incorrect — the user HAS followed people.

`EmptyState` (`src/components/ui/empty-state.tsx`) is the right component to reuse — it accepts `icon`, `title`, `description`, optional `children` slot for a CTA. The signed-out variant should pass `<button onClick={openSignIn}>` (matching `useAuth().openSignIn`) into the `children` slot.

Additionally, `feed-layout.tsx` already models the right pattern — it accepts an `emptyState?: React.ReactNode` prop so callers can supply a custom state (`feed-layout.tsx:25, 107-109`). The home-feed should follow the same pattern internally: branch on `(authors.length === 0 ? signedOutOrNoFollows : events.length === 0 ? noEvents : ...)` rather than collapsing to a single state.

### 9. `truncatedBySource` / `truncatedByCap` warning has no UI design

The hook returns both flags (`plan.md:194-201, 230-232`) and the render section says "feed UI can show a once-per-session warning banner" (`plan.md:259-260`). Two missing pieces:

- **Where does it sit?** The existing pattern is `feed-unfiltered-banner` (`feed.css:327-339`) — sticky top, primary-bg, white text, used for the "show everything" warning on the explore feed. Mention it explicitly so the implementer doesn't invent a new banner style.
- **`truncatedBySource`** is described as "soft warning"; **`truncatedByCap`** is the same UI? Different? If both render the same banner, the user can't tell whether the issue is "you follow too many people on Bluesky and we sampled" or "we couldn't read all your follows from your PDS." The copy should differ even if the visual is shared.

Decide and write the copy in the plan; otherwise the implementer will paste in something generic.

### 10. Fallback card is genuinely new — no existing pattern matches

Confirmed: there is no existing actor + opaque-subject-uri renderer in the codebase. The closest is `ActivityAuthor` (the byline component) which only renders the author half. The plan correctly identifies this as new territory.

One nit: the description "linked subjectUri (rendered as a short anchor to its at:// URI route or a degraded display when no route matches)" (`plan.md:287-288`) is vague. Concrete options:
- Pass the subjectUri through `parseAtUri` and dispatch on the inferred collection (`activity` → `/activity/...`, `collection` → `/project/...`, `profile` → `/profile/...`); when no match, show a copyable monospaced at:// URI with no link.
- Define a single `/uri/<encoded-uri>` lookup route that resolves and redirects — much more work but future-proofs every unknown kind.

The first is appropriate for v1. Call it out so the implementer doesn't go down the second path.

### 11. `home-page` CSS class has no rules — desktop layout is unaccounted for

`/home`'s page wrapper is `<div className="home-page">` and "the home-page wrapper already has a `.home-page` class with no rules yet" (`plan.md:309-310`). A grep across `src/app/styles/*.css` for `.home-page` returns zero matches. So the feed will inherit the layout's center-column constraints (good) but won't have any padding/margin of its own.

Compare to `/feed`'s legacy redirector path (gone), `/explore` (has `.explore` rules), `/notifications` (has its own page-level styles). The plan should at minimum add `.home-page { padding: 0 16px; }` (or whatever matches the redesign's editorial-column spacing — DESIGN.md §5 calls out `0 16px-20px` mobile padding) so the feed doesn't hug the viewport edges on small screens.

## Approved decisions

- **Polling cadence and pause-when-empty** (`plan.md:254-258, 264-265`). Matches the `notifications-context.tsx:75-107` pattern and the issue's 30s/5min spec. Pausing entirely when `authors.length === 0` is correct and prevents wasted requests for signed-out / no-follows users.
- **Reusing `useAuthorInfo` indirectly via `EndorsementRow`** (`endorsement-row.tsx:40`). The hook is module-cached and shared with `ActivityAuthor` (`activity-author.tsx:28`), so multiple rows displaying the same DID hit the network once. The plan's note that the indexer denormalizes actor onto each event (`discovery.md:86`) means the row's per-subject lookup is the only remaining per-event resolve — the actor avatar/handle is already in hand.
- **Single GraphQL request for hydration with one alias per visible event** (`plan.md:185-188`). Far better than the per-URI XRPC fanout pattern used elsewhere; the trade-off is worth it for a polled feed.
- **Generic-kind fallback in v1** (`discovery.md:148-150, plan.md:10`). Right call — the server is already shipping new kinds via `followerEvents` and the cost of fallback rendering is one branch + one small component. Without it, the server adding a `cert.update` event tomorrow silently drops it from the feed.
- **Alphabetical-by-DID truncation as v1 ranking** (`plan.md:208-210, discovery.md:140-143`). Defensible because deterministic and cheap; deferred most-recent-interaction ranking is correctly punted to a follow-up.
- **`endCursor` reset on poll-refresh, with the caveat documented** (`plan.md:240-241, 359-362`). Right trade-off for v1. Anything fancier needs server-side stability guarantees we don't have.
- **Disjoint file ownership and single-commit-per-track rollback** (`plan.md:21-48, 380-385`). Matches the project's standard pattern.
- **`appCertifiedTempGraphEndorsement` adds a by-URI variant** (`discovery.md:112-113`). Necessary; no surprise.
- **Empty `authors: []` is forwarded, not rejected** (`plan.md:80-82, 165-167`). Correct — preserves the "load-bearing nil/empty semantic" referenced from the records repo and keeps the proxy's validation rule small.

## Summary

The data-fetching and proxy plumbing are well-specified and reuse the right existing patterns. The visible UX has three deferred decisions that will produce visible bugs at implementation time if not addressed:

1. **The mount point.** `/home` is not the redesign's feed surface today; only `SiteDrawer` links there. Either retarget the redesign nav (multi-file change) or move the mount to `/feed` (smaller change). Decide before any rendering work happens.
2. **The render dispatch.** Reusing `ActivityCard` + `ProjectListRow` + `EndorsementRow` side-by-side mixes three incompatible visual registers in one column and breaks the redesign's editorial-card rhythm. Either build feed-card adapters per kind, or wrap the rows in feed-card shells, or accept a noticeably uneven feed in v1 and write it down.
3. **`EndorsementRow` is a bare `<li>` that needs a `<ul>` parent for its styling to work**, and it has no actor-byline slot — so for the home feed it both renders incorrectly and is missing the "who endorsed whom" cue.

Skeleton, empty-state, and warning-banner specifications are all under-specified in a way that will resolve to "the implementer picks something." Lock down copy + variants in the plan to avoid a second review round on visible polish.
