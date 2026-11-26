import { describe, expect, it } from "vitest";
import { groupNetworkFeed, type NetworkFeedEntry } from "./feed-grouping";

const actor = (did: string, name: string) => ({
  did,
  handle: `${name.toLowerCase()}.certified.one`,
  displayName: name,
  description: null,
  avatarUrl: null,
  isOrganization: false,
});

const alice = actor("did:plc:alice1111111111111111111", "Alice");
const bob = actor("did:plc:bob222222222222222222222", "Bob");
const orgA = actor("did:plc:orga33333333333333333333", "OrgA");
const orgB = actor("did:plc:orgb44444444444444444444", "OrgB");
const orgC = actor("did:plc:orgc55555555555555555555", "OrgC");

function endorsement(
  id: string,
  who = alice,
  subject = orgA,
  date = "Jun 30, 2026",
): NetworkFeedEntry {
  return {
    kind: "endorsement.award",
    uri: `at://${who.did}/app.certified.badge.award/${id}`,
    actor: who,
    subject,
    date,
    createdAt: "2026-06-30T12:00:00.000Z",
  };
}

function activity(id: string, who = alice): NetworkFeedEntry {
  return {
    kind: "cert.create",
    uri: `at://${who.did}/org.hypercerts.claim.activity/${id}`,
    actor: who,
    href: `/${who.did}/activity/${id}`,
    title: `Activity ${id}`,
    summary: null,
    meta: null,
    imageUrl: null,
    date: "Jun 29, 2026",
    createdAt: "2026-06-29T12:00:00.000Z",
  };
}

describe("groupNetworkFeed", () => {
  it("leaves a single endorsement ungrouped", () => {
    const items = groupNetworkFeed([endorsement("1", alice, orgA)]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ type: "entry", key: endorsement("1", alice, orgA).uri });
  });

  it("collapses consecutive endorsements by the same actor and deduplicates repeated subjects", () => {
    const items = groupNetworkFeed([
      endorsement("1", alice, orgA),
      endorsement("2", alice, orgB),
      endorsement("3", alice, orgA), // duplicate subject
      endorsement("4", alice, orgC),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      type: "endorsementGroup",
      key: `at://${alice.did}/app.certified.badge.award/1`,
      actor: alice,
      subjects: [orgA, orgB, orgC],
    });
  });

  it("breaks an endorsement group when another event kind or another actor intervenes", () => {
    const items = groupNetworkFeed([
      endorsement("1", alice, orgA),
      endorsement("2", alice, orgB),
      activity("a1", alice),
      endorsement("3", alice, orgC),
      endorsement("4", bob, orgA),
    ]);
    expect(items.map((i) => i.type)).toEqual(["endorsementGroup", "entry", "entry", "entry"]);
  });
});
