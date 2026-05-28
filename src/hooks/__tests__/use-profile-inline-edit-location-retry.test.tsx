import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, act, cleanup } from "@testing-library/react"

// --- Module mocks -----------------------------------------------------
// Scenario for risk-003: the save path does up to three sequential PDS
// writes (putProfile -> putLocationRecord -> putOrgMarker). We let
// putProfile + putLocationRecord resolve and make putOrgMarker reject on
// the FIRST save. The retry must NOT mint a second (orphan) location
// record: it must reuse the rkey minted by the first attempt so the
// write overwrites in place.

const putProfile = vi.fn(async () => undefined)
const uploadAvatar = vi.fn()
const uploadBanner = vi.fn()
const uploadBlob = vi.fn()

vi.mock("@/lib/atproto/profile", () => ({
  putProfile: (...args: unknown[]) => putProfile(...args),
  uploadAvatar: (...args: unknown[]) => uploadAvatar(...args),
  uploadBanner: (...args: unknown[]) => uploadBanner(...args),
  uploadBlob: (...args: unknown[]) => uploadBlob(...args),
}))

const putOrgMarker = vi.fn(async () => undefined)
vi.mock("@/lib/groups/org-marker", () => ({
  putOrgMarker: (...args: unknown[]) => putOrgMarker(...args),
}))

// putLocationRecord simulates the real own-repo behavior: without an
// rkey it MINTS a fresh TID-keyed record (createRecord); with an rkey it
// overwrites that record in place (putRecord). We mint a new rkey each
// time it's called without one so the test can detect a fresh orphan.
let locationMintCounter = 0
const LOCATION_COLLECTION = "app.certified.location"
const putLocationRecord = vi.fn(
  async (
    _ownDid: string,
    targetDid: string,
    _coords: { lat: number; lng: number },
    _name: string | null,
    options: { rkey?: string } = {},
  ) => {
    const rkey = options.rkey ?? `minted-${++locationMintCounter}`
    return { uri: `at://${targetDid}/${LOCATION_COLLECTION}/${rkey}`, cid: "c" }
  },
)

vi.mock("@/lib/atproto/location", () => ({
  putLocationRecord: (...args: unknown[]) =>
    (putLocationRecord as unknown as (...a: unknown[]) => unknown)(...args),
  readLocationStrongRef: vi.fn(async () => null),
  // Real impl extracts the rkey from at://did/coll/<rkey>. Mirror it so
  // the hook can recover an rkey both from a persisted refUri and from
  // the rkey it just minted.
  rkeyFromStrongRefUri: (uri: string) => uri.split("/").pop() ?? null,
}))

import { useProfileInlineEdit } from "../use-profile-inline-edit"
import type { CertifiedProfile } from "@/lib/atproto/types"

const baseProfile: CertifiedProfile = {
  createdAt: "2024-01-01T00:00:00.000Z",
  displayName: "Org Name",
}

function baseInput() {
  return {
    did: "did:plc:org",
    sessionDid: "did:plc:org",
    isAuthenticated: true,
    canEditInline: true,
    editTargetDid: undefined,
    sidebarIsOrg: true,
    profile: baseProfile,
    avatarUrl: null,
    bannerUrl: null,
    // First-time location add: marker has no existing location strongRef.
    orgMarker: { createdAt: "2024-01-01T00:00:00.000Z" } as never,
    refreshOrgMarker: vi.fn(),
    orgUrls: null,
    additionalUrls: [],
  }
}

beforeEach(() => {
  cleanup()
  locationMintCounter = 0
  putProfile.mockClear()
  putOrgMarker.mockReset()
  putLocationRecord.mockClear()
  uploadAvatar.mockReset()
  uploadBanner.mockReset()
  uploadBlob.mockReset()
  URL.createObjectURL = vi.fn(() => "blob:preview")
  URL.revokeObjectURL = vi.fn()
})

describe("useProfileInlineEdit — location write retry (risk-003)", () => {
  it("reuses the minted rkey on retry instead of orphaning a second location record", async () => {
    // First save: putOrgMarker rejects after the location record is minted.
    putOrgMarker.mockRejectedValueOnce(new Error("marker write failed"))
    putOrgMarker.mockResolvedValueOnce(undefined)

    const { result } = renderHook(() => useProfileInlineEdit(baseInput()))

    act(() => result.current.handleEditClick())

    // Enter a new coordinate location (first-time add, no existing ref).
    act(() => {
      result.current.handleDraftChange("locationName", "Berlin")
      result.current.handleDraftChange("locationLat", 52.52)
      result.current.handleDraftChange("locationLng", 13.405)
    })

    // First save — marker fails, so the save errors out.
    await act(async () => {
      await result.current.handleSave()
    })
    expect(result.current.saveError).toBeTruthy()
    expect(putLocationRecord).toHaveBeenCalledTimes(1)

    // The first call minted a fresh rkey (no rkey passed in).
    const firstOpts = putLocationRecord.mock.calls[0][4] as
      | { rkey?: string }
      | undefined
    expect(firstOpts?.rkey).toBeUndefined()

    // Retry — putOrgMarker succeeds this time.
    await act(async () => {
      await result.current.handleSave()
    })

    expect(putLocationRecord).toHaveBeenCalledTimes(2)
    const secondOpts = putLocationRecord.mock.calls[1][4] as
      | { rkey?: string }
      | undefined

    // CORE ASSERTION: the retry must reuse the rkey minted on the first
    // attempt (overwrite), NOT mint a brand-new orphan record.
    expect(secondOpts?.rkey).toBe("minted-1")

    // No new mint slot should have been allocated on the retry.
    expect(locationMintCounter).toBe(1)
  })
})
