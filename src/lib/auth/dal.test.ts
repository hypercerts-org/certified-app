import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheTag: vi.fn() }));
vi.mock("next/server", () => ({ connection: vi.fn(async () => {}) }));

const mocks = {
  readAppSession: vi.fn(),
  endAppSession: vi.fn(),
  restore: vi.fn(),
  isExpectedSessionError: vi.fn(),
  logError: vi.fn(),
};

vi.mock("@atproto/oauth-client-node", () => ({
  isExpectedSessionError: (err: unknown) => mocks.isExpectedSessionError(err),
}));
vi.mock("./oauth-client", () => ({
  getOAuthClient: async () => ({ restore: (...args: unknown[]) => mocks.restore(...args) }),
}));
vi.mock("./session", () => ({
  readAppSession: () => mocks.readAppSession(),
  endAppSession: (...args: unknown[]) => mocks.endAppSession(...args),
}));
vi.mock("@/lib/log", () => ({ logError: (...args: unknown[]) => mocks.logError(...args) }));

const { getUser, getOAuthSession, readOAuthSession, SessionUnavailableError } = await import(
  "./dal"
);

const USER = "did:plc:user11111111111111111111";
const FAKE_SESSION = { did: USER };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.readAppSession.mockResolvedValue({ did: USER });
  mocks.endAppSession.mockResolvedValue(undefined);
  mocks.restore.mockResolvedValue(FAKE_SESSION);
  mocks.isExpectedSessionError.mockReturnValue(false);
});

describe("auth DAL", () => {
  it("returns user DID from app session or null when signed out", async () => {
    expect(await getUser()).toEqual({ did: USER });
    mocks.readAppSession.mockResolvedValueOnce(null);
    expect(await getUser()).toBeNull();
  });

  it("ends the app session on expired OAuth in getOAuthSession, but never mutates in readOAuthSession", async () => {
    mocks.restore.mockRejectedValueOnce(new Error("TokenRefreshError"));
    mocks.isExpectedSessionError.mockReturnValueOnce(true);
    expect(await getOAuthSession()).toBeNull();
    expect(mocks.endAppSession).toHaveBeenCalledWith({ revokeIfLast: false });

    mocks.endAppSession.mockClear();
    mocks.restore.mockRejectedValueOnce(new Error("TokenRefreshError"));
    mocks.isExpectedSessionError.mockReturnValueOnce(true);
    expect(await readOAuthSession()).toBe("expired");
    expect(mocks.endAppSession).not.toHaveBeenCalled();
  });

  it("throws SessionUnavailableError on transient failures without signing the user out", async () => {
    mocks.restore.mockRejectedValueOnce(new Error("Valkey ECONNREFUSED"));
    await expect(getOAuthSession()).rejects.toBeInstanceOf(SessionUnavailableError);
    expect(mocks.endAppSession).not.toHaveBeenCalled();
    expect(mocks.logError).toHaveBeenCalledTimes(1);
  });
});
