import { XrpcResponseError } from "@atproto/lex";
import type { OAuthSession } from "@atproto/oauth-client-node";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  compareSocialGraph,
  confirmGroupAccountPasswordReset,
  promotePersonalAccountToGroup,
  unlockGroupSession,
} from "./settings-actions";

const mocks = vi.hoisted(() => ({
  getOAuthSession: vi.fn(),
  establishElevatedSession: vi.fn(),
  endElevatedSession: vi.fn(async () => {}),
  callElevatedPds: vi.fn(),
  callPublicPds: vi.fn(),
  verifyGroupPassword: vi.fn(),
  importGroup: vi.fn(),
  canEdit: vi.fn(),
  isMember: vi.fn(),
  forgetMemberships: vi.fn(async () => {}),
  createOrganization: vi.fn(async () => ({})),
  sdkContext: vi.fn(async () => ({})),
  repositoryFor: vi.fn(),
  getActorCards: vi.fn(async () => []),
  updateTag: vi.fn(),
}));

vi.mock("next/cache", () => ({ updateTag: mocks.updateTag }));
vi.mock("@/lib/auth/dal", () => ({
  getOAuthSession: mocks.getOAuthSession,
  SessionUnavailableError: class SessionUnavailableError extends Error {},
}));
vi.mock("@/lib/auth/elevated-session", () => ({
  establishElevatedSession: mocks.establishElevatedSession,
  endElevatedSession: mocks.endElevatedSession,
  callElevatedPds: mocks.callElevatedPds,
  callOAuthPds: vi.fn(),
  callPublicPds: mocks.callPublicPds,
  hasElevatedSession: vi.fn(),
  readPdsError: vi.fn(async () => "PDS error"),
  verifyGroupPassword: mocks.verifyGroupPassword,
}));
vi.mock("@/lib/cgs", () => ({
  CgsAuthError: class CgsAuthError extends Error {},
  canEdit: mocks.canEdit,
  forgetMemberships: mocks.forgetMemberships,
  importGroup: mocks.importGroup,
  isMember: mocks.isMember,
}));
vi.mock("@hypercerts-org/sdk/organization", () => ({
  createOrganization: mocks.createOrganization,
}));
vi.mock("@hypercerts-org/sdk/social", () => ({
  followAccount: vi.fn(),
}));
vi.mock("@/lib/hypercerts/sdk", () => ({
  sdkContext: mocks.sdkContext,
  writeFailure: vi.fn(() => "unavailable"),
  writeTo: vi.fn(),
}));
vi.mock("@/lib/hypercerts/index-wait", () => ({ waitForIndex: vi.fn(async () => true) }));
vi.mock("@/lib/hypercerts/queries", () => ({ getActorCards: mocks.getActorCards }));
vi.mock("@/lib/hypercerts/writes", () => ({
  createBlueskyFollow: vi.fn(),
  repositoryFor: mocks.repositoryFor,
  WriteError: class WriteError extends Error {
    constructor(
      readonly reason: string,
      message: string,
    ) {
      super(message);
    }
  },
}));
vi.mock("@/lib/identity", () => ({ resolveHandleFresh: vi.fn(async () => null) }));
vi.mock("@/lib/log", () => ({ logError: () => {} }));

const alice = "did:plc:ewvi7nxzyoun6zhxrhs64oiz";
const group = "did:plc:aaaaaaaaaaaaaaaaaaaaaaaa";
const bob = "did:plc:bbbbbbbbbbbbbbbbbbbbbbbb";
const carol = "did:plc:cccccccccccccccccccccccc";
const fakeSession = { did: alice } as unknown as OAuthSession;

describe("settings actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOAuthSession.mockResolvedValue(fakeSession);
  });

  it("keeps the minted app password active when promotePersonalAccountToGroup succeeds", async () => {
    mocks.establishElevatedSession.mockResolvedValue({ status: "ok" });
    mocks.callElevatedPds.mockResolvedValueOnce({
      kind: "ok",
      response: Response.json({
        name: "Certified Group Service (abcd)",
        password: "xxxx-xxxx-xxxx-xxxx",
        createdAt: "2026-11-26T00:00:00.000Z",
      }),
    });
    mocks.importGroup.mockResolvedValue({ groupDid: alice, handle: "alice.certified.one" });

    const res = await promotePersonalAccountToGroup({ password: "my-password" });
    expect(res).toEqual({
      ok: true,
      status: "ok",
      groupDid: alice,
      handle: "alice.certified.one",
    });

    // Only createAppPassword was called — NOT revokeAppPassword (CGS needs the credential!).
    expect(mocks.callElevatedPds).toHaveBeenCalledTimes(1);
    expect(mocks.callElevatedPds.mock.calls[0]?.[1]).toBe("com.atproto.server.createAppPassword");
    // Elevated session is closed afterwards and membership cache cleared.
    expect(mocks.endElevatedSession).toHaveBeenCalledTimes(1);
    expect(mocks.forgetMemberships).toHaveBeenCalledWith(alice);
    expect(mocks.updateTag).toHaveBeenCalledWith(`memberships:${alice}`);
  });

  it("revokes the minted app password on a definite 4xx CGS refusal so no orphan stays behind", async () => {
    mocks.establishElevatedSession.mockResolvedValue({ status: "ok" });
    mocks.callElevatedPds
      .mockResolvedValueOnce({
        kind: "ok",
        response: Response.json({
          name: "Certified Group Service (abcd)",
          password: "xxxx-xxxx-xxxx-xxxx",
          createdAt: "2026-11-26T00:00:00.000Z",
        }),
      })
      .mockResolvedValueOnce({ kind: "ok", response: new Response(null, { status: 200 }) });
    mocks.importGroup.mockRejectedValue(
      new XrpcResponseError({} as never, new Response(null, { status: 409 }), {
        encoding: "application/json",
        body: {
          error: "GroupAlreadyRegistered",
          message: "Already registered",
        },
      }),
    );

    const res = await promotePersonalAccountToGroup({ password: "my-password" });
    expect(res.ok).toBe(false);

    expect(mocks.callElevatedPds).toHaveBeenCalledTimes(2);
    expect(mocks.callElevatedPds.mock.calls[1]?.[1]).toBe("com.atproto.server.revokeAppPassword");
    expect(mocks.endElevatedSession).toHaveBeenCalledTimes(1);
  });

  it("does NOT revoke the minted app password on 5xx/unknown CGS errors so a committed import is not bricked", async () => {
    mocks.establishElevatedSession.mockResolvedValue({ status: "ok" });
    mocks.callElevatedPds.mockResolvedValueOnce({
      kind: "ok",
      response: Response.json({
        name: "Certified Group Service (abcd)",
        password: "xxxx-xxxx-xxxx-xxxx",
        createdAt: "2026-11-26T00:00:00.000Z",
      }),
    });
    mocks.importGroup.mockRejectedValue(
      new XrpcResponseError({} as never, new Response(null, { status: 502 }), {
        encoding: "application/json",
        body: {
          error: "UpstreamFailure",
          message: "Gateway timeout",
        },
      }),
    );

    const res = await promotePersonalAccountToGroup({ password: "my-password" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toMatch(/couldn't confirm/i);

    // Only createAppPassword ran — revokeAppPassword was NOT called.
    expect(mocks.callElevatedPds).toHaveBeenCalledTimes(1);
    expect(mocks.endElevatedSession).toHaveBeenCalledTimes(1);
  });

  it("rejects group unlock when caller is not an admin or owner on CGS", async () => {
    mocks.canEdit.mockResolvedValue(false);
    const res = await unlockGroupSession(group, { password: "secret" });
    expect(res.ok).toBe(false);
    expect(mocks.establishElevatedSession).not.toHaveBeenCalled();
  });

  it("surfaces a clear error if a group password reset applied to a different account", async () => {
    mocks.canEdit.mockResolvedValue(true);
    mocks.callPublicPds.mockResolvedValue(new Response(null, { status: 200 }));
    mocks.verifyGroupPassword.mockResolvedValue(false);

    const res = await confirmGroupAccountPasswordReset(group, {
      token: "123456",
      password: "new-password-123",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toMatch(/different account/i);
  });

  it("refuses social graph comparison for non-members and computes diffs accurately", async () => {
    mocks.isMember.mockResolvedValueOnce(false);
    const denied = await compareSocialGraph(group);
    expect(denied.ok).toBe(false);

    mocks.isMember.mockResolvedValueOnce(true);
    mocks.repositoryFor.mockResolvedValue({
      listRecords: async (collection: string) => ({
        records:
          collection === "app.certified.graph.follow"
            ? [{ value: { subject: { did: bob } } }]
            : [{ value: { subject: bob } }, { value: { subject: carol } }],
      }),
    });
    const res = await compareSocialGraph(group);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.certifiedCount).toBe(1);
      expect(res.blueskyCount).toBe(2);
      expect(res.inBothCount).toBe(1);
      expect(res.onlyBluesky.map((a) => a.did)).toEqual([carol]);
      expect(res.onlyCertified).toEqual([]);
    }
  });
});
