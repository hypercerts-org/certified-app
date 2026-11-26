import type { OAuthSession } from "@atproto/oauth-client-node";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: <T extends (...args: never[]) => unknown>(fn: T) => fn }));
vi.mock("next/cache", () => ({ cacheLife: () => {}, cacheTag: () => {} }));

const mocks = {
  getUser: vi.fn(),
  readOAuthSession: vi.fn(),
  readCachedMemberships: vi.fn(),
  listMembershipsForDisplay: vi.fn(),
  readCachedGroupMembers: vi.fn(),
  listGroupMembersForDisplay: vi.fn(),
  logError: vi.fn(),
};

vi.mock("@/lib/auth/dal", () => ({
  getUser: () => mocks.getUser(),
  readOAuthSession: () => mocks.readOAuthSession(),
  SessionUnavailableError: class SessionUnavailableError extends Error {},
}));
vi.mock("@/lib/cgs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/cgs")>();
  return {
    ...actual,
    readCachedMemberships: (...args: unknown[]) => mocks.readCachedMemberships(...args),
    listMembershipsForDisplay: (...args: unknown[]) => mocks.listMembershipsForDisplay(...args),
    readCachedGroupMembers: (...args: unknown[]) => mocks.readCachedGroupMembers(...args),
    listGroupMembersForDisplay: (...args: unknown[]) => mocks.listGroupMembersForDisplay(...args),
  };
});
vi.mock("@/lib/log", () => ({ logError: (...args: unknown[]) => mocks.logError(...args) }));

const { getMemberships, getGroupMembers, mayEditAccount } = await import("./memberships");

const USER = "did:plc:user11111111111111111111";
const ORG_ADMIN = "did:plc:admn11111111111111111111";
const ORG_MEMBER = "did:plc:memb11111111111111111111";
const FAKE_SESSION = { did: USER } as unknown as OAuthSession;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ did: USER });
  mocks.readOAuthSession.mockResolvedValue(FAKE_SESSION);
  mocks.readCachedMemberships.mockResolvedValue([
    { groupDid: ORG_ADMIN, role: "admin" },
    { groupDid: ORG_MEMBER, role: "member" },
  ]);
  mocks.listMembershipsForDisplay.mockResolvedValue([{ groupDid: ORG_ADMIN, role: "owner" }]);
  mocks.readCachedGroupMembers.mockResolvedValue([
    { did: USER, role: "owner", addedAt: "2026-11-01T00:00:00Z" },
  ]);
  mocks.listGroupMembersForDisplay.mockResolvedValue([
    { did: USER, role: "admin", addedAt: "2026-11-01T00:00:00Z" },
  ]);
});

describe("getMemberships & getGroupMembers", () => {
  it("uses Valkey cache without restoring OAuth on cache hits", async () => {
    const memberships = await getMemberships();
    expect(memberships).toHaveLength(2);
    const groupMembers = await getGroupMembers(ORG_ADMIN);
    expect(groupMembers).toHaveLength(1);
    expect(mocks.readOAuthSession).not.toHaveBeenCalled();
  });

  it("restores OAuth and asks CGS only on cache miss, returning expired when session expired", async () => {
    mocks.readCachedMemberships.mockResolvedValueOnce(undefined);
    expect(await getMemberships()).toEqual([{ groupDid: ORG_ADMIN, role: "owner" }]);
    expect(mocks.readOAuthSession).toHaveBeenCalledTimes(1);
    expect(mocks.logError).not.toHaveBeenCalled();

    mocks.readCachedGroupMembers.mockResolvedValueOnce(undefined);
    mocks.readOAuthSession.mockResolvedValueOnce("expired");
    expect(await getGroupMembers(ORG_ADMIN)).toBe("expired");
  });

  it("does not serve cached group members to a caller absent from the cached roster", async () => {
    mocks.readCachedGroupMembers.mockResolvedValueOnce([
      { did: "did:plc:someoneelse11111111111111", role: "owner", addedAt: "2026-11-01T00:00:00Z" },
    ]);
    await getGroupMembers(ORG_ADMIN);
    expect(mocks.readOAuthSession).toHaveBeenCalledTimes(1);
    expect(mocks.listGroupMembersForDisplay).toHaveBeenCalledWith(FAKE_SESSION, ORG_ADMIN);
  });
});

describe("mayEditAccount", () => {
  it("allows own account and org admins/owners, but not regular members or signed-out visitors", async () => {
    expect(await mayEditAccount(USER)).toBe(true);
    expect(await mayEditAccount(ORG_ADMIN)).toBe(true);
    expect(await mayEditAccount(ORG_MEMBER)).toBe(false);

    mocks.getUser.mockResolvedValueOnce(null);
    expect(await mayEditAccount(USER)).toBe(false);
  });
});
