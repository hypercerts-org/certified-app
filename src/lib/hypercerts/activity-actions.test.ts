import type { OAuthSession } from "@atproto/oauth-client-node";
import { WriteOutcomeUnknownError } from "@hypercerts-org/sdk/activity";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivityDraft } from "./activity-actions";

vi.mock("server-only", () => ({}));

const mocks = {
  getOAuthSession: vi.fn<() => Promise<OAuthSession | null>>(),
  mayPublish: vi.fn<(...args: unknown[]) => Promise<boolean>>(),
  createActivity: vi.fn(),
  activityIndexed: vi.fn(),
  getDid: vi.fn(),
  waitForIndex: vi.fn(),
  updateTag: vi.fn(),
};

vi.mock("next/cache", () => ({ updateTag: (...args: unknown[]) => mocks.updateTag(...args) }));
vi.mock("@/lib/auth/dal", () => ({
  getOAuthSession: () => mocks.getOAuthSession(),
  SessionUnavailableError: class SessionUnavailableError extends Error {},
}));
vi.mock("@/lib/hypercerts/publish-access", () => ({
  mayPublish: (...args: unknown[]) => mocks.mayPublish(...args),
}));
vi.mock("@/lib/hypercerts/index-wait", () => ({
  waitForIndex: (check: () => Promise<boolean>) => mocks.waitForIndex(check),
}));
vi.mock("@/lib/hypercerts/queries", () => ({
  activityIndexed: (...args: unknown[]) => mocks.activityIndexed(...args),
}));
vi.mock("@/lib/identity", () => ({
  getDid: (...args: unknown[]) => mocks.getDid(...args),
}));
vi.mock("@hypercerts-org/sdk/activity", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@hypercerts-org/sdk/activity")>();
  return { ...actual, createActivity: (...args: unknown[]) => mocks.createActivity(...args) };
});

const { publishActivity } = await import("./activity-actions");

const USER = "did:plc:user11111111111111111111";
const ORG = "did:plc:org111111111111111111111";
const ALICE = "did:plc:alic11111111111111111111";
const FAKE_SESSION = { did: USER, fetchHandler: vi.fn() } as unknown as OAuthSession;

const baseDraft = (overrides: Partial<ActivityDraft> = {}): ActivityDraft => ({
  title: "Tree planting",
  shortDescription: "Planted 500 native trees.",
  description: "",
  startDate: "2026-03-01",
  endDate: "2026-03-10",
  workScope: "Reforestation",
  contributors: [],
  image: null,
  location: null,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getOAuthSession.mockResolvedValue(FAKE_SESSION);
  mocks.mayPublish.mockResolvedValue(true);
  mocks.waitForIndex.mockResolvedValue(true);
  mocks.getDid.mockResolvedValue(ALICE);
  mocks.createActivity.mockResolvedValue({
    uri: `at://${ORG}/org.hypercerts.claim.activity/act1`,
    cid: "bafyact",
  });
});

describe("publishActivity", () => {
  it("validates dates and required fields before calling auth or SDK", async () => {
    const bad = await publishActivity(
      USER,
      baseDraft({ title: " ", startDate: "2026-05-10", endDate: "2026-05-01" }),
    );
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.fields?.title).toBeDefined();
      expect(bad.fields?.endDate).toBeDefined();
    }
    expect(mocks.getOAuthSession).not.toHaveBeenCalled();
  });

  it("publishes via SDK for an organization, resolves handles, and expires location tag for new locations", async () => {
    const res = await publishActivity(
      ORG,
      baseDraft({
        contributors: [{ identity: "@alice.bsky.social", role: "Lead", share: "1" }],
        location: { kind: "new", name: "Kitale", point: { lat: 1.02, lng: 35.0 } },
      }),
    );

    expect(res).toEqual({
      ok: true,
      href: `/${ORG}/activity/act1`,
      indexed: true,
    });
    expect(mocks.mayPublish).toHaveBeenCalledWith(FAKE_SESSION, ORG);
    expect(mocks.createActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        title: "Tree planting",
        contributors: [{ identity: { inline: ALICE }, details: { inline: "Lead" }, weight: "1" }],
      }),
      { repo: ORG },
    );
    expect(mocks.updateTag.mock.calls.flat()).toEqual([
      `activities:${ORG}`,
      `actor:${ORG}`,
      "explore",
      `locations:${ORG}`,
    ]);
  });

  it("returns field error for unresolvable contributor handle and maps forbidden/unknown failures", async () => {
    mocks.getDid.mockResolvedValueOnce(null);
    const missing = await publishActivity(
      USER,
      baseDraft({ contributors: [{ identity: "missing.example.com", role: "", share: "" }] }),
    );
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.fields?.["contributors[0].identity"]).toContain("No account");

    mocks.mayPublish.mockResolvedValueOnce(false);
    const forbidden = await publishActivity(ORG, baseDraft());
    expect(forbidden.ok).toBe(false);
    if (!forbidden.ok) expect(forbidden.message).toContain("member");

    mocks.createActivity.mockRejectedValueOnce(new WriteOutcomeUnknownError("createActivity", []));
    const unknown = await publishActivity(USER, baseDraft());
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.message).toContain("couldn't confirm");
  });
});
