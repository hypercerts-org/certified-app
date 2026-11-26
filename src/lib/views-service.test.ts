import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = {
  getHandle: vi.fn<(did: string) => Promise<string | null>>(),
  getList: vi.fn(),
  getActorCards: vi.fn(),
  resolveListItems: vi.fn(),
  logError: vi.fn(),
};

vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("@/lib/identity", () => ({ getHandle: (did: string) => mocks.getHandle(did) }));
vi.mock("@/lib/hypercerts/queries", () => ({
  getList: (...args: unknown[]) => mocks.getList(...args),
  getActorCards: (...args: unknown[]) => mocks.getActorCards(...args),
  resolveListItems: (...args: unknown[]) => mocks.resolveListItems(...args),
}));
vi.mock("@/lib/log", () => ({ logError: (...args: unknown[]) => mocks.logError(...args) }));

const { FeedServiceError, getNetworkFeed, getTrustedEvaluators, HYPERCERTS_FEED_ID } = await import(
  "./views-service"
);

const VIEWER = "did:plc:viewer111111111111111111";
const AUTHOR = "did:plc:author222222222222222222";
const SUBJECT = "did:plc:subject33333333333333333";
const EVALUATOR = "did:plc:eval4444444444444444444444";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getHandle.mockImplementation(async (did) =>
    did === AUTHOR ? "author.certified.one" : null,
  );
  mocks.resolveListItems.mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getNetworkFeed", () => {
  it("posts the hypercertsFeed request, maps known content views, tolerates unknown kinds, and enriches handles and target titles", async () => {
    const targetUri = `at://${AUTHOR}/org.hypercerts.claim.activity/act1`;
    mocks.resolveListItems.mockResolvedValueOnce([
      {
        kind: "activity",
        uri: targetUri,
        activity: { title: "Tree Planting" },
      },
    ]);

    const requests: { url: string; body: unknown }[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({
        url: String(input),
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      return Response.json({
        feed: [
          {
            subject: `at://${AUTHOR}/org.hypercerts.claim.activity/act1`,
            view: {
              $type: "org.hypercerts.feed.defs#hypercertsFeedView",
              kind: "cert.create",
              actor: { did: AUTHOR, displayName: "Forest Org" },
              content: {
                $type: "org.hypercerts.feed.defs#activityView",
                title: "Tree Planting",
                shortDescription: "Planted 1000 native trees",
                locationCount: 2,
                createdAt: "2026-07-01T10:00:00.000Z",
              },
            },
          },
          {
            subject: `at://${AUTHOR}/org.hypercerts.context.attachment/upd1`,
            view: {
              $type: "org.hypercerts.feed.defs#hypercertsFeedView",
              kind: "update.create",
              actor: { did: AUTHOR, displayName: "Forest Org" },
              content: {
                $type: "org.hypercerts.feed.defs#updateView",
                title: "Month 1 report",
                shortDescription: "90% survival rate",
                image: {
                  $type: "org.hypercerts.defs#smallBlob",
                  blob: {
                    $type: "blob",
                    ref: { $link: "bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku" },
                    mimeType: "image/jpeg",
                    size: 100,
                  },
                },
                target: { uri: targetUri, cid: "bafycid" },
                createdAt: "2026-07-02T10:00:00.000Z",
              },
            },
          },
          {
            subject: `at://${AUTHOR}/app.certified.badge.award/aw1`,
            view: {
              $type: "org.hypercerts.feed.defs#hypercertsFeedView",
              kind: "endorsement.award",
              actor: { did: AUTHOR, displayName: "Forest Org" },
              content: {
                $type: "org.hypercerts.feed.defs#endorsementView",
                subject: { did: SUBJECT, displayName: "River Steward" },
                createdAt: "2026-07-03T10:00:00.000Z",
              },
            },
          },
          {
            subject: `at://${AUTHOR}/org.hypercerts.future.record/fut1`,
            view: {
              $type: "org.hypercerts.feed.defs#hypercertsFeedView",
              kind: "future.event",
              actor: { did: AUTHOR, displayName: "Forest Org" },
              content: { $type: "org.hypercerts.feed.defs#futureView" },
            },
          },
        ],
        cursor: "next-cursor-token",
      });
    });

    const page = await getNetworkFeed({
      viewerDid: VIEWER,
      trustedEvaluators: [EVALUATOR],
      organizationQuality: { allowed: ["high-quality"], includeUnrated: false },
      kinds: ["cert.create", "update.create", "endorsement.award"],
      limit: 20,
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain("/xrpc/org.hypercerts.feed.getFeed");
    expect(requests[0].body).toEqual({
      feedId: HYPERCERTS_FEED_ID,
      params: {
        $type: "org.hypercerts.feed.defs#hypercertsFeedParams",
        viewerDid: VIEWER,
        trustedEvaluators: [EVALUATOR],
        organizationQuality: { allowed: ["high-quality"], includeUnrated: false },
        kinds: ["cert.create", "update.create", "endorsement.award"],
      },
      limit: 20,
    });

    expect(page.cursor).toBe("next-cursor-token");
    expect(page.items).toHaveLength(4);
    expect(page.items[0]).toMatchObject({
      kind: "cert.create",
      title: "Tree Planting",
      meta: "2 locations",
      actor: { did: AUTHOR, handle: "author.certified.one", displayName: "Forest Org" },
    });
    expect(page.items[1]).toMatchObject({
      kind: "update.create",
      title: "Month 1 report",
      target: { title: "Tree Planting", href: `/${AUTHOR}/activity/act1` },
    });
    expect(page.items[1].kind === "update.create" && page.items[1].imageUrl).toContain(
      "bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku",
    );
    expect(page.items[2]).toMatchObject({
      kind: "endorsement.award",
      subject: { did: SUBJECT, displayName: "River Steward" },
    });
    expect(page.items[3]).toMatchObject({
      kind: "unknown",
      rawKind: "future.event",
    });
  });

  it("throws FeedServiceError with code and status on non-OK upstream response", async () => {
    vi.stubGlobal("fetch", async () =>
      Response.json({ error: "InvalidCursor", message: "Cursor expired" }, { status: 400 }),
    );
    await expect(getNetworkFeed({ viewerDid: VIEWER })).rejects.toMatchObject({
      name: "FeedServiceError",
      status: 400,
      code: "InvalidCursor",
      message: "Cursor expired",
    });
    await expect(getNetworkFeed({ viewerDid: VIEWER })).rejects.toBeInstanceOf(FeedServiceError);
  });
});

describe("getTrustedEvaluators", () => {
  it("resolves deduplicated evaluator DIDs from the curated accounts list", async () => {
    mocks.getList.mockResolvedValueOnce({
      itemUris: [
        `at://${EVALUATOR}/app.certified.actor.profile/self`,
        `at://${EVALUATOR}/app.certified.actor.profile/self`,
        `at://${AUTHOR}/app.bsky.actor.profile/self`,
      ],
    });
    mocks.getActorCards.mockResolvedValueOnce([
      {
        did: EVALUATOR,
        displayName: "Evaluator",
        handle: null,
        description: null,
        avatarUrl: null,
        isOrganization: true,
      },
      {
        did: AUTHOR,
        displayName: "Author",
        handle: null,
        description: null,
        avatarUrl: null,
        isOrganization: false,
      },
    ]);

    const evaluators = await getTrustedEvaluators();
    expect(mocks.getActorCards).toHaveBeenCalledWith([EVALUATOR, AUTHOR]);
    expect(evaluators).toHaveLength(2);
  });
});
