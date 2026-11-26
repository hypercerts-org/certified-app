import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  exploreAccounts: vi.fn(),
  exploreActivities: vi.fn(),
  exploreProjects: vi.fn(),
  getActor: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("@/lib/hypercerts/queries", () => ({
  exploreAccounts: mocks.exploreAccounts,
  exploreActivities: mocks.exploreActivities,
  exploreProjects: mocks.exploreProjects,
  getActor: mocks.getActor,
}));
vi.mock("@/lib/log", () => ({ logError: mocks.logError }));

const { GET } = await import("./route");

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.exploreActivities.mockResolvedValue({ items: [] });
  mocks.exploreProjects.mockResolvedValue({ items: [] });
  mocks.exploreAccounts.mockResolvedValue({ items: [], cursor: null });
  mocks.getActor.mockResolvedValue(null);
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("GET /api/search", () => {
  it("returns empty results for a blank query without calling upstream services", async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const res = await GET(new NextRequest("http://localhost:3000/api/search?q=%20%20"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ go: null, activities: [], projects: [], accounts: [] });
    expect(mocks.exploreActivities).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("handles scope=actors by deduping direct/Certified/Bluesky hits and sanitizing Bluesky avatars", async () => {
    const aliceDid = "did:plc:ewvi7nxzyoun6zhxrhs64oiz";
    const bskyDid = "did:plc:bbbbbbbbbbbbbbbbbbbbbbbb";
    mocks.getActor.mockResolvedValueOnce({
      did: aliceDid,
      handle: "alice.certified.one",
      displayName: "Alice",
      avatarUrl: "https://cdn.example/alice.jpg",
      isOrganization: false,
    });
    mocks.exploreAccounts.mockResolvedValueOnce({
      items: [
        {
          did: aliceDid,
          handle: "alice.certified.one",
          displayName: "Alice",
          avatarUrl: "https://cdn.example/alice.jpg",
          isOrganization: false,
        },
      ],
      cursor: null,
    });
    globalThis.fetch = vi.fn(async () =>
      Response.json({
        actors: [
          { did: aliceDid, handle: "alice.certified.one", displayName: "Alice Duplicate" },
          {
            did: bskyDid,
            handle: "bob.bsky.social",
            displayName: "Bob",
            avatar: "javascript:alert(1)",
          },
        ],
      }),
    ) as unknown as typeof fetch;

    const res = await GET(
      new NextRequest(
        "http://localhost:3000/api/search?scope=actors&q=@alice.certified.one&limit=5",
      ),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { actors: Array<Record<string, unknown>> };
    expect(body.actors).toHaveLength(2);
    expect(body.actors[0]).toMatchObject({ did: aliceDid, certified: true });
    expect(body.actors[1]).toMatchObject({
      did: bskyDid,
      certified: false,
      avatarUrl: null,
      href: "/bob.bsky.social",
    });
  });

  it("degrades gracefully when one upstream source fails and returns ranked results", async () => {
    mocks.exploreActivities.mockRejectedValueOnce(new Error("indexer timeout"));
    mocks.exploreProjects.mockResolvedValueOnce({
      items: [
        {
          uri: "at://did:plc:aaaaaaaaaaaaaaaaaaaaaaaa/org.hypercerts.collection/p1",
          rkey: "p1",
          title: "Solar Microgrid",
          summary: "Clean power",
          imageUrl: null,
          author: {
            did: "did:plc:aaaaaaaaaaaaaaaaaaaaaaaa",
            handle: "solar.certified.one",
            displayName: "Solar Co",
          },
        },
      ],
    });
    globalThis.fetch = vi.fn(
      async () => new Response(null, { status: 503 }),
    ) as unknown as typeof fetch;

    const res = await GET(new NextRequest("http://localhost:3000/api/search?q=Solar"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      activities: unknown[];
      projects: Array<{ title: string }>;
    };
    expect(body.activities).toEqual([]);
    expect(body.projects.map((p) => p.title)).toEqual(["Solar Microgrid"]);
    expect(mocks.logError).toHaveBeenCalled();
  });
});
