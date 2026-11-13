import { describe, it, expect, vi } from "vitest"

const redirect = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`)
  }),
)
vi.mock("next/navigation", () => ({ redirect }))

describe("retired routes redirect to Records", () => {
  it("/endorsements goes to the Endorsements kind in Records", async () => {
    const { default: Page } = await import("../endorsements/page")
    await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "NEXT_REDIRECT /records?kind=endorsements",
    )
  })

  it("/endorsements keeps the tab it was opened on", async () => {
    const { default: Page } = await import("../endorsements/page")
    await expect(
      Page({ searchParams: Promise.resolve({ tab: "received" }) }),
    ).rejects.toThrow("NEXT_REDIRECT /records?kind=endorsements&tab=received")
  })

  it("/workspace goes to the Workspace Overview", async () => {
    const { default: Page } = await import("../workspace/page")
    expect(() => Page()).toThrow("NEXT_REDIRECT /home")
  })
})
