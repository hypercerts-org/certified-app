import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connection: vi.fn(async () => {}),
  getUser: vi.fn(),
  getActingAs: vi.fn(),
  getTrustedEvaluators: vi.fn(),
  getNetworkFeed: vi.fn(),
  logError: vi.fn(),
}));

class MockFeedServiceError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, connection: mocks.connection };
});
vi.mock("@/lib/auth/dal", () => ({
  getUser: mocks.getUser,
  SessionUnavailableError: class SessionUnavailableError extends Error {},
}));
vi.mock("@/lib/acting-as", () => ({ getActingAs: mocks.getActingAs }));
vi.mock("@/lib/views-service", () => ({
  FeedServiceError: MockFeedServiceError,
  getTrustedEvaluators: mocks.getTrustedEvaluators,
  getNetworkFeed: mocks.getNetworkFeed,
}));
vi.mock("@/lib/log", () => ({ logError: mocks.logError }));

const { GET } = await import("./route");

const userDid = "did:plc:user11111111111111111111";
const orgDid = "did:plc:org111111111111111111111";
const evalA = "did:plc:evalaaaaaaaaaaaaaaaaaaaa";
const evalB = "did:plc:evalbbbbbbbbbbbbbbbbbbbb";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ did: userDid });
  mocks.getActingAs.mockResolvedValue(orgDid);
  mocks.getTrustedEvaluators.mockResolvedValue([{ did: evalA }, { did: evalB }]);
  mocks.getNetworkFeed.mockResolvedValue({ items: [], cursor: null });
});

describe("GET /api/feed", () => {
  it("returns 401 private no-store when signed out", async () => {
    mocks.getUser.mockResolvedValueOnce(null);
    const res = await GET(new NextRequest("http://localhost:3000/api/feed"));
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await res.json()).toEqual({ error: "SignedOut" });
  });

  it("rejects malformed cursor, evaluators, orgQuality, and kinds with 400", async () => {
    expect(
      (await GET(new NextRequest("http://localhost:3000/api/feed?cursor=bad!cursor"))).status,
    ).toBe(400);
    expect(
      (await GET(new NextRequest("http://localhost:3000/api/feed?evaluators=not-a-did"))).status,
    ).toBe(400);
    expect(
      (await GET(new NextRequest("http://localhost:3000/api/feed?orgQuality=bogus"))).status,
    ).toBe(400);
    expect((await GET(new NextRequest("http://localhost:3000/api/feed?kinds=bogus"))).status).toBe(
      400,
    );
    expect(mocks.getNetworkFeed).not.toHaveBeenCalled();
  });

  it("uses actingAs DID and subtracts excludeEvaluators from default trusted evaluators", async () => {
    const res = await GET(
      new NextRequest(
        `http://localhost:3000/api/feed?excludeEvaluators=${evalB}&includeUnrated=false`,
      ),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.getNetworkFeed).toHaveBeenCalledWith(
      expect.objectContaining({
        viewerDid: orgDid,
        trustedEvaluators: [evalA],
        organizationQuality: expect.objectContaining({ includeUnrated: false }),
      }),
    );
  });

  it("passes through 4xx FeedServiceError and maps unexpected failures to 503", async () => {
    mocks.getNetworkFeed.mockRejectedValueOnce(
      new MockFeedServiceError("Expired cursor", 400, "InvalidCursor"),
    );
    const bad = await GET(new NextRequest("http://localhost:3000/api/feed"));
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: "InvalidCursor", message: "Expired cursor" });

    mocks.getNetworkFeed.mockRejectedValueOnce(new Error("boom"));
    const down = await GET(new NextRequest("http://localhost:3000/api/feed"));
    expect(down.status).toBe(503);
    expect(down.headers.get("cache-control")).toBe("private, no-store");
  });
});
