import { describe, it, expect, afterEach, vi, beforeEach } from "vitest"
import { render, cleanup } from "@testing-library/react"

// quality-043: ProjectItemRow gated its skeleton on `!project`, but
// useProject resolves to {project:null, isLoading:false, error} on a
// 404 / malformed URI. That left the row stuck on a permanent grey
// skeleton with no terminal state — non-owners got an eternal grey
// bar. These tests pin the post-fix render gate: skeleton only while
// isLoading, and a fallback row (URI rkey tail or "Project
// unavailable", remove button preserved for owners) once loading has
// finished without a record.

import type { SingleProject } from "@/hooks/use-project"

// Mock the project hook so we can drive each load state directly.
const useProjectMock =
  vi.fn<
    () => { project: SingleProject | null; isLoading: boolean; error: string | null }
  >()
vi.mock("@/hooks/use-project", () => ({
  useProject: () => useProjectMock(),
}))

// ProjectListRow pulls in the full activity/feed-card stack; stub it
// to a sentinel so these tests stay focused on the gate.
vi.mock("@/components/explore-page/project-list-row", () => ({
  default: () => <div data-testid="project-list-row" />,
}))

import { ProjectItemRow } from "../profile-lists"

const URI = "at://did:plc:abc/org.hypercerts.collection/proj123"

beforeEach(() => {
  useProjectMock.mockReset()
})

afterEach(() => {
  cleanup()
})

describe("ProjectItemRow render gate (quality-043)", () => {
  it("shows the skeleton only while loading", () => {
    useProjectMock.mockReturnValue({
      project: null,
      isLoading: true,
      error: null,
    })
    const { container } = render(
      <ProjectItemRow uri={URI} canRemove={false} onRemove={async () => {}} />,
    )
    expect(
      container.querySelector(".profile-lists__project--loading"),
    ).not.toBeNull()
    expect(container.querySelector(".profile-lists__project-skel")).not.toBeNull()
  })

  it("renders a fallback row (not a skeleton) once loading finishes without a record", () => {
    useProjectMock.mockReturnValue({
      project: null,
      isLoading: false,
      error: "Project not found",
    })
    const { container } = render(
      <ProjectItemRow uri={URI} canRemove={false} onRemove={async () => {}} />,
    )
    // The permanent-skeleton bug: no skeleton must remain.
    expect(
      container.querySelector(".profile-lists__project--loading"),
    ).toBeNull()
    expect(container.querySelector(".profile-lists__project-skel")).toBeNull()
    // A real terminal row with the URI rkey tail as the label.
    const title = container.querySelector(".profile-lists__item-title")
    expect(title?.textContent).toBe("proj123")
  })

  it("falls back to a generic label when the URI is malformed", () => {
    useProjectMock.mockReturnValue({
      project: null,
      isLoading: false,
      error: "Project not found",
    })
    const { container } = render(
      <ProjectItemRow uri="not-an-at-uri" canRemove={false} onRemove={async () => {}} />,
    )
    const title = container.querySelector(".profile-lists__item-title")
    expect(title?.textContent).toBe("Project unavailable")
  })

  it("keeps the remove button on the fallback row for owners", () => {
    useProjectMock.mockReturnValue({
      project: null,
      isLoading: false,
      error: "Project not found",
    })
    const { container } = render(
      <ProjectItemRow uri={URI} canRemove onRemove={async () => {}} />,
    )
    const removeBtn = container.querySelector(".profile-lists__item-remove")
    expect(removeBtn).not.toBeNull()
  })

  it("does not render a remove button on the fallback row for non-owners", () => {
    useProjectMock.mockReturnValue({
      project: null,
      isLoading: false,
      error: "Project not found",
    })
    const { container } = render(
      <ProjectItemRow uri={URI} canRemove={false} onRemove={async () => {}} />,
    )
    expect(container.querySelector(".profile-lists__item-remove")).toBeNull()
  })

  it("renders the resolved project row when the record loads", () => {
    useProjectMock.mockReturnValue({
      project: {
        uri: URI,
        cid: "cid1",
        did: "did:plc:abc",
        rkey: "proj123",
        value: { title: "My Project" } as SingleProject["value"],
      },
      isLoading: false,
      error: null,
    })
    const { container, getByTestId } = render(
      <ProjectItemRow uri={URI} canRemove={false} onRemove={async () => {}} />,
    )
    expect(getByTestId("project-list-row")).not.toBeNull()
    expect(container.querySelector(".profile-lists__project-skel")).toBeNull()
  })
})
