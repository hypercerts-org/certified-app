import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react"

/**
 * The record byline and "Who's behind it" when looking the account up
 * fails (a 429): unknown is not "an account without a name" and never a
 * person's circle for an account whose kind isn't known.
 */

interface AuthorMock {
  info: { did: string; handle: string; displayName: string | null; avatarUrl: string | null; description?: string | null } | null
  isLoading: boolean
  failed: boolean
  retry: () => void
}
let author: AuthorMock
vi.mock("@/hooks/use-author-info", () => ({
  useAuthorInfo: () => ({ ...author, error: author.failed ? "Couldn't load this account." : null }),
}))

interface MarkerMock {
  isOrg: boolean
  marker: { longDescription?: unknown } | null
  isLoading: boolean
  answeredFor: string | null
  failed: boolean
  refresh: () => void
}
let marker: MarkerMock
vi.mock("@/hooks/use-org-marker", () => ({
  useOrgMarker: () => marker,
}))

import { RecordByline, RecordOwnerCard } from "../cert-detail-parts"

const DID = "did:plc:owner"
const ada = { did: DID, handle: "ada.test", displayName: "Ada", avatarUrl: null, description: "Plants trees." }

beforeEach(() => {
  author = { info: ada, isLoading: false, failed: false, retry: vi.fn() }
  marker = { isOrg: false, marker: null, isLoading: false, answeredFor: DID, failed: false, refresh: vi.fn() }
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("RecordByline", () => {
  it("names the account, with a person's circle once the kind is known", () => {
    const { container } = render(<RecordByline did={DID} period="2026" place={null} />)
    expect(screen.getByRole("link", { name: "Ada" })).toBeTruthy()
    expect(container.querySelector('[data-shape="circle"]')).toBeTruthy()
  })

  it("draws a group's square avatar", () => {
    marker = { ...marker, isOrg: true }
    const { container } = render(<RecordByline did={DID} />)
    expect(container.querySelector('[data-shape="square"]')).toBeTruthy()
  })

  it("holds a neutral block, not a person's circle, while the kind is unknown", () => {
    marker = { ...marker, isLoading: true, answeredFor: null }
    const { container } = render(<RecordByline did={DID} />)
    expect(screen.getByRole("link", { name: "Ada" })).toBeTruthy()
    expect(container.querySelector("[data-shape]")).toBeNull()
  })

  it("keeps the neutral block when the organization record can't be read, and retries it", () => {
    vi.useFakeTimers()
    marker = { ...marker, failed: true }
    const { container } = render(<RecordByline did={DID} />)
    expect(container.querySelector("[data-shape]")).toBeNull()
    act(() => {
      vi.advanceTimersByTime(1_500)
    })
    expect(marker.refresh).toHaveBeenCalledTimes(1)
  })

  it("says the account couldn't be loaded, with Try again, instead of an unnamed account", () => {
    author = { ...author, info: { ...ada, handle: DID, displayName: null }, failed: true }
    render(<RecordByline did={DID} period="2026" />)
    expect(screen.getByText("Couldn't load this account.")).toBeTruthy()
    expect(screen.queryByText("Unnamed account")).toBeNull()
    expect(screen.queryByText("?")).toBeNull()
    // The rest of the byline stays.
    expect(screen.getByText("2026")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(author.retry).toHaveBeenCalled()
  })
})

describe("RecordOwnerCard", () => {
  it("shows the account in its own words", () => {
    render(<RecordOwnerCard did={DID} />)
    expect(screen.getByText("Plants trees.")).toBeTruthy()
    expect(screen.getByRole("link", { name: "View profile" })).toBeTruthy()
  })

  it("says the account couldn't be loaded, with Try again", () => {
    author = { ...author, info: null, failed: true }
    render(<RecordOwnerCard did={DID} />)
    expect(screen.getByRole("heading", { name: "Who's behind it" })).toBeTruthy()
    expect(screen.getByText("Couldn't load this account.")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(author.retry).toHaveBeenCalled()
  })

  it("doesn't vanish when, without a bio, the organization record couldn't be read", () => {
    vi.useFakeTimers()
    author = { ...author, info: { ...ada, description: null } }
    marker = { ...marker, failed: true }
    render(<RecordOwnerCard did={DID} />)
    // While its retries run, a placeholder holds the card.
    expect(screen.getByRole("heading", { name: "Who's behind it" })).toBeTruthy()
    expect(screen.queryByText("Couldn't load this account.")).toBeNull()
    for (const ms of [1_500, 4_000, 10_000]) {
      act(() => {
        vi.advanceTimersByTime(ms)
      })
    }
    expect(marker.refresh).toHaveBeenCalledTimes(3)
    expect(screen.getByText("Couldn't load this account.")).toBeTruthy()
  })
})
