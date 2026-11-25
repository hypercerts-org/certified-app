import type { OAuthSession } from "@atproto/oauth-client-node";
import { WriteOutcomeUnknownError, WriteRejectedError } from "@hypercerts-org/sdk/badge";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = {
  getOAuthSession: vi.fn<() => Promise<OAuthSession | null>>(),
  mayPublish: vi.fn<(...args: unknown[]) => Promise<boolean>>(),
  createBadgeDefinition: vi.fn(),
  awardBadge: vi.fn(),
  respondToBadgeAward: vi.fn(),
  badgeDefinitionIndexed: vi.fn(),
  badgeAwardIndexed: vi.fn(),
  getIndexedBadgeAwardResponse: vi.fn(),
  resolveAwardSubject: vi.fn(),
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
  badgeDefinitionIndexed: (...args: unknown[]) => mocks.badgeDefinitionIndexed(...args),
  badgeAwardIndexed: (...args: unknown[]) => mocks.badgeAwardIndexed(...args),
  getIndexedBadgeAwardResponse: (...args: unknown[]) => mocks.getIndexedBadgeAwardResponse(...args),
}));
vi.mock("@/lib/hypercerts/resolve-target", () => ({
  resolveAwardSubject: (...args: unknown[]) => mocks.resolveAwardSubject(...args),
}));
vi.mock("@hypercerts-org/sdk/badge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@hypercerts-org/sdk/badge")>();
  return {
    ...actual,
    createBadgeDefinition: (...args: unknown[]) => mocks.createBadgeDefinition(...args),
    awardBadge: (...args: unknown[]) => mocks.awardBadge(...args),
    respondToBadgeAward: (...args: unknown[]) => mocks.respondToBadgeAward(...args),
  };
});

const { respondToBadge, createBadge, awardBadgeToSubject } = await import("./badge-actions");

const USER = "did:plc:user11111111111111111111";
const ORG = "did:plc:org111111111111111111111";
const SUBJECT = "did:plc:subj11111111111111111111";
const DEF_URI = `at://${USER}/app.certified.badge.definition/def1`;
const AWARD_URI = `at://${ORG}/app.certified.badge.award/awd1`;
const FAKE_SESSION = { did: USER, fetchHandler: vi.fn() } as unknown as OAuthSession;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getOAuthSession.mockResolvedValue(FAKE_SESSION);
  mocks.mayPublish.mockResolvedValue(true);
  mocks.waitForIndex.mockResolvedValue(true);
  mocks.createBadgeDefinition.mockResolvedValue({ uri: DEF_URI, cid: "bafydef" });
  mocks.awardBadge.mockResolvedValue({
    uri: AWARD_URI,
    cid: "bafyawd",
    definition: { uri: DEF_URI, cid: "bafydef", created: false },
  });
  mocks.respondToBadgeAward.mockResolvedValue({
    uri: `at://${USER}/app.certified.badge.response/r1`,
    cid: "bafyr",
  });
  mocks.resolveAwardSubject.mockResolvedValue({ did: SUBJECT });
});

describe("respondToBadge", () => {
  it("writes an accepted/rejected response via SDK and expires badge + actor + definition tags", async () => {
    const result = await respondToBadge(USER, {
      awardUri: AWARD_URI,
      badgeUri: DEF_URI,
      response: "accepted",
    });

    expect(result).toEqual({ ok: true, response: "accepted", indexed: true });
    expect(mocks.respondToBadgeAward).toHaveBeenCalledWith(
      expect.anything(),
      { award: { uri: AWARD_URI }, response: "accepted" },
      undefined,
    );
    expect(mocks.updateTag.mock.calls.flat()).toEqual([
      `badges:${USER}`,
      `endorsements:${USER}`,
      `actor:${USER}`,
      `badge:${DEF_URI}`,
    ]);
  });

  it("routes organization responses through CGS with WriteOptions.repo", async () => {
    await respondToBadge(ORG, { awardUri: AWARD_URI, response: "rejected" });
    expect(mocks.respondToBadgeAward).toHaveBeenCalledWith(
      expect.anything(),
      { award: { uri: AWARD_URI }, response: "rejected" },
      { repo: ORG },
    );
  });

  it("reports WriteOutcomeUnknownError as unknown", async () => {
    mocks.respondToBadgeAward.mockRejectedValueOnce(
      new WriteOutcomeUnknownError("respondToBadgeAward", []),
    );
    expect(await respondToBadge(USER, { awardUri: AWARD_URI, response: "accepted" })).toMatchObject(
      { ok: false, reason: "unknown" },
    );
  });
});

describe("createBadge", () => {
  it("restricts allowedIssuers to repo by default and omits it for anyone", async () => {
    const form = new FormData();
    form.set("title", "Verified Steward");
    form.set("badgeType", "verification");
    form.set("description", "Confirmed land steward.");
    form.set("issuerPolicy", "self");

    const res = await createBadge(ORG, form);
    expect(res).toMatchObject({ ok: true, uri: DEF_URI, indexed: true });
    expect(mocks.createBadgeDefinition).toHaveBeenCalledWith(
      expect.anything(),
      {
        title: "Verified Steward",
        badgeType: "verification",
        description: "Confirmed land steward.",
        icon: undefined,
        allowedIssuers: [ORG],
      },
      { repo: ORG },
    );

    form.set("issuerPolicy", "anyone");
    await createBadge(USER, form);
    expect(mocks.createBadgeDefinition).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ allowedIssuers: undefined }),
      undefined,
    );
  });

  it("rejects unsupported icon MIME types and oversized icons before calling SDK", async () => {
    const badMime = new FormData();
    badMime.set("title", "Test");
    badMime.set("badgeType", "recognition");
    badMime.set("icon", new File(["hello"], "bad.txt", { type: "text/plain" }));
    expect(await createBadge(USER, badMime)).toMatchObject({ ok: false, reason: "invalid" });

    const tooBig = new FormData();
    tooBig.set("title", "Test");
    tooBig.set("badgeType", "recognition");
    tooBig.set("icon", new File([new Uint8Array(1_048_577)], "big.png", { type: "image/png" }));
    expect(await createBadge(USER, tooBig)).toMatchObject({ ok: false, reason: "invalid" });
    expect(mocks.createBadgeDefinition).not.toHaveBeenCalled();
  });
});

describe("awardBadgeToSubject", () => {
  it("awards a badge to a resolved account with note, url, and validUntil", async () => {
    const res = await awardBadgeToSubject(USER, {
      definitionUri: DEF_URI,
      subject: "@alice.bsky.social",
      note: "Great work",
      url: "https://example.org/report",
      validUntil: "2027-06-01",
    });

    expect(res).toEqual({ ok: true, uri: AWARD_URI, indexed: true });
    expect(mocks.awardBadge).toHaveBeenCalledWith(
      expect.anything(),
      {
        definition: { uri: DEF_URI },
        subject: { did: SUBJECT },
        note: "Great work",
        url: "https://example.org/report",
        validUntil: "2027-06-01T23:59:59Z",
      },
      undefined,
    );
    expect(mocks.updateTag.mock.calls.flat()).toContain(`badges:${SUBJECT}`);
    expect(mocks.updateTag.mock.calls.flat()).toContain(`badge:${DEF_URI}`);
  });

  it("rejects non-http(s) links and reports 403 as forbidden", async () => {
    expect(
      await awardBadgeToSubject(USER, {
        definitionUri: DEF_URI,
        subject: SUBJECT,
        url: "javascript:alert(1)",
      }),
    ).toMatchObject({ ok: false, reason: "invalid" });

    mocks.awardBadge.mockRejectedValueOnce(
      new WriteRejectedError("awardBadge", [], { status: 403, code: "Forbidden" }),
    );
    expect(
      await awardBadgeToSubject(USER, { definitionUri: DEF_URI, subject: SUBJECT }),
    ).toMatchObject({ ok: false, reason: "forbidden" });
  });
});
