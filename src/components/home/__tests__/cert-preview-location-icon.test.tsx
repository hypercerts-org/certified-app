import { describe, it, expect, afterEach } from "vitest"
import { render, screen, cleanup, within } from "@testing-library/react"

import { CertPreview } from "../home-feed-rows"
import type { ActivityHomeFeedView } from "@/hooks/use-home-feed"

// bug-010: the feed PreviewCard's MapPin was gated on
// `i === 0 && withLocationIcon && i === meta.length - 1`, which is only
// satisfiable when the locations entry is the *only* meta item. A cert
// with both a date period and locations builds meta = [period, "N
// locations"], so the pin rendered nowhere. The fix pushes a ReactNode
// `<><MapPin/> N locations</>` meta entry so the icon travels with the
// locations text regardless of how many other meta items exist.

const URI = "at://did:plc:abc/org.hypercerts.claim.activity/cert1"

afterEach(() => {
  cleanup()
})

describe("CertPreview location MapPin", () => {
  it("renders a MapPin next to the locations entry even when a period is also present", () => {
    const view = {
      title: "Reforestation effort",
      shortDescription: "Planting trees",
      imageUrl: null,
      startDate: "2025-01-15T00:00:00.000Z",
      endDate: "2025-03-20T00:00:00.000Z",
      locationCount: 3,
    } satisfies ActivityHomeFeedView

    render(<CertPreview view={view} uri={URI} />)

    // The locations text still renders.
    const locationsItem = screen.getByText(/3 locations/).closest("span")
    expect(locationsItem).not.toBeNull()

    // A MapPin svg must sit inside the same meta item as the locations
    // text — not somewhere else, and not nowhere.
    const svg = within(locationsItem as HTMLElement).queryByRole(
      "img",
      { hidden: true },
    ) as SVGElement | null
    // lucide icons render as <svg class="lucide lucide-map-pin">.
    const pin = (locationsItem as HTMLElement).querySelector("svg")
    expect(pin).not.toBeNull()
    expect(pin?.classList.toString()).toMatch(/map-pin/)
    // svg lookup above is just a sanity reference; the querySelector is
    // the authoritative assertion.
    void svg
  })
})
