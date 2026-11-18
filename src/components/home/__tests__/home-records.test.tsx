import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, within } from "@testing-library/react"

const records = { projects: [] as unknown[], created: [] as unknown[] }
vi.mock("@/hooks/use-user-projects", () => ({
  useUserProjects: () => ({ projects: records.projects, isLoading: false }),
}))
vi.mock("@/hooks/use-user-indexer-activities", () => ({
  useUserIndexerActivities: () => ({ created: records.created, isLoading: false }),
}))
vi.mock("@/hooks/use-received-endorsements", () => ({
  useReceivedEndorsements: () => ({ endorsements: [], isLoading: false }),
}))
vi.mock("@/hooks/use-endorsements", () => ({
  useGivenEndorsements: () => ({ endorsements: [], isLoading: false, error: null }),
}))
const following = { count: 7, isLoading: false, error: null as string | null, truncated: false }
vi.mock("@/hooks/use-following", () => ({
  useFollowing: () => following,
}))

import { HomeEndorsements, HomeRecords } from "../home-sections"
import type { WorkspaceCounts } from "@/lib/atproto/workspace"

const SOME = { certs: 3, projects: 1, lists: 0, followers: 12 } as unknown as WorkspaceCounts
const NONE = { certs: 0, projects: 0, lists: 0, followers: 0 } as unknown as WorkspaceCounts

function renderRecords(counts: WorkspaceCounts, isGroup = false) {
  return render(
    <HomeRecords did="did:plc:me" isGroup={isGroup} profileBase="/me.test" counts={counts} countsLoading={false} />,
  )
}

beforeEach(() => {
  records.projects = []
  records.created = []
  following.count = 7
  following.isLoading = false
  following.error = null
  following.truncated = false
})

// WS-04: once there were records the Overview offered no way to create.
describe("Your records: New activity", () => {
  it("sits in the section header, as New group does in Your groups", () => {
    renderRecords(SOME)
    // The SectionHeader row: the title (and description), the action.
    const header = screen.getByRole("heading", { name: "Your records" }).closest(".justify-between")
    expect(header).not.toBeNull()
    const create = within(header as HTMLElement).getByRole("link", { name: "New activity" })
    expect(create).toHaveAttribute("href", "/create")
    expect(screen.getAllByRole("link", { name: "New activity" })).toHaveLength(1)
  })

  it("is offered while acting as a group too (it publishes as the group)", () => {
    renderRecords(SOME, true)
    expect(screen.getByRole("link", { name: "New activity" })).toHaveAttribute("href", "/create")
  })

  it("empty: New activity (primary) and New project, once", () => {
    renderRecords(NONE)
    expect(screen.getByRole("heading", { name: "No records yet" })).toBeInTheDocument()
    const activity = screen.getAllByRole("link", { name: "New activity" })
    expect(activity).toHaveLength(1)
    expect(activity[0]).toHaveAttribute("href", "/create")
    expect(activity[0].className).toContain("bg-[var(--btn-primary-bg)]")
    expect(screen.getByRole("link", { name: "New project" })).toHaveAttribute("href", "/project/new")
  })

  // F4: a donor's first screen offered only making records.
  it("empty: offers Find accounts beside them, a secondary action to Explore's accounts", () => {
    renderRecords(NONE)
    const find = screen.getByRole("link", { name: "Find accounts" })
    expect(find).toHaveAttribute("href", "/explore?show=accounts")
    expect(find.className).not.toContain("bg-[var(--btn-primary-bg)]")
    // Beside New activity and New project, in the empty state's actions.
    const actions = find.parentElement as HTMLElement
    expect(within(actions).getByRole("link", { name: "New activity" })).toBeInTheDocument()
    expect(within(actions).getByRole("link", { name: "New project" })).toBeInTheDocument()
  })

  it("with records: no Find accounts (the header carries New activity)", () => {
    renderRecords(SOME)
    expect(screen.queryByRole("link", { name: "Find accounts" })).toBeNull()
  })
})

// F4: the Overview counts who the account follows, too.
describe("Endorsements and followers: Following", () => {
  function renderEndorsements(isGroup = false) {
    return render(
      <HomeEndorsements did="did:plc:me" isGroup={isGroup} profileBase="/me.test" counts={NONE} countsLoading={false} />,
    )
  }

  it("shows how many accounts it follows, linking to Following", () => {
    renderEndorsements()
    const stats = screen.getByRole("list", { name: "Endorsements and followers" })
    const link = within(stats).getByRole("link", { name: /Following/ })
    expect(link).toHaveTextContent("7")
    expect(link).toHaveAttribute("href", "/me.test?tab=followers&sub=following")
  })

  it("leads to the profile's Followers tab while acting as a group too", () => {
    renderEndorsements(true)
    const stats = screen.getByRole("list", { name: "Endorsements and followers" })
    expect(within(stats).getByRole("link", { name: /Following/ })).toHaveAttribute(
      "href",
      "/me.test?tab=followers&sub=following",
    )
    expect(within(stats).getByRole("link", { name: /Followers/ })).toHaveAttribute(
      "href",
      "/me.test?tab=followers",
    )
    expect(within(stats).getByRole("link", { name: /Received/ })).toHaveAttribute(
      "href",
      "/records?kind=endorsements&tab=received",
    )
    expect(within(stats).getByRole("link", { name: /Given/ })).toHaveAttribute(
      "href",
      "/records?kind=endorsements&tab=given",
    )
  })

  it("shows a skeleton while loading and an en dash when it failed, never a wrong 0", () => {
    following.count = 0
    following.isLoading = true
    const { unmount } = renderEndorsements()
    const item = screen.getByRole("link", { name: /Following/ }).closest("li") as HTMLElement
    expect(item).toHaveAttribute("aria-busy", "true")
    unmount()
    following.isLoading = false
    following.error = "Failed to load follows"
    renderEndorsements()
    expect(screen.getByRole("link", { name: /Following/ })).toHaveTextContent("–")
  })
})

// WS-09: on a 390px phone the three stats wrapped ("12 Followers" alone).
describe("Endorsements and followers: stat labels", () => {
  it("are short on phones and full from 800px", () => {
    render(
      <HomeEndorsements did="did:plc:me" isGroup={false} profileBase="/me.test" counts={SOME} countsLoading={false} />,
    )
    const stats = screen.getByRole("list", { name: "Endorsements and followers" })
    for (const [short, full] of [
      ["Received", "Endorsements received"],
      ["Given", "Endorsements given"],
    ]) {
      expect(within(stats).getByText(short)).toHaveClass("md:hidden")
      expect(within(stats).getByText(full)).toHaveClass("hidden", "md:inline")
    }
    // Followers is short already.
    expect(within(stats).getByText("Followers")).not.toHaveClass("md:hidden")
  })
})
