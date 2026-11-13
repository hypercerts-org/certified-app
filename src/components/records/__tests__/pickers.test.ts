import { describe, it, expect } from "vitest"
import { changesFor, membershipOf } from "../project-picker-dialog"
import { projectChangeFor } from "../activity-picker-dialog"
import type { CollectionRecord } from "@/lib/atproto/collection"
import type { ActivityRecord } from "@/lib/atproto/activity-types"

const DID = "did:plc:me"
const ref = (n: number) => ({
  uri: `at://${DID}/org.hypercerts.claim.activity/a${n}`,
  cid: `cid-a${n}`,
})
const project = (rkey: string, items: number[]): CollectionRecord => ({
  uri: `at://${DID}/org.hypercerts.collection/${rkey}`,
  cid: `cid-${rkey}`,
  value: { title: rkey, items: items.map((n) => ({ itemIdentifier: ref(n) })) },
})
const activity = (n: number): ActivityRecord => ({
  ...ref(n),
  value: { title: `A${n}`, shortDescription: "", createdAt: "2025-01-01T00:00:00.000Z" },
})

describe("membershipOf", () => {
  it("reads all, some or none of the selection", () => {
    const uris = [ref(1).uri, ref(2).uri]
    expect(membershipOf(project("p", [1, 2, 3]), uris)).toBe("all")
    expect(membershipOf(project("p", [2]), uris)).toBe("some")
    expect(membershipOf(project("p", [3]), uris)).toBe("none")
  })
})

describe("changesFor", () => {
  const selection = [ref(1), ref(2)]
  const p1 = project("p1", [2])
  const p2 = project("p2", [1, 2, 9])
  const p3 = project("p3", [])

  it("adds only what a ticked project lacks", () => {
    const out = changesFor([p1, p2, p3], selection, new Map([[p1.uri, "all"]]))
    expect(out).toEqual([{ project: p1, add: [ref(1)], remove: [] }])
  })

  it("removes only the selected activities an unticked project holds", () => {
    const out = changesFor([p1, p2, p3], selection, new Map([[p2.uri, "none"]]))
    expect(out).toEqual([{ project: p2, add: [], remove: [ref(1).uri, ref(2).uri] }])
  })

  it("skips untouched projects and choices that change nothing", () => {
    const out = changesFor(
      [p1, p2, p3],
      selection,
      new Map<string, "all" | "none">([
        [p2.uri, "all"],
        [p3.uri, "none"],
      ]),
    )
    expect(out).toEqual([])
  })
})

describe("projectChangeFor", () => {
  const p = project("p", [1, 2, 99])
  const mine = [activity(1), activity(2), activity(3)]

  it("adds ticked activities and removes unticked own ones, leaving others' items alone", () => {
    const change = projectChangeFor(p, mine, new Set([ref(1).uri, ref(3).uri]))
    expect(change).toEqual({ project: p, add: [ref(3)], remove: [ref(2).uri] })
  })

  it("is null when nothing changes", () => {
    expect(projectChangeFor(p, mine, new Set([ref(1).uri, ref(2).uri]))).toBeNull()
  })
})
