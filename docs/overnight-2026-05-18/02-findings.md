# 02 — Findings (consolidated)

This is the consolidated diagnostic from Phase 2. Six lenses were run (five parallel reviewer agents, one sequential pass by me). Per-lens raw outputs live in `02-findings-lens-1-security.md`, `02-findings-lens-2-correctness.md`, `02-findings-lens-3-architecture.md`, `02-findings-lens-4-reuse.md`, `02-findings-lens-5-api-ops.md`, and `02-findings-lens-6-perf-a11y.md` (lens 6 is the only one I wrote myself — the others are reviewer-agent transcripts captured per their summary blocks).

**Document is frozen at end of Phase 2.** New discoveries during implementation will go in `02b-late-findings.md`.

---

## Cross-lens consensus (the items multiple reviewers independently surfaced)

These are the items where two or more lenses converged on the same problem. They are the strongest signals.

| Issue | Lenses | Severity (consensus) |
|---|---|---|
| **Leaflet renderer + editor: user-controlled URLs rendered without scheme allowlist** (`javascript:` XSS class). Existing helper `safeHttpUrl` not called. | Security S-1, S-2, S-3, S-4; Correctness C-2; Reuse R-1, R-2 | **CRITICAL** |
| **`useMergedDidsMap` reinvents `useMemo` with refs (5 lint baseline errors)** | Correctness C-3; Lens-6 P-3 | High |
| **`useSocialGraphSync.refetch` broken memoization + dead ternary (1 lint baseline error)** | Correctness C-4; Lens-6 P-4 | Medium |
| **`/api/geocode` route is unauth + no rate limit + leaks Nominatim quota** | API/Ops O-1, O-2, O-3; Security S-6, S-7 | High |
| **`.env.local.example` drift — INDEXER_URL, INDEXER_DID, NEXT_PUBLIC_INDEXER_URL, NEXT_PUBLIC_STADIA_API_KEY missing** | API/Ops O-7; Orientation §7 | High |
| **Indexer proxy silently falls back to dev URL in production** | API/Ops O-19 | High |
| **`/api/groups/[groupDid]/activity` lacks field allowlist (mass-assignment regression vs. the April audit's CS-005)** | API/Ops O-5; Security S-5 | Medium |
| **`extractRouteError` returns generic 4xx messages — contradicts AGENTS.md §17 #7** | API/Ops O-12 | Medium |
| **`extractRouteError` trusts arbitrary status integer from upstream errors** | API/Ops O-13 | Medium |
| **Dual-path write pattern duplicated across 5 lib files with subtle divergence (error extraction, return contract, parameter shape)** | Architecture A-1, A-2; Reuse R-8 | Medium |
| **Bare `console.error` in three group routes — `extractRouteError` already logs via `logSafe`** | API/Ops O-6 | Medium |
| **`--danger` CSS var is undeclared but referenced 16x with `#d44` fallback (should be `--color-error`)** | Reuse R-4 | Medium |
| **Next.js 16.2.3 → 16.2.6 patch (advisory chain)** | Security S-10; Orientation §6 | Low |

---

## Findings master list

Below: every finding from every lens, deduplicated where they covered the same site, sorted by severity.

### Critical

#### F-1 — Leaflet XSS class: user-controlled URLs rendered without scheme allowlist
*Cross-lens: S-1, S-2, S-3, S-4, C-2, R-1, R-2.*

- **Lens:** Security (primary), Correctness, Reuse/Consistency
- **Locations:**
  - `src/components/leaflet/leaflet-document.tsx:217-224` — iframe non-allowlisted host fallback renders `<a href={url}>` unfiltered.
  - `src/components/leaflet/leaflet-document.tsx:361-371` — facet link rendering: `<a href={linkUri}>` with no scheme check.
  - `src/components/leaflet/nodes/leaflet-iframe-node.tsx:58-66` — same iframe fallback pattern as above.
  - `src/components/leaflet/leaflet-editor.tsx:239-251` — `editor.chain().insertContent(...)` bypasses TipTap's link `isAllowedUri` validator (only `setLink`/`toggleLink` runs it).
  - `src/components/leaflet/link-dialog.tsx:79` — dialog returns the raw URL with no validation; `type="url"` is not real validation.
  - `src/lib/leaflet/from-tiptap.ts:225-237` (`marksToFeatures`) — writes link facets verbatim to the PDS (defense-in-depth on the write boundary).
  - `src/lib/leaflet/to-tiptap.ts:266-271` (`featureToMark`) — hydrates link marks from foreign records with no validation (defense-in-depth on read).
- **Severity:** **Critical** (multiple reviewers; the renderer is mounted on profile hub, cert detail, profile overview, long-description modal — all foreign-content surfaces).
- **Problem:** AGENTS.md §22 pitfall #11 explicitly calls out this exact attack: `javascript:alert(1)` becomes one-click XSS. The pre-existing `safeHttpUrl()` helper at `src/lib/utils/safe-url.ts` was written for this purpose and is not called from any of these sites.
- **Evidence:** Any atproto account holder can author a `pub.leaflet.pages.linearDocument` record on their own PDS with a `pub.leaflet.richtext.facet#link` carrying `{ uri: "javascript:fetch('/api/auth/session')..." }`. Every signed-in viewer of that profile/cert runs the script in certified.app's origin, with full access to the indexer proxy, group BFF, and write paths. The editor's no-selection link insertion path is the second route in: even without a malicious foreign record, a careless paste by the user lands the same payload onto their own PDS, where every later viewer is attacked.
- **Proposed direction:** Single point of fix: call `safeHttpUrl(uri)` at the renderer (both fallback sites + the facet branch) and in the writer/reader (from-tiptap + to-tiptap) and in the link dialog's submit handler. When the helper returns null, render plain text (no `<a>` wrapper) or substitute `"#"`. Five call sites, ~6-10 lines each.
- **Effort:** S. **Risk:** low (tightening only). **Reversibility:** trivial.

### High

#### F-2 — `useMergedDidsMap` reads + writes a ref during render (5 lint baseline errors)
*Cross-lens: C-3, P-3.*

- **Lens:** Correctness
- **Location:** `src/hooks/use-user-indexer-activities.ts:178-202`
- **Severity:** High (correctness bug under StrictMode + 5 of the 6 lint baseline errors)
- **Problem:** The hook reinvents `useMemo` with `useRef` + `setState` during render. Under React StrictMode (or any concurrent render that is discarded and replayed), the ref mutation persists across discarded renders — the second pass sees the cached `{a,b}` and skips the `setMerged`, leaving stale state. Also schedules an extra render per dependency flip.
- **Evidence:** Code:
  ```ts
  const lastRef = useRef<{ a: typeof a; b: typeof b } | null>({ a, b })
  if (lastRef.current?.a !== a || lastRef.current?.b !== b) {
    lastRef.current = { a, b }
    setMerged(mergeMaps(a, b))
  }
  ```
- **Proposed direction:** Replace the entire helper body with `return useMemo(() => mergeMaps(a, b), [a, b])`. The "stable reference unless inputs change" semantic is exactly what `useMemo` provides. Resolves all 5 lint errors at once.
- **Effort:** S. **Risk:** low. **Reversibility:** trivial.

#### F-3 — `/api/geocode` is open to the internet with no auth or rate-limit
*Cross-lens: O-1, S-6.*

- **Lens:** API/Operations, Security
- **Location:** `src/app/api/geocode/route.ts:62-166` (handler), `:10-18` (intent comments)
- **Severity:** High
- **Problem:** GET handler (no CSRF gate by design), no `getSessionDid()` check, no origin restriction, no rate limit. Anonymous traffic on the open internet can call it and force certified.app's outbound IP to make Nominatim queries. Nominatim's policy is "absolute maximum 1 req/sec"; sustained abuse gets the egress IP blocked for legitimate users. The `s-maxage=86400` edge cache helps for repeated queries but does nothing for unique `q=` scans. Also costs Vercel function execution time per invocation.
- **Evidence:** Geocode is only used by the location picker on auth-gated edit screens. Gating on session would be invisible to legitimate users.
- **Proposed direction:** Add a `getSessionDid()` early-return at the top of the handler. If the route must remain public, IP-based rate-limit via Upstash. Option A (session gate) is the smaller diff and matches actual usage.
- **Effort:** S. **Risk:** low (geocode UI is auth-gated today). **Reversibility:** trivial.

#### F-4 — `.env.local.example` missing four load-bearing env vars (silent dev-indexer fallback in prod)
*Cross-lens: O-7, O-19 (related).*

- **Lens:** API/Operations
- **Location:** `.env.local.example` (declarations); `src/app/api/indexer/route.ts:21-23`, `src/app/api/notifications/route.ts:26,31`, `src/lib/map/tiles.ts:38` (read sites)
- **Severity:** High
- **Problem:** Four env vars read by production code are absent from the example:
  - **`INDEXER_URL`** — falls back to `NEXT_PUBLIC_INDEXER_URL`, then to a hardcoded `https://magic-indexer-dev.up.railway.app/graphql` *dev* instance. A production deploy with this var unset silently routes every feed/notifications query at the dev indexer.
  - **`NEXT_PUBLIC_INDEXER_URL`** — legacy fallback, still read.
  - **`INDEXER_DID`** — required for the notifications JWT `aud` claim. The notifications route handles this case correctly (module-load warn + 503 on request); the indexer route does not.
  - **`NEXT_PUBLIC_STADIA_API_KEY`** — optional with documented fallback (Carto) and warn-once log; least urgent.
- **Evidence:** `grep -r process.env.INDEXER_URL src/` → 4 sites; `grep -r process.env.INDEXER_DID src/` → 2 sites; not in `.env.local.example`. Module-level `console.warn` only exists on the notifications side (lines 34-37 of notifications/route.ts).
- **Proposed direction:** (a) Declare all four vars in `.env.local.example` with comments explaining failure modes. (b) Add a module-load `console.warn` to the indexer route mirroring notifications' pattern: in production, no `INDEXER_URL` → loud warning at boot. Optionally: remove the dev-URL fallback in production builds.
- **Effort:** S (docs + 5-line warn block). **Risk:** none. **Reversibility:** trivial.

#### F-5 — LeafletEditor resets cursor on every keystroke
*Single-lens: C-1.*

- **Lens:** Correctness
- **Location:** `src/components/leaflet/leaflet-editor.tsx:147-155` (value-sync effect)
- **Severity:** High (if this actually bites it's a constant data-loss UX problem in the rich text editor)
- **Problem:** The "sync external value" effect re-runs on every parent state change. Because the parent stores the user's typed content in `drafts.description` (e.g. `activity-detail.tsx:617-620`), every keystroke yields a new `value` reference whose `next` (`toInitialDoc(value)`) differs from the prior `lastExternalRef.current`. Result: each keystroke fires `tr.replaceWith(0, doc.content.size, …)`, which destroys the selection / cursor position. `emitUpdate:false` suppresses the change event but not the doc replacement.
- **Evidence:** First render: `lastExternalRef.current = initial = emptyDoc`. User types "h" → `onUpdate` → parent sets `drafts.description = linearDoc("h")`. Re-render: effect computes `next = tipDocOf("h")`, `shallowEqual(tipDocOf("h"), emptyDoc) === false` → setContent runs → cursor reset.
- **Proposed direction:** Compare `next` against the editor's *current* JSON (`editor.getJSON()`) — not against `lastExternalRef.current`. Or update `lastExternalRef.current` inside `onUpdate` so a self-originated change is recorded before the parent's setState reflects back. Implementer should manually exercise the editor (type a sentence; verify cursor stays put) since there's no test infrastructure.
- **Effort:** S. **Risk:** low. **Reversibility:** trivial.

#### F-6 — Indexer proxy passes arbitrary GraphQL through with no operation allowlist (write-amplification surface)
*Single-lens: O-9.*

- **Lens:** API/Operations
- **Location:** `src/app/api/indexer/route.ts:51-137`
- **Severity:** High (architectural; the smaller defense fix is low-risk and small)
- **Problem:** The proxy passes the entire client body verbatim to the upstream GraphQL endpoint. CSRF is checked (same-origin only), no auth gate by design (feed is publicly readable), but any same-origin context (including any XSS payload — F-1) can make arbitrary GraphQL calls including mutations through our BFF. The notifications route does this right (server-held query strings + operation-name allowlist + variable scrubbing); the indexer route does not.
- **Evidence:** `route.ts:104-111` — `fetch(upstream, { body })` with raw client text. Compare `notifications/route.ts:53-82`.
- **Proposed direction:** Tonight, the bare-minimum fix: reject any request whose JSON-parsed body has `"mutation"` at the start of the trimmed `query` string. Full restructure (move queries server-side) is the right answer but blows the scope ceiling for a single commit — defer to operator.
- **Effort:** S (minimum) / M (full restructure). **Risk:** low (minimum) / med (full). **Reversibility:** easy.

### Medium

#### F-7 — `useSocialGraphSync.refetch` rebuilds every render (1 lint baseline error)
*Cross-lens: C-4, P-4.*

- **Lens:** Correctness
- **Location:** `src/hooks/use-social-graph-sync.ts:77-79`
- **Severity:** Medium (the React Compiler memoization-could-not-be-preserved baseline error)
- **Problem:** `useCallback(async () => { await Promise.all([certified.refetch(), bluesky ? Promise.resolve() : Promise.resolve()]) }, [certified])` — the dep is the whole `certified` object (always-fresh literal from `useFollowing` — see C-4 in raw transcript), and the `bluesky ? ... : ...` ternary is dead (both branches identical). Identity changes every render; downstream memoization broken.
- **Proposed direction:** Replace with `useCallback(() => certified.refetch(), [certified.refetch])`. Drop the dead ternary. Preserve the explanatory comment.
- **Effort:** S. **Risk:** low. **Reversibility:** trivial.

#### F-8 — `/api/groups/[groupDid]/activity` PUT lacks record-field allowlist (regression vs. the April audit's CS-005)
*Cross-lens: O-5, S-5.*

- **Lens:** Security, API/Operations
- **Location:** `src/app/api/groups/[groupDid]/activity/route.ts:58-68`
- **Severity:** Medium
- **Problem:** Sibling group BFF routes (`/profile`, `/metadata`, `/location`) all field-allowlist via `pickAllowedFields` or a hand-rolled set. The activity route alone does `{ ...rawRecord, $type: ACTIVITY_COLLECTION }` — every property of the request body is forwarded verbatim to the group's PDS. AUDIT_REPORT F-013/F-014 documented this exact pattern as the "mass assignment in group routes" root cause and CS-005 fixed it for profile/metadata. The activity route was added later and drifted.
- **Proposed direction:** Define `ACTIVITY_FIELDS` mirroring the lexicon (`title`, `shortDescription`, `description`, `image`, `workScope`, `workTimeframe`, `subjects`, `contributors`, `claimDelegate`, `verifiedAt`, `createdAt`, etc.) and route through `pickAllowedFields`. Verify against the cert-edit form's actual write payload before tightening too far.
- **Effort:** S. **Risk:** low (additive). **Reversibility:** trivial.

#### F-9 — `extractRouteError` returns generic message for 4xx (contradicts AGENTS.md §17 #7)
*Cross-lens: O-12.*

- **Lens:** API/Operations
- **Location:** `src/lib/utils/api.ts:36-44`
- **Severity:** Medium (UX-shaped)
- **Problem:** AGENTS.md §17 #7 and §24 #8 both say "4xx errors *can* echo upstream messages — those are usually validation a user can act on." The helper returns generic messages for ALL statuses, including 4xx. Users see `"Bad request"` instead of `"Handle must be at least 3 characters"`. The XRPC proxy's `xrpcError()` already does this right (uses `rawMessage` for 4xx, generic for 5xx).
- **Proposed direction:** Make the helper echo `err.message` on 4xx after `redactSecrets`, keep generic for 5xx. Mirror the XRPC proxy's pattern. Touches one function; many routes silently benefit.
- **Effort:** S. **Risk:** low (the policy change is explicitly endorsed by the security rules). **Reversibility:** trivial.

#### F-10 — `extractRouteError` trusts unbounded `status` integer from upstream errors
*Single-lens: O-13.*

- **Lens:** API/Operations
- **Location:** `src/lib/utils/api.ts:23-34`
- **Severity:** Medium
- **Problem:** Pulls `e.status` or `e.statusCode` from `unknown` and returns it as-is. A malformed upstream response (or `status: 0`/`status: 700`) flows straight through as the HTTP status of our response. `NextResponse` accepts any integer; caches/browsers behave weirdly on non-standard codes.
- **Proposed direction:** Clamp to `200 ≤ s ≤ 599`; if outside, default to 500. Same shape would benefit `xrpcError` (`src/app/api/xrpc/[...method]/route.ts:99-100`) but that's a separate line.
- **Effort:** S. **Risk:** none. **Reversibility:** trivial.

#### F-11 — Dual-path write routing duplicated across 5 lib files; shape divergence
*Cross-lens: A-1, A-2, R-8.*

- **Lens:** Architecture, Reuse
- **Locations:** `src/lib/atproto/{cert,profile,location,follow}.ts`, `src/lib/groups/org-marker.ts`
- **Severity:** Medium
- **Problem:** The "target vs. own → CGS BFF vs. XRPC" branch is repeated 5 times with already-diverging behavior: error extraction (`extractError` vs inline JSON parse in `follow.ts`), return contracts (`{uri,cid}` vs `void`), parameter shapes (`opts?.targetDid` vs positional). Not a bug today; exactly the slope a single shared seam prevents.
- **Proposed direction:** Add a `writeToRepo` helper that takes an own/target DID pair, an XRPC operation descriptor, and a group-route descriptor. Each helper collapses to one call. ~5 files of edits + 1 new file. ~80-120 lines added, ~130-160 removed. Within scope ceiling. Recommended for tonight by the architecture agent as "the single highest-value architecture finding."
- **Effort:** M (~2-3h). **Risk:** low. **Reversibility:** high.

#### F-12 — Bare `console.error` in 3 group routes leaks JWT/DPoP detail via `err.cause`
*Cross-lens: O-6.*

- **Lens:** API/Operations, Security
- **Locations:** `src/app/api/groups/[groupDid]/profile/route.ts:99`, `upload-blob/route.ts:63`, `metadata/route.ts:55`
- **Severity:** Medium
- **Problem:** `logSafe` (from `src/lib/utils/log-safe.ts`) strips JWT/DPoP/Authorization detail that the atproto SDK attaches to `err.cause`. Three routes still use raw `console.error(label, err)`. The metadata route additionally calls `extractRouteError` below, so the bare line is duplicate+raw.
- **Proposed direction:** Replace bare `console.error` with `logSafe`. For routes that also call `extractRouteError` (which internally calls `logSafe`), drop the bare line entirely.
- **Effort:** S. **Risk:** none. **Reversibility:** trivial.

#### F-13 — Object URL leak in cert inline-edit on save
*Single-lens: C-5.*

- **Lens:** Correctness
- **Location:** `src/components/feed/activity-detail.tsx:312-315` and surrounding image lifecycle
- **Severity:** Medium
- **Problem:** After save, the pending preview URL is transferred to `localImageUrl` (`setLocalImageUrl(pendingImagePreviewUrl); setPendingImagePreviewUrl(null)`). Next time edit mode reopens with a new image pick, the prior `localImageUrl`'s object URL is never revoked — only `pendingImagePreviewUrl` is revoked on replace. No unmount cleanup either.
- **Proposed direction:** Revoke any prior `localImageUrl` before promoting pending → local on save. Add an unmount cleanup that revokes whichever URL is still set.
- **Effort:** S. **Risk:** low. **Reversibility:** trivial.

#### F-14 — `useSession` doesn't clear handle/email on sign-out
*Single-lens: C-6.*

- **Lens:** Correctness
- **Location:** `src/hooks/use-session.ts:68-74`
- **Severity:** Medium
- **Problem:** When `isAuthenticated` flips to false, the effect clears the module-level cache but never calls `setHandle(null)` / `setEmail(null)`. Long-lived components that mounted while signed in keep returning that user's handle/email after sign-out until they unmount.
- **Proposed direction:** Add `setHandle(null); setEmail(null); setError(null);` to the sign-out branch.
- **Effort:** S. **Risk:** low. **Reversibility:** trivial.

#### F-15 — Ordered nested lists round-trip as bullet
*Single-lens: C-7.*

- **Lens:** Correctness
- **Location:** `src/lib/leaflet/from-tiptap.ts:174-177` vs. `src/lib/leaflet/to-tiptap.ts:160-174`
- **Severity:** Medium (data-loss; visible to user on next edit)
- **Problem:** `from-tiptap` stores nested ordered lists in `children`; `to-tiptap` hydrates `children` as a `bulletList`. User creates nested ordered list → reopens as bullet.
- **Proposed direction:** On the writer side, switch between `children` and `orderedListChildren` based on the nested node's type. The reader's asymmetric handling is already correct.
- **Effort:** S. **Risk:** low. **Reversibility:** trivial.

#### F-16 — `listFollowing` silent truncation at 10k cap
*Cross-lens: C-9, P-7.*

- **Lens:** Correctness
- **Location:** `src/lib/atproto/follow.ts:148-185`; same pattern in `use-received-endorsements.ts:101-104`, `use-followers.ts:180`.
- **Severity:** Medium
- **Problem:** Pagination loop breaks at 10K; no `truncated` flag is returned. A user crossing 10K follows shows as "9999+", and the derived `subjects` Set becomes incomplete, causing `useSocialGraphSync`'s "do I already follow X?" check to return false-negatives and re-import duplicates.
- **Proposed direction:** Return `{ records, truncated: boolean }` from `listFollowing`. Propagate to hooks. Render an indicator in the consumer UI when truncated. ~25 LOC across 3-4 files.
- **Effort:** M (touches hook return shape and 2-3 consumer files). **Risk:** low. **Reversibility:** easy.

#### F-17 — `importDids` write loop has no abort path
*Single-lens: C-11.*

- **Lens:** Correctness
- **Location:** `src/hooks/use-social-graph-sync.ts:87-136`
- **Severity:** Medium
- **Problem:** Serial for-loop with `await createFollow(...)` per DID; no `AbortSignal` checked between iterations. User closes the modal mid-import → loop continues writing follows to the repo and finally `setIsWriting(false)` fires on an unmounted component; module-level cache keeps populating with records the user thought they cancelled.
- **Proposed direction:** Accept an `AbortSignal` in `importDids`; check `signal.aborted` between iterations. The hook caller wires it to modal-open state.
- **Effort:** S. **Risk:** low. **Reversibility:** trivial.

#### F-18 — `mergeProfile`-style race window also present on cert inline edit (unacknowledged)
*Single-lens: C-19.*

- **Lens:** Correctness
- **Location:** `src/components/feed/activity-detail.tsx:270-323`, `src/lib/atproto/cert.ts:20-57`
- **Severity:** Medium
- **Problem:** Same shape as `mergeProfile`'s acknowledged race (PR #63 body): cert edit reads value at mount, user spends minutes editing, save → `next = { ...effectiveValue, title, shortDescription, image, description }` → `putRecord(rkey)` overwrites whatever's on the PDS. Concurrent edits to `contributors`/`locations` get clobbered. No `swapRecord` precondition, no comment acknowledging the window.
- **Proposed direction:** Two tiers — tonight: add the same kind of acknowledgement comment as `mergeProfile`. Future: pass the CID we read at mount into a `swapRecord` precondition.
- **Effort:** S (comment) / M (swapRecord). **Risk:** low. **Reversibility:** easy.

#### F-19 — `--danger` CSS variable undeclared, hard-coded `#d44` fallback used 16 times
*Single-lens: R-4.*

- **Lens:** Reuse / Consistency
- **Locations:** `src/app/styles/feed.css:1901,1927,2031`; `src/app/styles/profile-endorsements.css` (10 occurrences); `src/app/styles/social-graph-sync.css:78,194,438`
- **Severity:** Medium (breaks dark-theme contract — `#d44` is fixed regardless of theme)
- **Problem:** `--danger` is not declared anywhere. `var(--danger, #d44)` always resolves to the hard-coded `#d44`. Meanwhile `--color-error: #ba1a1a` (light) / `#f87171` (dark) IS declared in `tokens.css:91,221` for exactly this purpose. AGENTS.md §11 rule 3: "Reuse the CSS variables; don't hard-code colors."
- **Proposed direction:** Replace 16 occurrences with `var(--color-error)` (no fallback needed since it's declared).
- **Effort:** S (sed-style). **Risk:** light visual change (`#d44` → `#ba1a1a` in light mode; dark mode gains response). Designer should confirm; arguably this is what was intended.
- **Reversibility:** Trivial.

#### F-20 — `100vw` reintroduced in `leaflet.css` (AGENTS.md pitfall #13)
*Single-lens: R-7.*

- **Lens:** Reuse / Consistency
- **Location:** `src/app/styles/leaflet.css:466`
- **Severity:** Medium (causes horizontal scroll when a vertical scrollbar is present)
- **Problem:** `.long-description-modal { max-width: min(720px, calc(100vw - 32px)); }`. AGENTS.md §11 rule 1 and pitfall #13 both forbid `100vw`.
- **Proposed direction:** `max-width: min(720px, calc(100% - 32px))` (native `<dialog>` is body-positioned so `100%` resolves to viewport-ish without the scrollbar gotcha).
- **Effort:** S. **Risk:** none. **Reversibility:** trivial.

#### F-21 — `createdAt` stripped on group follow writes (loses Bluesky import history)
*Single-lens: O-4.*

- **Lens:** API/Operations
- **Location:** `src/app/api/groups/[groupDid]/follow/route.ts:55-59`
- **Severity:** Medium
- **Problem:** The route hardcodes `createdAt: new Date().toISOString()` regardless of body. For the social-graph sync flow, the original Bluesky follow time is the user's intent — losing it produces a chronologically-incorrect graph history. Also inconsistent with the personal-repo path which preserves whatever the client puts in the record.
- **Proposed direction:** Accept and validate an optional `createdAt` ISO-8601 string on the body; pass through. The sync flow can then send original timestamps.
- **Effort:** S. **Risk:** low (additive). **Reversibility:** trivial.

### Low

These are low-priority items. Per the brief, I implement them tonight only if they ride along with a larger change in the same file.

| ID | Lens | Site | Summary |
|---|---|---|---|
| F-22 | API/Ops O-2 | `geocode/route.ts:92-97, 140-144` | Echoes upstream status in 502 body. Use `"Geocoding upstream unavailable"`. |
| F-23 | API/Ops O-3 | `geocode/route.ts:92-97, 140-144` | No `logSafe` on `!res.ok`. Add. |
| F-24 | Security S-7 | `geocode/route.ts:162-165` | Raw `console.error("[geocode] upstream error", err)` — should be `logSafe`. (Rides with F-23.) |
| F-25 | API/Ops O-8 | `src/lib/map/tiles.ts:44` | `NEXT_PUBLIC_STADIA_API_KEY` is bundle-public by design; document the Stadia referer-allowlist requirement in `.env.local.example`. (Rides with F-4.) |
| F-26 | API/Ops O-10 | `src/app/api/xrpc/[...method]/route.ts:29,39-42` | AGENTS.md §17 #9 still says "four `ALLOWED_WRITE_COLLECTIONS`"; now eleven. Update doc string. |
| F-27 | Security S-8 / API/Ops O-11 | All `groups/[groupDid]/*/route.ts` | Document in AGENTS.md that group BFF intentionally trusts CGS for role enforcement (or add app-tier check — defer to operator). |
| F-28 | Security S-9 | `geocode/route.ts:78-81` | `parseInt` allows `"3.7"` → `3`. Replace with `Number()` + `Number.isInteger`. |
| F-29 | Security S-10 / Lens-6 P-5 | `package.json` | Next.js 16.2.3 has high-severity advisory chain; 16.2.6 patches. Within-minor bump. |
| F-30 | Correctness C-12 | `src/components/profile/profile-endorsements.tsx:1023-1049` | `useAuthorNamesMap` permanently caches negative results on transient failure. Cache.delete on error. |
| F-31 | Correctness C-13 | `src/lib/atproto/badges.ts:151-171` | `extractAwardSubjectDid` returns junk for malformed at-uri. Validate with `isValidDid`. |
| F-32 | Correctness C-15 | `src/lib/leaflet/from-tiptap.ts:67-84` | Empty-content blocks dropped on save (paragraph-of-hard-breaks). |
| F-33 | Correctness C-16 | `src/hooks/use-session.ts:85-96` | `fetchSession` setState-after-unmount on `then/catch`. Add `cancelled` sentinel. |
| F-34 | Reuse R-15 | `src/hooks/use-social-graph-sync.ts:102-132` | `isWriting=true` leaks on `refetch` failure. Wrap in try/finally. |
| F-35 | Reuse R-6 | `src/app/styles/cert-detail.css:75,116` | `.cert-detail__image` defined twice. Merge. |
| F-36 | Reuse R-5 | `src/app/styles/profile.css` vs `profile-projects.css`/`profile-groups.css` | Stale BEM blocks in `profile.css`. Delete. |
| F-37 | Reuse R-14 | `profile-inline-edit.css:27,42,269,283`; `cert-detail.css:135,150` | `rgba(17,17,17,…)` hard-coded 6x. Introduce `--overlay-image{,-strong}` tokens. |
| F-38 | Reuse R-11 | 4 new modals/editor sites | Inline error rendering bypasses `<ErrorMessage>`. |
| F-39 | API/Ops O-20 | `src/lib/groups/proxy-agent.ts:164-169` | `getAuthenticatedAgent()` silent oauth-restore failure. Add `logSafe`. |
| F-40 | Reuse R-9 | `src/hooks/use-org-marker.ts:143`; `use-private-memberships.ts:127` | `refresh` → rename to `refetch` for consistency. |
| F-41 | Reuse R-10 | `src/hooks/use-cert-projects.ts`, `use-rights.ts`, `use-project-items.ts` | Missing `error`/`refetch` on return; add or comment intent. |
| F-42 | Reuse R-13 | `leaflet.css:470` | `border-radius: 14px` hardcoded. Token or use `var(--radius)`. |
| F-43 | API/Ops O-14 | `src/app/api/resolve-did/route.ts:163-180` | No handle length cap / shape regex. |
| F-44 | API/Ops O-16 | `src/app/api/groups/[groupDid]/handle/route.ts:36-43` | No handle shape regex (just length). |
| F-45 | Correctness C-14 | `src/lib/atproto/location.ts:60-63` | `parseLocationCoords` accepts `"45.1,9.2,30"` silently. |
| F-46 | Correctness C-8 | `src/lib/atproto/badges.ts:225-277` | Cross-tab race in `ensureEndorsementDefinition` can yield duplicate defs. Fixed rkey would help (verify lexicon allows it). |
| F-47 | Correctness C-10 | `src/hooks/use-following.ts:106-113` | `refetch` runs without abort signal. |
| F-48 | Correctness C-17 | `src/lib/atproto/badges.ts:233-276` | `inflightEnsure` is release-on-resolve; small TTL cache would dedup back-to-back calls. |
| F-49 | Correctness C-18 | `src/app/api/groups/[groupDid]/location/route.ts:11-72` | `location` field shape unconstrained; narrow to known union variants. |
| F-50 | Correctness C-20 | `src/components/leaflet/leaflet-editor.tsx:148-155` | `setContent` silently coerces invalid JSONContent. Narrow risk. |
| F-51 | Architecture A-7 | `activity-detail.tsx` | Inline-edit extract (`useCertInlineEdit`). Defer per architecture agent. |
| F-52 | Architecture A-5 | `profile/[handle]/page.tsx` | Inline-edit extract (`useProfileInlineEdit`). Defer per architecture agent. |
| F-53 | Architecture A-12 | `src/lib/atproto/follow.ts`, `badges.ts` | Inline error parses; will collapse when F-11 lands. |
| F-54 | Architecture A-13 | `src/hooks/use-contributor-info.ts` vs `use-contributor-information.ts` | Names too close. Rename longer to `…Record`. |
| F-55 | Architecture A-14 | `useReceivedEndorsements` | No `refetch`. Add. |
| F-56 | Architecture A-15 | `profile/[handle]/page.tsx:768-771` | Cross-cutting `cache:"reload"` knowledge. Helper. (Rides with F-11 if it touches profile.ts.) |
| F-57 | Reuse R-3 | 8 new modals | `useFocusTrap` not used. But native `<dialog>.showModal()` provides focus containment. Either wire it in (option a) or update AGENTS.md (option b). The reviewer flagged this as Medium; lens-6 P-1 explicitly notes the native behavior is sufficient. Going with option b (doc clarification) tonight, since adding `useFocusTrap` to 8 files is real surface area for no behavior change. |
| F-58 | Reuse R-12 | 8 new modals | Identical 15-line dialog skeleton. Extract `<AppDialog>` primitive. Defer — substantial. |

### Non-findings (explicitly empty — important for honesty)

- **Modal class adherence** (`signin-modal app-modal`): 8/8 new modals on this branch carry both classes. No finding.
- **Provider tree scope**: no new context on this branch; the existing five are appropriately placed. (A-9)
- **`useUserProfile` vs `useProfile`** distinction: justified by different needs (read-render vs. read-then-write). (A-3)
- **`useGivenEndorsements` vs `useReceivedEndorsements`** shape difference: appropriate; their data is in different physical locations. (A-4)
- **`profile-endorsements.tsx`/`endorsement-lists.tsx` split**: coherent (tab orchestrator vs. Lists subsystem). (A-6)
- **Hook return shape variance**: driven by call-site needs; uniform-shaping would push work to consumers without saving anything. (A-10)
- **`<img>` use**: exactly one tag, with `alt=""` for decorative + `loading="lazy"`. Correct. (Lens-6 P-6)
- **CSP diff**: only `frame-src` widened (YouTube/Vimeo for embeds); no regression to `script-src`/`connect-src`/etc. (My direct check.)
- **`Performance + a11y deep audit`**: not attempted tonight without browser/profiler infra. Light pass only. (Lens-6 by design.)

### Out of scope tonight (explicitly deferred)

| Item | Reason |
|---|---|
| `core` 4.5 GB dump file at repo root | Listed in April audit as F-026 low-priority cleanup; per safety rules, no destructive ops without explicit operator approval. |
| Tests / test framework | No test infra in the repo; introducing Vitest + RTL + first suite is L-effort and blows scope. Document as known. |
| Rate limiting infra (Upstash) | Audit F-020 still open; "requires infrastructure (Vercel/Upstash rate limit) — not fixable in code alone". |
| swapRecord concurrency on cert/profile/marker writes | Operator decision: PR #63 body acknowledged the `mergeProfile` race as "acceptable for v1". Same applies to cert (F-18). |
| Group BFF role enforcement at app tier (F-27) | Defensible architecture decision; documenting suffices. |
| AppDialog primitive (F-58) | Substantial refactor; defer to a focused PR. |
| Profile / cert inline-edit extraction (F-51, F-52) | Architecture agent recommends defer; not bug-shaped. |
| Indexer proxy restructure to operation allowlist (F-6 full) | Real refactor; tonight does the minimum mutation-block. |

---

## Triage summary

- **Critical:** 1 (F-1 leaflet XSS — fixable at 5 sites with one existing helper)
- **High:** 5 (F-2, F-3, F-4, F-5, F-6)
- **Medium:** 16 (F-7 through F-21 plus one in low list; some inter-dependent)
- **Low:** 37 (F-22 through F-58; many are nits, several are ride-alongs)

Counts include the architecture and reuse "no-action / non-finding" items as separate lines for honesty, not as severity loadings.

**Phase 3** (`03-implementation-plan.md`) decides which of these get fixed tonight and in what order.
