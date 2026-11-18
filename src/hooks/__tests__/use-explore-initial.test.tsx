import { describe, it, expect, vi } from "vitest"
import { renderHook } from "@testing-library/react"

// Explore's lists start loading: the server render and the first paint
// show skeletons, never "No activities yet" before the fetch has begun.

// Stable values: the loader refetches when its inputs change identity.
const stable = vi.hoisted(() => ({ groups: [], subjects: [] }))
vi.mock("@/lib/auth/auth-context", () => ({ useAuth: () => ({ did: null }) }))
vi.mock("@/lib/groups/org-context", () => ({ useOrg: () => ({ groups: stable.groups }) }))
vi.mock("@/lib/groups/viewer", () => ({ useActingViewer: () => ({ viewer: null, viewerDid: null }) }))
vi.mock("@/hooks/use-following", () => ({ useFollowing: () => ({ subjects: stable.subjects }) }))
vi.mock("@/hooks/use-explore-loaders", () => ({
  PAGE_SIZE: 50,
  // Never settles: what the page looks like before the first page arrives.
  loadPage: () => new Promise(() => {}),
}))

import { useExploreData } from "../use-explore"

describe("useExploreData", () => {
  it("is loading from the first render, before its fetch has run", () => {
    // Every render's value, the first one being what the server renders.
    const seen: boolean[] = []
    const { result } = renderHook(() => {
      const data = useExploreData({ kind: "activities", filter: "all", sub: "all", search: "" })
      seen.push(data.isLoading)
      return data
    })
    expect(seen[0]).toBe(true)
    expect(seen.every(Boolean)).toBe(true)
    expect(result.current.certs).toEqual([])
    expect(result.current.error).toBe(false)
  })
})
