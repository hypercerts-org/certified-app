import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"

import type { ActivityRecord } from "@/lib/atproto/activity-types"

const DID = "did:plc:me"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

vi.mock("@/hooks/use-user-projects", () => ({
  USER_PROJECTS_MAX: 100,
  useUserProjects: () => ({ projects: [], isLoading: false, error: null, truncated: false, retry: vi.fn() }),
}))

vi.mock("@/components/records/use-own-activities", () => ({
  ACTIVITY_PAGE: 100,
  ACTIVITY_MAX_PAGES: 5,
  useOwnActivities: () => ({
    records: [
      {
        uri: `at://${DID}/org.hypercerts.claim.activity/abc`,
        cid: "bafy",
        value: { title: "River survey", createdAt: "2026-05-27T10:00:00Z" },
      } as unknown as ActivityRecord,
    ],
    isLoading: false,
    error: false,
    truncated: false,
  }),
}))

vi.mock("@/hooks/use-author-info", () => ({
  useAuthorInfo: () => ({ info: null, isLoading: false }),
}))

vi.mock("@/hooks/use-contributor-info", () => ({
  useContributorInfo: () => ({ info: null, isAtproto: false }),
}))

import WorkspaceShell from "@/components/layout/workspace-shell"
import WorkPane from "../work-pane"

describe("Projects and activities toolbar (PA4)", () => {
  it("puts the search and both create actions on one row, not in the header", () => {
    const { container } = render(
      <WorkspaceShell current="activities">
        <WorkPane
          did={DID}
          actor="me.certified.app"
          removed={new Set()}
          written={new Map()}
          onDeleted={vi.fn()}
          onProjectWritten={vi.fn()}
          onRetry={vi.fn()}
        />
      </WorkspaceShell>,
    )
    const search = screen.getByRole("searchbox", { name: "Search projects and activities" })
    const toolbar = search.closest(".records-pane__toolbar")
    expect(toolbar).not.toBeNull()
    const newActivity = screen.getByRole("link", { name: "New activity" })
    const newProject = screen.getByRole("link", { name: "New project" })
    expect(toolbar).toContainElement(newActivity)
    expect(toolbar).toContainElement(newProject)
    // The header keeps only the title and its line.
    const header = container.querySelector(".workspace__header") as HTMLElement
    expect(header).not.toContainElement(newActivity)
    // Search first, then the actions.
    expect(search.compareDocumentPosition(newActivity) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
