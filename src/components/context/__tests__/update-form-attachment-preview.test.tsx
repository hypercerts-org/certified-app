import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from "@testing-library/react"

// --- Module mocks -----------------------------------------------------
// UpdateForm pulls in the router and the ~9.7MB TipTap editor bundle.
// Stub both; neither participates in attachment thumbnailing.

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock("@/components/leaflet/leaflet-editor-dynamic", () => ({
  default: () => <div data-testid="leaflet-editor" />,
}))

vi.mock("@/hooks/use-context-updates", () => ({
  invalidateContextUpdates: vi.fn(),
}))

// Only `uploadBlob` is stubbed — `buildAvatarUrlFromCid` stays real so the
// test asserts against the actual getBlob proxy URL the app would emit.
const uploadBlob = vi.fn()
vi.mock("@/lib/atproto/profile", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/atproto/profile")>()
  return {
    ...actual,
    uploadBlob: (...args: unknown[]) => uploadBlob(...args),
  }
})

import UpdateForm from "../update-form"
import { ATTACHMENT_BLOB_TYPE } from "@/lib/atproto/context-attachment"

const OWN_DID = "did:plc:me"
const SUBJECT_URI = "at://did:plc:me/org.hypercerts.activity/abc"
const IMAGE_CID = "bafkreiimagecid"

const baseProps = {
  ownDid: OWN_DID,
  targetDid: OWN_DID,
  subjectUri: SUBJECT_URI,
  subjectCid: "bafysubjectcid",
  backHref: "/back",
} as const

/** The `<img>` inside the attachment chip list. */
function attachmentThumb(container: HTMLElement): HTMLImageElement | null {
  return container.querySelector("ul img")
}

beforeEach(() => {
  cleanup()
  uploadBlob.mockReset()
  // jsdom implements neither half of the object-URL API.
  URL.createObjectURL = vi.fn(() => "blob:local-preview")
  URL.revokeObjectURL = vi.fn()
})

afterEach(() => {
  cleanup()
})

describe("UpdateForm attachment thumbnails", () => {
  it("previews a freshly uploaded image from the local file, not getBlob", async () => {
    // A PDS won't serve this blob through getBlob until the update
    // record referencing it is saved, so the pre-save thumbnail has to
    // come from the File the user just picked.
    uploadBlob.mockResolvedValue({
      $type: "blob",
      ref: { $link: IMAGE_CID },
      mimeType: "image/png",
      size: 1234,
    })

    const { container } = render(<UpdateForm {...baseProps} mode="create" />)

    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement
    const file = new File(["x"], "shot.png", { type: "image/png" })
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => expect(attachmentThumb(container)).toBeTruthy())

    expect(attachmentThumb(container)?.getAttribute("src")).toBe(
      "blob:local-preview",
    )
    expect(URL.createObjectURL).toHaveBeenCalledWith(file)
  })

  it("resolves the map[$link:...] ref form to the same preview key", async () => {
    // `extractContentBlobCid` unwraps this stringified ref shape, so the
    // preview must be keyed off the resolved CID rather than
    // `blob.ref.$link` (which is undefined here).
    uploadBlob.mockResolvedValue({
      $type: "blob",
      ref: `map[$link:${IMAGE_CID}]`,
      mimeType: "image/png",
      size: 1234,
    })

    const { container } = render(<UpdateForm {...baseProps} mode="create" />)

    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement
    fireEvent.change(input, {
      target: { files: [new File(["x"], "shot.png", { type: "image/png" })] },
    })

    await waitFor(() => expect(attachmentThumb(container)).toBeTruthy())
    expect(attachmentThumb(container)?.getAttribute("src")).toBe(
      "blob:local-preview",
    )
  })

  it("uses the getBlob proxy for attachments the saved record already references", () => {
    const { container } = render(
      <UpdateForm
        {...baseProps}
        mode="edit"
        rkey="rkey1"
        initialCid="bafyrecordcid"
        initialValue={{
          title: "Existing",
          contentType: "update",
          content: [
            {
              $type: ATTACHMENT_BLOB_TYPE,
              blob: {
                $type: "blob",
                ref: { $link: IMAGE_CID },
                mimeType: "image/png",
                size: 1234,
              },
            },
          ],
        }}
      />,
    )

    expect(attachmentThumb(container)?.getAttribute("src")).toBe(
      `/api/xrpc/com/atproto/sync/getBlob?did=${encodeURIComponent(
        OWN_DID,
      )}&cid=${IMAGE_CID}`,
    )
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })

  it("leaves non-image attachments on the file label, with no object URL", async () => {
    uploadBlob.mockResolvedValue({
      $type: "blob",
      ref: { $link: "bafkreipdfcid" },
      mimeType: "application/pdf",
      size: 2048,
    })

    const { container } = render(<UpdateForm {...baseProps} mode="create" />)

    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement
    fireEvent.change(input, {
      target: {
        files: [new File(["x"], "doc.pdf", { type: "application/pdf" })],
      },
    })

    expect(await screen.findByText("PDF")).toBeTruthy()
    expect(attachmentThumb(container)).toBeNull()
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })

  it("revokes the session's object URLs on unmount", async () => {
    uploadBlob.mockResolvedValue({
      $type: "blob",
      ref: { $link: IMAGE_CID },
      mimeType: "image/png",
      size: 1234,
    })

    const { container, unmount } = render(
      <UpdateForm {...baseProps} mode="create" />,
    )

    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement
    fireEvent.change(input, {
      target: { files: [new File(["x"], "shot.png", { type: "image/png" })] },
    })

    await waitFor(() => expect(attachmentThumb(container)).toBeTruthy())

    unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:local-preview")
  })
})
