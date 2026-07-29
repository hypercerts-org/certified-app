import { describe, expect, it } from "vitest"
import { groupConsecutiveEndorsements } from "../group-feed"
import type { HomeFeedActor, HomeFeedEvent } from "@/hooks/use-home-feed"

function actor(did: string, complete = false): HomeFeedActor {
  return {
    did,
    handle: complete ? `${did.slice(-5)}.example` : null,
    displayName: complete ? `Actor ${did.slice(-3)}` : null,
    avatarUrl: null,
    complete,
  }
}

function endorsement(uri: string, issuer: string, subjectDid: string, complete = false): HomeFeedEvent {
  return {
    kind: "endorsement.award",
    uri,
    actor: issuer,
    actorProfile: actor(issuer, complete),
    createdAt: "2026-05-27T12:00:00.000Z",
    subject: actor(subjectDid, complete),
    note: null,
  }
}

function cert(uri: string, issuer: string): HomeFeedEvent {
  return {
    kind: "cert.create",
    uri,
    actor: issuer,
    actorProfile: actor(issuer),
    createdAt: "2026-05-27T12:00:00.000Z",
    view: {
      title: "Activity",
      shortDescription: null,
      imageUrl: null,
      startDate: null,
      endDate: null,
      locationCount: 0,
    },
  }
}

describe("groupConsecutiveEndorsements", () => {
  it("passes through empty and non-endorsement inputs", () => {
    const event = cert("at://1", "did:plc:alice")
    expect(groupConsecutiveEndorsements([])).toEqual([])
    expect(groupConsecutiveEndorsements([event])).toEqual([{ type: "single", event }])
  })

  it("keeps one endorsement as a single row", () => {
    const event = endorsement("at://1", "did:plc:alice", "did:plc:bob")
    expect(groupConsecutiveEndorsements([event])).toEqual([{ type: "single", event }])
  })

  it("groups consecutive endorsements and preserves hydrated subject summaries", () => {
    const first = endorsement("at://1", "did:plc:alice", "did:plc:bob", true)
    const second = endorsement("at://2", "did:plc:alice", "did:plc:carol", true)
    const result = groupConsecutiveEndorsements([first, second])

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      type: "endorsementGroup",
      key: "at://1",
      actor: "did:plc:alice",
      subjects: [
        { did: "did:plc:bob", complete: true },
        { did: "did:plc:carol", complete: true },
      ],
    })
  })

  it("does not merge across actors or an intervening event", () => {
    const alice = endorsement("at://1", "did:plc:alice", "did:plc:bob")
    const separator = cert("at://2", "did:plc:other")
    const laterAlice = endorsement("at://3", "did:plc:alice", "did:plc:carol")
    const bob = endorsement("at://4", "did:plc:bob", "did:plc:dana")

    expect(groupConsecutiveEndorsements([alice, separator, laterAlice, bob])).toEqual([
      { type: "single", event: alice },
      { type: "single", event: separator },
      { type: "single", event: laterAlice },
      { type: "single", event: bob },
    ])
  })
})
