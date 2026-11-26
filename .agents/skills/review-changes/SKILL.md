---

name: review-changes
description: Review a branch, pull request or set of uncommitted changes in certified.app v2 against this codebase's standards (architecture, data access and caching, auth and permissions, Next.js rendering and navigation, the Hypercerts UI toolkit and typography, simplicity, security), then report in plain language and offer fixes. Use when someone asks to "review my changes", "validate my work", "check this PR" or "does this follow our standards".
---

# Review changes in certified.app v2

certified.app v2 is a reference implementation: partners copy its patterns. A
change is good when it works, follows the patterns below, and leaves the code
as simple as it can be, but no simpler. This skill checks a change against
those patterns and explains what it finds to someone who may not be a
developer.

Read `AGENTS.md` and `README.md` ("How it is put together") first. They are
the source of truth; this skill is the checklist. If they disagree with this
file, they win: say so in the report.

## 1. Establish what changed

- Ask nothing you can find out. Default base: `v2`. Diff the branch against
  it: `git diff v2...HEAD` and `git log v2..HEAD`, plus `git status` and
  `git diff` for uncommitted work. For a GitHub pull request,
  `gh pr diff <n>` and `gh pr view <n>`. For one commit, `git show <sha>`;
  for a range, `git diff A..B`.
- List the changed files and group them: pages and layouts
  (`src/app/**`), components (`src/components/**`), data and auth
  (`src/lib/**`), styles (`globals.css`, `landing.css`), config.
- Read every changed file in full, and the callers and helpers it uses.
  Judge the change in context, not the diff alone.

## 2. Run the gates

Run them on the code under review: the checked-out branch or PR. To review
an older commit or a PR you haven't checked out, use a worktree
(`git worktree add ../review <ref>`, then `pnpm install` there; a copied or
symlinked `node_modules` breaks `next build`). The project uses Node 24
(`.nvmrc`): if `node -v` says otherwise or `pnpm` is missing, prefix each
command with `mise exec node@24 --`.

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm build
```

All five must pass (AGENTS.md). A failure is the first finding; quote the
error. `pnpm build` can exit 0 and still log errors, so search its output:
`Error occurred prerendering` fails a page; `"use cache: private" rejects
when the prerender is complete` means a catch block swallowed one of Next's
signals (rule C7). (The first `pnpm` command may also run `postinstall`,
which regenerates route types: expected, not a change to review.)

On a branch of several commits, tell new problems from old: run the gates
on the base (`v2`) too, and report a failure the base already has as
"pre-existing", not against this change.

If the change touches pages, look at them: `pnpm dev`, open
`http://127.0.0.1:3000` (not localhost), signed out at least. Note in the
report what you could not check (signed-in pages need a sign-in).

## 3. Know the architecture

**Routes** (`src/app`):

- Root `layout.tsx`: fonts, the Certified theme, `Providers` (TanStack
  Query, `UIProvider` with `IntentLink`, Sonner). `global-error.tsx`.
- `src/proxy.ts`: `/` redirects to `/workspace` or `/welcome`.
- `/welcome` (outside the site chrome): the landing page,
  `components/landing/*` and `landing.css`.
- `(site)/layout.tsx`: the chrome (sidebar from 64rem, top bar below).
  The account parts stream in through `getAccount()`.
  - Public and cached: `/explore/*`, `/apps`, `/terms`, `/privacy`, `/imprint`,
    `/dsa`, profiles `/{handle}` with tabs (the `(profile)` group),
    `/{did}/project/{rkey}/*`, `/{did}/activity/{rkey}/*`, `/{did}/badge/{rkey}`.
  - Per viewer: `/feed`, `/workspace`, `/{did}/workspace/**` (Overview,
    `/projects/*`, `/badges/*`, `/endorsements/*`, `/followers/*`,
    `/lists/*`), `/{did}/edit`, `/settings/**`, `/{did}/settings/**`, `/sign-in`.
  - `not-found.tsx`, `error.tsx`.
- Route handlers: `/api/activities`, `/api/explore`, `/api/profile-feed`,
  `/api/lists/items`, `/api/badges/holders`, `/api/receipts`, `/api/search`
  (public, CDN cached), `/api/feed`, `/api/likes`, `/api/places` (private,
  `no-store`), `/api/me/organizations` (private), `/oauth/*`, `/.well-known/*`.

**Modules** (`src/lib`), each the only place for its job:

| Module                                            | Owns                                                                                                               |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `hypercerts/queries.ts`                           | Reads from the Hypercerts API                                                                                      |
| `views-service.ts`                                | Reads from the Hypercerts Feed / Views service                                                                     |
| `hypercerts/views.ts`                             | Mapping API views to plain view models; `safeUrl`                                                                  |
| `hypercerts/cache.ts`                             | Cache tag names                                                                                                    |
| `hypercerts/sdk.ts`, `writes.ts`, `*-actions.ts`  | Repository writes (SDK + CGS/PDS stopgaps) and Server Actions                                                      |
| `settings-actions.ts`, `auth/elevated-session.ts` | Account/group PDS settings, elevated password sessions, Bluesky sync                                               |
| `cgs.ts`                                          | The Certified Group Service: memberships, `isMember`, `canEdit`, group/org ops                                     |
| `auth/dal.ts`                                     | Who is signed in: `getUser`, `readOAuthSession`, `getOAuthSession`                                                 |
| `memberships.ts`                                  | Your memberships for display, `mayEditAccount`, `getGroupMembers`                                                  |
| `acting-as.ts`                                    | Whom you act as (display only, never writes)                                                                       |
| `identity.ts`                                     | Handles ↔ DIDs, verified both ways                                                                                 |
| `routes.ts`                                       | Pure href builders (`actorHref`, `workspaceHref`, `groupSettingsHref`, `projectHref`, `activityHref`, `badgeHref`) |
| `search.ts`, `seo.ts`                             | Live search ranking/types and OpenGraph/canonical metadata                                                         |
| `validate.ts`                                     | `isDid`, `isAtUri`, `isRkey`, `returnPath`, `signInHref`                                                           |

Components to reuse rather than rewrite: `PageTitle`, `ComingSoonButton`,
`IntentLink`, `LinkPending`, `ProfileTabs` (tabs as links), `PeopleList`,
`TileSlot`, `WorkspaceAccess`/`workspaceDid`, `SignInButton`, and the href
helpers in `src/lib/routes.ts` / `actorHref`.

**Caching layers:** `'use cache'` + `cacheLife("public")` + `cacheTag` for
public data (`queries.ts`); `'use cache: private'` for per-session data
(`getUser`, memberships); React `cache()` to compute a per-request answer
once; Valkey for sessions, OAuth state and the membership cache (keys
through `storeKey()`); CDN headers on the public route handlers.

## 4. Check the change against the rules

Go through every section that the change touches. Each rule is checkable;
cite file and line for each finding.

### A. Data access

- A1. Hypercerts API reads only in `queries.ts` (Feed/Views in `views-service.ts`),
  repository writes only in `sdk.ts` or `writes.ts` (called from Server Actions in
  `*-actions.ts` / `settings-actions.ts`), CGS calls only in `cgs.ts`.
- A2. A public read is `'use cache'` with `publicData(tag)`. Tags are keyed
  by DID or AT-URI, never by a handle or raw URL value (a save expires
  `tags.actor(did)`).
- A3. Ask the smallest question: a batch endpoint for many accounts
  (`getActorCards`), `isFollowing` (the API's `getFollow`) for "do I
  follow", `includeTotal` or a `limit: 1` for counts and emptiness. No call
  per row; no 100-row page to answer yes or no.
- A3b. Reuse an answer the page already asked for: a cached function
  called with the same arguments shares one cache entry, different
  arguments don't. Prefer the existing call (`getRecordCounts`,
  `getEndorsements`) over a near-copy.
- A4. A count shown to users comes from the API's total, not from
  `rows.length` of a capped page.
- A5. Not found (return null), failure (throw) and a null projection
  (render it) are different. Strong references stay `{ uri, cid }`. A
  project points at exact versions of its activities, and after an edit
  the API returns that item as null; whether to show the current version
  instead is open (Linear TECH-920), so don't change how project items
  resolve without that decision.
- A6. URLs from records reach `href` or `src` only through `safeUrl`
  (https only for images).

### B. Who is viewing, and permissions

- B1. Ask who is signed in only through `dal.ts`; never read cookies or the
  session elsewhere.
- B2. A display decision (show Edit, act as, open a workspace) uses the
  cached answers: `getUser`, `getMemberships`, `getActingAs`,
  `mayEditAccount`, `workspaceAccess`. Never an OAuth restore
  (`readOAuthSession`) per component, never a new round trip per gate.
- B3. A new helper that reads the session or memberships and can be asked
  more than once per render is wrapped in React `cache()`.
- B4. Authorization for a write uses `canEdit` or `isMember` / `mayPublish`
  (CGS, live), never the display memberships, `getActingAs` or a cookie.
- B5. Every Server Action and POST handler authenticates first and
  validates every argument (`isDid`, lengths): its arguments come from the
  browser.
- B6. Never rely on a layout alone to keep data out: the page or its data
  function checks too (`workspaceDid` returns null without access).

### C. Rendering and navigation (Next.js 16, Cache Components)

Before judging a Next.js API, read its guide in
`node_modules/next/dist/docs/`; this version differs from older ones.

- C1. Session reads sit inside a `<Suspense>` boundary, so public pages
  keep their cached shell. Await `params` and `searchParams` inside a
  Suspense child in the page itself (a `loading.tsx` above it doesn't
  count: Next's dev overlay reports "encountered URL data outside of
  Suspense"), and validate them before calling the API.
- C2. Every click shows at once: a new tab bar or nav uses `LinkPending`
  in its links; a new route segment that loads data has a `loading.tsx`
  shaped like its content.
- C3. `<Link prefetch>` only on short navigation (tabs, sidebar, a few
  stat links). Links in lists, grids and cards use `IntentLink` (or a
  design-system component, which uses it).
- C4. A redirect that must be a real HTTP redirect (an entry URL) goes in
  `src/proxy.ts` or `next.config.ts`, not in a streamed component.
- C5. A new segment that fetches has an error boundary at or above it;
  sections that may fail on their own use `TileSlot`.
- C6. No global `:has()` that depends on which page is mounted: visited
  pages stay mounted, hidden (Next's "Preserving UI state").
- C7. A catch block around a session read, `redirect()` or `notFound()`
  starts with `unstable_rethrow(err)`.
- C8. `'use client'` only where interactivity needs it.
- C9. Every skeleton belongs to a component: exported from the same file
  as the component it stands in for, shaped like what it renders. A
  Suspense fallback or `loading.tsx` is built from those skeletons, with
  static parts (titles, tab labels) as themselves. Grep the change for
  `variant="text" lines=` used as a page's placeholder: it is a finding.

### D. UI toolkit, typography and CSS

- D1. Use `@hypercerts-org/ui-react` where it has the piece (check its
  export list; `SearchInput`, `MenuButton`, `Banner`, `EmptyState`,
  `Eyebrow`, `CopyableId`, `IdentityRow`, `Skeleton` exist). Don't replace
  a good-looking local piece with a worse toolkit one; if the toolkit lacks
  something, add it to `docs/toolkit-gaps.md` with a one-line proposal.
- D2. Headings: `PageTitle` for each page's one h1; `Heading` "heading"
  for every heading below it, a section's or a box's.
  Never a heading in the sans; labels are `Eyebrow`.
- D3. No `font-family`, `font-size` or `font-weight` on heading classes in
  CSS; type comes from components or `--hc-type-*` / `--hc-weight-*`
  tokens. Colours, radii and shadows from `--hc-*` tokens.
- D4. Never select a toolkit component's internals (`.rounded-full`,
  `.text-hc-*`, `*` inside one), except the bridged rules at the end of
  `globals.css`, each listed in `docs/toolkit-gaps.md`.
- D5. One rule block per selector: change the original rule, never append
  an override later in the file. A size rule isn't scoped to one page when
  the class is used on others.
- D6. Organizations show square avatars, people round, everywhere.
- D7. Placeholders for writes not built yet are `ComingSoonButton`.
- D8. Skeletons have the size and shape of what they stand for, at every
  breakpoint, and reuse the existing skeleton for the pattern.
- D9. Form fields have text of at least 16px on touch screens.

### E. Security

- E1. No GET starts a sign-in or changes state: links are prefetched and
  can be forged. Use a same-origin POST (see `/oauth/handle-login`).
- E2. Redirect targets taken from input go through `returnPath`.
- E3. Server-side fetches to user-derived hosts (handles, PDSes, links)
  use `safeFetchWrap` or the OAuth client's fetch.
- E4. No `dangerouslySetInnerHTML`. Only `/embed/*` may be framed, and
  embeds hold no forms or per-viewer UI.
- E5. Per-user data never goes in a plain `'use cache'`; per-user
  responses send `Cache-Control: private, no-store`.
- E6. New Valkey keys go through `storeKey()`. New cookies use
  `cookieOptions()`.
- E7. Log only through `logError`; never tokens, request objects or
  `err.cause`.

### F. Simplicity

- F1. No new export without a caller; no CSS class without a component
  using it. Grep before accepting.
- F2. No duplicate of an existing helper or component (formatting counts,
  rows, skeletons, tab bars, placeholders, href builders).
- F3. No `.catch(() => null)` or empty catch without a log and a rendered
  state: "unavailable" and "expired" must not render as "empty".
- F4. No string-matched error messages and no `as` casts beyond a
  validated boundary.
- F5. Comments describe the code as it is, not its history.
- F6. No speculative abstraction; no premature optimisation. Equally, no
  shortcut that hides a real state.
- F7. README routes, "Adapting this app" and the spike findings change in
  the same change as the code they describe.
- F8. Read the repository's layout as a newcomer would, not only `src/`:
  run `git ls-files | cut -d/ -f1 | sort -u` and open any top-level
  folder or config the change adds or touches. Each should have an
  obvious purpose and one copy: no file kept in two places, no copy of
  another repository's code or schemas without a stated reason to copy
  rather than install, and nothing a tool generates kept by hand.

## 5. Verify before reporting

Every finding must survive a second look: read the code again, run what
you can, and drop anything you can't show. No nitpicks: report what a
partner copying this code, or a user, would actually feel. Mark anything
you suspect but couldn't confirm as "to check".

## 6. Report

Write for someone who may not be a developer. Start with the verdict in
one or two sentences: ready to merge, ready after fixes, or needs rework.

Then the findings, most important first. For each:

- **What**: one plain sentence, then the file and line.
- **Why it matters**: what a user or a partner would run into.
- **Fix**: the concrete change, and its size (small, medium, large).

After the findings:

- **Checked and fine**: the areas the change touched that follow the
  rules, in a line or two, so the author knows what was covered.
- **Not checked**: what you could not verify (signed-in pages, writes on
  a preview, a live CGS).

End by offering to make the fixes. When the author says yes, fix them one
at a time, each as its own commit with a message that says what changed
and why. Run all five gates, the build included, before every commit, not
only at the end: a change can pass lint and tests and still fail a
prerender.
