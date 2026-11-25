import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/identity", () => ({
  getDid: vi.fn(async (handle: string) =>
    handle === "alice.bsky.social" ? "did:plc:alice111111111111111111" : null,
  ),
}));

const { parseTarget, resolveAccountDid, resolveAwardSubject } = await import("./resolve-target");

describe("parseTarget", () => {
  it("parses handles, @handles, DIDs, and AT-URIs", () => {
    expect(parseTarget("@alice.bsky.social")).toEqual({
      kind: "handle",
      handle: "alice.bsky.social",
    });
    expect(parseTarget("maearth.com")).toEqual({ kind: "handle", handle: "maearth.com" });
    expect(parseTarget("did:plc:alice111111111111111111")).toEqual({
      kind: "did",
      did: "did:plc:alice111111111111111111",
    });
    expect(parseTarget("at://did:plc:abc/org.hypercerts.claim.activity/3k2a")).toEqual({
      kind: "uri",
      uri: "at://did:plc:abc/org.hypercerts.claim.activity/3k2a",
    });
  });

  it("parses Certified profile, project, and activity URLs", () => {
    expect(parseTarget("https://certified.app/alice.bsky.social")).toEqual({
      kind: "handle",
      handle: "alice.bsky.social",
    });
    expect(parseTarget("https://certified.app/did:plc:abc/project/3k2a")).toEqual({
      kind: "record-path",
      actor: "did:plc:abc",
      collection: "org.hypercerts.collection",
      rkey: "3k2a",
    });
    expect(parseTarget("https://certified.app/alice.bsky.social/activity/3k2b")).toEqual({
      kind: "record-path",
      actor: "alice.bsky.social",
      collection: "org.hypercerts.claim.activity",
      rkey: "3k2b",
    });
  });

  it("rejects reserved app paths and malformed inputs", () => {
    expect(parseTarget("https://certified.app/explore")).toBeNull();
    expect(parseTarget("https://certified.app/workspace")).toBeNull();
    expect(parseTarget("not a handle")).toBeNull();
    expect(parseTarget("at://bad-uri")).toBeNull();
  });
});

describe("resolvers", () => {
  it("resolves handles and URLs to account DIDs and record AT-URIs", async () => {
    expect(await resolveAccountDid("@alice.bsky.social")).toBe("did:plc:alice111111111111111111");
    expect(
      await resolveAccountDid("https://certified.app/alice.bsky.social/project/r1"),
    ).toBeNull();
    expect(await resolveAwardSubject("https://certified.app/alice.bsky.social/project/r1")).toEqual(
      {
        uri: "at://did:plc:alice111111111111111111/org.hypercerts.collection/r1",
      },
    );
    expect(await resolveAwardSubject("@alice.bsky.social")).toEqual({
      did: "did:plc:alice111111111111111111",
    });
  });
});
