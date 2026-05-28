import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, act, cleanup } from "@testing-library/react"

// --- Module mocks -----------------------------------------------------
// We control `uploadAvatar` resolution per test (never-resolving for the
// in-flight case) and spy on `putProfile` to assert what the save path
// writes. Everything else the hook imports is stubbed to inert no-ops so
// the hook can mount under jsdom.

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

vi.mock("@/lib/groups/org-marker", () => ({
  putOrgMarker: vi.fn(async () => undefined),
}))

vi.mock("@/lib/atproto/location", () => ({
  putLocationRecord: vi.fn(async () => ({ uri: "at://x", cid: "c" })),
  readLocationStrongRef: vi.fn(async () => null),
  rkeyFromStrongRefUri: vi.fn(() => undefined),
}))

import { useProfileInlineEdit } from "../use-profile-inline-edit"
import type { CertifiedProfile } from "@/lib/atproto/types"
import type { BlobRef } from "@atproto/api"

// Pull the `$link` out of a profile avatar/banner image, regardless of
// the (loosely-typed) BlobRef shape. Used to assert which blob the save
// path persisted.
function avatarLink(profile: CertifiedProfile | undefined): string | undefined {
  const avatar = profile?.avatar
  if (!avatar || typeof avatar !== "object" || !("image" in avatar)) {
    return undefined
  }
  const image = avatar.image as { ref?: { $link?: string } }
  return image?.ref?.$link
}

// A profile that already has an avatar — the "stale base" the bug used to
// re-persist when Save ran during an in-flight upload.
const STALE_AVATAR: CertifiedProfile["avatar"] = {
  $type: "org.hypercerts.defs#smallImage",
  image: {
    $type: "blob",
    ref: { $link: "OLD_AVATAR" },
    mimeType: "image/png",
    size: 1,
  } as unknown as BlobRef,
}

const baseProfile: CertifiedProfile = {
  createdAt: "2024-01-01T00:00:00.000Z",
  displayName: "Old Name",
  avatar: STALE_AVATAR,
}

function baseInput() {
  return {
    did: "did:plc:viewer",
    sessionDid: "did:plc:viewer",
    isAuthenticated: true,
    canEditInline: true,
    editTargetDid: undefined,
    sidebarIsOrg: false,
    profile: baseProfile,
    avatarUrl: "https://cdn/old-avatar.png",
    bannerUrl: null,
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

describe("useProfileInlineEdit — Save during in-flight avatar upload", () => {
  it("does not persist the stale base.avatar while the upload is still pending", async () => {
    // uploadAvatar never resolves — simulates a slow/in-flight upload.
    uploadAvatar.mockReturnValue(new Promise<never>(() => {}))

    const { result } = renderHook(() => useProfileInlineEdit(baseInput()))

    act(() => result.current.handleEditClick())

    // Pick a new avatar; the upload promise is now in flight (unresolved).
    act(() => {
      void result.current.handleAvatarFile(
        new File(["x"], "new.png", { type: "image/png" }),
      )
    })

    // User hits Save before the upload resolves.
    let saveSettled = false
    act(() => {
      void result.current.handleSave().then(() => {
        saveSettled = true
      })
    })

    // Give microtasks a chance to flush.
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    // The save must NOT have written the stale avatar: either Save is
    // blocked entirely, or it awaits the still-pending upload. Crucially,
    // putProfile must never run with `base.avatar` (the OLD blob).
    const wroteStaleAvatar = putProfile.mock.calls.some(
      (call) => avatarLink(call[1] as CertifiedProfile | undefined) === "OLD_AVATAR",
    )
    expect(wroteStaleAvatar).toBe(false)
    // Since the upload never resolves, the save cannot complete.
    expect(saveSettled).toBe(false)
  })

  it("persists the freshly uploaded avatar (not the stale one) once the upload resolves", async () => {
    const freshBlob = {
      $type: "blob" as const,
      ref: { $link: "NEW_AVATAR" },
      mimeType: "image/png",
      size: 2,
    }
    uploadAvatar.mockResolvedValue(freshBlob)

    const { result } = renderHook(() => useProfileInlineEdit(baseInput()))

    act(() => result.current.handleEditClick())

    await act(async () => {
      await result.current.handleAvatarFile(
        new File(["x"], "new.png", { type: "image/png" }),
      )
    })

    await act(async () => {
      await result.current.handleSave()
    })

    expect(putProfile).toHaveBeenCalledTimes(1)
    const next = putProfile.mock.calls[0][1] as CertifiedProfile
    expect(avatarLink(next)).toBe("NEW_AVATAR")
  })
})
