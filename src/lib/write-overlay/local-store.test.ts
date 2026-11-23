import { describe, expect, it } from "vitest";
import { type FollowSave, followCaughtUp, indexCaughtUp, type SavedRecord } from "./local-store";

const save = (cid: string, replaced: (string | null)[]): SavedRecord => ({
  uri: "at://did:plc:ewvi7nxzyoun6zhxrhs64oiz/app.certified.actor.profile/self",
  cid,
  replaced,
  savedAt: 0,
  value: {},
});

describe("indexCaughtUp", () => {
  it("waits while the index still shows a version the saves replaced", () => {
    expect(indexCaughtUp("bafya", save("bafyb", ["bafya"]))).toBe(false);
    expect(indexCaughtUp(null, save("bafyb", [null]))).toBe(false);
  });

  it("waits through successive saves while the index is more than one behind", () => {
    const second = save("bafyc", ["bafya", "bafyb"]);
    expect(indexCaughtUp("bafya", second)).toBe(false);
    expect(indexCaughtUp("bafyb", second)).toBe(false);
  });

  it("is caught up once the index shows the save", () => {
    expect(indexCaughtUp("bafyc", save("bafyc", ["bafya", "bafyb"]))).toBe(true);
  });

  it("is caught up by a save that stored the version it replaced (no change)", () => {
    expect(indexCaughtUp("bafya", save("bafya", ["bafya"]))).toBe(true);
  });

  it("is caught up when the index shows a later change made elsewhere", () => {
    expect(indexCaughtUp("bafyother", save("bafyb", ["bafya"]))).toBe(true);
  });
});

const followSave = (following: boolean, removed: string[] = []): FollowSave => ({
  actor: "did:plc:ewvi7nxzyoun6zhxrhs64oiz",
  subject: "did:plc:sgbjeh7yb3n2edoiaty3gheq",
  following,
  follow: null,
  removed,
  savedAt: 0,
});
const indexed = (rkey: string) => ({
  uri: `at://did:plc:ewvi7nxzyoun6zhxrhs64oiz/app.certified.graph.follow/${rkey}`,
  cid: "bafya",
});

describe("followCaughtUp", () => {
  it("waits for a follow until the index shows one", () => {
    expect(followCaughtUp(null, followSave(true))).toBe(false);
    expect(followCaughtUp(indexed("3k1"), followSave(true))).toBe(true);
  });

  it("waits for an unfollow while the index shows a follow it deleted", () => {
    const save = followSave(false, [indexed("3k1").uri]);
    expect(followCaughtUp(indexed("3k1"), save)).toBe(false);
    expect(followCaughtUp(null, save)).toBe(true);
  });

  it("is caught up with an unfollow when the index shows a follow made since", () => {
    expect(followCaughtUp(indexed("3k2"), followSave(false, [indexed("3k1").uri]))).toBe(true);
  });
});
