# Plan — auth: bsky-PDS write fix (Next.js #90826 / Node 24.14+ workaround)

Status: **Post-review-round-3 — implementation-ready.** Round 1: 18 items accepted. Decision 1 (split vs bundle) reverted to BUNDLE by user direction after round 1 wrote up. Round 2: 16 items accepted against the bundled shape. Round 3: 7 items accepted (3 Important consistency fixes, 2 nit regex polishes, 2 nit ergonomics). Below the substantive-item threshold for a round 4. See `review-round-{1,2,3}.md` for accept/reject decisions.

Tracks `hypercerts-org/certs-social#86`. Mirrors the `safeFetch` change landed in `hypercerts-org/certified-app#54` (only the auth fix; other items from that release ship separately).

## Problem

Any authenticated XRPC write (`com.atproto.repo.putRecord`, `createRecord`, `deleteRecord`, `uploadBlob`) **500s silently** when the signed-in user's repo is hosted on a Bluesky-side PDS (`*.host.bsky.network`). Writes succeed when the user is on a `certified.one`-side PDS.

Upstream error masked to the client as `Internal server error`; server-side cause is `expected non-null body source` from undici.

### Root cause (three things must all be true)

1. **Next.js's patched `fetch`** (vercel/next.js#90826): on Node ≥ 24.14, when `fetch` is called with a `Request` and the response is an error, Next.js's wrapper re-reads the Request body for tracing. Undici's tightened stream locking throws `expected non-null body source` because the body stream was already consumed by the network send.
2. **The atproto OAuth DPoP wrapper** (`@atproto/oauth-client/dist/fetch-dpop.js`) constructs a `Request` and calls `fetch(request)`.
3. **Bluesky's PDS reliably returns `401 + DPoP-Nonce` on the first hit** to a new origin (RFC 9449). The Certified PDS does not — hence the bsky-only manifestation.

Vercel's default Node version is `24.x`, which includes the regression. Pinning to Node 22 sidesteps the bug but kicks the can; the wrapper approach is runtime-agnostic.

## Fix

Wrap the `fetch` passed to `NodeOAuthClient` so any incoming `Request` is deconstructed into `(url, init)` before reaching Next.js's wrapper. Buffer the body once into an `ArrayBuffer` so DPoP-nonce retries and token-refresh retries can both re-send it.

### Target

**File:** `src/lib/auth/oauth-client.ts` (single file, ~35-line addition).

Add `safeFetch` helper below the `getOAuthClient` function:

```ts
// Workaround for vercel/next.js#90826: on Node ≥ 24.14, Next.js's patched
// fetch throws `expected non-null body source` when given a Request whose
// body has been consumed and the response is an error. The atproto DPoP
// wrapper passes a Request to fetch, and bsky's PDS reliably returns 401 +
// DPoP-Nonce on the first hit, triggering the bug. Buffer the body once and
// re-issue with (url, init) form so Next.js's wrapper never sees a Request.
//
// Reach: this also protects token refresh and revoke. The same DPoP wrapper
// handles auth-server traffic, and bsky's auth server also returns nonce
// challenges, so `client.restore(did)` (which can trigger refresh) was
// affected by the same bug for bsky-hosted accounts.
//
// Note on uploadBlob: the route handler in `src/app/api/xrpc/[...method]`
// already buffers the upload to an ArrayBuffer (capped at 4 MB), and the
// atproto Agent then constructs a Request whose body we buffer again here.
// Peak transient memory ~12 MB; ~24 MB worst case on a nonce-retry. Well
// under Vercel's 1 GB function memory.
const safeFetch: typeof fetch = async (input, init) => {
  if (input instanceof Request) {
    // Body handling:
    //   input.body === null   → no body was provided; pass `body: undefined`.
    //   input.body !== null   → body exists (even if 0 bytes); buffer and
    //                           forward, preserving Content-Length: 0 for
    //                           empty-but-explicit POSTs like
    //                           com.atproto.server.requestEmailUpdate.
    const buffer = input.body ? await input.arrayBuffer() : undefined

    // The dpop wrapper currently invokes us as `fetch.call(this, request)`
    // with no second argument, so `init` is null in practice. Don't spread
    // it — if a future caller did pass `init.body`, the spread would
    // overwrite our buffered body and re-introduce the very bug this fix
    // prevents. Also: any caller-provided `init.signal` is intentionally
    // dropped together with `init` (the Request's own signal is forwarded
    // below).
    if (init != null && process.env.NODE_ENV !== "production") {
      // Dev-only canary: if a future @atproto/oauth-client release changes
      // its call convention, this fires loudly in test runs so we notice
      // before the bug returns in prod.
      console.warn(
        "[safeFetch] unexpected init alongside Request — body buffering may need revisit"
      )
    }

    return globalThis.fetch(input.url, {
      method: input.method,
      headers: input.headers,
      body: input.body ? buffer : undefined,
      // Request always carries a signal (synthesizes one if none was
      // provided); forwarding it keeps AbortSignal.timeout chains intact.
      signal: input.signal,
      redirect: input.redirect,
      credentials: input.credentials,
      cache: input.cache,
    })
  }
  return globalThis.fetch(input, init)
}
```

Pass it to `NodeOAuthClient` (current call site is line 48):

```ts
return new NodeOAuthClient({
  clientMetadata,
  stateStore: new RedisStateStore(),
  sessionStore: new RedisSessionStore(),
  handleResolver: PDS_URL,
  fetch: safeFetch,                       // <-- add this line
  ...(keyset ? { keyset } : {}),
})
```

### Why this works

`NodeOAuthClient`'s internal DPoP wrapper calls `fetch.call(this, request)` for each attempt (initial, DPoP-nonce retry, token-refresh retry). Our wrapper materializes the body into an `ArrayBuffer` (re-readable on every retry) and re-issues with `(url, init)` form, which Next.js's patched fetch handles correctly. The double-buffering cost is acceptable because OAuth-bound traffic is records, not large blobs; uploadBlob's 4 MB cap is enforced at the route handler before the request reaches the OAuth client.

The wrapper also covers the token-refresh and revoke paths — both go through the same DPoP wrapper, and bsky's auth server also issues nonce challenges, so `client.restore(did)` is protected as well.

## Scope decisions

### Decision 1 — Bundle the upstream-error logging? → **BUNDLE** (reverted after user direction)

R-Ops argued for split (smaller review surface for the redaction code, cleaner revert). The user opted to keep the change bundled: the observability is what made this bug findable in the first place upstream, and shipping the wrapper without logs leaves us blind to the *next* similar issue. The redaction-pattern gaps found in round 1 are absorbed into this PR rather than punted.

**This PR ships both:**
1. `safeFetch` in `src/lib/auth/oauth-client.ts` (the fix itself).
2. `redactSecrets` + `logSafe` + expanded `xrpcError` logging in `src/app/api/xrpc/[...method]/route.ts` (observability).

The redaction patterns include the originals from certified-app **plus** the extensions raised in round 1 A7:

```ts
function redactSecrets(s: string): string {
  // Wrap in try/catch — a catastrophic-backtracking regex on a pathological
  // input would otherwise throw inside the error handler. Failsafe is "log a
  // placeholder," never "log raw." (R2 B4.)
  try {
    return s
      // JWTs — DPoP proofs, bearer tokens, ID tokens. Base64-permissive (tolerates
      // `=` padding in the third segment per B11); benign false positives on any
      // "eyJ…" base64-JSON are acceptable.
      .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+=*/g, "<jwt>")
      // Header lines as serialized by util.inspect / Request stringification.
      // Anchor to end-of-line so multi-value `Cookie: a=1; b=2; c=3` is fully
      // redacted (B2 — \S+ would only catch the first cookie).
      .replace(/(Authorization|DPoP|Cookie|Set-Cookie):[^\r\n]*/gi, "$1: <redacted>")
      // Form-encoded OAuth token grants (certified-app's original pattern).
      .replace(/(access_token|refresh_token|id_token)=[A-Za-z0-9._~+/-]+=*/gi, "$1=<redacted>")
      // JSON-shape OAuth token grants. Tolerate escaped quotes inside the value
      // (B3 — atproto SDK error messages often stringify a response body
      // containing `"refresh_token":"…\\"…"`).
      .replace(
        /"(access_token|refresh_token|id_token)"\s*:\s*"(?:[^"\\]|\\.)*"/gi,
        '"$1":"<redacted>"'
      )
      // OAuth callback query params — `code` and `state` can land in error
      // messages if a callback URL is included in a serialized request.
      .replace(/([?&](?:code|state))=[^&\s"]+/gi, "$1=<redacted>")
      // JWK private material — atproto uses ES256/P-256, so `"d"` is realistic;
      // `"k"` covers any symmetric variant; RSA CRT params (`p`/`q`/`dp`/`dq`/`qi`)
      // are belt-and-suspenders but cheap. Escape-tolerant value match (B3).
      .replace(
        /"(dp|dq|qi|d|k|p|q)"\s*:\s*"(?:[^"\\]|\\.)*"/g,
        '"$1":"<redacted>"'
      )
      // Email addresses. Last on purpose — earlier patterns already replaced
      // their secrets with placeholders that contain no '@' (B12).
      .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "<email>")
  } catch {
    return "<redaction-failed>"
  }
}
```

`xrpcError` and `logSafe` deliberately drop `err.cause` and `err.stack` rather than redacting and keeping them — the atproto SDK attaches the upstream `Request` (with DPoP proofs and Bearer tokens) on `.cause`, and stack traces include the same Request via `util.inspect`. Round-tripping `cause` through `redactSecrets` is more attack surface than diagnostic value; the redacted `name + status + error + message` is enough to identify the failure mode.

`logSafe` itself must never throw. If `redactSecrets` fails (returns `"<redaction-failed>"`), `logSafe` falls through to logging `name + status` only with no payload — R2 B4 + B5/R9.

Example `xrpcError` shape and call-site (B10):

```ts
// xrpcError now also writes a server-side log line. Client still gets the
// masked-to-500 `Internal server error`.
function xrpcError(err: unknown): { status: number; message: string } {
  const error = err as { status?: number; statusCode?: number; message?: string; error?: string; name?: string }
  const status = error?.status ?? error?.statusCode ?? 500
  const message = status >= 500 ? "Internal server error" : (error?.message ?? "Internal server error")
  console.error("[xrpc] upstream error", {
    name: error?.name,
    status,
    error: error?.error,
    message: typeof error?.message === "string" ? redactSecrets(error.message) : undefined,
  })
  return { status, message }
}

// Example replacement of a silent catch:
//   - } catch {
//   -   await deleteSession()
//   -   return NextResponse.json({ error: "Session expired" }, { status: 401 })
//   - }
//   + } catch (err) {
//   +   logSafe("[xrpc] oauth restore failed", err)
//   +   await deleteSession()
//   +   return NextResponse.json({ error: "Session expired" }, { status: 401 })
//   + }
```

**Redaction posture (B13):** Vercel function logs are project-member-gated; there is no third-party log drain configured in this repo. Redaction is the **single barrier** to that surface, not a secondary layer. Its defense-in-depth value is against future log exports, log drains, or expanded read access — not the primary access control. The server-only `console.error` path is compliant with `AGENTS.md` / `AUDIT_REPORT.md` — clients still get the masked `Internal server error`.

### Decision 2 — Bump `@atproto/api` 0.13 → 0.19? → **DEFER**

R-Spec confirmed the bsky-PDS fix does not depend on 0.19: the agent in 0.13 doesn't itself construct `Request` objects passed to `NodeOAuthClient.fetch` — only the DPoP wrapper does, and our `safeFetch` neutralizes it the same way regardless of agent version. The bump would also touch:

- `com.atproto.repo.listRecords` (drop `rkeyEnd`/`rkeyStart` — currently passed at lines 150, 174–175, 214–215 of the xrpc route);
- write-method casts (change to `body as unknown as ComAtproto…`);
- pulls lex-data / lexicon / syntax / xrpc bumps transitively.

**Defer to a separate follow-up PR.** Keeps this fix narrowly scoped. Tracked in Open Questions.

### Decision 3 — Other items from certified-app#54 → **OUT OF SCOPE**

`groups list overhaul`, `profile banner fix`, and the upstream PR's "OAuth session restoration flow" item are independent product changes. The session-restoration item *overlaps* with our fix's blast radius (refresh is one of the paths our wrapper protects), but the upstream's behavioral change is independent and not required for the bsky-PDS write to succeed.

## Acceptance criteria

Human smoke (the user — has access to a bsky-hosted handle):

- [ ] **Bsky-PDS handle write**: Sign in with a Bluesky-hosted handle (any DID resolving to `*.host.bsky.network`); edit profile and save → `POST /api/xrpc/com/atproto/repo/putRecord` returns **200**, saved values render on `/profile/[handle]`.
- [ ] **Bsky-PDS token refresh**: Wait past the access-token TTL (or manually clear the access token from the Redis session store), then perform another save → still **200**. Exercises the DPoP retry + token-refresh path which is the *most likely* place an `init.body` regression would surface.
- [ ] **Bsky-PDS no-body write**: Trigger `com.atproto.server.requestEmailUpdate` (no request body) while signed in as the bsky-PDS user → **200**. Confirms the empty-body path doesn't strip `Content-Length: 0`.
- [ ] **Control — Certified-PDS handle write**: Sign in with a `certified.one`-hosted handle (email-OTP flow); profile save still works → **200**. Confirms the wrapper doesn't regress the path that was already working.
- [ ] **Browser devtools — header sanity**: The `POST /api/xrpc/...` request from the browser has `Origin` matching `PUBLIC_URL` (CSRF guard) and reaches the route handler; wrapper doesn't alter routing.
- [ ] **Log redaction smoke**: Deliberately trigger an upstream 4xx and inspect Vercel function logs (B14 concrete recipe):
  ```sh
  curl -X POST "$PREVIEW_URL/api/xrpc/com.atproto.repo.putRecord" \
    -H "Cookie: <copy session cookie from devtools>" \
    -H "Content-Type: application/json" \
    -d '{"collection":"app.bsky.feed.post","repo":"<your-did>","record":{"$type":"app.bsky.feed.post"}}'
  # Missing required `text` field → 400 from the PDS, exercising the
  # xrpcError redaction path without needing a real malformed write.
  ```
  The `[xrpc] upstream error` line must appear, **and** the line must contain no JWTs (no `eyJ…` substrings), no `Authorization`/`DPoP`/`Cookie` values, no `access_token=`/`refresh_token=`, no JSON-shape `"refresh_token":"…"`, no callback `code=`/`state=`, and no email addresses.
- [ ] **Log content survives redaction**: The same log line must still contain `status`, `error` (the atproto error name), and a non-empty `name` — i.e., redaction is targeted, not a blanket scrub.
- [ ] **OAuth-restore failure logged** (B7 + C4): Force `client.restore(did)` to fail by deleting the session blob from Upstash Redis, then issue any authenticated XRPC call. Key shape is `oauth:session:<did>` (see `src/lib/auth/stores.ts`). One-line REST recipe:
  ```sh
  curl -X POST "$UPSTASH_REDIS_REST_URL/del/oauth:session:<your-did>" \
    -H "Authorization: Bearer $UPSTASH_REDIS_REST_TOKEN"
  ```
  Confirm `[xrpc] oauth restore failed` appears in function logs with no secret leakage, **and** the client still receives `401 Session expired`. Without this, the bundled observability has no positive evidence the catch-block change actually fires.
- [ ] **Foreign-PDS upstream failure logged** (B1 + C1): Trigger a `getRecord` against a foreign DID whose PDS *resolves* (so the route reaches the try block) but whose serviceEndpoint is unreachable — e.g., a synthetic `did:web:` whose service endpoint points at a dead host, or a DID with a serviceEndpoint that returns a timeout. (Resolving to *null* won't work — it short-circuits to 404 at `route.ts:114` before the try.) Confirm `[xrpc] foreign-pds upstream` appears redacted in function logs. Without this, the silent-swallow pattern that masked the original bug is still present on three GET paths.

Build / type / lint:

- [ ] `npx tsc --noEmit` produces no new errors when diffed against `docs/auth-bsky-pds-fix/tsc-baseline.txt` (captured on `staging` HEAD before branching; see Implementation order step 3).
- [ ] `npm run build` succeeds on Node 24.x.
- [ ] `npm run lint` introduces no new warnings vs `staging` HEAD.

Environment / deploy:

- [ ] Vercel project Node version confirmed as **24.x** on the feature-branch preview before smoke. The bug only reproduces on Node ≥ 24.14; a green smoke on Node 22 is a false negative.
- [ ] Vercel function logs on the feature-branch preview show no `expected non-null body source` after the smoke runs. (Pre-fix: this string would appear; post-fix: it should not.)

## Preview env vars

Vercel preview env vars are scoped per branch. Before the first push of `feat/auth-bsky-pds-fix`, copy the following from `staging`:

- `PUBLIC_URL`
- `COOKIE_SECRET`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `NEXT_PUBLIC_PDS_URL`
- `ATPROTO_PRIVATE_KEY` (optional — only if running as a confidential client)
- `INDEXER_URL`
- `RESEND_API_KEY`

Without these, the first preview build fails on the first env-required server module — confirmed Vercel behavior.

## File ownership

| File | Change | In this PR? |
|---|---|---|
| `src/lib/auth/oauth-client.ts` | Add `safeFetch`, pass to `NodeOAuthClient` (commit 1) | Yes |
| `src/app/api/xrpc/[...method]/route.ts` | Add `redactSecrets`, `logSafe`; expand `xrpcError` to log redacted upstream errors; replace 2× bare `catch {}` on OAuth restore + **3× bare `catch {}` on foreign-PDS GET paths** (lines 135, 197, 263 for `getRecord`/`listRecords`/`sync.getBlob`, per B1) with `catch (err) { logSafe(...) }` (commit 2) | Yes |
| `package.json`, `package-lock.json` | Bump `@atproto/api` (Decision 2) | No — follow-up |

Two-commit, two-file diff. No parallel-track work needed; the commits are sequenced (fix first, then observability) so the fix can be reverted independently if needed.

## Implementation order

1. Branch `feat/auth-bsky-pds-fix` off `staging`.
2. **Pre-push checklist** (A14):
   - Verify `git config user.email` is a Vercel-team-registered email. Otherwise the Vercel author-check on the preview deploy fails.
   - Copy the preview env vars above from `staging` → `feat/auth-bsky-pds-fix` (per-branch scoping, see "Preview env vars").
3. Capture TS baseline **on `staging` HEAD before any edits** (A11):
   ```
   git checkout staging
   npm install
   npx tsc --noEmit 2>&1 | tee docs/auth-bsky-pds-fix/tsc-baseline.txt
   ```
4. Switch back to the feature branch.
5. `npm install` if not already done (A10 — `node_modules` is currently absent in this checkout).
6. **Commit 1: safeFetch.** Add the helper + wire into `NodeOAuthClient`. Targets `src/lib/auth/oauth-client.ts` only.
7. **Local verify after commit 1** (C5): `npx tsc --noEmit | diff baseline -` (no new errors) + `npm run build` + `npm run lint`. Cheap-checks-first ordering; don't burn a preview cycle on a broken build.
8. **Commit-1 isolation smoke** (B6): push the branch with only commit 1, wait for the preview deploy, then run only the *Bsky-PDS handle write* + *Vercel function logs clean of `expected non-null body source`* acceptance rows. If those go green, attribution is clean; proceed to commit 2. If they regress, fix the wrapper without commit 2 noise in the diff.
9. **Commit 2: redaction + logging.** `redactSecrets` + `logSafe` + expanded `xrpcError` + replace silent `catch {}` blocks (2× OAuth restore + 3× foreign-PDS GET per B1). Targets `src/app/api/xrpc/[...method]/route.ts` only. Separate commit preserves revert granularity at the commit level.
10. Full local verification after commit 2:
    ```
    npx tsc --noEmit 2>&1 | tee /tmp/tsc-post.txt
    diff docs/auth-bsky-pds-fix/tsc-baseline.txt /tmp/tsc-post.txt   # must be empty
    npm run build
    npm run lint
    ```
11. Implementation review: 3 reviewers — (a) functional correctness on the smoke paths, (b) code/style match against `oauth-client.ts` + `route.ts` surroundings, (c) **security-focused pass on the redaction patterns** since the observability code ships in this PR.
12. Open PR as **Draft into `staging`**. PR body links to this plan, `review-round-1.md`, `review-round-2.md`, `review-round-3.md`, the upstream PR (`certified-app#54`), and the bug report (`certs-social#86`).
13. Wait for the **feature-branch preview** deploy. **Confirm Vercel project Node version is 24.x for this preview before smoking** (B9 — the bug doesn't reproduce on Node 22). Confirm preview env vars resolved (no build error), then run the full human smoke from the Acceptance Criteria.
14. Manual regression recipe (C2 — ordering fix; was step 14, now before "mark ready") — three back-to-back writes from a bsky-PDS handle to exercise the DPoP nonce + retry path:
    ```
    # From browser devtools after signing in with the bsky handle:
    # save profile → expect 200
    # save profile again immediately → expect 200
    # save profile a third time → expect 200
    # Vercel logs: no `expected non-null body source` lines
    ```
15. Mark PR ready for review.
16. (Optional, B15) Run a one-shot redaction-fixture check before opening the PR:
    ```sh
    # Author a small tsx script with fixture inputs covering: a JWT, a
    # multi-cookie header line, an escaped-quote JSON token, a callback URL
    # with state/code, an email, and one moderate-size (~64 KB) random
    # string. Assert no expected-secret substring survives redactSecrets().
    npx tsx scripts/redaction-fixture.ts
    ```
    No vitest runner needed; pure assert. Optional because `tests/` has no runner configured (per `AGENTS.md`).
17. **Stop.** User merges.

## Post-merge verification

After the PR merges into `staging` (R-Ops A14):

- Re-run the bsky-PDS write smoke against `staging.certs.social` (the `staging` Vercel env is distinct from the per-branch preview env).
- Re-confirm Vercel function logs are clean of the failure string.

## What not to do (engineer-facing)

- **Do not auto-open the `staging → main` PR.** The user opens that one when ready.
- **Do not `--force` push to `main`** under any circumstance.
- **Do not skip hooks** (`--no-verify`).
- **Do not split commits 1 and 2 into separate PRs.** Bundled is the final decision (reverted from round 1's split). The two commits stay in one PR; revert granularity is preserved at the commit level, not the PR level.

## Rollback

The change is additive and side-effect-free outside the OAuth fetch path. Rollback = `git revert <safeFetch-commit>`. No data migration, no schema change, no env-var change. The post-revert behavior is identical to today's: bsky writes 500, Certified-hosted writes work.

`clientPromise` is a module-level singleton on a warm Vercel lambda; post-revert it may briefly serve the old closure until the instance recycles. No manual cache flush needed; allow normal lambda recycle (≤ minutes).

## Risks

- **R1 — Wrapper hides a header the DPoP retry needs.** Mitigation: forward `method`, `headers`, `body`, `signal`, `redirect`, `credentials`, `cache` explicitly. DPoP retries re-issue and re-sign with a fresh nonce; the wrapper doesn't touch retry logic inside `@atproto/oauth-client`.
- **R2 — Future caller passes `init` with `init.body`.** Mitigation: explicit no-spread + dev-mode warning canary (A1). Comment explains why.
- **R3 — Body buffering OOMs on large uploads.** Mitigation: uploadBlob is gated to 4 MB at the route handler before agent invocation; OAuth-bound writes are kilobyte JSON.
- **R4 — Next.js patches the bug upstream and our wrapper is dead code.** Mitigation: low cost. ~35 lines, well-commented with the upstream issue link; a future reader can verify before removing.
- **R5 — Empty-body POST regresses.** Mitigation: explicit logic in the body forwarding (`input.body ? buffer : undefined` correctly preserves both no-body and 0-byte-body cases). Acceptance criterion covers it.
- **R6 — Bug doesn't reproduce on the smoke environment.** Mitigation: Acceptance Criteria pin Node 24.x explicitly, and Implementation order step 12 makes it a pre-smoke gate. Without that gate, a green smoke proves nothing.
- **R7 — `redactSecrets` throws on pathological input** (e.g. catastrophic-backtracking on a multi-megabyte error message). Mitigation: regex patterns are linear (no nested quantifiers over alternations); the function body is wrapped in `try { … } catch { return "<redaction-failed>" }` (B4). `logSafe` falls through to logging `name + status` only if redaction errors, so the observability path itself can't crash the response handler.
- **R8 — Future secret format leaks past redaction** (e.g. a new atproto SDK error stringifies a private key in an unrecognized shape). Mitigation: drop `err.cause` / `err.stack` (the high-value attack surface); accept residual risk; treat the Log redaction smoke as a recurring check on `@atproto/*` bumps. If the optional fixture script (step 15) is committed, expand it on each upgrade.
- **R9 — Observability path itself fails silently.** Mitigation: `logSafe` must not throw under any input; if redaction errors, log a placeholder with no payload rather than swallowing entirely. B7's acceptance row provides a positive-evidence check that `[xrpc] oauth restore failed` actually appears in logs.

## Out of scope

- Bumping `@atproto/api` to 0.19 (see Decision 2; follow-up).
- Any change to the OAuth session store, Redis adapters, or session cookie handling.
- Groups-list, profile-banner, or any other change from certified-app#54.
- Linking `/imprint` from `mobile-sidebar.tsx`.
- Changes to **behavior** of the public XRPC proxy paths (`getRecord`, `listRecords`, `getBlob`) — these use plain `fetch(url, init)` and aren't affected by the bug. Their `catch {}` blocks *are* upgraded to `logSafe` in commit 2 (B1), but observable behavior is unchanged.

## Open questions / follow-ups

1. **Follow-up PR — `@atproto/api` 0.13 → 0.19 bump.** Per Decision 2 defer. Removes `rkeyEnd`/`rkeyStart` from `com.atproto.repo.listRecords`; adjusts write-method type casts.
2. **`handleResolver: PDS_URL`** — unchanged. Confirmed sanity-check; unrelated to the fix.
