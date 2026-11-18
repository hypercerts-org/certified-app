import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"

// C4: an edit page says "not found" only when the record is gone; any
// other failure to load says it couldn't load, with Try again. Its links
// name "Projects and activities", not the old "Records" / "Workspace".

vi.mock("next/navigation", () => ({
  usePathname: () => "/me/activity/abc/edit",
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock("@/lib/navbar-context", () => ({
  usePageTitle: () => {},
  useRegisterPageHeader: () => {},
}))
vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({ isAuthenticated: true, isLoading: false, did: "did:plc:me" }),
}))
vi.mock("@/lib/groups/org-context", () => ({
  useOrg: () => ({ activeOrg: null }),
}))
vi.mock("@/components/leaflet/leaflet-editor-dynamic", () => ({
  default: () => <div data-testid="editor" />,
}))
vi.mock("@/components/create/use-rights-options", () => ({
  useRightsOptions: () => ({ options: [], isLoading: false, error: null, retry: () => {} }),
}))
vi.mock("@/hooks/use-own-certs", () => ({
  useOwnCerts: () => ({ ownCerts: [], isLoading: false }),
}))
vi.mock("@/hooks/use-project-items", () => ({
  useProjectItems: () => ({ resolutions: [], isLoading: false }),
}))

const activityState = {
  activity: null,
  isLoading: false,
  error: null as string | null,
  refetch: vi.fn(),
}
vi.mock("@/hooks/use-activity", () => ({
  ACTIVITY_NOT_FOUND: "Activity not found",
  invalidateActivity: vi.fn(),
  useActivity: () => activityState,
}))

const projectState = {
  project: null,
  isLoading: false,
  error: null as string | null,
  refetch: vi.fn(),
}
vi.mock("@/hooks/use-project", () => ({
  PROJECT_NOT_FOUND: "Project not found",
  useProject: () => projectState,
}))

import ActivityEditRoute from "../activity-edit-route"
import ProjectEditRoute from "@/components/project/project-edit-route"

beforeEach(() => {
  activityState.refetch.mockReset()
  projectState.refetch.mockReset()
})

describe("activity edit: load states", () => {
  it("says not found only for a missing record", () => {
    activityState.error = "Activity not found"
    render(<ActivityEditRoute did="did:plc:me" rkey="abc" resolving={false} />)
    expect(screen.getByRole("heading", { name: "Activity not found" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Go to projects and activities" })).toHaveAttribute(
      "href",
      "/records",
    )
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull()
  })

  it("offers Try again when the record couldn't be read", () => {
    activityState.error = "Failed to fetch"
    render(<ActivityEditRoute did="did:plc:me" rkey="abc" resolving={false} />)
    expect(screen.getByRole("heading", { name: "Couldn't load this activity" })).toBeInTheDocument()
    expect(screen.queryByText("Failed to fetch")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(activityState.refetch).toHaveBeenCalledTimes(1)
  })
})

describe("project edit: load states", () => {
  it("says not found only for a missing record", () => {
    projectState.error = "Project not found"
    render(<ProjectEditRoute did="did:plc:me" rkey="abc" resolving={false} />)
    expect(screen.getByRole("heading", { name: "Project not found" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Go to projects and activities" })).toBeInTheDocument()
  })

  it("offers Try again when the record couldn't be read", () => {
    projectState.error = "Couldn't load this project. Try again."
    render(<ProjectEditRoute did="did:plc:me" rkey="abc" resolving={false} />)
    expect(screen.getByRole("heading", { name: "Couldn't load this project" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(projectState.refetch).toHaveBeenCalledTimes(1)
  })

  it("names Projects and activities on the back link when the record isn't known", () => {
    projectState.error = "Project not found"
    render(<ProjectEditRoute did={null} rkey={null} resolving={false} />)
    expect(screen.getByRole("link", { name: /Projects and activities/ })).toHaveAttribute(
      "href",
      "/records",
    )
    expect(screen.queryByRole("link", { name: /Workspace/ })).toBeNull()
  })
})
