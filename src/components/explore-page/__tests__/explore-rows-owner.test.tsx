import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import type { ActivityRecord } from "@/lib/atproto/activity-types"
import type { CollectionRecord } from "@/lib/atproto/collection"

// Every Explore row says whose record it is and what it covers in words:
// an activity row's work scope is humanized ("Community stewardship",
// never the raw slug), and activity rows, project rows and project cards
// carry "by <owner>" (the name, or a handle a person chose; never a
// handle the PDS made up, never "Unnamed account").

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

vi.mock("@/hooks/use-location", () => ({
  useLocation: () => ({ location: null }),
}))

// The author column's byline is not under test here.
vi.mock("@/components/feed/activity-author", () => ({
  default: () => null,
}))

import CertListRow from "../cert-list-row"
import ProjectListRow from "../project-list-row"
import ExploreProjectCard from "../explore-project-card"

const DID = "did:plc:ownerownerowner"

class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", NoopResizeObserver)
  author.info = { did: DID, handle: "estuary.certified.app", displayName: "Estuary Alliance", avatarUrl: null }
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function activity(workScope: unknown): ActivityRecord {
  return {
    uri: `at://${DID}/org.hypercerts.claim.activity/abc`,
    cid: "cid",
    value: {
      title: "Mangrove nursery",
      startDate: "2025-01-01",
      endDate: "2025-12-31",
      workScope,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  } as unknown as ActivityRecord
}

function project(): CollectionRecord {
  return {
    uri: `at://${DID}/org.hypercerts.claim.collection/p1`,
    cid: "cid",
    value: { title: "Coastal restoration", items: [], createdAt: "2026-01-01T00:00:00.000Z" },
  } as unknown as CollectionRecord
}

describe("Explore activity rows", () => {
  it("writes the work scope as words, not the raw slug", () => {
    const { container } = render(
      <CertListRow
        record={activity({ scope: "community_stewardship,tree-nursery" })}
        did={DID}
        showByline
      />,
    )
    const meta = container.querySelector(".cert-list-row__meta")?.textContent ?? ""
    expect(meta).toContain("Community stewardship, Tree nursery")
    expect(meta).not.toContain("community_stewardship")
  })

  it("says who did the work (the phone line under the title)", () => {
    const { container } = render(
      <CertListRow record={activity(null)} did={DID} showByline />,
    )
    expect(container.querySelector(".cert-list-row__subtitle")?.textContent).toBe(
      "by Estuary Alliance",
    )
  })

  it("never names the owner by a made-up handle", () => {
    author.info = { did: DID, handle: "12gkq0.certified.one", displayName: null, avatarUrl: null }
    const { container } = render(
      <CertListRow record={activity(null)} did={DID} showByline />,
    )
    expect(container.querySelector(".cert-list-row__subtitle")).toBeNull()
  })
})

describe("Explore project rows and cards", () => {
  it("carries the owner on the row", () => {
    const { container } = render(<ProjectListRow project={project()} />)
    expect(container.querySelector(".cert-list-row__subtitle")?.textContent).toBe(
      "by Estuary Alliance",
    )
  })

  it("carries the owner on the card, under the title", () => {
    render(<ExploreProjectCard project={project()} />)
    expect(screen.getByText("by Estuary Alliance")).toBeTruthy()
  })

  it("uses a handle a person chose when there is no name", () => {
    author.info = { did: DID, handle: "estuary.org", displayName: null, avatarUrl: null }
    render(<ExploreProjectCard project={project()} />)
    expect(screen.getByText("by estuary.org")).toBeTruthy()
  })
})
