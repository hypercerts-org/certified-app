import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getProfileFeed: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("@/lib/hypercerts/queries", () => ({ getProfileFeed: mocks.getProfileFeed }));
vi.mock("@/lib/log", () => ({ logError: mocks.logError }));

const { GET } = await import("./route");

const validDid = "did:plc:user11111111111111111111";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/profile-feed", () => {
  it("rejects missing or invalid DID and malformed cursors with 400", async () => {
    expect((await GET(new NextRequest("http://localhost:3000/api/profile-feed"))).status).toBe(400);
    expect(
      (await GET(new NextRequest("http://localhost:3000/api/profile-feed?did=not-a-did"))).status,
    ).toBe(400);
    expect(
      (
        await GET(
          new NextRequest(`http://localhost:3000/api/profile-feed?did=${validDid}&cursor=bad!`),
        )
      ).status,
    ).toBe(400);
    expect(mocks.getProfileFeed).not.toHaveBeenCalled();
  });

  it("returns cacheable feed JSON on success", async () => {
    mocks.getProfileFeed.mockResolvedValueOnce({ items: [{ id: "1" }], cursor: "next_1" });
    const res = await GET(
      new NextRequest(`http://localhost:3000/api/profile-feed?did=${validDid}&cursor=abc_1`),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("s-maxage=60");
    expect(mocks.getProfileFeed).toHaveBeenCalledWith(validDid, "abc_1");
    expect(await res.json()).toEqual({ items: [{ id: "1" }], cursor: "next_1" });
  });

  it("returns 503 with private no-store when upstream fails", async () => {
    mocks.getProfileFeed.mockRejectedValueOnce(new Error("indexer unavailable"));
    const res = await GET(
      new NextRequest(`http://localhost:3000/api/profile-feed?did=${validDid}`),
    );
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await res.json()).toEqual({ error: "ProfileFeedUnavailable" });
  });
});
