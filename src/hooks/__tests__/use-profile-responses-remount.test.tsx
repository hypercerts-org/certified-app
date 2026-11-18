import { StrictMode, createElement, type ReactNode } from "react"
import { describe, it, expect, vi } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"

// A load whose component unmounted (StrictMode's double effect in dev, or a
// Workspace pane remounted mid-load) is aborted and never writes the store.
// The remount used to join that aborted load, so the responses never
// arrived: a hidden endorsement showed as shown ("Hide from profile").

const RESPONSE = {
  uri: "at://did:plc:group/app.certified.badge.response/1",
  cid: "c1",
  rkey: "1",
  value: {
    badgeAward: { uri: "at://did:plc:ana/app.certified.badge.award/1", cid: "a1" },
    response: "rejected",
    createdAt: "2026-07-01T10:00:00Z",
  },
}

vi.mock("@/lib/atproto/badges", () => ({
  listResponses: vi.fn(
    (_did: string, signal?: AbortSignal) =>
      new Promise((resolve, reject) => {
        setTimeout(() => {
          // As fetch does: an aborted request rejects.
          if (signal?.aborted) reject(new DOMException("Aborted", "AbortError"))
          else resolve([RESPONSE])
        }, 0)
      }),
  ),
}))

import { useProfileResponses } from "../use-profile-responses"

describe("useProfileResponses after a remount mid-load", () => {
  it("loads under StrictMode (mount, cleanup, mount)", async () => {
    const wrapper = ({ children }: { children: ReactNode }) => createElement(StrictMode, null, children)
    const { result } = renderHook(() => useProfileResponses("did:plc:group"), { wrapper })
    await waitFor(() => expect(result.current.responses).toHaveLength(1))
    expect(result.current.isLoading).toBe(false)
  })

  it("loads when a component unmounts mid-load and another mounts", async () => {
    const first = renderHook(() => useProfileResponses("did:plc:other"))
    // Unmounted before the load lands: its signal is aborted.
    first.unmount()
    const { result } = renderHook(() => useProfileResponses("did:plc:other"))
    await waitFor(() => expect(result.current.responses).toHaveLength(1))
  })
})
