import type { ComponentType } from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  service: vi.fn(() => ({
    events: [],
    isLoading: false,
    isLoadingMore: false,
    hasMore: false,
    cursor: null,
    error: null,
    continuationError: null,
    retryAt: null,
    canAutoLoad: true,
    requestKey: "service-request",
    retryInitial: vi.fn(),
    loadMore: vi.fn(),
  })),
  legacy: vi.fn(() => {
    throw new Error("Legacy feed hook must not mount in service mode")
  }),
  following: vi.fn(() => {
    throw new Error("Follow expansion must not mount in service mode")
  }),
  evaluatorExpansion: vi.fn(() => {
    throw new Error("Evaluator expansion must not mount in service mode")
  }),
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

let HomeFeed: ComponentType<{ activeDid: string }>

beforeAll(async () => {
  vi.stubEnv("NEXT_PUBLIC_HOME_FEED_SOURCE", "service")
  HomeFeed = (await import("../home-feed")).default
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

afterAll(() => {
  vi.unstubAllEnvs()
})

describe("HomeFeed service source isolation", () => {
  it("mounts only the service hook graph", () => {
    render(<HomeFeed activeDid="did:plc:abcdefghijklmnopqrstuvwx" />)

    expect(screen.getByText("No activity yet")).toBeTruthy()
    expect(mocks.service).toHaveBeenCalledOnce()
    expect(mocks.legacy).not.toHaveBeenCalled()
    expect(mocks.following).not.toHaveBeenCalled()
    expect(mocks.evaluatorExpansion).not.toHaveBeenCalled()
  })
})
