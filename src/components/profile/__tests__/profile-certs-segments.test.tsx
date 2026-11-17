import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import type { ActivityRecord } from "@/lib/atproto/activity-types"

/**
 * The Activities tab's Created / Contributed to segments: a visitor isn't
 * shown a list known to be empty ("Contributed to 0"), and with one list
 * left there are no segments. The account itself keeps both.
 */

let data: {
  created: ActivityRecord[]
  contributed: ActivityRecord[]
  isLoading: boolean
  error: string | null
}
vi.mock("@/hooks/use-user-indexer-activities", () => ({
  useUserIndexerActivities: () => ({
    ...data,
    dids: new Map(),
    isLoadingMore: false,
    hasMore: false,
    loadMore: vi.fn(),
    refetch: vi.fn(),
  }),
}))
vi.mock("@/hooks/use-managed-authors", () => ({ useManagedAuthors: () => ({ authors: [] }) }))
vi.mock("@/hooks/use-author-info", () => ({
  useAuthorInfo: () => ({ info: null, isLoading: false, error: null, failed: false, retry: vi.fn() }),
}))

import ProfileCerts from "../profile-certs"

function activity(n: number, did = "did:plc:me"): ActivityRecord {
  return {
    uri: `at://${did}/org.hypercerts.claim.activity/rk${n}`,
    cid: `cid${n}`,
    value: { title: `Activity ${n}`, createdAt: `2026-05-0${n}T00:00:00.000Z` },
  } as unknown as ActivityRecord
}

beforeEach(() => {
  data = { created: [activity(1)], contributed: [], isLoading: false, error: null }
})

afterEach(() => {
  cleanup()
})

describe("ProfileCerts segments", () => {
  it("shows a visitor no segments when nothing was contributed to", () => {
    render(<ProfileCerts did="did:plc:me" />)
    expect(screen.queryByRole("tablist")).toBeNull()
    expect(screen.queryByText("Contributed to")).toBeNull()
    expect(screen.getByText("Activity 1")).toBeTruthy()
  })

  it("shows a visitor only the contributions, named, when nothing was created", () => {
    data = { ...data, created: [], contributed: [activity(2, "did:plc:other")] }
    render(<ProfileCerts did="did:plc:me" />)
    expect(screen.queryByRole("tablist")).toBeNull()
    expect(screen.getByRole("heading", { name: "Contributed to" })).toBeTruthy()
    expect(screen.getByText("Activity 2")).toBeTruthy()
  })

  it("keeps both segments when both have something", () => {
    data = { ...data, contributed: [activity(2, "did:plc:other")] }
    render(<ProfileCerts did="did:plc:me" />)
    expect(screen.getByRole("tab", { name: /Created/ })).toBeTruthy()
    expect(screen.getByRole("tab", { name: /Contributed to/ })).toBeTruthy()
  })

  it("keeps both segments while loading", () => {
    data = { created: [], contributed: [], isLoading: true, error: null }
    render(<ProfileCerts did="did:plc:me" />)
    expect(screen.getByRole("tablist")).toBeTruthy()
  })

  it("keeps both segments for the account itself", () => {
    render(<ProfileCerts did="did:plc:me" viewerIsOwner />)
    expect(screen.getByRole("tab", { name: /Contributed to/ })).toBeTruthy()
  })
})
