import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import ActivityQuickPick from "../activity-quick-pick"

const activities = [
  { uri: "at://did:plc:me/org.hypercerts.claim.activity/a", cid: "ca", title: "Mangroves" },
  { uri: "at://did:plc:me/org.hypercerts.claim.activity/b", cid: "cb", title: "Seed bank" },
]

describe("ActivityQuickPick", () => {
  it("lists only the activities not yet in the project", () => {
    render(
      <ActivityQuickPick
        activities={activities}
        addedUris={new Set([activities[0].uri])}
        onAdd={() => {}}
      />,
    )
    expect(screen.queryByRole("button", { name: "Add Mangroves" })).toBeNull()
    expect(screen.getByRole("button", { name: "Add Seed bank" })).toBeInTheDocument()
  })

  it("adds an activity when its row is clicked", () => {
    const onAdd = vi.fn()
    render(<ActivityQuickPick activities={activities} addedUris={new Set()} onAdd={onAdd} />)
    fireEvent.click(screen.getByRole("button", { name: "Add Seed bank" }))
    expect(onAdd).toHaveBeenCalledWith(activities[1])
  })

  it("says so when every activity is already in the project", () => {
    render(
      <ActivityQuickPick
        activities={activities}
        addedUris={new Set(activities.map((a) => a.uri))}
        onAdd={() => {}}
      />,
    )
    expect(screen.getByText("All your activities are in this project.")).toBeInTheDocument()
    expect(screen.queryByRole("list")).toBeNull()
  })
})
