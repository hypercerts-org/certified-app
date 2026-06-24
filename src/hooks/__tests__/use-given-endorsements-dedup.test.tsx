import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor, cleanup } from "@testing-library/react"
import type { BadgeAwardRecord } from "@/lib/atproto/badges"

/**
 * The profile "Given" view counts UNIQUE endorsed accounts (matching the
 * /endorsement-graph graph, which dedupes issuer→subject edges). A recipient
 * endorsed more than once must collapse to a single entry whose `rkeys`
 * lists every award, so a revoke can remove them all.
 */

let serverAwards: BadgeAwardRecord[] = []

vi.mock("@/lib/atproto/badges", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/atproto/badges")>()
  return {
    ...actual,
    listDefinitions: vi.fn(async () => []),
    listAwards: vi.fn(async () => serverAwards),
    endorsementDefUriSet: vi.fn(async () => new Set(["at://issuer/badge/x"])),
  }
})

import { useGivenEndorsements } from "../use-endorsements"

function award(rkey: string, subjectDid: string, createdAt: string): BadgeAwardRecord {
  return {
    uri: `at://me/app.certified.badge.award/${rkey}`,
    cid: `cid-${rkey}`,
    rkey,
    value: {
      badge: { uri: "at://issuer/badge/x", cid: "cid-badge" },
      subject: { did: subjectDid },
      createdAt,
    } as BadgeAwardRecord["value"],
  }
}

beforeEach(() => {
  cleanup()
  serverAwards = []
})

describe("useGivenEndorsements — unique-recipient dedup", () => {
  it("collapses repeat endorsements of one account into a single entry", async () => {
    // Account A endorsed twice, account B once.
    serverAwards = [
      award("a1", "did:plc:A", "2026-03-01T00:00:00.000Z"),
      award("a2", "did:plc:A", "2026-01-01T00:00:00.000Z"),
      award("b1", "did:plc:B", "2026-02-01T00:00:00.000Z"),
    ]

    const { result } = renderHook(() => useGivenEndorsements("did:plc:me"))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Two UNIQUE recipients, not three raw awards.
    expect(result.current.endorsements).toHaveLength(2)

    const a = result.current.endorsements.find((e) => e.subjectDid === "did:plc:A")
    const b = result.current.endorsements.find((e) => e.subjectDid === "did:plc:B")

    // A carries BOTH award rkeys; the representative is the newest (a1).
    expect(a?.rkeys.sort()).toEqual(["a1", "a2"])
    expect(a?.rkey).toBe("a1")
    expect(a?.createdAt).toBe("2026-03-01T00:00:00.000Z")

    expect(b?.rkeys).toEqual(["b1"])
  })
})
