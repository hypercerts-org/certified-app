# Findings — dead code

All entries verified by `grep -rn "<symbol>" src --include="*.ts" --include="*.tsx"`.
"Self-only" means the only hit is the export declaration itself.

## D-1 — `useActivities` in `src/hooks/use-activities.ts` — entire file dead

```
"use client"
import { useAuth } from "@/lib/auth/auth-context"
import { useUserActivities } from "./use-user-activities"

export function useActivities() {
  const { isAuthenticated, did } = useAuth()
  return useUserActivities(isAuthenticated ? did : null)
}
```

Only reference outside the file is a doc comment in
`use-user-activities.ts:8`. **Delete the file. Tier 1.**

## D-2 — `clearRecentlyViewed` in `src/lib/utils/recently-viewed.ts:92`

Exported function, zero callers. **Delete. Tier 1.**

## D-3 — `loadDraft` in `src/lib/utils/swap-drafts.ts:72`

Exported function, zero callers. **Delete. Tier 1.**

## D-4 — `awardAuthorDid` in `src/lib/atproto/badges.ts:627`

Exported function, zero callers. **Delete. Tier 1.**

## D-5 — `extractYouTubeId` exported but only used internally
(`src/lib/atproto/context-attachment.ts:280`)

Internal helper that doesn't need to be exported. **Demote to a
non-export. Tier 1.**

## D-6 — `getClosureCacheVersionSnapshot` candidate

`src/lib/atproto/endorsement-closure-cache.ts:60`. Counted 3 self-only refs in
earlier grep. Verify before deletion (it's `useSyncExternalStore` style — may
be subscribed from a hook that imports it indirectly).

Verified: `grep -rn "getClosureCacheVersionSnapshot" src` → only the export.
**Delete. Tier 1.**

Actually re-checking — better wait until track time to re-verify; the
endorsement-closure cache is tied to a behavior chain that I don't want to
disrupt.

**Defer to Tier 2** — too easy to be wrong here.

## D-7 — Empty `tsconfig.tsbuildinfo` and `.next` in repo

Not src/. Out of scope.

## D-8 — Suspect: `src/lib/groups/personal-only.ts`

Has 3 importers (verified). NOT dead.

## D-9 — Suspect: `network-stats.tsx`

`src/components/landing/sections/network-stats.tsx` — 1 importer
(`landing-page.tsx`). NOT dead.

## Outcome

Tier 1: delete `use-activities.ts` (1 file), remove `clearRecentlyViewed`,
`loadDraft`, `awardAuthorDid` (3 exports), demote `extractYouTubeId` to
private. Combine into one "dead code sweep" commit.
