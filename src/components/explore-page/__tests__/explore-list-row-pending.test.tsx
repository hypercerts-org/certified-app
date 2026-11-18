import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import { render, cleanup, renderHook } from "@testing-library/react"

// While a row's owner is looked up, its "by <owner>" line is held by a
// blank line of the same height, so the row doesn't grow 19px when the
// name arrives (phones show the line; desktop has its author column).

const author = vi.hoisted(() => ({
  info: null as null | { did: string; handle: string; displayName: string | null; avatarUrl: string | null },
}))

vi.mock("@/hooks/use-author-info", () => ({
  useAuthorInfo: () => ({ info: author.info, isLoading: !author.info, error: null }),
}))

vi.mock("@/components/feed/activity-author", () => ({
  default: () => null,
}))

import ExploreListRow from "../explore-list-row"
import { OWNER_BYLINE_PENDING, useOwnerByline } from "../use-owner-byline"

const DID = "did:plc:ownerownerowner"

class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", NoopResizeObserver)
  author.info = null
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("useOwnerByline", () => {
  it("is pending (an empty line) while the owner is looked up", () => {
    const { result } = renderHook(() => useOwnerByline(DID))
    expect(result.current).toBe(OWNER_BYLINE_PENDING)
  })

  it("is null without a DID", () => {
    const { result } = renderHook(() => useOwnerByline(null))
    expect(result.current).toBeNull()
  })

  it("names the owner once known, and is null for an account without a name", () => {
    author.info = { did: DID, handle: "estuary.certified.app", displayName: "Estuary Alliance", avatarUrl: null }
    expect(renderHook(() => useOwnerByline(DID)).result.current).toBe("by Estuary Alliance")
    author.info = { did: DID, handle: "12gkq0.certified.one", displayName: null, avatarUrl: null }
    expect(renderHook(() => useOwnerByline(DID)).result.current).toBeNull()
  })
})

describe("ExploreListRow subtitle", () => {
  const base = {
    href: "/x",
    title: "Mangrove nursery",
    metaItems: [],
    timestampIso: null,
  }

  it("holds the line with a blank, hidden from assistive tech, while pending", () => {
    const { container } = render(<ExploreListRow {...base} subtitle={OWNER_BYLINE_PENDING} />)
    const line = container.querySelector(".cert-list-row__subtitle")
    expect(line).not.toBeNull()
    expect(line).toHaveAttribute("aria-hidden", "true")
    expect(line?.textContent).toBe(" ")
  })

  it("renders the owner line once known, and no line for null", () => {
    const { container, rerender } = render(<ExploreListRow {...base} subtitle="by Estuary Alliance" />)
    expect(container.querySelector(".cert-list-row__subtitle")?.textContent).toBe("by Estuary Alliance")
    expect(container.querySelector(".cert-list-row__subtitle")).not.toHaveAttribute("aria-hidden")
    rerender(<ExploreListRow {...base} subtitle={null} />)
    expect(container.querySelector(".cert-list-row__subtitle")).toBeNull()
  })
})
