import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import type { NetworkActor } from "@/lib/atproto/workspace"
import type { EndorsementClosureAccount } from "@/lib/atproto/indexer"

// An account on /explore is the same row as an activity or a project
// (ExploreListRow), so every section has one geometry: the avatar in the
// 40px lead slot (people size), the name as the title, the description
// under it, the account's own @handle where the others show their author,
// and the joined date in the date column.

const author = vi.hoisted(() => ({
  info: null as null | {
    did: string
    handle: string
    displayName: string | null
    avatarUrl: string | null
  },
}))

vi.mock("@/hooks/use-author-info", () => ({
  useAuthorInfo: () => ({ info: author.info, isLoading: false, error: null }),
}))

import AccountListRow from "../account-list-row"

const DID = "did:plc:abcdefghijklmnop"

function actor(over: Partial<NetworkActor> = {}): NetworkActor {
  return {
    did: DID,
    displayName: "Ma Earth",
    description: "Regenerating land with local communities.",
    avatarUrl: null,
    createdAt: "2026-03-05T10:00:00.000Z",
    ...over,
  }
}

// The row measures its meta line to hide separators at wrap points;
// jsdom has no ResizeObserver.
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", NoopResizeObserver)
  author.info = { did: DID, handle: "maearth.certified.one", displayName: null, avatarUrl: null }
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("AccountListRow", () => {
  it("is the shared Explore row, with the avatar in the 40px lead slot", () => {
    const { container } = render(<AccountListRow actor={actor()} />)
    const row = container.querySelector("article.cert-list-row")
    expect(row).not.toBeNull()
    expect(row?.classList.contains("cert-list-row--compact")).toBe(false)
    const lead = container.querySelector(".cert-list-row__thumb.cert-list-row__thumb--avatar")
    const avatar = lead?.querySelector('[data-centerpiece="avatar"]')
    // Avatar size="row": the people size, 40px (h-10 w-10).
    expect(avatar?.className).toContain("h-10")
    expect(avatar?.className).toContain("w-10")
  })

  it("titles the row with the name and puts the description under it", () => {
    const { container } = render(<AccountListRow actor={actor()} />)
    expect(screen.getByRole("heading", { level: 3, name: "Ma Earth" })).toBeTruthy()
    expect(container.querySelector(".cert-list-row__meta")?.textContent).toBe(
      "Regenerating land with local communities.",
    )
  })

  it("shows the handle where the other rows show their author", () => {
    const { container } = render(<AccountListRow actor={actor()} />)
    expect(container.querySelector(".cert-list-row__author-col")?.textContent).toBe(
      "@maearth.certified.one",
    )
    // Phones drop that column; the handle moves under the name there.
    expect(container.querySelector(".cert-list-row__subtitle")?.textContent).toBe(
      "@maearth.certified.one",
    )
  })

  it("puts the joined date in the date column, labelled Joined", () => {
    const { container } = render(<AccountListRow actor={actor()} />)
    const time = container.querySelector("time.cert-list-row__time")
    expect(time?.getAttribute("dateTime")).toBe("2026-03-05T10:00:00.000Z")
    expect(time?.getAttribute("title")).toMatch(/^Joined /)
    expect(time?.querySelector(".sr-only")?.textContent).toBe("Joined ")
  })

  it("leaves the date column empty without a joined date", () => {
    const { container } = render(<AccountListRow actor={actor({ createdAt: null })} />)
    expect(container.querySelector("time")).toBeNull()
    expect(container.querySelector(".cert-list-row__time")).not.toBeNull()
  })

  it("shows the endorsement degree after the handle", () => {
    const meta: EndorsementClosureAccount = {
      did: DID,
      degree: 2,
      via: [],
      issuer: { did: DID } as EndorsementClosureAccount["issuer"],
    }
    const { container } = render(<AccountListRow actor={actor()} endorsementMeta={meta} />)
    expect(container.querySelector(".cert-list-row__author-col")?.textContent).toBe(
      "@maearth.certified.one2nd",
    )
  })

  it("falls back to the shortened DID when there is no handle", () => {
    author.info = { did: DID, handle: DID, displayName: null, avatarUrl: null }
    const { container } = render(<AccountListRow actor={actor({ description: null })} />)
    const handle = container.querySelector(".cert-list-row__handle")
    expect(handle?.classList.contains("cert-list-row__handle--did")).toBe(true)
    expect(handle?.textContent).not.toContain("@")
    expect(container.querySelector(".cert-list-row__meta")).toBeNull()
  })
})
