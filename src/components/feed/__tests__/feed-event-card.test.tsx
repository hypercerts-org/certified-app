import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import type { FeedEvent, HydratedPayload } from "@/lib/atproto/follower-events"

// useAuthorInfo is used to resolve the SUBJECT of badge.award / legacy.endorsement
// events. We mock it to avoid a network fetch in tests.
vi.mock("@/hooks/use-author-info", () => ({
  useAuthorInfo: (did: string) => ({
    info: {
      did,
      handle: did === "did:plc:subject" ? "subject.test" : `${did.slice(0, 12)}`,
      displayName: did === "did:plc:subject" ? "Subject Person" : null,
      avatarUrl: null,
    },
    isLoading: false,
  }),
}))

import FeedEventCard from "../feed-event-card"

const actor: FeedEvent["actor"] = {
  did: "did:plc:author",
  handle: "author.test",
  displayName: "Author Person",
  avatarCid: null,
}

function makeEvent(kind: string, subjectUri = "at://did:plc:x/y/z"): FeedEvent {
  return {
    id: subjectUri,
    kind,
    subjectUri,
    sortAt: "2026-05-26T00:00:00.000Z",
    actor,
  }
}

beforeEach(() => {
  cleanup()
})

afterEach(() => {
  cleanup()
})

describe("FeedEventCard", () => {
  it("renders the denormalised actor without fetching", () => {
    render(<FeedEventCard event={makeEvent("cert.create")} payload={null} />)
    expect(screen.getByText("Author Person")).toBeTruthy()
    expect(screen.getByText("@author.test")).toBeTruthy()
  })

  it("renders the cert.create action label and title", () => {
    const payload: HydratedPayload = {
      kind: "cert.create",
      record: {
        uri: "at://did:plc:author/org.hypercerts.claim.activity/abc",
        cid: "bafy",
        value: {
          title: "My Cert",
          shortDescription: "Description here",
          createdAt: "2026-05-26T00:00:00.000Z",
        },
      },
    }
    render(
      <FeedEventCard
        event={makeEvent("cert.create", payload.record.uri)}
        payload={payload}
      />,
    )
    expect(screen.getByText("created a cert")).toBeTruthy()
    expect(screen.getByText("My Cert")).toBeTruthy()
    expect(screen.getByText("Description here")).toBeTruthy()
  })

  it("renders the collection.create action label according to type", () => {
    const payload: HydratedPayload = {
      kind: "collection.create",
      record: {
        uri: "at://did:plc:author/org.hypercerts.collection/list1",
        cid: "bafy",
        value: {
          title: "My List",
          type: "endorsement-list",
        },
      },
    }
    render(
      <FeedEventCard
        event={makeEvent("collection.create", payload.record.uri)}
        payload={payload}
      />,
    )
    expect(screen.getByText("created a list")).toBeTruthy()
    expect(screen.getByText("My List")).toBeTruthy()
  })

  it("renders badge.award with subject byline and note", () => {
    const payload: HydratedPayload = {
      kind: "badge.award",
      subjectDid: "did:plc:subject",
      note: "Great work last quarter.",
      createdAt: "2026-05-26T00:00:00.000Z",
    }
    render(
      <FeedEventCard event={makeEvent("badge.award")} payload={payload} />,
    )
    expect(screen.getByText("awarded a badge to")).toBeTruthy()
    expect(screen.getByText("Subject Person")).toBeTruthy()
    expect(screen.getByText("Great work last quarter.")).toBeTruthy()
  })

  it("renders legacy.endorsement with no note region", () => {
    const payload: HydratedPayload = {
      kind: "legacy.endorsement",
      subjectDid: "did:plc:subject",
      createdAt: "2026-05-26T00:00:00.000Z",
    }
    render(
      <FeedEventCard
        event={makeEvent("legacy.endorsement")}
        payload={payload}
      />,
    )
    expect(screen.getByText("endorsed")).toBeTruthy()
    expect(screen.getByText("Subject Person")).toBeTruthy()
  })

  it("renders the fallback card for an unknown kind", () => {
    const subjectUri = "at://did:plc:x/some.future.collection/rkey"
    render(
      <FeedEventCard
        event={makeEvent("future.unknown.kind", subjectUri)}
        payload={null}
      />,
    )
    expect(screen.getByText("did something")).toBeTruthy()
    expect(screen.getByText(subjectUri)).toBeTruthy()
  })

  it("shows the degraded action line when payload is null on a known kind (404 hydration)", () => {
    render(
      <FeedEventCard event={makeEvent("cert.create")} payload={null} />,
    )
    // We know the kind (cert.create) even though hydration failed, so
    // we keep the verb rather than falling through to "did something".
    expect(screen.getByText("created a cert")).toBeTruthy()
    expect(screen.queryByText("did something")).toBeNull()
  })
})
