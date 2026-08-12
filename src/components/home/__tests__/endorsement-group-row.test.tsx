import { describe, it, expect, afterEach, vi } from "vitest"
import { render, screen, cleanup, fireEvent } from "@testing-library/react"

import { EndorsementGroupRow } from "../home-feed-rows"
import type { EndorsementGroupItem } from "@/lib/utils/group-feed"
import type { FeedActor } from "@/lib/atproto/follower-events"

// useAuthorInfo goes through the batched DID resolver (network). Stub
// it so rows render DID-only bylines synchronously; the spy doubles as
// a render probe for the memo test below.
const useAuthorInfoMock = vi.fn((_did: string | null) => ({
  info: null,
  isLoading: false,
  error: null,
}))
vi.mock("@/hooks/use-author-info", () => ({
  useAuthorInfo: (did: string | null) => useAuthorInfoMock(did),
}))

const ACTOR_PROFILE: FeedActor = {
  did: "did:plc:actor",
  handle: null,
  displayName: null,
  avatarCid: null,
}

function makeGroup(
  count: number,
  overrides?: Partial<EndorsementGroupItem>,
): EndorsementGroupItem {
  return {
    type: "endorsementGroup",
    key: "at://did:plc:actor/app.certified.feed.endorsement/e0",
    actor: "did:plc:actor",
    actorProfile: ACTOR_PROFILE,
    createdAt: "2026-07-01T00:00:00.000Z",
    subjectDids: Array.from({ length: count }, (_, i) => `did:plc:subject${i}`),
    ...overrides,
  }
}

afterEach(() => {
  cleanup()
  useAuthorInfoMock.mockClear()
})

describe("EndorsementGroupRow expanded-list windowing", () => {
  it("caps the initial expansion at one page and pages the rest via Show more", () => {
    render(<EndorsementGroupRow group={makeGroup(120)} />)

    fireEvent.click(screen.getByRole("button", { name: /show all/i }))
    expect(screen.getAllByRole("listitem")).toHaveLength(50)

    fireEvent.click(
      screen.getByRole("button", { name: /show more \(70 remaining\)/i }),
    )
    expect(screen.getAllByRole("listitem")).toHaveLength(100)

    fireEvent.click(
      screen.getByRole("button", { name: /show more \(20 remaining\)/i }),
    )
    expect(screen.getAllByRole("listitem")).toHaveLength(120)
    expect(screen.queryByRole("button", { name: /show more/i })).toBeNull()
  })

  it("resets the window on collapse so re-expanding starts at one page", () => {
    render(<EndorsementGroupRow group={makeGroup(120)} />)

    fireEvent.click(screen.getByRole("button", { name: /show all/i }))
    fireEvent.click(
      screen.getByRole("button", { name: /show more \(70 remaining\)/i }),
    )
    expect(screen.getAllByRole("listitem")).toHaveLength(100)

    fireEvent.click(screen.getByRole("button", { name: /show fewer/i }))
    expect(screen.queryAllByRole("listitem")).toHaveLength(0)

    fireEvent.click(screen.getByRole("button", { name: /show all/i }))
    expect(screen.getAllByRole("listitem")).toHaveLength(50)
  })

  it("renders small groups in full with no Show more button", () => {
    render(<EndorsementGroupRow group={makeGroup(3)} />)

    fireEvent.click(screen.getByRole("button", { name: /show all/i }))
    expect(screen.getAllByRole("listitem")).toHaveLength(3)
    expect(screen.queryByRole("button", { name: /show more/i })).toBeNull()
  })
})

describe("EndorsementGroupRow memo comparator", () => {
  // groupConsecutiveEndorsements rebuilds group objects (and their
  // subjectDids arrays) on every events change; the memo comparator
  // must bail on a structurally-equal rebuild and re-render when the
  // group absorbs another subject.
  it("skips re-render for a rebuilt-but-equal group and re-renders on growth", () => {
    const { rerender } = render(<EndorsementGroupRow group={makeGroup(5)} />)
    const baseline = useAuthorInfoMock.mock.calls.length
    expect(baseline).toBeGreaterThan(0)

    // Fresh group + fresh subjectDids array, same values (actorProfile
    // ref is stable in production — it comes from the stable event).
    rerender(<EndorsementGroupRow group={makeGroup(5)} />)
    expect(useAuthorInfoMock.mock.calls.length).toBe(baseline)

    // One more absorbed subject must invalidate the bail-out.
    rerender(<EndorsementGroupRow group={makeGroup(6)} />)
    expect(useAuthorInfoMock.mock.calls.length).toBeGreaterThan(baseline)
  })
})
