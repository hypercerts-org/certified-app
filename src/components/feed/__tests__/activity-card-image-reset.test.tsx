import { describe, it, expect, afterEach } from "vitest"
import { render, cleanup, fireEvent } from "@testing-library/react"

import ActivityCard from "../activity-card"
import type { ActivityRecord } from "@/lib/atproto/activity-types"

// quality-052 (feed-img-state-1): ActivityCard tracks image-load failure
// in `imageFailed` state but only ever sets it true. A reused instance
// whose `imageUrl` changes (record mutated in place, no remount) keeps
// showing the placeholder forever. ActivityDetail already resets the
// flag with `useEffect(() => setImageFailed(false), [baseImageUrl])`;
// ActivityCard must do the same so a new URL retries the image.

function makeRecord(imageUrl: string): ActivityRecord {
  return {
    uri: "at://did:plc:test/org.hypercerts.claim.activity/abc",
    cid: "bafytestcid",
    value: {
      title: "Test cert",
      shortDescription: "",
      createdAt: "2026-01-01T00:00:00.000Z",
      // A plain-string image resolves directly to itself as the URL.
      image: imageUrl as unknown as never,
    },
  }
}

afterEach(() => {
  cleanup()
})

describe("ActivityCard image-failure reset on imageUrl change", () => {
  it("retries the image when imageUrl changes after a prior load failure", () => {
    // did="" so ActivityAuthor (a network hook) is skipped.
    const { container, rerender } = render(
      <ActivityCard record={makeRecord("https://cdn.example/a.png")} did="" />,
    )

    const firstImg = container.querySelector(
      "img.feed-card__image",
    ) as HTMLImageElement | null
    expect(firstImg).toBeTruthy()
    expect(firstImg!.getAttribute("src")).toBe("https://cdn.example/a.png")

    // The first image fails to load → component falls back to the placeholder.
    fireEvent.error(firstImg!)
    expect(container.querySelector("img.feed-card__image")).toBeNull()
    expect(
      container.querySelector(".feed-card__image-wrap--placeholder"),
    ).toBeTruthy()

    // The same instance is reused with a new image URL (no remount).
    rerender(
      <ActivityCard record={makeRecord("https://cdn.example/b.png")} did="" />,
    )

    // The new URL must be retried: the <img> reappears with the new src.
    const retriedImg = container.querySelector(
      "img.feed-card__image",
    ) as HTMLImageElement | null
    expect(retriedImg).toBeTruthy()
    expect(retriedImg!.getAttribute("src")).toBe("https://cdn.example/b.png")
  })
})
