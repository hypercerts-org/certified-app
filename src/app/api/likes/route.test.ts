import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connection: vi.fn(async () => {}),
  getActingAs: vi.fn(),
  getLikeCounts: vi.fn(),
  getActorLikesForSubjects: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, connection: mocks.connection };
});
vi.mock("@/lib/acting-as", () => ({ getActingAs: mocks.getActingAs }));
vi.mock("@/lib/auth/dal", () => ({
  SessionUnavailableError: class SessionUnavailableError extends Error {},
}));
vi.mock("@/lib/hypercerts/queries", () => ({
  getLikeCounts: mocks.getLikeCounts,
  getActorLikesForSubjects: mocks.getActorLikesForSubjects,
}));
vi.mock("@/lib/log", () => ({ logError: mocks.logError }));

const { GET } = await import("./route");

const actorDid = "did:plc:user11111111111111111111";
const uriA = "at://did:plc:aaaaaaaaaaaaaaaaaaaaaaaa/org.hypercerts.claim.activity/a1";
const uriB = "at://did:plc:aaaaaaaaaaaaaaaaaaaaaaaa/org.hypercerts.claim.activity/b2";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getActingAs.mockResolvedValue(actorDid);
  mocks.getLikeCounts.mockResolvedValue({});
  mocks.getActorLikesForSubjects.mockResolvedValue({});
});

describe("GET /api/likes", () => {
  it("filters invalid URIs, deduplicates and sorts subjects, and caps at 50", async () => {
    const params = new URLSearchParams();
    params.append("subjects", "not-a-uri");
    params.append("subjects", `${uriB},${uriA}`);
    params.append("subjects", uriA);
    for (let i = 0; i < 60; i++) {
      params.append(
        "subjects",
        `at://did:plc:aaaaaaaaaaaaaaaaaaaaaaaa/org.hypercerts.claim.activity/r${String(i).padStart(2, "0")}`,
      );
    }

    mocks.getLikeCounts.mockResolvedValueOnce({ [uriA]: 3, [uriB]: 1 });
    mocks.getActorLikesForSubjects.mockResolvedValueOnce({
      [uriA]: `at://${actorDid}/app.certified.feed.like/l1`,
    });

    const res = await GET(new NextRequest(`http://localhost:3000/api/likes?${params.toString()}`));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");

    const passedSubjects = mocks.getLikeCounts.mock.calls[0]?.[0] as string[];
    expect(passedSubjects).toHaveLength(50);
    expect(passedSubjects).toEqual([...passedSubjects].sort());
    expect(passedSubjects).not.toContain("not-a-uri");

    const body = (await res.json()) as {
      actor: string | null;
      likes: Record<string, { count: number; likeUri: string | null }>;
    };
    expect(body.actor).toBe(actorDid);
    expect(body.likes[uriA]).toEqual({
      count: 3,
      likeUri: `at://${actorDid}/app.certified.feed.like/l1`,
    });
    expect(body.likes[uriB]).toEqual({ count: 1, likeUri: null });
  });

  it("skips viewer like lookup when signed out", async () => {
    mocks.getActingAs.mockResolvedValueOnce(null);
    mocks.getLikeCounts.mockResolvedValueOnce({ [uriA]: 2 });

    const res = await GET(
      new NextRequest(`http://localhost:3000/api/likes?subjects=${encodeURIComponent(uriA)}`),
    );
    expect(res.status).toBe(200);
    expect(mocks.getActorLikesForSubjects).not.toHaveBeenCalled();
    expect(await res.json()).toEqual({
      actor: null,
      likes: { [uriA]: { count: 2, likeUri: null } },
    });
  });

  it("returns 503 with private no-store when upstream fails so clients can retry", async () => {
    mocks.getLikeCounts.mockRejectedValueOnce(new Error("indexer down"));

    const res = await GET(
      new NextRequest(`http://localhost:3000/api/likes?subjects=${encodeURIComponent(uriA)}`),
    );
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await res.json()).toEqual({ error: "LikesUnavailable" });
  });
});
