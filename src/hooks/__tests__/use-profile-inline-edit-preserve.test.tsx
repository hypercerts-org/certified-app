import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, act, cleanup } from "@testing-library/react"

// --- Module mocks -----------------------------------------------------
// Spy on `putProfile` to assert which record the text-only save path
// writes. The data-loss bug (judgment-006) was: an avatar/banner-LESS
// base profile fed into the hook left `base.avatar` / `base.banner`
// undefined, so the preserve branches in handleSave were dead and a
// text-only save wrote the profile record WITHOUT the existing blob
// refs — deleting them. The page fix sources the base from the RAW
// certs record (with blob refs); this suite pins that the preserve
// branches keep the refs when the base carries them, and would drop
// them when it doesn't (the old, buggy sourcing).

const putProfile = vi.fn(async (..._args: unknown[]) => undefined)
const uploadAvatar = vi.fn()
const uploadBanner = vi.fn()
const uploadBlob = vi.fn()

vi.mock("@/lib/atproto/profile", () => ({
  putProfile: (...args: unknown[]) => putProfile(...args),
  uploadAvatar: (...args: unknown[]) => uploadAvatar(...args),
  uploadBanner: (...args: unknown[]) => uploadBanner(...args),
  uploadBlob: (...args: unknown[]) => uploadBlob(...args),
}))

vi.mock("@/lib/groups/org-marker", () => ({
  putOrgMarker: vi.fn(async () => undefined),
}))

vi.mock("@/lib/atproto/location", () => ({
  putLocationRecord: vi.fn(async () => ({ uri: "at://x", cid: "c" })),
  readLocationStrongRef: vi.fn(async () => null),
  rkeyFromStrongRefUri: vi.fn(() => undefined),
}))

import { useProfileInlineEdit } from "../use-profile-inline-edit"
import type {
  CertifiedProfile,
  HypercertsSmallImage,
  HypercertsLargeImage,
} from "@/lib/atproto/types"
import type { BlobRef } from "@atproto/api"

// Pull the `$link` out of a profile avatar/banner image, regardless of
// the (loosely-typed) BlobRef shape. Used to assert which blob the save
// path persisted.
function imageLink(
  field: CertifiedProfile["avatar"] | CertifiedProfile["banner"] | undefined,
): string | undefined {
  if (!field || typeof field !== "object" || !("image" in field)) {
    return undefined
  }
  const image = (field as { image?: { ref?: { $link?: string } } }).image
  return image?.ref?.$link
}

// A profile that already carries BOTH an avatar (smallImage) and a
// banner (largeImage) blob ref — the existing record the inline-edit
// base must preserve across a text-only save.
const EXISTING_AVATAR: HypercertsSmallImage = {
  $type: "org.hypercerts.defs#smallImage",
  image: {
    $type: "blob",
    ref: { $link: "EXISTING_AVATAR_CID" },
    mimeType: "image/png",
    size: 10,
  } as unknown as BlobRef,
}

const EXISTING_BANNER: HypercertsLargeImage = {
  $type: "org.hypercerts.defs#largeImage",
  image: {
    $type: "blob",
    ref: { $link: "EXISTING_BANNER_CID" },
    mimeType: "image/png",
    size: 20,
  } as unknown as BlobRef,
}

// The RAW certs-record base (post-fix): carries the blob refs. This is
// what the page now sources via getProfileWithCid(did) for the editable
// case, instead of the avatar-less useUserProfile snapshot.
const baseWithBlobs: CertifiedProfile = {
  createdAt: "2024-01-01T00:00:00.000Z",
  displayName: "Old Name",
  description: "Old bio",
  avatar: EXISTING_AVATAR,
  banner: EXISTING_BANNER,
}

// The avatar/banner-LESS base (pre-fix behavior): the resolved
// useUserProfile snapshot has no blob refs. Used by the regression
// assertion below to pin that the OLD sourcing drops the blobs.
const baseWithoutBlobs: CertifiedProfile = {
  createdAt: "2024-01-01T00:00:00.000Z",
  displayName: "Old Name",
  description: "Old bio",
}

function inputFor(profile: CertifiedProfile) {
  return {
    did: "did:plc:viewer",
    sessionDid: "did:plc:viewer",
    isAuthenticated: true,
    canEditInline: true,
    editTargetDid: undefined,
    sidebarIsOrg: false,
    profile,
    profileCid: "bafyProfileCid",
    avatarUrl: "https://cdn/old-avatar.png",
    bannerUrl: "https://cdn/old-banner.png",
    orgMarker: null,
    refreshOrgMarker: vi.fn(),
    orgUrls: null,
    additionalUrls: [],
  }
}

beforeEach(() => {
  cleanup()
  putProfile.mockClear()
  uploadAvatar.mockReset()
  uploadBanner.mockReset()
  uploadBlob.mockReset()
  // jsdom lacks createObjectURL/revokeObjectURL — stub them so the
  // synchronous preview-URL bookkeeping in the hook doesn't throw.
  URL.createObjectURL = vi.fn(() => "blob:preview")
  URL.revokeObjectURL = vi.fn()
})

describe("useProfileInlineEdit — text-only save preserves existing avatar/banner", () => {
  it("keeps the existing avatar AND banner blob refs when the base carries them and no new image is uploaded", async () => {
    const { result } = renderHook(() =>
      useProfileInlineEdit(inputFor(baseWithBlobs)),
    )

    act(() => result.current.handleEditClick())

    // Text-only edit: change the display name; do NOT pick a new
    // avatar or banner.
    act(() => result.current.handleDraftChange("displayName", "New Name"))

    await act(async () => {
      await result.current.handleSave()
    })

    expect(putProfile).toHaveBeenCalledTimes(1)
    const next = putProfile.mock.calls[0][1] as CertifiedProfile
    // The edited text field is written...
    expect(next.displayName).toBe("New Name")
    // ...and crucially the existing avatar + banner blob refs survive.
    expect(imageLink(next.avatar)).toBe("EXISTING_AVATAR_CID")
    expect(imageLink(next.banner)).toBe("EXISTING_BANNER_CID")
  })

  it("threads the mount-time profile CID as the swapRecord precondition", async () => {
    const { result } = renderHook(() =>
      useProfileInlineEdit(inputFor(baseWithBlobs)),
    )

    act(() => result.current.handleEditClick())
    act(() => result.current.handleDraftChange("displayName", "New Name"))

    await act(async () => {
      await result.current.handleSave()
    })

    expect(putProfile).toHaveBeenCalledTimes(1)
    const opts = putProfile.mock.calls[0][2] as
      | { targetDid?: string; swapRecord?: string }
      | undefined
    expect(opts?.swapRecord).toBe("bafyProfileCid")
  })

  it("regression: an avatar/banner-LESS base (the old sourcing) would DROP both blobs on a text-only save", async () => {
    // This pins WHY the page must source the base from the raw certs
    // record. With the avatar-less useUserProfile snapshot, the preserve
    // branches in handleSave have nothing to copy, so the written record
    // loses the existing avatar/banner — the data-loss bug.
    const { result } = renderHook(() =>
      useProfileInlineEdit(inputFor(baseWithoutBlobs)),
    )

    act(() => result.current.handleEditClick())
    act(() => result.current.handleDraftChange("displayName", "New Name"))

    await act(async () => {
      await result.current.handleSave()
    })

    expect(putProfile).toHaveBeenCalledTimes(1)
    const next = putProfile.mock.calls[0][1] as CertifiedProfile
    expect(next.displayName).toBe("New Name")
    expect(imageLink(next.avatar)).toBeUndefined()
    expect(imageLink(next.banner)).toBeUndefined()
  })
})
