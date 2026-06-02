import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { useState } from "react"
import { render, cleanup, fireEvent, waitFor } from "@testing-library/react"

import BannerUpload from "../banner-upload"

// quality-056-profile-edit-5: BannerUpload's pending/preview state must
// not desync from the displayed image. In the inline-edit flow the parent
// owns the authoritative banner URL (effectiveBannerUrl): on pick it
// promotes a preview, on Remove it clears to null. The component's
// displayed image and "Replace/Change" label must follow that parent
// truth — after Remove, no image should render and the label must reset
// to "Change banner" rather than pinning the stale picked preview.

beforeEach(() => {
  cleanup()
  // jsdom doesn't implement object URLs — stub so the preview logic runs.
  URL.createObjectURL = vi.fn(() => "blob:banner-preview-url")
  URL.revokeObjectURL = vi.fn()
})

afterEach(() => {
  cleanup()
})

// Minimal parent mirroring use-profile-inline-edit: it owns the banner
// URL, promotes a preview on pick (onUpload), and clears it on Remove.
function InlineEditHarness() {
  const [bannerUrl, setBannerUrl] = useState<string | null>(null)
  return (
    <BannerUpload
      currentBannerUrl={bannerUrl}
      onUpload={async () => {
        setBannerUrl("blob:parent-preview-url")
      }}
      onRemove={() => setBannerUrl(null)}
      isUploading={false}
    />
  )
}

describe("BannerUpload pending/preview desync", () => {
  it("clears preview + resets label when the parent removes the banner", async () => {
    const { container } = render(<InlineEditHarness />)

    const input = container.querySelector(
      "input.profile-banner-upload__input",
    ) as HTMLInputElement

    // Pick a file -> preview kicks in, label flips to "Replace".
    const file = new File(["x"], "banner.png", { type: "image/png" })
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      const img = container.querySelector("img.profile-banner-upload__img")
      expect(img).toBeTruthy()
    })
    await waitFor(() => {
      expect(container.textContent).toContain("Replace banner")
    })

    // Parent removes the banner: onRemove fires, currentBannerUrl -> null.
    // The component must show NO image (not the stale preview) and the
    // label must read "Change banner" again.
    const removeBtn = container.querySelector(
      'button[aria-label="Remove banner"]',
    ) as HTMLButtonElement
    expect(removeBtn).toBeTruthy()
    fireEvent.click(removeBtn)

    await waitFor(() => {
      const img = container.querySelector("img.profile-banner-upload__img")
      expect(img).toBeNull()
    })
    expect(container.textContent).toContain("Change banner")
    expect(container.textContent).not.toContain("Replace banner")
  })
})
