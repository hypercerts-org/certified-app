import type { ComponentType } from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  service: vi.fn(() => {
    throw new Error("Service hook must not mount in indexer mode")
  }),
  legacy: vi.fn(() => ({
    events: [],
    isLoading: false,
    isLoadingMore: false,
    hasMore: false,
    cursor: null,
    error: null,
    continuationError: null,
    retryAt: null,
    canAutoLoad: true,
    requestKey: "legacy-request",
    retryInitial: vi.fn(),
    loadMore: vi.fn(),
  })),
  following: vi.fn(() => ({
    subjects: new Set(["did:plc:zyxwvutsrqponmlkjihgfedc"]),
    isLoading: false,
    error: null,
  })),
  evaluatorExpansion: vi.fn(() => ({
    endorsedDids: new Set<string>(),
    isLoading: false,
  })),
  fetchOrgDidsByLabel: vi.fn(async () => new Set<string>()),
}))

vi.mock("@/hooks/use-home-feed", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/use-home-feed")>(
    "@/hooks/use-home-feed",
  )
  return {
    ...actual,
    useHomeFeed: mocks.service,
    useLegacyHomeFeed: mocks.legacy,
  }
})
vi.mock("@/hooks/use-following", () => ({ useFollowing: mocks.following }))
vi.mock("@/hooks/use-evaluator-endorsements", () => ({
  useEvaluatorEndorsements: mocks.evaluatorExpansion,
}))
vi.mock("@/hooks/use-trusted-evaluators", () => ({
  useTrustedEvaluators: () => ({ evaluatorDids: [], isLoading: false }),
}))
vi.mock("@/lib/atproto/workspace", async () => {
  const actual = await vi.importActual<typeof import("@/lib/atproto/workspace")>(
    "@/lib/atproto/workspace",
  )
  return { ...actual, fetchOrgDidsByLabel: mocks.fetchOrgDidsByLabel }
})

let HomeFeed: ComponentType<{ activeDid: string }>

beforeAll(async () => {
  vi.stubEnv("NEXT_PUBLIC_HOME_FEED_SOURCE", "indexer")
  HomeFeed = (await import("../home-feed")).default
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

afterAll(() => {
  vi.unstubAllEnvs()
})

describe("HomeFeed indexer source isolation", () => {
  it("mounts the legacy graph and never mounts the service hook", () => {
    render(<HomeFeed activeDid="did:plc:abcdefghijklmnopqrstuvwx" />)

    expect(screen.getByText("No activity yet")).toBeTruthy()
    expect(mocks.service).not.toHaveBeenCalled()
    expect(mocks.legacy).toHaveBeenCalledOnce()
    expect(mocks.following).toHaveBeenCalledOnce()
    expect(mocks.evaluatorExpansion).toHaveBeenCalledOnce()
  })
})
