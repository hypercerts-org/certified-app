import type { OAuthSession } from "@atproto/oauth-client-node";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WriteError } from "./writes";

vi.mock("server-only", () => ({}));

const mocks = {
  getOAuthSession: vi.fn<() => Promise<OAuthSession | null>>(),
  getRecordSigner: vi.fn(),
  editableRepository: vi.fn(),
  updateProfile: vi.fn(),
  getIndexedProfile: vi.fn(),
  waitForIndex: vi.fn(),
  updateTag: vi.fn(),
};

vi.mock("next/cache", () => ({ updateTag: (...args: unknown[]) => mocks.updateTag(...args) }));
vi.mock("@/lib/atproto/app-key", () => ({ getRecordSigner: () => mocks.getRecordSigner() }));
vi.mock("@/lib/auth/dal", () => ({
  getOAuthSession: () => mocks.getOAuthSession(),
  SessionUnavailableError: class SessionUnavailableError extends Error {},
}));
vi.mock("@/lib/hypercerts/index-wait", () => ({
  waitForIndex: (check: () => Promise<boolean>) => mocks.waitForIndex(check),
}));
vi.mock("@/lib/hypercerts/queries", () => ({
  getIndexedProfile: (...args: unknown[]) => mocks.getIndexedProfile(...args),
}));
vi.mock("@/lib/hypercerts/writes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./writes")>();
  return {
    ...actual,
    editableRepository: (...args: unknown[]) => mocks.editableRepository(...args),
    updateProfile: (...args: unknown[]) => mocks.updateProfile(...args),
  };
});

const { saveProfile } = await import("./actions");

const USER = "did:plc:user11111111111111111111";
const FAKE_SESSION = { did: USER } as unknown as OAuthSession;
const FAKE_REPO = { did: USER };
const SAVED = {
  uri: `at://${USER}/app.certified.actor.profile/self`,
  cid: "bafysaved",
  displayName: "Alice",
  description: "Steward",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getOAuthSession.mockResolvedValue(FAKE_SESSION);
  mocks.getRecordSigner.mockResolvedValue(vi.fn());
  mocks.editableRepository.mockResolvedValue(FAKE_REPO);
  mocks.updateProfile.mockResolvedValue(SAVED);
  mocks.waitForIndex.mockResolvedValue(true);
});

describe("saveProfile", () => {
  it("validates bounds before touching auth or PDS", async () => {
    expect(
      await saveProfile({
        repo: "not-a-did",
        fields: { displayName: "A", description: "" },
        expectedCid: null,
      }),
    ).toMatchObject({ ok: false, reason: "invalid" });
    expect(
      await saveProfile({
        repo: USER,
        fields: { displayName: "x".repeat(641), description: "" },
        expectedCid: null,
      }),
    ).toMatchObject({ ok: false, reason: "invalid" });
    expect(mocks.getOAuthSession).not.toHaveBeenCalled();
  });

  it("saves trimmed fields, waits for index, and expires actor and explore tags", async () => {
    const res = await saveProfile({
      repo: USER,
      fields: { displayName: "  Alice ", description: " Steward  " },
      expectedCid: "bafyprev",
    });
    expect(res).toEqual({ ok: true, saved: SAVED, indexed: true });
    expect(mocks.updateProfile).toHaveBeenCalledWith(
      FAKE_REPO,
      { displayName: "Alice", description: "Steward" },
      "bafyprev",
      expect.anything(),
    );
    expect(mocks.updateTag.mock.calls.flat()).toEqual([`actor:${USER}`, "explore"]);
  });

  it("reports signed-out, forbidden, conflict, and unknown WriteErrors accurately", async () => {
    mocks.getOAuthSession.mockResolvedValueOnce(null);
    expect(
      await saveProfile({
        repo: USER,
        fields: { displayName: "Alice", description: "" },
        expectedCid: null,
      }),
    ).toMatchObject({ ok: false, reason: "signed-out" });

    mocks.editableRepository.mockResolvedValueOnce(null);
    expect(
      await saveProfile({
        repo: USER,
        fields: { displayName: "Alice", description: "" },
        expectedCid: null,
      }),
    ).toMatchObject({ ok: false, reason: "forbidden" });

    mocks.updateProfile.mockRejectedValueOnce(new WriteError("conflict", "changed"));
    expect(
      await saveProfile({
        repo: USER,
        fields: { displayName: "Alice", description: "" },
        expectedCid: "bafyold",
      }),
    ).toMatchObject({ ok: false, reason: "conflict" });

    mocks.updateProfile.mockRejectedValueOnce(new WriteError("unknown", "timeout"));
    expect(
      await saveProfile({
        repo: USER,
        fields: { displayName: "Alice", description: "" },
        expectedCid: "bafyold",
      }),
    ).toMatchObject({ ok: false, reason: "unknown" });
  });
});
