import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"

/**
 * The root not-found page names what's missing only when that absence is
 * established: a typo under a real profile is a plain "Page not found",
 * not "Profile not found" (Greptile on #267).
 */

const { pathname, lookupActor, lookupRecord, resolveHandle } = vi.hoisted(() => ({
  pathname: { value: "" },
  lookupActor: vi.fn(),
  lookupRecord: vi.fn(),
  resolveHandle: vi.fn(),
}))
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-pathname": pathname.value }),
}))
vi.mock("@/lib/og-metadata", () => ({ lookupActor, lookupRecord }))
vi.mock("@/lib/atproto/did", () => ({ resolveHandle }))

import NotFoundPage from "../not-found"

async function renderAt(path: string) {
  pathname.value = path
  render(await NotFoundPage())
  return screen.getByRole("heading", { level: 1 }).textContent
}

beforeEach(() => {
  lookupActor.mockReset().mockResolvedValue({ status: "found", did: "did:plc:alice", handle: "alice.example.com" })
  lookupRecord.mockReset().mockResolvedValue({ uri: "", value: {} })
  resolveHandle.mockReset().mockResolvedValue(null)
})

describe("not-found page", () => {
  it("a top-level actor path is a missing profile", async () => {
    expect(await renderAt("/nobody.example.com")).toBe("Profile not found")
    expect(lookupActor).not.toHaveBeenCalled()
  })

  it("a deeper path under a missing actor is a missing profile", async () => {
    lookupActor.mockResolvedValue({ status: "missing" })
    expect(await renderAt("/nobody.example.com/activity/3abc")).toBe("Profile not found")
  })

  it("a deleted record under a real profile is a missing record", async () => {
    lookupRecord.mockResolvedValue("missing")
    expect(await renderAt("/alice.example.com/project/3abc")).toBe("Project not found")
    expect(screen.getByRole("link", { name: "View @alice.example.com" }).getAttribute("href")).toBe(
      "/alice.example.com",
    )
  })

  it("a DID-addressed missing record links the profile by its handle", async () => {
    lookupActor.mockResolvedValue({ status: "found", did: "did:plc:alice", handle: null })
    lookupRecord.mockResolvedValue("missing")
    resolveHandle.mockResolvedValue("alice.example.com")
    await renderAt("/did:plc:alice/activity/3abc")
    expect(screen.getByRole("link", { name: "View @alice.example.com" }).getAttribute("href")).toBe(
      "/alice.example.com",
    )
  })

  it("falls back to the DID when the handle can't be resolved", async () => {
    lookupActor.mockResolvedValue({ status: "found", did: "did:plc:alice", handle: null })
    lookupRecord.mockResolvedValue("missing")
    resolveHandle.mockRejectedValue(new Error("down"))
    await renderAt("/did:plc:alice/activity/3abc")
    expect(screen.getByRole("link", { name: "View @did:plc:alice" })).toBeTruthy()
  })

  it("a missing record's edit page is a missing record too", async () => {
    lookupRecord.mockResolvedValue("missing")
    expect(await renderAt("/alice.example.com/activity/3abc/edit")).toBe("Activity not found")
  })

  it("falls back to the generic page when the lookups run long", async () => {
    vi.useFakeTimers()
    lookupActor.mockReturnValue(new Promise(() => {}))
    pathname.value = "/alice.example.com/typo"
    const page = NotFoundPage()
    await vi.advanceTimersByTimeAsync(3_000)
    render(await page)
    vi.useRealTimers()
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Page not found")
  })

  it.each([
    ["a typo under a real profile", "/alice.example.com/typo", undefined],
    ["an actor that couldn't be looked up", "/alice.example.com/typo", { status: "unknown" }],
    ["a reserved route", "/settings/nope", undefined],
  ])("%s stays a generic page", async (_label, path, actor) => {
    if (actor) lookupActor.mockResolvedValue(actor)
    expect(await renderAt(path)).toBe("Page not found")
  })
})
