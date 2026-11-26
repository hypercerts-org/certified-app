import { parseCid, type TypedBlobRef } from "@atproto/lex";
import type { OAuthSession } from "@atproto/oauth-client-node";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WriteError } from "./writes";

vi.mock("server-only", () => ({}));

const mocks = {
  getOAuthSession: vi.fn<() => Promise<OAuthSession | null>>(),
  getRecordSigner: vi.fn(),
  editableRepository: vi.fn(),
  patchProfile: vi.fn(),
  patchOrganization: vi.fn(),
  resolvePublicRecordRef: vi.fn(),
  uploadBlob: vi.fn(),
  createLocation: vi.fn(),
  sdkContext: vi.fn(),
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
vi.mock("@/lib/hypercerts/sdk", () => ({
  sdkContext: (...args: unknown[]) => mocks.sdkContext(...args),
  writeTo: (session: { did: string }, repo: string) =>
    repo === session.did ? undefined : { repo },
}));
vi.mock("@hypercerts-org/sdk/blob", () => ({
  uploadBlob: (...args: unknown[]) => mocks.uploadBlob(...args),
}));
vi.mock("@hypercerts-org/sdk/location", () => ({
  createLocation: (...args: unknown[]) => mocks.createLocation(...args),
}));
vi.mock("@/lib/hypercerts/writes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./writes")>();
  return {
    ...actual,
    editableRepository: (...args: unknown[]) => mocks.editableRepository(...args),
    patchProfile: (...args: unknown[]) => mocks.patchProfile(...args),
    patchOrganization: (...args: unknown[]) => mocks.patchOrganization(...args),
    resolvePublicRecordRef: (...args: unknown[]) => mocks.resolvePublicRecordRef(...args),
  };
});

const { saveOrganizationField, saveProfileField, saveProfileMedia } = await import(
  "./profile-actions"
);

const USER = "did:plc:user11111111111111111111";
const GROUP = "did:plc:group22222222222222222222";
const FAKE_SESSION = { did: USER } as unknown as OAuthSession;
const FAKE_REPO = { did: USER };
const BLOB_REF: TypedBlobRef = {
  $type: "blob",
  ref: parseCid("bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku"),
  mimeType: "image/png",
  size: 12,
};
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getOAuthSession.mockResolvedValue(FAKE_SESSION);
  mocks.getRecordSigner.mockResolvedValue(vi.fn());
  mocks.editableRepository.mockResolvedValue(FAKE_REPO);
  mocks.sdkContext.mockResolvedValue({ ctx: true });
  mocks.uploadBlob.mockResolvedValue(BLOB_REF);
  mocks.waitForIndex.mockResolvedValue(true);
});

describe("saveProfileField", () => {
  it("rejects unsafe website URLs and >3 languages before calling auth", async () => {
    expect(
      await saveProfileField({
        repo: USER,
        expectedCid: null,
        patch: { website: "javascript:alert(1)" },
      }),
    ).toMatchObject({ ok: false, reason: "invalid" });

    expect(
      await saveProfileField({
        repo: USER,
        expectedCid: null,
        patch: { langs: ["en", "es", "fr", "de"] },
      }),
    ).toMatchObject({ ok: false, reason: "invalid" });

    expect(mocks.getOAuthSession).not.toHaveBeenCalled();
  });

  it("patches the profile, waits for index, and expires actor and explore tags", async () => {
    const saved = {
      cid: "bafynew",
      displayName: "Ada",
      description: "",
      pronouns: "she/her",
      website: "https://ada.example",
      langs: ["en"],
      avatarUrl: null,
      bannerUrl: null,
    };
    mocks.patchProfile.mockResolvedValueOnce(saved);

    const res = await saveProfileField({
      repo: USER,
      expectedCid: "bafyprev",
      patch: { pronouns: "she/her", website: "https://ada.example" },
    });

    expect(res).toEqual({ ok: true, data: saved });
    expect(mocks.updateTag.mock.calls.flat()).toEqual([`actor:${USER}`, "explore"]);
  });
});

describe("saveProfileMedia", () => {
  it("rejects files whose magic bytes are not PNG, JPEG, or WebP", async () => {
    const fd = new FormData();
    fd.set("repo", USER);
    fd.set("slot", "avatar");
    fd.set(
      "file",
      new File([new TextEncoder().encode("<svg></svg>")], "evil.png", { type: "image/png" }),
    );

    const res = await saveProfileMedia(fd);
    expect(res).toMatchObject({ ok: false, reason: "invalid" });
    expect(mocks.uploadBlob).not.toHaveBeenCalled();
  });

  it("uploads a valid PNG to a group repository via CGS { repo } and patches avatar", async () => {
    mocks.editableRepository.mockResolvedValueOnce({ did: GROUP });
    mocks.patchProfile.mockResolvedValueOnce({
      cid: "bafyavatar",
      avatarUrl: "https://cdn.example/avatar.jpg",
      bannerUrl: null,
    });

    const fd = new FormData();
    fd.set("repo", GROUP);
    fd.set("slot", "avatar");
    fd.set("expectedCid", "bafyprev");
    fd.set("file", new File([PNG_BYTES], "photo.png", { type: "image/png" }));

    const res = await saveProfileMedia(fd);
    expect(res).toEqual({
      ok: true,
      cid: "bafyavatar",
      url: "https://cdn.example/avatar.jpg",
    });
    expect(mocks.uploadBlob).toHaveBeenCalledWith({ ctx: true }, expect.any(Uint8Array), {
      mimeType: "image/png",
      repo: GROUP,
    });
  });

  it("removes an organization logo without calling uploadBlob", async () => {
    mocks.patchOrganization.mockResolvedValueOnce({ cid: "bafynologo", logoUrl: null });

    const fd = new FormData();
    fd.set("repo", USER);
    fd.set("slot", "logo");
    fd.set("expectedCid", "bafyprev");
    fd.set("remove", "true");

    const res = await saveProfileMedia(fd);
    expect(res).toEqual({ ok: true, cid: "bafynologo", url: null });
    expect(mocks.uploadBlob).not.toHaveBeenCalled();
    expect(mocks.patchOrganization).toHaveBeenCalledWith(
      FAKE_REPO,
      { logo: null },
      "bafyprev",
      expect.anything(),
    );
  });
});

describe("saveOrganizationField", () => {
  it("validates publicEmail, foundedDate, and reference URLs before touching auth", async () => {
    expect(
      await saveOrganizationField({
        repo: USER,
        expectedCid: null,
        patch: { publicEmail: "not-an-email" },
      }),
    ).toMatchObject({ ok: false, reason: "invalid" });

    expect(
      await saveOrganizationField({
        repo: USER,
        expectedCid: null,
        patch: { foundedDate: "2020/01/01" },
      }),
    ).toMatchObject({ ok: false, reason: "invalid" });

    expect(
      await saveOrganizationField({
        repo: USER,
        expectedCid: null,
        patch: { urls: [{ url: "javascript:void(0)", label: "Bad" }] },
      }),
    ).toMatchObject({ ok: false, reason: "invalid" });

    expect(mocks.getOAuthSession).not.toHaveBeenCalled();
  });

  it("creates a new location via SDK when saving a new primary location and expires locations tag", async () => {
    mocks.createLocation.mockResolvedValueOnce({
      uri: `at://${USER}/app.certified.location/loc1`,
      cid: "bafyloc",
    });
    mocks.patchOrganization.mockResolvedValueOnce({
      exists: true,
      cid: "bafyorg",
      locationUri: `at://${USER}/app.certified.location/loc1`,
    });

    const res = await saveOrganizationField({
      repo: USER,
      expectedCid: null,
      patch: {
        locationChoice: { kind: "new", name: "Stockholm", point: { lat: 59.33, lng: 18.07 } },
      },
    });

    expect(res).toMatchObject({ ok: true, data: { cid: "bafyorg" } });
    expect(mocks.createLocation).toHaveBeenCalledTimes(1);
    expect(mocks.patchOrganization).toHaveBeenCalledWith(
      FAKE_REPO,
      expect.objectContaining({
        location: { uri: `at://${USER}/app.certified.location/loc1`, cid: "bafyloc" },
      }),
      null,
      expect.anything(),
    );
    expect(mocks.updateTag.mock.calls.flat()).toEqual([
      `actor:${USER}`,
      "explore",
      `locations:${USER}`,
    ]);
  });

  it("surfaces conflict WriteError accurately", async () => {
    mocks.patchOrganization.mockRejectedValueOnce(new WriteError("conflict", "changed"));
    const res = await saveOrganizationField({
      repo: USER,
      expectedCid: "bafyold",
      patch: { legalName: "Updated" },
    });
    expect(res).toMatchObject({ ok: false, reason: "conflict" });
  });
});
