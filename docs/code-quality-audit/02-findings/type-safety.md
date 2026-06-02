# Findings — type safety

Baseline is strong: zero TS errors, zero literal `: any` annotations,
zero `as any` casts in src/ (only in tests, where it's controlled).

## T-1 — Non-null assertions in `orbiting-logos.tsx`

`src/components/landing/orbiting-logos.tsx` uses `el!` 7 times at
lines 244-272. Each is inside a closure that captured `el` from
`document.getElementById(...)`; a guard at the top would let TS
narrow naturally.

**Tier 2** — touching the orbiting-logos animation is risky (visual,
timing-sensitive). Skip.

## T-2 — `as unknown as BlobRef` casts duplicated 7 times

Found in:
- `src/components/profile/profile-edit-form.tsx:286,296`
- `src/components/project/project-detail.tsx:603`
- `src/components/feed/activity-detail.tsx:409`
- `src/app/groups/[groupDid]/edit-profile/page.tsx:129,140`
- `src/hooks/use-profile-inline-edit.ts:555,565`
- `src/components/onboarding/use-onboarding-commit.ts:133,140`

All cast `UploadedBlob` (from `lib/atproto/profile.ts`) → `BlobRef`. The right
fix is to teach `UploadedBlob` to *be* a `BlobRef` (or expose an `asBlobRef`
helper). Risk: `BlobRef` comes from the atproto SDK and the shape isn't
guaranteed to overlap forever.

**Tier 2** — narrow but cross-cutting. Worth a focused track if time remains.

## T-3 — `as unknown as { data?: { uri?: string; cid?: string } }` in 4 group routes

`src/app/api/groups/[groupDid]/{activity,follow,location,project}/route.ts`
all do the same dance after an XRPC call:

```ts
const data = (upstream as unknown as { data?: { uri?: string; cid?: string } }).data
```

Extract a typed helper `extractRecordRef(upstream): { uri?: string; cid?: string }`.
**Tier 1**, single new helper + 4 call-site updates.

## T-4 — `editor.storage as unknown as Record<string, LeafletImageStorage>` (3 sites)

`leaflet-editor.tsx:174, 313`, `nodes/leaflet-image-node.tsx:88`. The tiptap
`editor.storage` is `Record<string, unknown>` upstream. Extract a
`getLeafletImageStorage(editor)` accessor and centralize the cast. **Tier 2**
— tiptap typing is fragile.

## T-5 — Mass-assignment defended at runtime, weakly at compile time

`pickAllowedFields(body, allowedFields, $type)` (`lib/utils/api.ts:81`) takes
`Record<string, unknown>` and returns `Record<string, unknown>`. Callers cast
the return to the record type. A generic
`pickAllowedFields<T>(body, allowed, $type): Partial<T> & { $type: string }`
would tighten this without runtime cost.

**Tier 2** — touches a security-critical helper; needs careful review.

## T-6 — Test-only casts in `app-dialog.test.tsx` (acceptable)

`src/components/ui/__tests__/app-dialog.test.tsx` casts via
`as unknown as { showModal: ... }` to monkey-patch `HTMLDialogElement.prototype`
for jsdom. Standard test-shim pattern; out of scope.

## Decision

Tier 1 targets: T-3 only. Others are Tier 2 / skip.
