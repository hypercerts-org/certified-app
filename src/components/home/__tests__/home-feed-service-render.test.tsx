import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  useHomeFeed,
  type HomeFeedActor,
  type HomeFeedEvent,
} from "@/hooks/use-home-feed"
import type {
  CertifiedFeedItem,
  CertifiedFeedView,
} from "@/lib/atproto/certified-feed"

interface MockAuthorResult {
  info: {
    did: string
    handle: string
    displayName: string | null
    avatarUrl: string | null
  } | null
  isLoading: boolean
  error: string | null
}

const { fetchCertifiedFeedMock, useAuthorInfoMock } = vi.hoisted(() => ({
  fetchCertifiedFeedMock: vi.fn(),
  useAuthorInfoMock: vi.fn(
    (_did: string | null): MockAuthorResult => ({
      info: null,
      isLoading: false,
      error: null,
    }),
  ),
}))

vi.mock("@/lib/atproto/certified-feed", async () => {
  const actual = await vi.importActual<typeof import("@/lib/atproto/certified-feed")>(
    "@/lib/atproto/certified-feed",
  )
  return { ...actual, fetchCertifiedFeed: fetchCertifiedFeedMock }
})

vi.mock("@/hooks/use-author-info", () => ({
  useAuthorInfo: useAuthorInfoMock,
}))

import { EndorsementGroupRow, HomeFeedRow } from "../home-feed-rows"

const issuer: HomeFeedActor = {
  did: "did:plc:abcdefghijklmnopqrstuvwx",
  handle: "issuer.example",
  displayName: "Hydrated Issuer",
  avatarUrl: null,
  complete: true,
}
const subject: HomeFeedActor = {
  did: "did:plc:zyxwvutsrqponmlkjihgfedc",
  handle: "subject.example",
  displayName: "Hydrated Subject",
  avatarUrl: null,
  complete: true,
}

function base(uri: string) {
  return {
    uri,
    actor: issuer.did,
    actorProfile: issuer,
    createdAt: "2026-07-21T10:00:00.000Z",
  }
}

const serviceActor = {
  did: issuer.did,
  handle: issuer.handle,
  displayName: issuer.displayName,
  avatar: null,
}
const serviceSubject = {
  did: subject.did,
  handle: subject.handle,
  displayName: subject.displayName,
  avatar: null,
}
const serviceCid =
  "bafyreia3tbsfxe3cc75xrxyyn6qc42oupi73fxiox76prlyi5bpx7hr72u"
const serviceTimestamp = "2026-07-21T10:00:00.000Z"

function serviceItem(
  kind: string,
  rkey: string,
  view: CertifiedFeedView,
  collection = "org.hypercerts.claim.activity",
): CertifiedFeedItem {
  const uri = `at://${issuer.did}/${collection}/${rkey}`
  return {
    id: uri,
    kind,
    subject: { uri, cid: serviceCid },
    feedTimestamp: serviceTimestamp,
    actor: serviceActor,
    view,
  }
}

const serviceEventMatrix: CertifiedFeedItem[] = [
  serviceItem("cert.create", "activity", {
    $type: "app.certified.feed.beta.defs#activityView",
    title: "Matrix activity",
    shortDescription: null,
    image: null,
    createdAt: null,
    startDate: null,
    endDate: null,
    locationCount: 0,
  }),
  serviceItem(
    "collection.create",
    "collection",
    {
      $type: "app.certified.feed.beta.defs#collectionView",
      collectionType: "list:accounts",
      title: "Matrix collection",
      shortDescription: null,
      image: null,
      createdAt: null,
      itemCount: 2,
    },
    "org.hypercerts.collection",
  ),
  serviceItem(
    "project.created_with_cert",
    "paired-project",
    {
      $type: "app.certified.feed.beta.defs#collectionView",
      collectionType: "project",
      title: "Matrix paired project",
      shortDescription: null,
      image: null,
      createdAt: null,
      itemCount: 1,
    },
    "org.hypercerts.collection",
  ),
  serviceItem(
    "endorsement.award",
    "endorsement",
    {
      $type: "app.certified.feed.beta.defs#endorsementView",
      subject: serviceSubject,
      createdAt: null,
    },
    "app.certified.badge.award",
  ),
  serviceItem("evaluation.create", "evaluation", {
    $type: "app.certified.feed.beta.defs#evaluationView",
    summary: "Matrix evaluation",
    createdAt: null,
    target: null,
  }),
  serviceItem("measurement.create", "measurement", {
    $type: "app.certified.feed.beta.defs#measurementView",
    metric: "Matrix measurement",
    createdAt: null,
    target: null,
  }),
  serviceItem("hyperboard.create", "hyperboard", {
    $type: "app.certified.feed.beta.defs#hyperboardView",
    createdAt: null,
  }),
  serviceItem("update.create", "update", {
    $type: "app.certified.feed.beta.defs#updateView",
    title: "Matrix update",
    shortDescription: null,
    image: null,
    createdAt: null,
    target: null,
  }),
  serviceItem("future.create", "future", {
    $type: "app.certified.feed.beta.defs#futureView",
    unknown: true,
  }),
]

function ServiceEventMatrix() {
  const result = useHomeFeed(issuer.did, {
    trustedEvaluators: [],
    organizationQuality: { allowed: ["high-quality", "standard"], includeUnrated: true },
  })
  if (result.isLoading) return <p>Loading matrix</p>
  return (
    <>
      <output data-testid="normalized-kinds">
        {result.events.map((event) => event.kind).join("|")}
      </output>
      {result.events.map((event) => (
        <HomeFeedRow key={event.uri} event={event} />
      ))}
    </>
  )
}

beforeEach(() => {
  fetchCertifiedFeedMock.mockReset()
  useAuthorInfoMock.mockReset()
  useAuthorInfoMock.mockReturnValue({ info: null, isLoading: false, error: null })
})

afterEach(() => {
  cleanup()
})

describe("service-native feed rendering", () => {
  it("normalizes and renders all eight known kinds plus the unknown fallback", async () => {
    fetchCertifiedFeedMock.mockResolvedValue({
      items: serviceEventMatrix,
      cursor: null,
    })

    render(<ServiceEventMatrix />)

    await waitFor(() =>
      expect(screen.getByTestId("normalized-kinds").textContent).toBe(
        [
          "cert.create",
          "collection.create",
          "project.created_with_cert",
          "endorsement.award",
          "evaluation.create",
          "measurement.create",
          "hyperboard.create",
          "update.create",
          "unknown",
        ].join("|"),
      ),
    )
    expect(screen.getByText("created an activity")).toBeTruthy()
    expect(screen.getByText("created a list of accounts")).toBeTruthy()
    expect(screen.getByText("created a project with an activity")).toBeTruthy()
    expect(screen.getByText("Hydrated Subject")).toBeTruthy()
    expect(screen.getByText("added an evaluation")).toBeTruthy()
    expect(screen.getByText("added a measurement")).toBeTruthy()
    expect(screen.getByText("created a hyperboard")).toBeTruthy()
    expect(screen.getByText("posted an update")).toBeTruthy()
    expect(screen.getByText("did something")).toBeTruthy()
    expect(screen.getByText("Matrix activity")).toBeTruthy()
    expect(screen.getByText("Matrix collection")).toBeTruthy()
    expect(screen.getByText("Matrix paired project")).toBeTruthy()
    expect(screen.getByText("Matrix update")).toBeTruthy()
    expect(fetchCertifiedFeedMock).toHaveBeenCalledOnce()
    expect(useAuthorInfoMock).not.toHaveBeenCalled()
  })

  it("renders a complete actor summary without mounting the fallback lookup", () => {
    const event: HomeFeedEvent = {
      ...base(`at://${issuer.did}/org.hypercerts.claim.activity/a`),
      kind: "cert.create",
      view: {
        title: "Hydrated activity",
        shortDescription: null,
        imageUrl: null,
        startDate: null,
        endDate: null,
        locationCount: 0,
      },
    }
    render(<HomeFeedRow event={event} />)
    expect(screen.getByText("Hydrated Issuer")).toBeTruthy()
    expect(useAuthorInfoMock).not.toHaveBeenCalled()
  })

  it("renders complete endorsement issuer and subject summaries without fallback lookups", () => {
    const event: HomeFeedEvent = {
      ...base(`at://${issuer.did}/app.certified.badge.award/a`),
      kind: "endorsement.award",
      subject,
      note: null,
    }
    render(<HomeFeedRow event={event} />)
    expect(screen.getByText("Hydrated Issuer")).toBeTruthy()
    expect(screen.getByText("Hydrated Subject")).toBeTruthy()
    expect(useAuthorInfoMock).not.toHaveBeenCalled()
  })

  it("preserves live lookup precedence over every incomplete legacy hint", () => {
    useAuthorInfoMock.mockImplementation((did: string | null) => ({
      info: did === null
        ? null
        : did === issuer.did
          ? {
              did,
              handle: "live-issuer.example",
              displayName: "Live Issuer",
              avatarUrl: "https://images.example/live-issuer.png",
            }
          : {
              did,
              handle: "live-subject.example",
              displayName: "Live Subject",
              avatarUrl: "https://images.example/live-subject.png",
            },
      isLoading: false,
      error: null,
    }))
    const event: HomeFeedEvent = {
      ...base(`at://${issuer.did}/app.certified.badge.award/legacy`),
      actorProfile: {
        ...issuer,
        handle: "stale-issuer.example",
        displayName: "Stale Issuer",
        avatarUrl: "https://images.example/stale-issuer.png",
        complete: false,
      },
      kind: "endorsement.award",
      subject: {
        ...subject,
        handle: "stale-subject.example",
        displayName: "Stale Subject",
        avatarUrl: "https://images.example/stale-subject.png",
        complete: false,
      },
      note: null,
    }

    const { container } = render(<HomeFeedRow event={event} />)

    expect(screen.getByText("Live Issuer")).toBeTruthy()
    expect(screen.getByText("Live Subject")).toBeTruthy()
    expect(screen.queryByText("Stale Issuer")).toBeNull()
    expect(screen.queryByText("Stale Subject")).toBeNull()
    const imageSources = [...container.querySelectorAll("img")].map((image) =>
      image.getAttribute("src"),
    )
    expect(imageSources).toContain("https://images.example/live-issuer.png")
    expect(useAuthorInfoMock).toHaveBeenCalledWith(issuer.did)
    expect(useAuthorInfoMock).toHaveBeenCalledWith(subject.did)
  })

  it("uses live lookup precedence in grouped legacy summary and expanded rows", () => {
    const secondDid = "did:plc:qwertyuiopasdfghjklzxcvb"
    useAuthorInfoMock.mockImplementation((did: string | null) => {
      const identities = new Map([
        [issuer.did, ["live-issuer.example", "Live Issuer"]],
        [subject.did, ["live-subject.example", "Live Subject"]],
        [secondDid, ["live-second.example", "Live Second"]],
      ])
      const identity = did ? identities.get(did) : undefined
      return {
        info:
          did && identity
            ? {
                did,
                handle: identity[0],
                displayName: identity[1],
                avatarUrl: null,
              }
            : null,
        isLoading: false,
        error: null,
      }
    })
    const incompleteIssuer = {
      ...issuer,
      displayName: "Stale Issuer",
      complete: false,
    }
    render(
      <EndorsementGroupRow
        group={{
          type: "endorsementGroup",
          key: "legacy-group",
          actor: issuer.did,
          actorProfile: incompleteIssuer,
          createdAt: "2026-07-21T10:00:00.000Z",
          subjects: [
            { ...subject, displayName: "Stale Subject", complete: false },
            {
              ...subject,
              did: secondDid,
              displayName: "Stale Second",
              complete: false,
            },
          ],
        }}
      />,
    )

    expect(screen.getByText("Live Issuer")).toBeTruthy()
    expect(screen.getByText("Live Subject")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Show all" }))
    expect(screen.getByText("Live Second")).toBeTruthy()
    expect(screen.queryByText("Stale Second")).toBeNull()
  })

  it("renders a grouped hydrated endorsement without fallback lookups", () => {
    render(
      <EndorsementGroupRow
        group={{
          type: "endorsementGroup",
          key: "group-a",
          actor: issuer.did,
          actorProfile: issuer,
          createdAt: "2026-07-21T10:00:00.000Z",
          subjects: [
            subject,
            {
              ...subject,
              did: "did:plc:qwertyuiopasdfghjklzxcvb",
              handle: "second.example",
              displayName: "Second Subject",
            },
          ],
        }}
      />,
    )

    expect(screen.getByText("Hydrated Subject")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Show all" }))
    expect(screen.getByText("Second Subject")).toBeTruthy()
    expect(useAuthorInfoMock).not.toHaveBeenCalled()
  })
})
