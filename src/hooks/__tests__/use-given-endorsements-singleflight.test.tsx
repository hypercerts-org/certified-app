import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, act, waitFor, cleanup } from "@testing-library/react"
import type { BadgeAwardRecord } from "@/lib/atproto/badges"

// useGivenEndorsements deliberately has NO TTL cache (fresh on every
// mount), but concurrent mounts for the same DID — the Given panel and
// its manage modal — must share ONE in-flight two-call PDS load, and a
// forced refetch must bypass that shared load with noCache.

const listAwardsMock = vi.fn()
vi.mock("@/lib/atproto/badges", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/atproto/badges")>()
  return {
    ...actual,
    listDefinitions: vi.fn(async () => []),
    listAwards: (...args: unknown[]) => listAwardsMock(...args),
    endorsementDefUriSet: vi.fn(async () => new Set(["at://issuer/badge/x"])),
  }
})

import { useGivenEndorsements } from "../use-endorsements"

function award(rkey: string, subjectDid: string): BadgeAwardRecord {
  return {
    uri: `at://me/app.certified.badge.award/${rkey}`,
    cid: `cid-${rkey}`,
    rkey,
    value: {
      badge: { uri: "at://issuer/badge/x", cid: "cid-badge" },
      subject: { did: subjectDid },
      createdAt: "2026-01-01T00:00:00.000Z",
    } as BadgeAwardRecord["value"],
  }
}

beforeEach(() => {
  cleanup()
  listAwardsMock.mockReset()
})

describe("useGivenEndorsements — in-flight coalescing (no TTL cache)", () => {
  it("two simultaneous mounts share one PDS load", async () => {
    let resolveAwards: (v: BadgeAwardRecord[]) => void = () => {}
    listAwardsMock.mockImplementation(
      () =>
        new Promise<BadgeAwardRecord[]>((resolve) => {
          resolveAwards = resolve
        }),
    )

    const did = "did:plc:given-singleflight"
    const a = renderHook(() => useGivenEndorsements(did))
    const b = renderHook(() => useGivenEndorsements(did))

    await waitFor(() => expect(listAwardsMock).toHaveBeenCalledTimes(1))

    await act(async () => {
      resolveAwards([award("a1", "did:plc:subject")])
    })

    await waitFor(() => {
      expect(a.result.current.isLoading).toBe(false)
      expect(b.result.current.isLoading).toBe(false)
    })
    expect(listAwardsMock).toHaveBeenCalledTimes(1)
    expect(a.result.current.endorsements).toHaveLength(1)
    expect(b.result.current.endorsements).toEqual(a.result.current.endorsements)
  })

  it("refetch bypasses the shared load and passes noCache", async () => {
    listAwardsMock.mockImplementation(async () => [])

    const did = "did:plc:given-refetch"
    const hook = renderHook(() => useGivenEndorsements(did))
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false))
    expect(listAwardsMock).toHaveBeenCalledTimes(1)
    expect(listAwardsMock.mock.calls[0][2]).toBeUndefined()

    await act(async () => {
      await hook.result.current.refetch()
    })
    expect(listAwardsMock).toHaveBeenCalledTimes(2)
    // Post-write freshness: the forced load must beat the proxy's 5s
    // listRecords cache.
    expect(listAwardsMock.mock.calls[1][2]).toEqual({ noCache: true })
  })
})
