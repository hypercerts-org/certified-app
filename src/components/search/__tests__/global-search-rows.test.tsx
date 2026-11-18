import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup, within, act } from "@testing-library/react"

// The search's rows: an activity or project names its owner as Explore
// does ("by <name>"), not by handle (a blank line holds the place while the
// owner is looked up, so the row doesn't grow), and a search that finds
// nothing says so in one muted line above the way on ("Search Explore for
// …"). Handing the search to Explore empties this field: Explore's own
// field holds the query then.

const data = vi.hoisted(() => ({
  certs: [] as { uri: string; value: { title: string } }[],
  projects: [] as { uri: string; value: { title: string } }[],
  push: vi.fn(),
}))

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: data.push }) }))

vi.mock("@/lib/atproto/indexer", () => ({
  fetchIndexerActivities: async () => ({
    records: data.certs,
    dids: new Map(data.certs.map((c) => [c.uri, c.uri.split("/")[2]])),
  }),
}))

vi.mock("@/lib/atproto/indexer-collections", () => ({
  fetchProjects: async () => ({ records: data.projects }),
}))

vi.mock("@/lib/atproto/workspace", () => ({
  fetchNetworkActors: async () => ({ actors: [] }),
}))

vi.mock("@/hooks/use-author-info", () => ({
  useAuthorInfo: (did: string | null) => ({
    // A DID with "pending" in it is still being looked up.
    info:
      did && !did.includes("pending")
        ? { displayName: "Riverbank Trust", handle: "riverbank.certified.app", avatarUrl: null }
        : null,
  }),
}))

import GlobalSearch from "../global-search"

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({ actors: [] }) })),
  )
  data.certs = []
  data.projects = []
  data.push.mockReset()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function search(q: string) {
  render(<GlobalSearch placeholder="Search" />)
  fireEvent.change(screen.getByRole("combobox", { name: "Search" }), {
    target: { value: q },
  })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000)
  })
  return screen.getByRole("listbox")
}

describe("GlobalSearch rows", () => {
  it("names an activity's and a project's owner, not their handle", async () => {
    data.certs = [
      { uri: "at://did:plc:river/org.hypercerts.claim.activity/1", value: { title: "Mangrove nursery" } },
    ]
    data.projects = [
      { uri: "at://did:plc:river/org.hypercerts.claim.collection/2", value: { title: "Mangrove coast" } },
    ]
    const list = await search("mangrove")
    expect(within(list).getAllByText("by Riverbank Trust")).toHaveLength(2)
    expect(within(list).queryByText("@riverbank.certified.app")).toBeNull()
    expect(within(list).queryByText("No activities, projects or accounts match.")).toBeNull()
  })

  it("holds the owner's line while the owner is looked up", async () => {
    data.certs = [
      { uri: "at://did:plc:pendingowner/org.hypercerts.claim.activity/1", value: { title: "Mangrove nursery" } },
    ]
    const list = await search("mangrove")
    const row = within(list).getByRole("option", { name: /Mangrove nursery/ })
    const line = row.querySelector(".cert-search__item-handle")
    expect(line).not.toBeNull()
    expect(line).toHaveAttribute("aria-hidden", "true")
    expect(line?.textContent).toBe("\u00a0")
  })

  it("empties the field when Enter hands the search to Explore", async () => {
    await search("mangrove")
    const input = screen.getByRole("combobox", { name: "Search" }) as HTMLInputElement
    fireEvent.keyDown(input, { key: "Enter" })
    expect(data.push).toHaveBeenCalledWith("/explore?q=mangrove")
    expect(input.value).toBe("")
  })

  it("empties the field when the Explore row is picked", async () => {
    const list = await search("zzzz")
    fireEvent.mouseDown(within(list).getByRole("option", { name: /Search Explore for/ }))
    expect(data.push).toHaveBeenCalledWith("/explore?q=zzzz")
    expect((screen.getByRole("combobox", { name: "Search" }) as HTMLInputElement).value).toBe("")
  })

  it("keeps a pasted identifier in the field as it jumps to it", async () => {
    await search("did:plc:abcdefghijklmnopqrstuvwx")
    const input = screen.getByRole("combobox", { name: "Search" }) as HTMLInputElement
    fireEvent.keyDown(input, { key: "Enter" })
    expect(data.push).toHaveBeenCalledTimes(1)
    expect(data.push.mock.calls[0][0]).not.toMatch(/^\/explore/)
    expect(input.value).toBe("did:plc:abcdefghijklmnopqrstuvwx")
  })

  it("says nothing matched, above the Explore row", async () => {
    const list = await search("zzzz")
    const line = within(list).getByText("No activities, projects or accounts match.")
    const explore = within(list).getByRole("option", { name: /Search Explore for/ })
    expect(line.compareDocumentPosition(explore) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // Not an option: the arrow keys walk past it.
    expect(within(list).getAllByRole("option")).toHaveLength(1)
  })
})
