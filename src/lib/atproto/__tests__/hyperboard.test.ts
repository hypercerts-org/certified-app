import { describe, it, expect, vi, beforeEach } from "vitest"

const authFetch = vi.fn()
vi.mock("@/lib/auth/fetch", () => ({
  authFetch: (...args: unknown[]) => authFetch(...args),
}))

import {
  buildBoardEntries,
  parseWeight,
  parseBoardRecord,
  fetchBoardForActivity,
  invalidateBoardForActivity,
  boardImageUrl,
  type ResolvedContributorProfile,
  type BuildEntriesInput,
} from "@/lib/atproto/hyperboard"
import type {
  BoardRecord,
  ContributorInformationRecord,
  DisplayProfileRecord,
} from "@/lib/atproto/hyperboard-types"
import type { ActivityContributor } from "@/lib/atproto/activity-types"

const uri = (s: string) => ({ $type: "org.hypercerts.defs#uri" as const, uri: s })

function input(over: Partial<BuildEntriesInput>): BuildEntriesInput {
  return {
    contributors: [],
    board: null,
    boardDid: "did:plc:board",
    contributorInfo: new Map<string, ContributorInformationRecord>(),
    resolved: new Map<string, ResolvedContributorProfile>(),
    displayProfiles: new Map<string, DisplayProfileRecord>(),
    ...over,
  }
}

describe("parseWeight", () => {
  it("parses positive numbers and falls back to 1", () => {
    expect(parseWeight("5")).toBe(5)
    expect(parseWeight("2.5")).toBe(2.5)
    expect(parseWeight("")).toBe(1)
    expect(parseWeight("0")).toBe(1)
    expect(parseWeight("-3")).toBe(1)
    expect(parseWeight("abc")).toBe(1)
    expect(parseWeight(undefined)).toBe(1)
  })
})

describe("buildBoardEntries precedence", () => {
  const contributors: ActivityContributor[] = [
    { contributorIdentity: { identity: "alice.test" }, contributionWeight: "5" },
  ]
  const board = (override: boolean): BoardRecord => ({
    subject: { uri: "at://did:plc:board/org.hypercerts.claim.activity/a", cid: "c" },
    createdAt: "",
    contributorConfigs: [
      {
        contributor: { identity: "alice.test" },
        override,
        displayName: "BoardName",
        image: uri("board.png"),
      },
    ],
  })
  const resolved = new Map<string, ResolvedContributorProfile>([
    ["alice.test", { did: "did:plc:a", displayName: "ProfileName", avatarUrl: "prof.png" }],
  ])
  const displayProfiles = new Map<string, DisplayProfileRecord>([
    ["did:plc:a", { displayName: "DPName", image: uri("dp.png"), createdAt: "" }],
  ])

  it("override config wins over everything", () => {
    const [e] = buildBoardEntries(
      input({ contributors, board: board(true), resolved, displayProfiles }),
    )
    expect(e.name).toBe("BoardName")
    expect(e.imageUrl).toBe("board.png")
    expect(e.value).toBe(5)
  })

  it("displayProfile wins when config is not an override", () => {
    const [e] = buildBoardEntries(
      input({ contributors, board: board(false), resolved, displayProfiles }),
    )
    expect(e.name).toBe("DPName")
    expect(e.imageUrl).toBe("dp.png")
  })

  it("actor profile wins over config fallback when no displayProfile", () => {
    const [e] = buildBoardEntries(
      input({ contributors, board: board(false), resolved }),
    )
    expect(e.name).toBe("ProfileName")
    expect(e.imageUrl).toBe("prof.png")
  })

  it("config fallback applies when no displayProfile or actor profile", () => {
    const [e] = buildBoardEntries(input({ contributors, board: board(false) }))
    expect(e.name).toBe("BoardName")
    expect(e.imageUrl).toBe("board.png")
  })

  it("contributorInformation supplies identity when nothing else is set", () => {
    const ref = { uri: "at://did:plc:board/org.hypercerts.claim.contributorInformation/1", cid: "c" }
    const [e] = buildBoardEntries(
      input({
        contributors: [{ contributorIdentity: ref }],
        contributorInfo: new Map([
          [ref.uri, { identifier: "x.handle", displayName: "InfoName", image: uri("info.png"), createdAt: "" }],
        ]),
      }),
    )
    expect(e.name).toBe("InfoName")
    expect(e.imageUrl).toBe("info.png")
  })

  it("falls back to the raw identity and no image when nothing resolves", () => {
    const [e] = buildBoardEntries(
      input({ contributors: [{ contributorIdentity: { identity: "plainname" } }] }),
    )
    expect(e.name).toBe("plainname")
    expect(e.imageUrl).toBeNull()
    expect(e.value).toBe(1)
  })
})

describe("boardImageUrl", () => {
  it("returns a bare string URL as-is (hyperboards-v2 stores backgroundImage as a string)", () => {
    expect(boardImageUrl("https://example.com/bg.jpg", "did:plc:x")).toBe(
      "https://example.com/bg.jpg",
    )
  })
  it("returns the uri from a uri union", () => {
    expect(boardImageUrl(uri("https://a/b.png"), "did:plc:x")).toBe("https://a/b.png")
  })
  it("returns null for nullish input", () => {
    expect(boardImageUrl(undefined, "did:plc:x")).toBeNull()
    expect(boardImageUrl(null, "did:plc:x")).toBeNull()
  })
})

describe("parseBoardRecord", () => {
  it("requires a subject strongRef", () => {
    expect(parseBoardRecord({ createdAt: "x" })).toBeNull()
    expect(parseBoardRecord({ subject: { uri: "at://x/y/z", cid: "c" }, createdAt: "x" })).not.toBeNull()
  })

  it("keeps valid contributorConfigs and drops malformed ones", () => {
    const board = parseBoardRecord({
      subject: { uri: "at://x/y/z", cid: "c" },
      createdAt: "x",
      contributorConfigs: [
        { contributor: { identity: "a" }, displayName: "A" },
        { contributor: { nope: true } },
        { displayName: "no contributor" },
      ],
    })
    expect(board?.contributorConfigs).toHaveLength(1)
    expect(board?.contributorConfigs?.[0].displayName).toBe("A")
  })
})

describe("fetchBoardForActivity", () => {
  beforeEach(() => authFetch.mockReset())

  it("returns the board whose subject matches the activity uri", async () => {
    const activityUri = "at://did:plc:author/org.hypercerts.claim.activity/act1"
    authFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        records: [
          {
            uri: "at://did:plc:author/org.hyperboards.board/other",
            cid: "c1",
            value: { subject: { uri: "at://did:plc:author/org.hypercerts.claim.activity/zzz", cid: "x" }, createdAt: "t" },
          },
          {
            uri: "at://did:plc:author/org.hyperboards.board/match",
            cid: "c2",
            value: { subject: { uri: activityUri, cid: "x" }, createdAt: "t" },
          },
        ],
      }),
    })
    invalidateBoardForActivity(activityUri)
    const result = await fetchBoardForActivity("did:plc:author", activityUri)
    expect(result?.rkey).toBe("match")
    expect(result?.board.subject.uri).toBe(activityUri)
  })

  it("returns null when no board matches", async () => {
    const activityUri = "at://did:plc:author/org.hypercerts.claim.activity/none"
    authFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ records: [] }),
    })
    invalidateBoardForActivity(activityUri)
    const result = await fetchBoardForActivity("did:plc:author", activityUri)
    expect(result).toBeNull()
  })
})
