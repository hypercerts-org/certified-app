import type { LexMap } from "@atproto/lex";
import { describe, expect, it, vi } from "vitest";
import { activityForEditing, projectForEditing } from "./record-drafts";
import type { Repository } from "./writes";

vi.mock("@/lib/hypercerts/queries", () => ({
  getActor: async (did: string) => ({ did, handle: "alice.example.com" }),
  getPlace: async () => ({ name: "Kitale, Kenya", short: "Kenya", point: { lat: 1, lng: 35 } }),
}));

const DID = "did:plc:abc123";
const repoWith = (value: Record<string, unknown>): Repository => ({
  did: DID,
  getRecord: async () => ({ cid: "bafycurrent", value: value as LexMap }),
  putRecord: async () => {
    throw new Error("no writes");
  },
  createRecord: async () => {
    throw new Error("no writes");
  },
});

describe("activityForEditing", () => {
  it("fills the form from the stored record", async () => {
    const editing = await activityForEditing(
      repoWith({
        $type: "org.hypercerts.claim.activity",
        title: "Planting day",
        shortDescription: "We planted trees.",
        description: { $type: "org.hypercerts.defs#descriptionString", value: "All of it." },
        workScope: { $type: "org.hypercerts.claim.activity#workScopeString", scope: "planting" },
        startDate: "2026-03-01T00:00:00Z",
        contributors: [
          {
            contributorIdentity: {
              $type: "org.hypercerts.claim.activity#contributorIdentity",
              identity: DID,
            },
            contributionWeight: "2",
          },
        ],
        locations: [{ uri: `at://${DID}/app.certified.location/1`, cid: "bafyloc" }],
        createdAt: "2026-03-02T00:00:00Z",
      }),
      "3k",
    );
    expect(editing?.initial).toMatchObject({
      title: "Planting day",
      shortDescription: "We planted trees.",
      description: "All of it.",
      workScope: "planting",
      startDate: "2026-03-01",
      endDate: "",
      contributors: [{ identity: "alice.example.com", role: "", share: "2" }],
      location: {
        kind: "saved",
        uri: `at://${DID}/app.certified.location/1`,
        name: "Kitale, Kenya",
      },
    });
    expect(editing?.kept).toEqual({
      description: false,
      workScope: false,
      contributors: 0,
      locations: 0,
    });
  });

  it("keeps what the form can't show", async () => {
    const editing = await activityForEditing(
      repoWith({
        title: "T",
        shortDescription: "S",
        description: { $type: "pub.leaflet.pages.linearDocument", blocks: [] },
        workScope: { $type: "org.hypercerts.workscope.cel", expression: "x", usedTags: [] },
        contributors: [{ contributorIdentity: { uri: "at://x/y/z", cid: "bafy" } }],
      }),
      "3k",
    );
    expect(editing?.kept).toEqual({
      description: true,
      workScope: true,
      contributors: 1,
      locations: 0,
    });
    expect(editing?.initial.contributors).toEqual([]);
  });
});

describe("projectForEditing", () => {
  it("fills the form from the stored record", async () => {
    const activity = `at://${DID}/org.hypercerts.claim.activity/a1`;
    const editing = await projectForEditing(
      repoWith({
        type: "project",
        title: "Forest",
        shortDescription: "Trees",
        items: [{ itemIdentifier: { uri: activity, cid: "bafya" } }],
        createdAt: "2026-03-02T00:00:00Z",
      }),
      "3p",
    );
    expect(editing?.initial).toMatchObject({
      title: "Forest",
      shortDescription: "Trees",
      description: "",
      activities: [activity],
      banner: null,
      location: null,
    });
  });
});
