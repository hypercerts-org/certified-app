import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, cleanup, fireEvent } from "@testing-library/react"

/**
 * The record routes when something goes wrong: a failed lookup of the
 * record's account is not "not found" (a 429 must not tell a visitor the
 * activity is gone), a missing record is, and a record served in part says
 * some details couldn't load, with Try again.
 */

let activityState: {
  activity: { uri: string; did: string; cid: string; value: object; partial?: boolean } | null
  isLoading: boolean
  error: string | null
  refetch: () => void
}
vi.mock("@/hooks/use-activity", () => ({
  useActivity: () => activityState,
}))
let projectState: {
  project: { uri: string; did: string; cid: string; value: object } | null
  isLoading: boolean
  error: string | null
  refetch: () => void
}
vi.mock("@/hooks/use-project", () => ({
  PROJECT_NOT_FOUND: "Project not found",
  useProject: () => projectState,
}))
vi.mock("@/components/feed/activity-detail", () => ({
  default: () => <div data-testid="activity-detail" />,
}))
vi.mock("@/components/project/project-detail", () => ({
  default: () => <div data-testid="project-detail" />,
}))
vi.mock("@/lib/utils/recently-viewed", () => ({ trackRecentlyViewed: vi.fn() }))

let profileState: {
  did: string | null
  handle: string | null
  isLoading: boolean
  errorKind: "not-found" | "failed" | null
  retry: () => void
}
vi.mock("@/hooks/use-user-profile", () => ({
  useUserProfile: () => profileState,
}))
let params: Record<string, string> = {}
vi.mock("next/navigation", () => ({
  useParams: () => params,
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}))

import ActivityDetailRoute from "../activity-detail-route"
import ProjectDetailRoute from "@/components/project/project-detail-route"
import RecordDetailPage from "@/app/[actor]/[type]/[rkey]/page"

const DID = "did:plc:owner"

beforeEach(() => {
  activityState = { activity: null, isLoading: false, error: null, refetch: vi.fn() }
  projectState = { project: null, isLoading: false, error: null, refetch: vi.fn() }
  profileState = { did: null, handle: null, isLoading: false, errorKind: null, retry: vi.fn() }
  params = { actor: "ada.test", type: "activity", rkey: "r1" }
})

afterEach(() => {
  cleanup()
})

describe("RecordDetailPage", () => {
  it("says it couldn't load the activity, with Try again, when the account lookup failed", () => {
    profileState = { ...profileState, errorKind: "failed" }
    const { container } = render(<RecordDetailPage />)
    expect(screen.getByText("Couldn't load this activity")).toBeTruthy()
    expect(screen.queryByText("Activity not found")).toBeNull()
    expect(container.querySelector("[data-not-found]")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(profileState.retry).toHaveBeenCalled()
  })

  it("says the same of a project", () => {
    params = { ...params, type: "project" }
    profileState = { ...profileState, errorKind: "failed" }
    render(<RecordDetailPage />)
    expect(screen.getByText("Couldn't load this project")).toBeTruthy()
    expect(screen.queryByText("Project not found")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(profileState.retry).toHaveBeenCalled()
  })

  it('keeps "not found" for an account that really isn\'t there', () => {
    profileState = { ...profileState, errorKind: "not-found" }
    render(<RecordDetailPage />)
    expect(screen.getByText("Activity not found")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull()
  })
})

describe("ActivityDetailRoute", () => {
  it("says a missing activity is not found", () => {
    activityState = { ...activityState, error: "Activity not found" }
    render(<ActivityDetailRoute did={DID} handle="ada.test" rkey="r1" resolving={false} />)
    expect(screen.getByText("Activity not found")).toBeTruthy()
  })

  it("says some details couldn't load, without blaming a server, and tries again", () => {
    activityState = {
      ...activityState,
      activity: { uri: `at://${DID}/x/r1`, did: DID, cid: "c", value: {}, partial: true },
    }
    render(<ActivityDetailRoute did={DID} handle="ada.test" rkey="r1" resolving={false} />)
    const banner = screen.getByRole("alert")
    expect(banner.textContent).toContain("Some details couldn't load.")
    expect(banner.textContent).not.toMatch(/server/i)
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(activityState.refetch).toHaveBeenCalled()
    expect(screen.getByTestId("activity-detail")).toBeTruthy()
  })
})

describe("ProjectDetailRoute", () => {
  it("says it couldn't load the project when the lookup failed", () => {
    const retry = vi.fn()
    render(
      <ProjectDetailRoute
        did={null}
        handle={null}
        rkey="r1"
        resolving={false}
        lookupFailed
        onRetryLookup={retry}
      />,
    )
    expect(screen.getByText("Couldn't load this project")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(retry).toHaveBeenCalled()
  })
})
