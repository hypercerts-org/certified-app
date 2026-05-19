# Quality pass — four open issues, one branch

Tracks issues hypercerts-org/certified-app#68, #69, #70, #71. Stacking
onto `feat/positioning-redesign` per the user's explicit choice (the
"correct" answer is four branches off main, but the user took the
trade-off knowingly).

## Revisions after round-1 review

Round-1 review (three lenses, see `review-round-1.md`) caught several
plan-level issues that update the original sections below. Bake in:

- **B1**: Rate-limit module already exists at `src/lib/auth/rate-limit.ts`.
  Extend (don't replace), keep `@upstash/redis`, **do not** install
  `@upstash/ratelimit`. Match the existing 429 shape
  (`{error, resetAt}` + `Retry-After` + `X-RateLimit-Reset`).
- **B2**: `swapRecord` is a `putRecord` envelope field, NOT a record
  field. Read `body.swapRecord` separately in each BFF route; forward
  as the outer `swapRecord` arg. Do **not** add it to `ALLOWED_*_FIELDS`.
- **B3**: Conflict detection catches `body.error === "InvalidSwap"`,
  status 400 (NOT 409 as originally written).
- **B4**: #69 scope clarified — Received-side gets full migration;
  Given-side gets filter-only migration. Per-row `useAuthorInfo(subjectDid)`
  stays on Given until indexer exposes a `subject { ... }` block.
- **B5**: Rejected-award privacy preserved by keeping today's
  client-side filter for non-owner viewers (response state is now
  read from the indexer payload instead of `useProfileResponses`).
- **B6**: No test harness exists — "Unit:" bullets become "Manual:"
  scenarios. Verification is `tsc --noEmit`, `next build`, manual
  smoke per issue.
- **H1**: Document the two-phase perf delta in the PR (groundwork
  wins land now, per-row identity wins activate when operator enables
  indexer profile-ingestion).
- **H2**: Avatar URL reconstruction uses `(pds, did, cid)`, not just
  `(did, cid)`. Indexer's issuer block exposes `pds`.
- **H3**: IP source is `x-real-ip` (Vercel-injected, trusted) with
  fallback to rightmost XFF hop. NOT leftmost.
- **H4**: `/api/auth/login` bumped to **30/min by IP** (was 10) to
  avoid breaking shared NAT / CGNAT users.
- **H5**: `/api/feedback` and `/api/search-actors` enforce DID **AND**
  IP limits simultaneously (deny if either exceeded), not "DID > IP
  fallback."
- **H6**: Rate-limit middleware runs **before** CSRF on every route.
- **H7**: Web Locks re-list inside the lock passes `{ noCache: true }`
  to bypass the XRPC proxy's 5s `listRecords` cache.
- **H8**: Web Lock name is `endorse-def:${ownDid}` (per-DID) so two
  accounts in one browser don't serialise unnecessarily.
- **H9**: Background dedupe-delete in `ensureEndorsementDefinition`
  must not trigger `onUnauthorized`. Use a path that bypasses the
  401 auto-logout (or wrap to suppress).
- **H10**: localStorage key is `swap-draft:${viewerDid}:${collection}:${rkey}`.
  Cleared on logout via a hook in the auth-context logout path.
- **H11**: Dirty-field detection at save time:
  `touched = Object.keys(drafts).filter(k => drafts[k] !== snapshot[k])`.
  Snapshot taken on `handleEditClick`. No `dirty: Set` state.
- **H12**: Implementation order revised to front-load larger blast
  radius: **#68 → #70 → #71 → #69**. Avoids rebase churn (#69
  touches profile render sites that #71 also touches).
- **H13**: Atomic-commit count per issue:
  - #68: 1 commit
  - #70: 2 commits (extend module; integrate into routes)
  - #71: 3 commits (read-hooks+CID; write-helpers+BFF/XRPC; conflict UX+localStorage)
  - #69: 2 commits (hook migration; render-site cleanup)

Original plan below is otherwise authoritative.

---

## Decisions captured up-front

| Decision | Choice | Rationale |
|---|---|---|
| Branch shape | Stack on `feat/positioning-redesign` | User's explicit pick after weighing the alternatives. |
| #68 Web Locks layer | Layer 1 + Layer 2 (full belt-and-suspenders) | Web Locks supported everywhere; dedupe-on-read self-heals the rare fallback case. |
| #69 indexer adoption | Full adoption with graceful fallback when `issuer.*` returns null | Indexer schema is live on dev; profile-ingestion isn't enabled yet, so `useAuthorInfo` stays as the fallback when fields are null. |
| #70 rate-limit values | Issue's table verbatim | Numbers are reasonable starting points; tune from Upstash analytics after a week. |
| #71 conflict UX | C (silent rebase) default + A with localStorage-backed drafts for same-field conflicts, 3-retry livelock guard | Drift from "pure C" to a hybrid: invisible rebase for the common disjoint case, draft-preserving refresh prompt for the rare same-field case. |

## Implementation order

Smallest-blast-radius first so a regression at the bottom doesn't taint
the bigger pieces above:

1. **#68 — Endorsement def cross-tab race.** ~50 lines in
   `src/lib/atproto/badges.ts`, no protocol/BFF changes. Self-healing
   even if rolled back.
2. **#70 — Rate limiting.** New helper + 7 route integrations. Touches
   auth surface — needs careful review on identifier strategy.
3. **#69 — Single-query indexer adoption.** Refactor across the
   received-endorsements + given-endorsements + lists hooks + the
   profile-endorsements and profile-overview render paths. Drops the
   per-row `useAuthorInfo` resolves where the indexer carries identity.
4. **#71 — swapRecord on inline-edit writes.** The largest surface —
   threads CID through all six dual-path write helpers, all read hooks,
   the XRPC proxy, and the five group BFF routes. Conflict-resolution
   hybrid UX is new code.

Each lands as a single atomic commit (or 2-3 commits if the surface
genuinely needs it — e.g. infrastructure commit + integration commit).

## Acceptance criteria

### #68

- `ensureEndorsementDefinition` returns the canonical (oldest by
  `createdAt`) endorsement definition when more than one exists on the
  caller's repo.
- Background best-effort delete of duplicates; errors are swallowed.
- Web Locks API call (`navigator.locks.request`) wraps the create
  critical section. Fallback path (no Web Locks API) matches today's
  behaviour — same-tab `inflightEnsure` still dedupes within a tab.
- Inside the lock, a re-list happens so a tab that lost the race
  returns the winner's def instead of creating a second.
- No behaviour change for users with a single definition.
- Existing duplicates self-heal on next read.

### #69

- `useReceivedEndorsements` makes one indexer query (the new
  `where.badgeType` flat filter on `appCertifiedBadgeAward`) instead of
  two sequential queries.
- The PDS `listResponses` call in `useProfileResponses` is dropped from
  the received-endorsements hot path (the indexer's `response { state }`
  block replaces it). `useProfileResponses` itself may stay for
  other surfaces.
- `useGivenEndorsements` migrates to the same shape.
- `useEndorsementLists` detail view pulls `issuer { ... }` inline.
- `ReceivedCard` and `EndorsementPreviewRow` render directly from
  `node.issuer.{handle,displayName,avatarCid}` when those fields are
  populated; fall through to `useAuthorInfo(did)` when they're null
  (graceful degradation while the indexer's profile-ingestion is being
  enabled).
- Avatar URL is reconstructed from `(did, avatarCid)` using the
  existing CDN convention.
- Cold-load: a profile with 30 received endorsements goes from
  "2 sequential indexer queries + 1 PDS listResponses + 30 resolve-did"
  to "1 indexer query" on the new path.

### #70

- New `src/lib/auth/rate-limit.ts` exporting `makeLimiter(name, max, windowSec)`
  and `checkRateLimit(limiter, identifier)`.
- New `src/lib/utils/ip.ts` exporting `clientIp(request)` — pulls
  `x-forwarded-for[0]` with fallback.
- Seven routes integrated with the limits from #70's table:
  - `/api/auth/login` — 10 / min by IP
  - `/api/auth/callback-handler` — 20 / min by IP
  - `/api/feedback` — 5 / 10 min by session DID > IP
  - `/api/search-actors` — 60 / min by session DID > IP
  - `/api/groups/register` — 5 / 10 min by session DID
  - `/api/geocode` — 60 / min by session DID
  - `/api/resolve-handle` — 100 / min by IP
- 429 responses carry a `Retry-After` header (seconds until reset).
- Limiter prefixes namespaced per route so budgets don't collide.

### #71

- All four read hooks expose the record's CID alongside its value:
  `useUserProfile`, `useOrgMarker`, `useProject`, and the cert detail's
  value read (`useCertActivity` / wherever the snapshot is read).
- All six dual-path write helpers accept optional `swapRecord?: string`:
  cert, profile, location, follow, org-marker, project.
- XRPC proxy and the 5 group BFF routes forward `swapRecord` to upstream
  `com.atproto.repo.putRecord` (or the BFF's `putRecord` equivalent).
- Save handlers catch the 409 conflict response, then:
  1. Re-read the record to get the new CID + value.
  2. Re-compute `next = { ...newValue, ...editsThisDraftMadeFromTheOldValue }`.
  3. Detect same-field conflicts: a field is a conflict if the user's
     draft changed it AND the new server value also differs from the
     CID-anchored snapshot we took at mount.
  4. **No same-field conflict** → retry the save with the new CID
     (silent rebase, Option C). Cap at 3 retries; on the 4th, fall
     through to (5).
  5. **Same-field conflict** → preserve the user's drafts in
     `localStorage` keyed by `{collection,uri}`, surface a banner:
     "Someone else saved while you were editing. Your draft is saved
     locally; refresh to see the latest and re-apply." Refresh discards
     the in-memory drafts; the localStorage key lets us offer a
     "Restore draft" affordance after refresh.
- The localStorage key is cleared on a successful save and on user
  explicit dismissal.

## Test plan (per issue)

### #68

- Unit: simulate `listDefinitions` returning two endorsement defs with
  different `createdAt`. Assert returns the older one. Assert background
  delete is scheduled (mock `deleteRecord` and verify call).
- Unit: simulate `navigator.locks` available. Assert the create path
  re-checks inside the lock and returns the existing def if found.
- Unit: simulate `navigator.locks` absent. Assert falls through to today's
  behaviour.
- Manual: two browser tabs, never endorsed, both click Endorse at the
  same instant. Verify only one definition is created (check via
  `listDefinitions` after).

### #69

- Unit: mock indexer response with `issuer.handle` populated. Assert
  `ReceivedCard` renders without firing `useAuthorInfo`.
- Unit: mock indexer response with `issuer.handle: null`. Assert
  `ReceivedCard` falls through to `useAuthorInfo(did)`.
- Manual: open `/profile/<handle>` overview. Network panel: receive
  one indexer call (was 2-3 + N).
- Manual: open Endorsements tab Received sub-tab on a profile with
  many endorsers. First-paint time: should drop noticeably.

### #70

- Unit: `makeLimiter` returns a `Ratelimit`. `checkRateLimit` mocks
  Upstash; assert `success: true` returns `{ok: true}`, `success: false`
  returns 429 shape.
- Integration: hit `/api/feedback` 6 times in 60s; 6th returns 429 with
  `Retry-After`.
- Integration: sign in, hit `/api/search-actors` past the limit; assert
  per-DID budget (different DID has separate budget).

### #71

- Unit: every write helper accepts `swapRecord` and threads it through.
- Unit: 409-on-save → re-read → disjoint fields → silent rebase →
  success.
- Unit: 409-on-save → re-read → same-field conflict → drafts saved to
  localStorage → conflict banner shown.
- Unit: livelock — 3 consecutive 409s → conflict banner shown even
  though all conflicts are disjoint.
- Manual: open profile edit in tab A, edit a different field in tab
  B, save B; switch to A, save A → A's save silently rebases and
  succeeds.
- Manual: same flow but both tabs edit the same field → A's save shows
  the conflict banner; draft is recoverable after refresh.

## Out of scope

- #69's indexer profile-ingestion enablement (operator action on Railway).
- Backfilling existing duplicate definitions (#68's dedupe-on-read
  handles them lazily).
- Rate-limit analytics dashboards / admin unlock CLI for #70.
- Per-record-type conflict diff modal (#71 Option B). Skipped until
  evidence shows it's needed.

## Rollback

Each issue lands as one or two atomic commits; revert independently if
needed. None of the four are gated behind feature flags — they're
all in-place migrations. If something regresses badly, revert the
specific commit and the codebase falls back to the previous behaviour.

For #69 specifically: the old `RECEIVED_AWARDS_QUERY` + `DEFINITIONS_QUERY`
sources are kept commented inline for one release in case we need to
revert the migration quickly without restoring code from git.

## Open questions (none blocking)

- Will the indexer's profile-ingestion enablement be done this week?
  If yes, the graceful-degradation fallback in #69 is short-lived.
  If no, we ship in degraded mode and migrate later.
- Should `/api/notifications` or other XRPC paths also get rate limits?
  Not in the original #70 list; deferring to a follow-up if traffic
  patterns suggest it's needed.
