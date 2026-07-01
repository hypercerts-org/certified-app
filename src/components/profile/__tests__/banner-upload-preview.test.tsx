import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, cleanup, fireEvent, waitFor } from "@testing-library/react"

import BannerUpload from "../banner-upload"

// bug-009: BannerUpload must self-preview the picked file (like
// AvatarUpload) so the user sees the banner they just chose, rather
// than the stale saved banner. The picked file's object URL should
// drive the rendered <img src> immediately on change.

beforeEach(() => {
  cleanup()
  // jsdom doesn't implement object URLs — stub so the preview logic runs.
  URL.createObjectURL = vi.fn(() => "blob:banner-preview-url")
  URL.revokeObjectURL = vi.fn()
})

afterEach(() => {
  cleanup()
})

describe("BannerUpload live preview", () => {
  it("renders the picked file's object URL as the img src", async () => {
    const onUpload = vi.fn().mockResolvedValue(undefined)

    const { container } = render(
      <BannerUpload
        currentBannerUrl={null}
        onUpload={onUpload}
        isUploading={false}
      />,
    )

    const input = container.querySelector(
      "input.profile-banner-upload__input",
    ) as HTMLInputElement
    expect(input).toBeTruthy()

    const file = new File(["x"], "banner.png", { type: "image/png" })
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      const img = container.querySelector(
        "img.profile-banner-upload__img",
      ) as HTMLImageElement | null
      expect(img).toBeTruthy()
      expect(img!.getAttribute("src")).toBe("blob:banner-preview-url")
    })

    expect(URL.createObjectURL).toHaveBeenCalledWith(file)
  })
})
