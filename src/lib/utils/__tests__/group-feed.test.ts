import { describe, it, expect } from "vitest"
import { groupConsecutiveEndorsements } from "../group-feed"
import type { HomeFeedEvent } from "@/hooks/use-home-feed"

// Test fixtures — produce minimal HomeFeedEvent shapes.
function endorsement(opts: {
  uri: string
  actor: string
  subjectDid: string
  createdAt?: string
  handle?: string
  displayName?: string
}): HomeFeedEvent {
  return {
    kind: "endorsement.award",
    uri: opts.uri,
    actor: opts.actor,
    actorProfile: {
      did: opts.actor,
      handle: opts.handle ?? null,
      displayName: opts.displayName ?? null,
      avatarCid: null,
    },
    createdAt: opts.createdAt ?? "2026-05-27T12:00:00.000Z",
    subjectDid: opts.subjectDid,
    note: null,
  }
}

function cert(opts: {
  uri: string
  actor: string
  createdAt?: string
}): HomeFeedEvent {
  return {
    kind: "cert.create",
    uri: opts.uri,
    actor: opts.actor,
    actorProfile: {
      did: opts.actor,
      handle: null,
      displayName: null,
      avatarCid: null,
    },
    createdAt: opts.createdAt ?? "2026-05-27T12:00:00.000Z",
    record: {
      uri: opts.uri,
      cid: "cid",
      value: { title: "T", $type: "org.hypercerts.claim.activity" },
    } as never,
    labels: [],
  }
}

describe("groupConsecutiveEndorsements", () => {
  it("passes through an empty event list", () => {
    expect(groupConsecutiveEndorsements([])).toEqual([])
  })

  it("passes through non-endorsement events untouched", () => {
    const c = cert({ uri: "at://1", actor: "did:plc:alice" })
    const items = groupConsecutiveEndorsements([c])
    expect(items).toEqual([{ type: "single", event: c }])
  })

  it("a single endorsement does NOT form a group", () => {
    const e = endorsement({
      uri: "at://1",
      actor: "did:plc:alice",
      subjectDid: "did:plc:bob",
    })
    const items = groupConsecutiveEndorsements([e])
    expect(items).toEqual([{ type: "single", event: e }])
  })

  it("two consecutive endorsements by the same actor form a group of two", () => {
    const e1 = endorsement({
      uri: "at://1",
      actor: "did:plc:alice",
      subjectDid: "did:plc:bob",
    })
    const e2 = endorsement({
      uri: "at://2",
      actor: "did:plc:alice",
      subjectDid: "did:plc:carol",
    })
    const items = groupConsecutiveEndorsements([e1, e2])
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      type: "endorsementGroup",
      actor: "did:plc:alice",
      subjectDids: ["did:plc:bob", "did:plc:carol"],
    })
    expect(items[0].type === "endorsementGroup" && items[0].key).toBe(
      "at://1",
    )
  })

  it("three consecutive endorsements by the same actor form a group of three", () => {
    const e1 = endorsement({
      uri: "at://1",
      actor: "did:plc:alice",
      subjectDid: "did:plc:b",
    })
    const e2 = endorsement({
      uri: "at://2",
      actor: "did:plc:alice",
      subjectDid: "did:plc:c",
    })
    const e3 = endorsement({
      uri: "at://3",
      actor: "did:plc:alice",
      subjectDid: "did:plc:d",
    })
    const items = groupConsecutiveEndorsements([e1, e2, e3])
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      type: "endorsementGroup",
      subjectDids: ["did:plc:b", "did:plc:c", "did:plc:d"],
    })
  })

  it("endorsements from different actors don't merge", () => {
    const aliceE = endorsement({
      uri: "at://1",
      actor: "did:plc:alice",
      subjectDid: "did:plc:b",
    })
    const bobE = endorsement({
      uri: "at://2",
      actor: "did:plc:bob",
      subjectDid: "did:plc:c",
    })
    const items = groupConsecutiveEndorsements([aliceE, bobE])
    expect(items).toEqual([
      { type: "single", event: aliceE },
      { type: "single", event: bobE },
    ])
  })

  it("a non-endorsement event between two endorsements by the same actor breaks the group", () => {
    const e1 = endorsement({
      uri: "at://1",
      actor: "did:plc:alice",
      subjectDid: "did:plc:b",
    })
    const c = cert({ uri: "at://2", actor: "did:plc:other" })
    const e3 = endorsement({
      uri: "at://3",
      actor: "did:plc:alice",
      subjectDid: "did:plc:d",
    })
    const items = groupConsecutiveEndorsements([e1, c, e3])
    expect(items).toEqual([
      { type: "single", event: e1 },
      { type: "single", event: c },
      { type: "single", event: e3 },
    ])
  })

  it("supports multiple groups in sequence by different actors", () => {
    const aliceA = endorsement({
      uri: "at://1",
      actor: "did:plc:alice",
      subjectDid: "did:plc:x",
    })
    const aliceB = endorsement({
      uri: "at://2",
      actor: "did:plc:alice",
      subjectDid: "did:plc:y",
    })
    const bobA = endorsement({
      uri: "at://3",
      actor: "did:plc:bob",
      subjectDid: "did:plc:m",
    })
    const bobB = endorsement({
      uri: "at://4",
      actor: "did:plc:bob",
      subjectDid: "did:plc:n",
    })
    const items = groupConsecutiveEndorsements([aliceA, aliceB, bobA, bobB])
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({
      type: "endorsementGroup",
      actor: "did:plc:alice",
      subjectDids: ["did:plc:x", "did:plc:y"],
    })
    expect(items[1]).toMatchObject({
      type: "endorsementGroup",
      actor: "did:plc:bob",
      subjectDids: ["did:plc:m", "did:plc:n"],
    })
  })

  it("group's createdAt is the first (latest) endorsement's createdAt", () => {
    const newer = endorsement({
      uri: "at://1",
      actor: "did:plc:alice",
      subjectDid: "did:plc:b",
      createdAt: "2026-05-27T12:00:00.000Z",
    })
    const older = endorsement({
      uri: "at://2",
      actor: "did:plc:alice",
      subjectDid: "did:plc:c",
      createdAt: "2026-05-27T11:55:00.000Z",
    })
    const items = groupConsecutiveEndorsements([newer, older])
    expect(items[0]).toMatchObject({
      type: "endorsementGroup",
      createdAt: "2026-05-27T12:00:00.000Z",
    })
  })

  it("interleaved single + group + single", () => {
    const certA = cert({ uri: "at://1", actor: "did:plc:other1" })
    const aliceA = endorsement({
      uri: "at://2",
      actor: "did:plc:alice",
      subjectDid: "did:plc:x",
    })
    const aliceB = endorsement({
      uri: "at://3",
      actor: "did:plc:alice",
      subjectDid: "did:plc:y",
    })
    const certB = cert({ uri: "at://4", actor: "did:plc:other2" })
    const items = groupConsecutiveEndorsements([certA, aliceA, aliceB, certB])
    expect(items).toHaveLength(3)
    expect(items[0]).toEqual({ type: "single", event: certA })
    expect(items[1]).toMatchObject({
      type: "endorsementGroup",
      subjectDids: ["did:plc:x", "did:plc:y"],
    })
    expect(items[2]).toEqual({ type: "single", event: certB })
  })
})
