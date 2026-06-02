# Quality pass — plan review round 1 (consolidated)

Three parallel reviews (security/BFF, atproto/lexicon, code quality)
against `docs/quality-pass/plan.md`. Findings merged + de-duplicated;
where two reviewers raised the same point, the stronger framing wins.

## Blockers (must fix in plan before implementation)

### B1 — Rate-limit infrastructure already exists [#70]
`src/lib/auth/rate-limit.ts` is **already populated** with a Redis-INCR
window limiter (`checkAndIncrementWriteRate`) wired into the XRPC
proxy at `src/app/api/xrpc/[...method]/route.ts:444`. The plan's
"create `src/lib/auth/rate-limit.ts`" step would clobber it. **Resolution:**
extend the existing module — add `makeLimiter(name, max, windowSec)` +
`checkRateLimit(limiter, identifier)` alongside the existing per-DID
write limiter. Do NOT install `@upstash/ratelimit`; the existing
`@upstash/redis` direct-INCR pattern is the project's convention and
matches the existing 429 response shape (`{error, resetAt}` + `Retry-After`
+ `X-RateLimit-Reset` per route.ts:450-462).

### B2 — `swapRecord` is a putRecord envelope field [#71]
Both security and atproto reviewers caught this. `swapRecord` belongs
on the outer `putRecord` envelope (sibling of `repo / collection / rkey
/ record`), NOT inside `record`. The 5 group BFF routes (`activity`,
`project`, `profile`, `metadata`, `location`) currently
`pickAllowedFields(rawRecord, ...)` and would silently drop it.
**Resolution:** in each BFF route, read `body.swapRecord` as a
top-level field (separate from `body.record`), validate it's a string
of plausible CID shape, and forward it as the outer `swapRecord`
parameter to `app.certified.group.repo.putRecord`. Same treatment
for the XRPC proxy POST handler at `xrpc/[...method]/route.ts:483-487`.

### B3 — Conflict detection: catch `InvalidSwap` error code, NOT HTTP 409 [#71]
The atproto reviewer caught this. `@atproto/api` throws
`InvalidSwapError` with `error: "InvalidSwap"` and the upstream PDS
returns **HTTP 400**, not 409. The plan said 409 multiple times. Catch
by `body.error === "InvalidSwap"`. Verify `extractRouteError` in BFF
routes preserves the error discriminator.

### B4 — `useGivenEndorsements` doesn't have "same shape" as received [#69]
Code-quality reviewer caught this. The Given view needs the **subject /
recipient** identity, not the issuer. Indexer issue #96 only exposed
`issuer { ... }` on `appCertifiedBadgeAward`. **Resolution:** scope
#69's migration to two surfaces:
- **Received side**: full migration — single indexer query, drops
  `useProfileResponses`, drops per-row `useAuthorInfo` when issuer
  fields populated.
- **Given side**: filter-only migration — pick up the same
  `where.badgeType` shortcut, but keep `useAuthorInfo(subjectDid)`
  for per-row identity (no `subject { ... }` block exists yet).
  Open a follow-up indexer ticket for `subject { ... }` denormalisation.

### B5 — `response { state }` visibility = no privacy regression today, but document it [#69]
Security reviewer raised privacy concern; atproto reviewer confirmed
the join is correct. The current contract is "client-side filter
rejected for non-owner views" via `useProfileResponses`. After
migration, the indexer payload carries `response.state` for every
award. **Resolution:** preserve today's contract by filtering rejected
awards client-side for non-owner viewers (same as today; we just
read the state from a different source). Note in the plan that
"strong privacy" (rejected awards never leaving the indexer) would
require authenticated indexer queries — out of scope.

### B6 — No test runner; "Unit tests" bullets are aspirational [all four]
AGENTS.md §2 line 77 declares "Test runner: None." `package.json` has
no test script. The orphan `trusted-evaluators.test.ts` imports
`vitest` but the dep isn't installed. **Resolution:** rewrite every
"Unit:" bullet in the plan's test plan section as "Manual:" with
specific scenarios. Defer adding a test harness to a follow-up.

## High (address in implementation, document if deferred)

### H1 — #69 perf win is net-zero **today**, not when shipped
Indexer's profile-ingestion isn't enabled yet (operator action item
in issue #69). Until enabled, every row falls through to
`useAuthorInfo(did)` which is the same per-row fan-out we have today.
**Resolution:** ship as groundwork — the migration drops one
sequential indexer query and the PDS `listResponses` round-trip
*regardless* of ingestion state. Per-row identity wins activate when
ingestion flips. Document the perf delta in two states in the PR.

### H2 — Avatar reconstruction needs `(pds, did, cid)` not `(did, cid)` [#69]
Atproto reviewer: group-PDS users would get broken avatars without
`pds`. The indexer's issuer block exposes `pds`. Pass all three to
the avatar URL helper.

### H3 — Vercel IP source [#70]
Security reviewer: `x-forwarded-for[0]` is client-controllable on
Vercel and trivially spoofable. **Resolution:** use
`request.headers.get("x-real-ip")` (Vercel-injected, trusted) as
primary; fall back to rightmost XFF hop. Drop the leftmost-XFF
approach entirely.

### H4 — `/api/auth/login` 10/min by IP breaks shared NAT [#70]
Security reviewer: corporate NAT / household CGNAT means N users
share one egress IP. **Resolution:** bump login to 30/min by IP, OR
key on `(ip, ip-fingerprint-hash)` if we ever add device hints.
Bumping is simpler.

### H5 — DID rotation bypasses session-DID-keyed limits [#70]
Security reviewer: an attacker can spin up new `did:plc` cheaply.
**Resolution:** for `/api/feedback` and `/api/search-actors`, limit
by **DID AND IP simultaneously** (deny if either exceeded), not
"DID > IP fallback."

### H6 — Rate-limit ordering vs. CSRF [#70]
Security reviewer: RL should run before CSRF for write routes (cheap
INCR vs. CSRF parse). For `/api/auth/login` (no session yet), the
order doesn't matter — but document the chosen pattern. **Resolution:**
RL → CSRF for all routes; uniform.

### H7 — Web Locks re-list must pass `noCache: true` [#68]
Atproto reviewer: XRPC proxy caches `listRecords` for 5s; the
just-written record won't appear in the re-list inside the lock,
defeating Layer 2.

### H8 — Web Locks lock name must include DID [#68]
Security reviewer: two accounts in two tabs (different DIDs in one
browser) should not serialise unnecessarily. Lock name:
`endorse-def:${ownDid}`.

### H9 — Background-delete must not trigger auto-logout [#68]
Security reviewer: `authFetch` triggers `onUnauthorized` on 401. If
the dedupe delete hits a 401 (session expired), we'd log the user
out as a side-effect of a successful endorse. **Resolution:** either
use a non-401-handling fetch path for the delete, or wrap the catch
to suppress the unauth handler. Document explicitly.

### H10 — `localStorage` key needs `viewerDid` [#71]
Both security and atproto reviewers: `{collection, uri}` collides
across accounts on a shared browser. Key: `swap-draft:${did}:${collection}:${rkey}`.
Clear on logout via a hook in the auth-context logout path.

### H11 — Dirty-field detection: mount-snapshot diff [#71]
Code-quality reviewer: don't restructure drafts state into
`{dirty:Set, values:...}`. Instead, at save time:
`const touched = Object.keys(drafts).filter(k => drafts[k] !== snapshot[k])`.
Mount-snapshot is captured on `handleEditClick`. Simpler; no
parallel state to drift.

### H12 — Implementation order: front-load #71 [all four]
Code-quality reviewer: #69 and #71 both touch the same render sites
(`profile-endorsements.tsx`, `profile-overview.tsx`, project +
cert detail save handlers). Doing #71 last forces #69's diff to
rebase. **Resolution:** swap to `#68 → #70 → #71 → #69`. Largest
blast radius mid-stack; smallest cleanup at the end.

### H13 — Atomic commit count per issue [all four]
Code-quality reviewer: specify upfront. **Resolution:**
- #68: 1 commit.
- #70: 2 commits (extend rate-limit module; integrate into routes).
- #71: 3 commits (read hooks + write helpers + BFF/XRPC; conflict UX + localStorage; integration on save handlers).
- #69: 2 commits (hook migration; render-site cleanup).

## Notes

### N1 — Existing 429 response shape [#70]
`/api/xrpc/[...method]/route.ts:450-462` returns
`{error, resetAt}` + `Retry-After` + `X-RateLimit-Reset` headers.
New routes should match exactly. ([code-quality reviewer])

### N2 — Avoid putting `swapRecord` in `pickAllowedFields` [#71]
It's an envelope field, not a record field. Adding it to
`ALLOWED_*_FIELDS` would break record-shape validation.
([both reviewers])

### N3 — `useAuthorInfo` stays in use [#69]
10 callers (search-actors, global-search, …). Plan explicitly
notes this; verified. ([code-quality reviewer])

### N4 — `void deleteRecord(...).catch(...)` should log in dev [#68]
Add `if (process.env.NODE_ENV !== 'production') console.warn(...)`
in the catch so failed dedupes are debuggable.
([code-quality reviewer])

### N5 — `useDraftsWithSwap()` shared hook [#71]
`activity-detail.tsx:196` and `project-detail.tsx:140` use
identical drafts patterns. Candidate for a shared hook in #71's
implementation. Out of scope for the issue itself; optional
refactor. ([code-quality reviewer])

### N6 — `existing inflightEnsure` Map still earns its keep [#68]
Web Locks serialises across tabs; the Map dedupes React-strict-mode
double-invokes within a tab. Both layers retained.
([security reviewer])

### N7 — localStorage size + cadence [#71]
Multi-KB drafts × write-on-keystroke could blow past localStorage
quota. **Resolution:** write only on conflict (not on every
keystroke). Clear on successful save. Atproto reviewer suggests
~500ms idle throttle as alternative if keystroke persistence is
desired — out of scope here.

### N8 — Cross-tab broadcast for #71 (deferred)
`BroadcastChannel('record:saved')` would let tab B refresh after
tab A saves. Not necessary; tab B's next save hits 409 and triggers
rebase as designed. Document, don't implement.

### N9 — InvalidSwap on cleanup-delete is impossible [#68]
deleteRecord doesn't take swapRecord. Cross-tab cleanup-delete
of a duplicate is always safe re: CID. ([atproto reviewer])

### N10 — Retry latency budget [#71]
3 retries × ~2 RTT each = ~6 requests, ~1.5s before the banner
appears. Document in the conflict banner copy:
"Couldn't auto-merge after several retries — your draft is safe.".
([code-quality reviewer])

## Decisions deferred to user (1 round)

- **DQ1**: #69 ship as groundwork even though perf is net-zero until
  operator enables indexer profile-ingestion — **recommend yes** (the
  one-sequential-query + dropped-PDS-call wins still land).
- **DQ2**: #69 scope to Received-side only for full migration; Given-side
  gets filter-only migration — **recommend yes** (subject hydration is a
  separate indexer ticket).

Will surface these to the user, then revise the plan and start.
