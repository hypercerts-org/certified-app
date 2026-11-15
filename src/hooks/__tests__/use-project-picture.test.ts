import { describe, expect, it } from "vitest"
import { projectPictureFrom } from "../use-project-picture"
import { projectActivityUris, type CollectionValue } from "@/lib/atproto/collection"
import type { ActivityRecord } from "@/lib/atproto/activity-types"

const A1 = "at://did:plc:org/org.hypercerts.claim.activity/a1"
const A2 = "at://did:plc:org/org.hypercerts.claim.activity/a2"

const blob = (cid: string) => ({
  $type: "org.hypercerts.defs#smallImage",
  image: { $type: "blob", ref: { $link: cid }, mimeType: "image/jpeg", size: 1 },
})

function activity(uri: string, image?: string): ActivityRecord {
  return {
    uri,
    cid: "c",
    value: { title: "An activity", ...(image ? { image: blob(image) } : {}) },
  } as unknown as ActivityRecord
}

function project(extra: Record<string, unknown> = {}): CollectionValue {
  return {
    title: "A project",
    items: [{ itemIdentifier: { uri: A1, cid: "x" } }, { uri: A2 }],
    ...extra,
  } as unknown as CollectionValue
}

describe("projectActivityUris", () => {
  it("reads both item shapes, in order and once each, activities only", () => {
    expect(
      projectActivityUris([
        { itemIdentifier: { uri: A1 } },
        { uri: A2 },
        { uri: A1 },
        { uri: "at://did:plc:org/org.hypercerts.collection/p" },
        null,
      ]),
    ).toEqual([A1, A2])
    expect(projectActivityUris(undefined)).toEqual([])
  })
})

describe("projectPictureFrom", () => {
  it("uses the banner first", () => {
    const url = projectPictureFrom(project({ banner: blob("bannercid") }), "did:plc:org", [
      activity(A1, "photocid"),
    ])
    expect(url).toContain("cid=bannercid")
  })

  it("falls back to the first of its activities with a photo, in the project's order", () => {
    const url = projectPictureFrom(project(), "did:plc:org", [
      activity(A2, "second"),
      activity(A1),
    ])
    expect(url).toContain("cid=second")
  })

  it("is undefined when the known activities don't answer, null with none at all", () => {
    expect(projectPictureFrom(project(), "did:plc:org", [])).toBeUndefined()
    expect(projectPictureFrom(project({ items: [] }), "did:plc:org", [])).toBeNull()
  })
})
