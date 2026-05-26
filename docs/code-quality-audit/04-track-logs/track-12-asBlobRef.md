# Track T12 — asBlobRef centralization

Commit: `cfd362a`

The cast `someBlob as unknown as BlobRef` was inlined at 7 call sites
that built records after `uploadBlob`/`uploadAvatar`/`uploadBanner`. The
two types are not structurally compatible: `UploadedBlob` carries
`ref: { $link: string }` (JSON shape returned by the BFF), while the
SDK's `BlobRef` is a class with `ref: CID` (a multiformats CID
instance).

Added `asBlobRef(blob: UploadedBlob): BlobRef` to
`src/lib/atproto/profile.ts`. The cast still exists — it has to — but
now lives in one documented function instead of seven separate
`as unknown as` expressions across components, hooks, and pages.

Touched (7):
- `src/lib/atproto/profile.ts` (new export)
- `src/app/groups/[groupDid]/edit-profile/page.tsx`
- `src/components/feed/activity-detail.tsx`
- `src/components/onboarding/use-onboarding-commit.ts`
- `src/components/profile/profile-edit-form.tsx`
- `src/components/project/project-detail.tsx`
- `src/hooks/use-profile-inline-edit.ts`

Each consumer also drops its `import type { BlobRef } from "@atproto/api"`
where that import was used only for the cast.

Verification: all four gates passed.
