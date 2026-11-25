import type { OAuthSession } from "@atproto/oauth-client-node";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = {
  getOAuthSession: vi.fn<() => Promise<OAuthSession | null>>(),
  registerGroup: vi.fn(),
  forgetMemberships: vi.fn(),
  addGroupMember: vi.fn(),
  removeGroupMember: vi.fn(),
  setGroupMemberRole: vi.fn(),
  createOrganization: vi.fn(),
  resolveAccountDid: vi.fn(),
  updateTag: vi.fn(),
};

vi.mock("next/cache", () => ({ updateTag: (...args: unknown[]) => mocks.updateTag(...args) }));
vi.mock("@/lib/auth/dal", () => ({
  getOAuthSession: () => mocks.getOAuthSession(),
  SessionUnavailableError: class SessionUnavailableError extends Error {},
}));
vi.mock("@/lib/cgs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/cgs")>();
  return {
    ...actual,
    registerGroup: (...args: unknown[]) => mocks.registerGroup(...args),
    forgetMemberships: (...args: unknown[]) => mocks.forgetMemberships(...args),
    addGroupMember: (...args: unknown[]) => mocks.addGroupMember(...args),
    removeGroupMember: (...args: unknown[]) => mocks.removeGroupMember(...args),
    setGroupMemberRole: (...args: unknown[]) => mocks.setGroupMemberRole(...args),
  };
});
vi.mock("@hypercerts-org/sdk/organization", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@hypercerts-org/sdk/organization")>();
  return {
    ...actual,
    createOrganization: (...args: unknown[]) => mocks.createOrganization(...args),
  };
});
vi.mock("@/lib/hypercerts/resolve-target", () => ({
  resolveAccountDid: (...args: unknown[]) => mocks.resolveAccountDid(...args),
}));

const { createGroup, addMember, removeMember, changeMemberRole } = await import("./group-actions");

const USER = "did:plc:user11111111111111111111";
const ORG = "did:plc:org111111111111111111111";
const MEMBER = "did:plc:mem111111111111111111111";
const FAKE_SESSION = { did: USER, fetchHandler: vi.fn() } as unknown as OAuthSession;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getOAuthSession.mockResolvedValue(FAKE_SESSION);
  mocks.forgetMemberships.mockResolvedValue(undefined);
  mocks.registerGroup.mockResolvedValue({
    groupDid: ORG,
    handle: "forest-co.certified.one",
    accountPassword: "secret-one-time-password",
  });
  mocks.createOrganization.mockResolvedValue({
    uri: `at://${ORG}/app.certified.actor.organization/self`,
    cid: "bafyorg",
    profile: {
      uri: `at://${ORG}/app.certified.actor.profile/self`,
      cid: "bafyprof",
      created: true,
    },
  });
  mocks.resolveAccountDid.mockResolvedValue(MEMBER);
  mocks.addGroupMember.mockResolvedValue({ memberDid: MEMBER, role: "admin" });
  mocks.removeGroupMember.mockResolvedValue(undefined);
  mocks.setGroupMemberRole.mockResolvedValue({ memberDid: MEMBER, role: "member" });
});

describe("createGroup", () => {
  it("appends the default PDS domain to bare handles, registers on CGS, and initializes organization via SDK", async () => {
    const res = await createGroup({
      handle: "forest-co",
      displayName: "Forest Collective",
      description: "Stewardship network",
      email: "team@forest.example",
    });

    expect(res).toEqual({
      ok: true,
      groupDid: ORG,
      handle: "forest-co.certified.one",
      accountPassword: "secret-one-time-password",
      href: `/${ORG}/workspace`,
      profileNote: undefined,
    });
    expect(mocks.registerGroup).toHaveBeenCalledWith(FAKE_SESSION, {
      handle: "forest-co.certified.one",
      email: "team@forest.example",
    });
    expect(mocks.forgetMemberships).toHaveBeenCalledWith(USER);
    expect(mocks.createOrganization).toHaveBeenCalledWith(
      expect.anything(),
      {
        organization: {},
        profileIfMissing: {
          displayName: "Forest Collective",
          description: "Stewardship network",
        },
      },
      { repo: ORG },
    );
  });

  it("still returns the one-time password if initial organization record fails", async () => {
    mocks.createOrganization.mockRejectedValueOnce(new Error("pds busy"));
    const res = await createGroup({ handle: "forest-co" });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.accountPassword).toBe("secret-one-time-password");
      expect(res.profileNote).toContain("edit it from the workspace");
    }
  });

  it("rejects invalid handles and emails before calling CGS", async () => {
    expect(await createGroup({ handle: "bad handle!" })).toMatchObject({ ok: false });
    expect(await createGroup({ handle: "good-org", email: "not-an-email" })).toMatchObject({
      ok: false,
    });
    expect(mocks.registerGroup).not.toHaveBeenCalled();
  });
});

describe("group member management", () => {
  it("adds, updates role, and removes a member while clearing their membership cache", async () => {
    expect(await addMember(ORG, { target: "@alice.bsky.social", role: "admin" })).toEqual({
      ok: true,
    });
    expect(mocks.addGroupMember).toHaveBeenCalledWith(FAKE_SESSION, ORG, MEMBER, "admin");
    expect(mocks.forgetMemberships).toHaveBeenCalledWith(MEMBER);

    expect(await changeMemberRole(ORG, { memberDid: MEMBER, role: "member" })).toEqual({
      ok: true,
    });
    expect(mocks.setGroupMemberRole).toHaveBeenCalledWith(FAKE_SESSION, ORG, MEMBER, "member");

    expect(await removeMember(ORG, MEMBER)).toEqual({ ok: true });
    expect(mocks.removeGroupMember).toHaveBeenCalledWith(FAKE_SESSION, ORG, MEMBER);
  });

  it("refuses adding a group as its own member", async () => {
    mocks.resolveAccountDid.mockResolvedValueOnce(ORG);
    expect(await addMember(ORG, { target: ORG, role: "member" })).toMatchObject({ ok: false });
    expect(mocks.addGroupMember).not.toHaveBeenCalled();
  });
});
