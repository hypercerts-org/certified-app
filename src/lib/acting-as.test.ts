import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: <T extends (...args: never[]) => unknown>(fn: T) => fn }));

const mocks = {
  getUser: vi.fn(),
  readActingAs: vi.fn(),
  getMemberships: vi.fn(),
  logError: vi.fn(),
};

vi.mock("@/lib/auth/dal", () => ({ getUser: () => mocks.getUser() }));
vi.mock("@/lib/auth/session", () => ({ readActingAs: () => mocks.readActingAs() }));
vi.mock("@/lib/memberships", () => ({ getMemberships: () => mocks.getMemberships() }));
vi.mock("@/lib/log", () => ({ logError: (...args: unknown[]) => mocks.logError(...args) }));

const { getActingAs } = await import("./acting-as");

const USER = "did:plc:user11111111111111111111";
const ORG = "did:plc:org111111111111111111111";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ did: USER });
  mocks.readActingAs.mockResolvedValue(null);
  mocks.getMemberships.mockResolvedValue([{ groupDid: ORG, role: "admin" }]);
});

describe("getActingAs", () => {
  it("returns null when signed out and user.did when no org cookie is set", async () => {
    mocks.getUser.mockResolvedValueOnce(null);
    expect(await getActingAs()).toBeNull();
    expect(await getActingAs()).toBe(USER);
    expect(mocks.getMemberships).not.toHaveBeenCalled();
  });

  it("returns the stored organization DID while the user belongs to it, else falls back to user.did", async () => {
    mocks.readActingAs.mockResolvedValueOnce(ORG);
    expect(await getActingAs()).toBe(ORG);

    mocks.readActingAs.mockResolvedValueOnce(ORG);
    mocks.getMemberships.mockResolvedValueOnce([]);
    expect(await getActingAs()).toBe(USER);
  });

  it("logs and falls back to user.did when membership lookup fails", async () => {
    mocks.readActingAs.mockResolvedValueOnce(ORG);
    mocks.getMemberships.mockRejectedValueOnce(new Error("valkey down"));
    expect(await getActingAs()).toBe(USER);
    expect(mocks.logError).toHaveBeenCalledTimes(1);
  });
});
