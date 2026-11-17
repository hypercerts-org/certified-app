import { describe, it, expect, vi, beforeEach } from "vitest"

// `/explore?show=funding` (the retired Funding tab) lands on Network →
// Funding, the one place for receipts; every other link renders Explore.

const redirect = vi.hoisted(() => vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT ${url}`)
}))

vi.mock("next/navigation", () => ({ redirect }))
vi.mock("@/components/explore-page/explore", () => ({ default: () => null }))

import ExplorePage from "../page"

beforeEach(() => {
  redirect.mockClear()
})

describe("/explore", () => {
  it("sends the old Funding tab to /funding", async () => {
    await expect(
      ExplorePage({ searchParams: Promise.resolve({ show: "funding" }) }),
    ).rejects.toThrow("NEXT_REDIRECT /funding")
    expect(redirect).toHaveBeenCalledWith("/funding")
  })

  it("renders Explore for any other type", async () => {
    const el = await ExplorePage({
      searchParams: Promise.resolve({ show: "projects" }),
    })
    expect(el).toBeTruthy()
    expect(redirect).not.toHaveBeenCalled()
  })
})
