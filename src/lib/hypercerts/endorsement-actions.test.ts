import type { OAuthSession } from "@atproto/oauth-client-node";
import {
  PartialWriteError,
  WriteOutcomeUnknownError,
  WriteRejectedError,
} from "@hypercerts-org/sdk/badge";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WriteError } from "./writes";

vi.mock("server-only", () => ({}));

const mocks = {
  getOAuthSession: vi.fn<() => Promise<OAuthSession | null>>(),
  mayPublish: vi.fn<(...args: unknown[]) => Promise<boolean>>(),
  getIndexedEndorsement: vi.fn(),
  getIndexedEndorsements: vi.fn(),
  badgeAwardIndexed: vi.fn(),
  getIndexedBadgeAwardResponse: vi.fn(),
  resolveAccountDid: vi.fn(),
  awardBadge: vi.fn(),
  respondToBadgeAward: vi.fn(),
  findEndorsementDefinition: vi.fn(),
  deleteBadgeAward: vi.fn(),
  repositoryFor: vi.fn(),
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
  getIndexedEndorsement: (...args: unknown[]) => mocks.getIndexedEndorsement(...args),
  getIndexedEndorsements: (...args: unknown[]) => mocks.getIndexedEndorsements(...args),
  badgeAwardIndexed: (...args: unknown[]) => mocks.badgeAwardIndexed(...args),
  getIndexedBadgeAwardResponse: (...args: unknown[]) => mocks.getIndexedBadgeAwardResponse(...args),
}));
vi.mock("@/lib/hypercerts/resolve-target", () => ({
  resolveAccountDid: (...args: unknown[]) => mocks.resolveAccountDid(...args),
}));
vi.mock("@hypercerts-org/sdk/badge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@hypercerts-org/sdk/badge")>();
  return {
    ...actual,
    awardBadge: (...args: unknown[]) => mocks.awardBadge(...args),
    respondToBadgeAward: (...args: unknown[]) => mocks.respondToBadgeAward(...args),
  };
});
vi.mock("@/lib/hypercerts/writes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/hypercerts/writes")>();
  return {
    ...actual,
    findEndorsementDefinition: (...args: unknown[]) => mocks.findEndorsementDefinition(...args),
    deleteBadgeAward: (...args: unknown[]) => mocks.deleteBadgeAward(...args),
    repositoryFor: (...args: unknown[]) => mocks.repositoryFor(...args),
  };
});

const { endorse, unendorse, endorseFromWorkspace, revokeEndorsement, setEndorsementVisibility } =
  await import("./endorsement-actions");

const USER = "did:plc:user11111111111111111111";
const ORG = "did:plc:org111111111111111111111";
const SUBJECT = "did:plc:subj11111111111111111111";
const FAKE_SESSION = { did: USER, fetchHandler: vi.fn() } as unknown as OAuthSession;
const FAKE_REPO = { did: USER };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getOAuthSession.mockResolvedValue(FAKE_SESSION);
  mocks.mayPublish.mockResolvedValue(true);
  mocks.resolveAccountDid.mockResolvedValue(SUBJECT);
  mocks.getIndexedEndorsement.mockResolvedValue(null);
  mocks.getIndexedEndorsements.mockResolvedValue([]);
  mocks.repositoryFor.mockResolvedValue(FAKE_REPO);
  mocks.findEndorsementDefinition.mockResolvedValue(null);
  mocks.awardBadge.mockResolvedValue({
    uri: `at://${USER}/app.certified.badge.award/new1`,
    cid: "bafynew",
    definition: {
      uri: `at://${USER}/app.certified.badge.definition/def1`,
      cid: "bafydef",
      created: true,
    },
  });
  mocks.respondToBadgeAward.mockResolvedValue({
    uri: `at://${USER}/app.certified.badge.response/r1`,
    cid: "bafyr",
  });
  mocks.deleteBadgeAward.mockResolvedValue(undefined);
  mocks.waitForIndex.mockImplementation(async () => true);
});

describe("endorse", () => {
  it("creates the Endorsement definition alongside the award on first endorsement", async () => {
    const result = await endorse({ repo: USER, subject: SUBJECT });

    expect(result).toEqual({
      ok: true,
      endorsement: { uri: `at://${USER}/app.certified.badge.award/new1`, cid: "bafynew" },
      indexed: true,
    });
    expect(mocks.awardBadge).toHaveBeenCalledWith(
      expect.anything(),
      {
        definition: { title: "Endorsement", badgeType: "endorsement" },
        subject: { did: SUBJECT },
      },
      undefined,
    );
    expect(mocks.updateTag.mock.calls.flat()).toEqual([
      `badges:${USER}`,
      `endorsements:${USER}`,
      `actor:${USER}`,
      `endorsements:${SUBJECT}`,
      `actor:${SUBJECT}`,
    ]);
  });

  it("reuses the existing Endorsement definition URI on subsequent endorsements", async () => {
    const existingDef = `at://${USER}/app.certified.badge.definition/existing1`;
    mocks.findEndorsementDefinition.mockResolvedValue(existingDef);

    const result = await endorse({ repo: USER, subject: SUBJECT });

    expect(result.ok).toBe(true);
    expect(mocks.awardBadge).toHaveBeenCalledWith(
      expect.anything(),
      {
        definition: { uri: existingDef },
        subject: { did: SUBJECT },
      },
      undefined,
    );
  });

  it("routes organization endorsements through CGS using WriteOptions.repo", async () => {
    const orgDef = `at://${ORG}/app.certified.badge.definition/orgdef`;
    mocks.findEndorsementDefinition.mockResolvedValue(orgDef);

    await endorse({ repo: ORG, subject: SUBJECT });

    expect(mocks.mayPublish).toHaveBeenCalledWith(FAKE_SESSION, ORG);
    expect(mocks.repositoryFor).toHaveBeenCalledWith(FAKE_SESSION, ORG);
    expect(mocks.awardBadge).toHaveBeenCalledWith(
      expect.anything(),
      { definition: { uri: orgDef }, subject: { did: SUBJECT } },
      { repo: ORG },
    );
  });

  it("returns the indexed endorsement instead of writing a duplicate", async () => {
    const existing = { uri: `at://${USER}/app.certified.badge.award/already`, cid: "bafyold" };
    mocks.getIndexedEndorsement.mockResolvedValue(existing);

    const result = await endorse({ repo: USER, subject: SUBJECT });

    expect(result).toEqual({ ok: true, endorsement: existing, indexed: true });
    expect(mocks.awardBadge).not.toHaveBeenCalled();
  });

  it("refuses self-endorsement, invalid DIDs, and signed-out callers", async () => {
    expect(await endorse({ repo: USER, subject: USER })).toMatchObject({
      ok: false,
      reason: "invalid",
    });
    expect(await endorse({ repo: USER, subject: "not-a-did" })).toMatchObject({
      ok: false,
      reason: "invalid",
    });
    mocks.getOAuthSession.mockResolvedValue(null);
    expect(await endorse({ repo: USER, subject: SUBJECT })).toMatchObject({
      ok: false,
      reason: "signed-out",
    });
    expect(mocks.awardBadge).not.toHaveBeenCalled();
  });

  it("reports PartialWriteError and WriteOutcomeUnknownError as unknown, never as failure", async () => {
    mocks.awardBadge.mockRejectedValueOnce(
      new PartialWriteError("awardBadge", {
        written: [{ uri: `at://${USER}/app.certified.badge.definition/def1`, cid: "bafydef" }],
        failed: { uri: `at://${USER}/app.certified.badge.award/x`, cid: "bafyx" },
        failure: new Error("boom"),
        notAttempted: [],
      }),
    );
    expect(await endorse({ repo: USER, subject: SUBJECT })).toMatchObject({
      ok: false,
      reason: "unknown",
    });

    mocks.awardBadge.mockRejectedValueOnce(
      new WriteOutcomeUnknownError("awardBadge", [], { cause: new Error("timeout") }),
    );
    expect(await endorse({ repo: USER, subject: SUBJECT })).toMatchObject({
      ok: false,
      reason: "unknown",
    });

    mocks.awardBadge.mockRejectedValueOnce(
      new WriteRejectedError("awardBadge", [], { status: 403, code: "Forbidden" }),
    );
    expect(await endorse({ repo: USER, subject: SUBJECT })).toMatchObject({
      ok: false,
      reason: "forbidden",
    });
  });
});

describe("unendorse", () => {
  it("deletes both client-known and indexed awards, waits for index, and expires tags", async () => {
    const knownUri = `at://${USER}/app.certified.badge.award/known1`;
    const indexedUri = `at://${USER}/app.certified.badge.award/indexed2`;
    mocks.getIndexedEndorsements.mockResolvedValue([{ uri: indexedUri, cid: "bafy2" }]);

    const result = await unendorse({ repo: USER, subject: SUBJECT, uris: [knownUri] });

    expect(result).toEqual({ ok: true, endorsement: null, indexed: true });
    expect(mocks.deleteBadgeAward).toHaveBeenCalledTimes(2);
    expect(mocks.deleteBadgeAward).toHaveBeenNthCalledWith(1, FAKE_REPO, "known1");
    expect(mocks.deleteBadgeAward).toHaveBeenNthCalledWith(2, FAKE_REPO, "indexed2");
    expect(mocks.updateTag.mock.calls.flat()).toEqual([
      `badges:${USER}`,
      `endorsements:${USER}`,
      `actor:${USER}`,
      `endorsements:${SUBJECT}`,
      `actor:${SUBJECT}`,
    ]);
  });

  it("rejects URIs belonging to another account or another collection", async () => {
    expect(
      await unendorse({
        repo: USER,
        subject: SUBJECT,
        uris: [`at://${ORG}/app.certified.badge.award/other`],
      }),
    ).toMatchObject({ ok: false, reason: "invalid" });
    expect(
      await unendorse({
        repo: USER,
        subject: SUBJECT,
        uris: [`at://${USER}/org.hypercerts.claim.activity/not-an-award`],
      }),
    ).toMatchObject({ ok: false, reason: "invalid" });
    expect(mocks.deleteBadgeAward).not.toHaveBeenCalled();
  });

  it("maps CGS forbidden and unknown delete errors accurately", async () => {
    const uri = `at://${ORG}/app.certified.badge.award/a1`;
    mocks.deleteBadgeAward.mockRejectedValueOnce(new WriteError("forbidden", "no"));
    const forbidden = await unendorse({ repo: ORG, subject: SUBJECT, uris: [uri] });
    expect(forbidden).toMatchObject({ ok: false, reason: "forbidden" });
    if (!forbidden.ok) expect(forbidden.message).toContain("admins and owners");

    mocks.deleteBadgeAward.mockRejectedValueOnce(new WriteError("unknown", "502"));
    expect(await unendorse({ repo: ORG, subject: SUBJECT, uris: [uri] })).toMatchObject({
      ok: false,
      reason: "unknown",
    });
  });
});

describe("workspace endorsement actions", () => {
  it("endorses from workspace with an optional note and rejects duplicates", async () => {
    const res = await endorseFromWorkspace(USER, {
      target: "@alice.bsky.social",
      note: "Trusted collaborator",
    });
    expect(res.ok).toBe(true);
    expect(mocks.awardBadge).toHaveBeenCalledWith(
      expect.anything(),
      {
        definition: { title: "Endorsement", badgeType: "endorsement" },
        subject: { did: SUBJECT },
        note: "Trusted collaborator",
      },
      undefined,
    );

    mocks.getIndexedEndorsement.mockResolvedValueOnce({
      uri: `at://${USER}/app.certified.badge.award/dup`,
      cid: "bafydup",
    });
    expect(await endorseFromWorkspace(USER, { target: "@alice.bsky.social" })).toMatchObject({
      ok: false,
      reason: "invalid",
    });
  });

  it("revokes a specific given endorsement award", async () => {
    const awardUri = `at://${USER}/app.certified.badge.award/awd9`;
    const res = await revokeEndorsement(USER, { awardUri, subjectDid: SUBJECT });
    expect(res).toEqual({ ok: true, endorsement: null, indexed: true });
    expect(mocks.deleteBadgeAward).toHaveBeenCalledWith(FAKE_REPO, "awd9");
  });

  it("hides and shows received endorsements via respondToBadgeAward", async () => {
    const awardUri = `at://${SUBJECT}/app.certified.badge.award/in1`;
    expect(await setEndorsementVisibility(USER, { awardUri, hidden: true })).toEqual({
      ok: true,
      hidden: true,
      indexed: true,
    });
    expect(mocks.respondToBadgeAward).toHaveBeenCalledWith(
      expect.anything(),
      { award: { uri: awardUri }, response: "rejected" },
      undefined,
    );

    expect(await setEndorsementVisibility(ORG, { awardUri, hidden: false })).toEqual({
      ok: true,
      hidden: false,
      indexed: true,
    });
    expect(mocks.respondToBadgeAward).toHaveBeenLastCalledWith(
      expect.anything(),
      { award: { uri: awardUri }, response: "accepted" },
      { repo: ORG },
    );
  });
});
