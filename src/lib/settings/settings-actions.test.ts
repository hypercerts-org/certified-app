import { XrpcResponseError } from "@atproto/lex";
import type { OAuthSession } from "@atproto/oauth-client-node";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  confirmGroupAccountEmail,
  confirmGroupAccountPasswordReset,
  confirmOwnPasswordReset,
  confirmPersonalEmail,
  getGroupAccountStatus,
  lockPersonalSession,
  readGroupAccountEmail,
  requestGroupAccountEmailUpdate,
  requestOwnPasswordReset,
  requestPersonalEmailConfirmation,
  requestPersonalEmailUpdate,
  unlockGroupSession,
  unlockPersonalSession,
  updateGroupAccountEmail,
  updateGroupAccountHandle,
  updateOwnHandle,
  updatePersonalEmail,
} from "./account-actions";
import {
  createPersonalAppPassword,
  listPersonalAppPasswords,
  revokePersonalAppPassword,
} from "./app-password-actions";
import {
  compareSocialGraph,
  exportCertifiedFollowsToBluesky,
  importBlueskyFollows,
} from "./bluesky-sync-actions";
import { promotePersonalAccountToGroup } from "./group-import-action";

const mocks = vi.hoisted(() => ({
  getOAuthSession: vi.fn(),
  establishElevatedSession: vi.fn(),
  endElevatedSession: vi.fn(async () => {}),
  callElevatedPds: vi.fn(),
  callOAuthPds: vi.fn(),
  callPublicPds: vi.fn(),
  hasElevatedSession: vi.fn(),
  readPdsError: vi.fn(async () => "PDS error"),
  verifyGroupPassword: vi.fn(),
  importGroup: vi.fn(),
  canEdit: vi.fn(),
  isMember: vi.fn(),
  forgetMemberships: vi.fn(async () => {}),
  createOrganization: vi.fn(async () => ({})),
  followAccount: vi.fn(),
  sdkContext: vi.fn(async () => ({})),
  writeFailure: vi.fn(() => "unavailable"),
  writeTo: vi.fn(),
  createBlueskyFollow: vi.fn(),
  repositoryFor: vi.fn(),
  getActorCards: vi.fn(async () => []),
  updateTag: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ updateTag: mocks.updateTag }));
vi.mock("@/lib/auth/dal", () => ({
  getOAuthSession: mocks.getOAuthSession,
  SessionUnavailableError: class SessionUnavailableError extends Error {},
}));
vi.mock("@/lib/auth/elevated-session", () => ({
  establishElevatedSession: mocks.establishElevatedSession,
  endElevatedSession: mocks.endElevatedSession,
  callElevatedPds: mocks.callElevatedPds,
  callOAuthPds: mocks.callOAuthPds,
  callPublicPds: mocks.callPublicPds,
  hasElevatedSession: mocks.hasElevatedSession,
  readPdsError: mocks.readPdsError,
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
  followAccount: mocks.followAccount,
}));
vi.mock("@/lib/hypercerts/sdk", () => ({
  sdkContext: mocks.sdkContext,
  writeFailure: mocks.writeFailure,
  writeTo: mocks.writeTo,
}));
vi.mock("@/lib/hypercerts/index-wait", () => ({ waitForIndex: vi.fn(async () => true) }));
vi.mock("@/lib/hypercerts/queries", () => ({ getActorCards: mocks.getActorCards }));
vi.mock("@/lib/hypercerts/writes", () => ({
  createBlueskyFollow: mocks.createBlueskyFollow,
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

const { WriteError } = await import("@/lib/hypercerts/writes");

const alice = "did:plc:ewvi7nxzyoun6zhxrhs64oiz";
const group = "did:plc:aaaaaaaaaaaaaaaaaaaaaaaa";
const bob = "did:plc:bbbbbbbbbbbbbbbbbbbbbbbb";
const carol = "did:plc:cccccccccccccccccccccccc";
const fakeSession = { did: alice } as unknown as OAuthSession;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getOAuthSession.mockResolvedValue(fakeSession);
  mocks.readPdsError.mockResolvedValue("PDS error");
});

describe("account actions (personal)", () => {
  it("validates handles, surfaces missing-scope guidance, and expires actor/handle/explore tags", async () => {
    expect(await updateOwnHandle("not a handle")).toMatchObject({ ok: false });
    expect(mocks.callOAuthPds).not.toHaveBeenCalled();

    mocks.callOAuthPds.mockResolvedValueOnce(new Response(null, { status: 400 }));
    mocks.readPdsError.mockResolvedValueOnce("Missing required scope: transition:generic");
    const missingScope = await updateOwnHandle("alice.certified.one");
    expect(missingScope.ok).toBe(false);
    if (!missingScope.ok) expect(missingScope.message).toMatch(/sign out and sign back in/i);

    mocks.callOAuthPds.mockResolvedValueOnce(new Response(null, { status: 200 }));
    const ok = await updateOwnHandle("@Alice.Certified.One");
    expect(ok).toEqual({ ok: true });
    expect(mocks.callOAuthPds).toHaveBeenLastCalledWith(
      fakeSession,
      "com.atproto.identity.updateHandle",
      { method: "POST", body: { handle: "alice.certified.one" } },
    );
    expect(mocks.updateTag.mock.calls.flat()).toEqual([
      `actor:${alice}`,
      "handle:alice.certified.one",
      "explore",
    ]);
  });

  it("validates inputs and forwards personal password reset requests and confirmations", async () => {
    expect(await requestOwnPasswordReset("bad-email")).toMatchObject({ ok: false });
    expect(await confirmOwnPasswordReset({ token: "", password: "long-password" })).toMatchObject({
      ok: false,
    });
    expect(await confirmOwnPasswordReset({ token: "code", password: "short" })).toMatchObject({
      ok: false,
    });

    mocks.callPublicPds.mockResolvedValueOnce(new Response(null, { status: 200 }));
    expect(await requestOwnPasswordReset("alice@example.org")).toEqual({ ok: true });

    mocks.callPublicPds.mockResolvedValueOnce(new Response(null, { status: 200 }));
    expect(
      await confirmOwnPasswordReset({ token: " 123456 ", password: "new-password-123" }),
    ).toEqual({ ok: true });
    expect(mocks.callPublicPds).toHaveBeenLastCalledWith(
      alice,
      "com.atproto.server.resetPassword",
      { token: "123456", password: "new-password-123" },
    );
  });

  it("opens and closes personal elevated sessions and maps rate limits", async () => {
    mocks.establishElevatedSession.mockResolvedValueOnce({ status: "rateLimited" });
    const limited = await unlockPersonalSession({ password: "secret" });
    expect(limited).toMatchObject({ ok: true, status: "rateLimited" });
    if (limited.ok) expect(limited.message).toMatch(/too many attempts/i);

    expect(await lockPersonalSession()).toEqual({ ok: true });
    expect(mocks.endElevatedSession).toHaveBeenCalledWith({ kind: "personal", callerDid: alice });
  });

  it("surfaces locked=true for personal email mutations until unlocked, then succeeds", async () => {
    mocks.callElevatedPds.mockResolvedValueOnce({ kind: "locked" });
    expect(await requestPersonalEmailUpdate()).toMatchObject({ ok: false, locked: true });

    mocks.callElevatedPds.mockResolvedValueOnce({
      kind: "ok",
      response: Response.json({ tokenRequired: true }),
    });
    expect(await requestPersonalEmailUpdate()).toEqual({ ok: true, tokenRequired: true });

    expect(await updatePersonalEmail({ email: "not-an-email" })).toMatchObject({ ok: false });
    mocks.callElevatedPds.mockResolvedValueOnce({
      kind: "ok",
      response: new Response(null, { status: 200 }),
    });
    expect(await updatePersonalEmail({ email: "new@example.org", token: "999" })).toEqual({
      ok: true,
    });

    mocks.callElevatedPds.mockResolvedValueOnce({
      kind: "ok",
      response: new Response(null, { status: 200 }),
    });
    expect(await requestPersonalEmailConfirmation()).toEqual({ ok: true });

    mocks.callElevatedPds.mockResolvedValueOnce({
      kind: "ok",
      response: new Response(null, { status: 200 }),
    });
    expect(await confirmPersonalEmail({ email: "new@example.org", token: "abc" })).toEqual({
      ok: true,
    });
  });
});

describe("account actions (group)", () => {
  it("rejects group management actions when caller is not an admin or owner on CGS", async () => {
    mocks.canEdit.mockResolvedValue(false);
    expect(await unlockGroupSession(group, { password: "secret" })).toMatchObject({ ok: false });
    expect(await updateGroupAccountHandle(group, "team.certified.one")).toMatchObject({
      ok: false,
    });
    expect(await updateGroupAccountEmail(group, { email: "team@example.org" })).toMatchObject({
      ok: false,
    });
    expect(mocks.establishElevatedSession).not.toHaveBeenCalled();
    expect(mocks.callElevatedPds).not.toHaveBeenCalled();
  });

  it("reads group unlock status, email, and updates group handle/email via elevated session", async () => {
    mocks.canEdit.mockResolvedValue(true);
    mocks.hasElevatedSession.mockResolvedValueOnce(true);
    expect(await getGroupAccountStatus(group)).toEqual({ ok: true, unlocked: true });

    mocks.callElevatedPds.mockResolvedValueOnce({
      kind: "ok",
      response: Response.json({ email: "team@example.org", emailConfirmed: false }),
    });
    expect(await readGroupAccountEmail(group)).toEqual({
      ok: true,
      email: "team@example.org",
      emailConfirmed: false,
    });

    mocks.callElevatedPds.mockResolvedValueOnce({ kind: "locked" });
    expect(await updateGroupAccountHandle(group, "team.certified.one")).toMatchObject({
      ok: false,
      locked: true,
    });

    mocks.callElevatedPds.mockResolvedValueOnce({
      kind: "ok",
      response: new Response(null, { status: 200 }),
    });
    expect(await updateGroupAccountHandle(group, "team.certified.one")).toEqual({ ok: true });
    expect(mocks.updateTag.mock.calls.flat()).toEqual([
      `actor:${group}`,
      "handle:team.certified.one",
      "explore",
    ]);

    mocks.callElevatedPds.mockResolvedValueOnce({
      kind: "ok",
      response: Response.json({ tokenRequired: false }),
    });
    expect(await requestGroupAccountEmailUpdate(group)).toEqual({ ok: true, tokenRequired: false });

    mocks.callElevatedPds.mockResolvedValueOnce({
      kind: "ok",
      response: new Response(null, { status: 200 }),
    });
    expect(
      await confirmGroupAccountEmail(group, { email: "team@example.org", token: "111" }),
    ).toEqual({ ok: true });
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
});

describe("app password actions", () => {
  it("lists, creates, and revokes app passwords, enforcing name bounds and unlock state", async () => {
    mocks.callElevatedPds.mockResolvedValueOnce({ kind: "locked" });
    expect(await listPersonalAppPasswords()).toMatchObject({ ok: false, locked: true });

    mocks.callElevatedPds.mockResolvedValueOnce({
      kind: "ok",
      response: Response.json({ passwords: [{ name: "Bluesky", createdAt: "2026-01-01" }] }),
    });
    expect(await listPersonalAppPasswords()).toEqual({
      ok: true,
      passwords: [{ name: "Bluesky", createdAt: "2026-01-01" }],
    });

    expect(await createPersonalAppPassword("   ")).toMatchObject({ ok: false });
    expect(await createPersonalAppPassword("a".repeat(101))).toMatchObject({ ok: false });

    mocks.callElevatedPds.mockResolvedValueOnce({
      kind: "ok",
      response: Response.json({ name: "CLI", password: "abcd-efgh", createdAt: "2026-01-01" }),
    });
    expect(await createPersonalAppPassword(" CLI ")).toEqual({
      ok: true,
      created: { name: "CLI", password: "abcd-efgh", createdAt: "2026-01-01" },
    });

    expect(await revokePersonalAppPassword("")).toMatchObject({ ok: false });
    mocks.callElevatedPds.mockResolvedValueOnce({
      kind: "ok",
      response: new Response(null, { status: 200 }),
    });
    expect(await revokePersonalAppPassword("CLI")).toEqual({ ok: true });
  });
});

describe("group import action", () => {
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
});

describe("bluesky sync actions", () => {
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

  it("imports Bluesky follows, skips self/dupes, expires subject tags, and reports unknown outcomes", async () => {
    mocks.isMember.mockResolvedValueOnce(false);
    expect(await importBlueskyFollows(group, [bob])).toMatchObject({ ok: false });

    mocks.isMember.mockResolvedValueOnce(true);
    mocks.followAccount
      .mockResolvedValueOnce({ uri: "at://follow/1" })
      .mockRejectedValueOnce(new Error("timeout"));
    mocks.writeFailure.mockReturnValueOnce("unknown");

    const res = await importBlueskyFollows(group, [group, bob, bob, carol]);
    expect(res).toEqual({
      ok: true,
      imported: 1,
      failed: 1,
      errors: [
        {
          subjectDid: carol,
          message: "Couldn't confirm whether this follow was imported. Reload to check.",
        },
      ],
    });
    // Both the acting account and the followed subject's caches are expired.
    expect(mocks.updateTag.mock.calls.flat()).toEqual([
      `follows:${group}`,
      `actor:${group}`,
      `follows:${bob}`,
      `actor:${bob}`,
    ]);
  });

  it("exports Certified follows to Bluesky, skips self, and distinguishes unknown vs rejected writes", async () => {
    mocks.getOAuthSession.mockResolvedValueOnce(null);
    expect(await exportCertifiedFollowsToBluesky([bob])).toMatchObject({ ok: false });

    mocks.createBlueskyFollow
      .mockResolvedValueOnce({ uri: "at://bsky/1", cid: "bafy1" })
      .mockRejectedValueOnce(new WriteError("unknown", "timeout"))
      .mockRejectedValueOnce(
        new XrpcResponseError({} as never, new Response(null, { status: 400 }), {
          encoding: "application/json",
          body: { error: "InvalidRequest", message: "bad" },
        }),
      );

    const dave = "did:plc:dddddddddddddddddddddddd";
    const res = await exportCertifiedFollowsToBluesky([alice, bob, carol, dave]);
    expect(res).toEqual({
      ok: true,
      imported: 1,
      failed: 2,
      errors: [
        {
          subjectDid: carol,
          message: "Couldn't confirm whether this follow was added on Bluesky. Reload to check.",
        },
        {
          subjectDid: dave,
          message: "Couldn't add this follow on Bluesky.",
        },
      ],
    });
  });
});
