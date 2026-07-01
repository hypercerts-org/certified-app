import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react"

// --- Module mocks -----------------------------------------------------
// CreatePage pulls in auth/org contexts, next/navigation, navbar title,
// author info, and the blob uploader. Stub everything that isn't under
// test so the authenticated form mounts, then drive the image picker.

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({ did: "did:plc:me", isAuthenticated: true, isLoading: false }),
}))

vi.mock("@/lib/groups/org-context", () => ({
  useOrg: () => ({ activeOrg: null }),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock("@/lib/navbar-context", () => ({
  usePageTitle: () => {},
}))

vi.mock("@/hooks/use-author-info", () => ({
  useAuthorInfo: () => ({ info: null }),
}))

// The cert create page reads the onboarding tour state; the test renders it
// outside a TourProvider, so stub the hook to an inactive tour.
vi.mock("@/lib/tour/tour-context", () => ({
  useTour: () => ({ isActive: false }),
}))

// authFetch is used for the rights dropdown load — keep it inert so the
// effect resolves to an empty list without a real network call.
vi.mock("@/lib/auth/fetch", () => ({
  authFetch: vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ records: [] }),
  }),
}))

// The unit under test: uploadBlob rejects, simulating a failed blob
// write. The page must surface the error and clear the dangling preview.
const uploadBlob = vi.fn()
vi.mock("@/lib/atproto/profile", () => ({
  uploadBlob: (...args: unknown[]) => uploadBlob(...args),
}))

import CreatePage from "../create/page"

beforeEach(() => {
  cleanup()
  uploadBlob.mockReset()
  // jsdom doesn't implement object URLs — stub so the preview logic runs.
  URL.createObjectURL = vi.fn(() => "blob:preview-url")
  URL.revokeObjectURL = vi.fn()
})

afterEach(() => {
  cleanup()
})

describe("CreatePage image upload failure", () => {
  it("surfaces an error and clears the preview when uploadBlob rejects", async () => {
    uploadBlob.mockRejectedValue(new Error("blob write failed"))

    const { container } = render(<CreatePage />)

    const input = container.querySelector(
      "input.image-edit-overlay__input",
    ) as HTMLInputElement
    expect(input).toBeTruthy()

    const file = new File(["x"], "hero.png", { type: "image/png" })
    fireEvent.change(input, { target: { files: [file] } })

    // The error message surfaces in the page's role="alert" region.
    expect(await screen.findByText("blob write failed")).toBeTruthy()

    // The optimistic preview must be cleared — no <img> left behind that
    // would let the user publish a cert without the previewed image.
    await waitFor(() => {
      expect(
        container.querySelector("img.cert-detail__image-img"),
      ).toBeNull()
    })
  })
})
