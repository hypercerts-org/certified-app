import type { OAuthSession } from "@atproto/oauth-client-node";
import { WriteOutcomeUnknownError, WriteRejectedError } from "@hypercerts-org/sdk/social";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = {
  getOAuthSession: vi.fn<() => Promise<OAuthSession | null>>(),
  mayPublish: vi.fn<(...args: unknown[]) => Promise<boolean>>(),
  followAccount: vi.fn(),
  followEntity: vi.fn(),
  unfollowAccount: vi.fn(),
  unfollowEntity: vi.fn(),
  getIndexedFollow: vi.fn(),
  getIndexedEntityFollow: vi.fn(),
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
  getIndexedFollow: (...args: unknown[]) => mocks.getIndexedFollow(...args),
  getIndexedEntityFollow: (...args: unknown[]) => mocks.getIndexedEntityFollow(...args),
}));
vi.mock("@hypercerts-org/sdk/social", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@hypercerts-org/sdk/social")>();
  return {
    ...actual,
    followAccount: (...args: unknown[]) => mocks.followAccount(...args),
    followEntity: (...args: unknown[]) => mocks.followEntity(...args),
    unfollowAccount: (...args: unknown[]) => mocks.unfollowAccount(...args),
    unfollowEntity: (...args: unknown[]) => mocks.unfollowEntity(...args),
  };
});

const { follow, unfollow } = await import("./follow-actions");

const USER = "did:plc:user11111111111111111111";
const ORG = "did:plc:org111111111111111111111";
const TARGET = "did:plc:targ11111111111111111111";
const PROJECT_URI = `at://${TARGET}/org.hypercerts.collection/proj1`;
const FAKE_SESSION = { did: USER, fetchHandler: vi.fn() } as unknown as OAuthSession;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getOAuthSession.mockResolvedValue(FAKE_SESSION);
  mocks.mayPublish.mockResolvedValue(true);
  mocks.getIndexedFollow.mockResolvedValue(null);
  mocks.getIndexedEntityFollow.mockResolvedValue(null);
  mocks.waitForIndex.mockResolvedValue(true);
  mocks.followAccount.mockResolvedValue({
    uri: `at://${USER}/app.certified.graph.follow/f1`,
    cid: "bafyf1",
  });
  mocks.followEntity.mockResolvedValue({
    uri: `at://${ORG}/app.certified.graph.entityFollow/ef1`,
    cid: "bafyef1",
  });
  mocks.unfollowAccount.mockResolvedValue(undefined);
  mocks.unfollowEntity.mockResolvedValue(undefined);
});

describe("follow", () => {
  it("follows an account using explicit repo and expires both accounts' tags", async () => {
    const res = await follow({ repo: USER, subject: TARGET });
    expect(res).toEqual({
      ok: true,
      follow: { uri: `at://${USER}/app.certified.graph.follow/f1`, cid: "bafyf1" },
      indexed: true,
    });
    expect(mocks.mayPublish).toHaveBeenCalledWith(FAKE_SESSION, USER);
    expect(mocks.followAccount).toHaveBeenCalledWith(
      expect.anything(),
      { subject: { did: TARGET } },
      undefined,
    );
    expect(mocks.updateTag.mock.calls.flat()).toEqual([
      `follows:${USER}`,
      `actor:${USER}`,
      `follows:${TARGET}`,
      `actor:${TARGET}`,
    ]);
  });

  it("routes organization project follows through CGS using WriteOptions.repo", async () => {
    const res = await follow({ repo: ORG, subject: PROJECT_URI });
    expect(res.ok).toBe(true);
    expect(mocks.followEntity).toHaveBeenCalledWith(
      expect.anything(),
      { subject: { uri: PROJECT_URI } },
      { repo: ORG },
    );
    expect(mocks.updateTag.mock.calls.flat()).toEqual([
      `follows:${ORG}`,
      `actor:${ORG}`,
      `project:${PROJECT_URI}`,
    ]);
  });

  it("rejects self-follow, non-members, and invalid inputs before writing", async () => {
    expect(await follow({ repo: USER, subject: USER })).toMatchObject({
      ok: false,
      reason: "invalid",
    });
    expect(
      await follow({ repo: USER, subject: `at://${USER}/org.hypercerts.collection/mine` }),
    ).toMatchObject({ ok: false, reason: "invalid" });
    mocks.mayPublish.mockResolvedValueOnce(false);
    expect(await follow({ repo: ORG, subject: TARGET })).toMatchObject({
      ok: false,
      reason: "forbidden",
    });
    expect(mocks.followAccount).not.toHaveBeenCalled();
  });

  it("returns an already-indexed follow instead of writing a duplicate", async () => {
    const existing = { uri: `at://${USER}/app.certified.graph.follow/old`, cid: "bafyold" };
    mocks.getIndexedFollow.mockResolvedValueOnce(existing);
    expect(await follow({ repo: USER, subject: TARGET })).toEqual({
      ok: true,
      follow: existing,
      indexed: true,
    });
    expect(mocks.followAccount).not.toHaveBeenCalled();
  });
});

describe("unfollow", () => {
  it("deletes client-known and indexed follow URIs and maps unknown/forbidden failures", async () => {
    const known = `at://${USER}/app.certified.graph.follow/k1`;
    const indexed = `at://${USER}/app.certified.graph.follow/i2`;
    mocks.getIndexedFollow.mockResolvedValueOnce({ uri: indexed, cid: "bafyi2" });

    expect(await unfollow({ repo: USER, subject: TARGET, uris: [known] })).toEqual({
      ok: true,
      follow: null,
      indexed: true,
    });
    expect(mocks.unfollowAccount).toHaveBeenCalledTimes(2);

    mocks.unfollowAccount.mockRejectedValueOnce(
      new WriteOutcomeUnknownError("unfollowAccount", []),
    );
    expect(await unfollow({ repo: USER, subject: TARGET, uris: [known] })).toMatchObject({
      ok: false,
      reason: "unknown",
    });

    mocks.unfollowAccount.mockRejectedValueOnce(
      new WriteRejectedError("unfollowAccount", [], { status: 403, code: "Forbidden" }),
    );
    const forbidden = await unfollow({ repo: ORG, subject: TARGET, uris: [known] });
    expect(forbidden).toMatchObject({ ok: false, reason: "forbidden" });
    if (!forbidden.ok) expect(forbidden.message).toContain("admins and owners");
  });
});
