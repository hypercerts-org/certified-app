import type { OAuthSession } from "@atproto/oauth-client-node";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WriteError } from "./writes";

vi.mock("server-only", () => ({}));

const mocks = {
  getOAuthSession: vi.fn<() => Promise<OAuthSession | null>>(),
  mayPublish: vi.fn<(...args: unknown[]) => Promise<boolean>>(),
  getRecordSigner: vi.fn(),
  createCollection: vi.fn(),
  getIndexedList: vi.fn(),
  repositoryFor: vi.fn(),
  updateListDetails: vi.fn(),
  addItemsToList: vi.fn(),
  removeItemsFromList: vi.fn(),
  deleteCollectionRecord: vi.fn(),
  resolvePublicRecordRef: vi.fn(),
  resolveAccountProfileRef: vi.fn(),
  getDid: vi.fn(),
  waitForIndex: vi.fn(),
  updateTag: vi.fn(),
};

vi.mock("next/cache", () => ({ updateTag: (...args: unknown[]) => mocks.updateTag(...args) }));
vi.mock("@/lib/auth/dal", () => ({
  getOAuthSession: () => mocks.getOAuthSession(),
  SessionUnavailableError: class SessionUnavailableError extends Error {},
}));
vi.mock("@/lib/atproto/app-key", () => ({
  assertWritesAllowed: () => {},
  getRecordSigner: () => mocks.getRecordSigner(),
}));
vi.mock("@/lib/hypercerts/publish-access", () => ({
  mayPublish: (...args: unknown[]) => mocks.mayPublish(...args),
}));
vi.mock("@/lib/hypercerts/index-wait", () => ({
  waitForIndex: (check: () => Promise<boolean>) => mocks.waitForIndex(check),
}));
vi.mock("@/lib/hypercerts/queries", () => ({
  getIndexedList: (...args: unknown[]) => mocks.getIndexedList(...args),
}));
vi.mock("@/lib/identity", () => ({
  getDid: (...args: unknown[]) => mocks.getDid(...args),
}));
vi.mock("@hypercerts-org/sdk/collection", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@hypercerts-org/sdk/collection")>();
  return { ...actual, createCollection: (...args: unknown[]) => mocks.createCollection(...args) };
});
vi.mock("@/lib/hypercerts/writes", async (importOriginal) => {
  const writesActual = await importOriginal<typeof import("./writes")>();
  return {
    ...writesActual,
    repositoryFor: (...args: unknown[]) => mocks.repositoryFor(...args),
    updateListDetails: (...args: unknown[]) => mocks.updateListDetails(...args),
    addItemsToList: (...args: unknown[]) => mocks.addItemsToList(...args),
    removeItemsFromList: (...args: unknown[]) => mocks.removeItemsFromList(...args),
    deleteCollectionRecord: (...args: unknown[]) => mocks.deleteCollectionRecord(...args),
    resolvePublicRecordRef: (...args: unknown[]) => mocks.resolvePublicRecordRef(...args),
    resolveAccountProfileRef: (...args: unknown[]) => mocks.resolveAccountProfileRef(...args),
  };
});

const { createList, editList, addListItems, removeListItems, deleteList } = await import(
  "./list-actions"
);

const USER = "did:plc:user11111111111111111111";
const ORG = "did:plc:org111111111111111111111";
const OTHER = "did:plc:other1111111111111111111";
const LIST_URI = `at://${USER}/org.hypercerts.collection/list1`;
const FAKE_SESSION = { did: USER, fetchHandler: vi.fn() } as unknown as OAuthSession;
const FAKE_REPO = { did: USER };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getOAuthSession.mockResolvedValue(FAKE_SESSION);
  mocks.mayPublish.mockResolvedValue(true);
  mocks.getRecordSigner.mockResolvedValue(vi.fn());
  mocks.repositoryFor.mockResolvedValue(FAKE_REPO);
  mocks.waitForIndex.mockResolvedValue(true);
  mocks.createCollection.mockResolvedValue({ uri: LIST_URI, cid: "bafylist", tags: [], items: [] });
  mocks.updateListDetails.mockResolvedValue({ uri: LIST_URI, cid: "bafyupdated" });
  mocks.addItemsToList.mockResolvedValue({
    stored: { uri: LIST_URI, cid: "bafyadded" },
    added: 1,
    skipped: 0,
  });
  mocks.removeItemsFromList.mockResolvedValue({
    stored: { uri: LIST_URI, cid: "bafyremoved" },
    removed: 1,
  });
  mocks.deleteCollectionRecord.mockResolvedValue(undefined);
  mocks.getDid.mockResolvedValue(OTHER);
  mocks.resolveAccountProfileRef.mockResolvedValue({
    uri: `at://${OTHER}/app.certified.actor.profile/self`,
    cid: "bafyprof",
  });
  mocks.resolvePublicRecordRef.mockResolvedValue({
    uri: `at://${OTHER}/org.hypercerts.claim.activity/a1`,
    cid: "bafyact",
  });
});

describe("createList", () => {
  it("maps list kinds to Certified collection types and writes via SDK createCollection", async () => {
    const res = await createList(ORG, {
      kind: "Activities",
      title: "Round 3",
      description: "Finalists",
    });

    expect(res).toEqual({
      ok: true,
      href: `/${ORG}/workspace/lists/list1`,
      indexed: true,
    });
    expect(mocks.createCollection).toHaveBeenCalledWith(
      expect.anything(),
      { title: "Round 3", type: "list:certs", description: "Finalists" },
      { repo: ORG },
    );
    expect(mocks.updateTag.mock.calls.flat()).toEqual([`projects:${ORG}`, `actor:${ORG}`]);
  });

  it("maps Endorsements lists to list:endorsements", async () => {
    await createList(USER, { kind: "Endorsements", title: "References" });
    expect(mocks.createCollection).toHaveBeenCalledWith(
      expect.anything(),
      { title: "References", type: "list:endorsements", description: undefined },
      undefined,
    );
  });
});

describe("editList & deleteList", () => {
  it("updates list details and expires list + projects + actor tags", async () => {
    const res = await editList(USER, "list1", { title: "Renamed", description: "Updated" });
    expect(res).toEqual({ ok: true, indexed: true });
    expect(mocks.updateListDetails).toHaveBeenCalledWith(
      FAKE_REPO,
      "list1",
      { title: "Renamed", description: "Updated" },
      expect.anything(),
    );
    expect(mocks.updateTag.mock.calls.flat()).toEqual([
      `list:${LIST_URI}`,
      `projects:${USER}`,
      `actor:${USER}`,
    ]);
  });

  it("deletes a list and returns the workspace lists URL", async () => {
    const res = await deleteList(USER, "list1");
    expect(res).toEqual({ ok: true, href: `/${USER}/workspace/lists`, indexed: true });
    expect(mocks.deleteCollectionRecord).toHaveBeenCalledWith(FAKE_REPO, "list1");
  });

  it("maps WriteError conflict cleanly", async () => {
    mocks.updateListDetails.mockRejectedValueOnce(new WriteError("conflict", "changed"));
    expect(await editList(USER, "list1", { title: "X", description: "" })).toMatchObject({
      ok: false,
      reason: "conflict",
    });
  });
});

describe("addListItems & removeListItems", () => {
  it("resolves handles and record URIs while reporting unresolved lines", async () => {
    mocks.getDid.mockImplementation(async (handle: string) =>
      handle === "alice.bsky.social" ? OTHER : null,
    );
    const res = await addListItems(USER, "list1", [
      "@alice.bsky.social",
      "not-a-valid-entry",
      `at://${OTHER}/org.hypercerts.claim.activity/a1`,
    ]);

    expect(res).toMatchObject({
      ok: true,
      added: 1,
      skipped: 0,
      unresolved: ["not-a-valid-entry"],
    });
    expect(mocks.addItemsToList).toHaveBeenCalledWith(
      FAKE_REPO,
      "list1",
      [
        { uri: `at://${OTHER}/app.certified.actor.profile/self`, cid: "bafyprof" },
        { uri: `at://${OTHER}/org.hypercerts.claim.activity/a1`, cid: "bafyact" },
      ],
      expect.anything(),
    );
  });

  it("removes selected AT-URIs and rejects non-URI inputs", async () => {
    expect(await removeListItems(USER, "list1", ["not-a-uri"])).toMatchObject({
      ok: false,
      reason: "invalid",
    });
    const uri = `at://${OTHER}/org.hypercerts.claim.activity/a1`;
    const res = await removeListItems(USER, "list1", [uri]);
    expect(res).toEqual({ ok: true, removed: 1, indexed: true });
    expect(mocks.removeItemsFromList).toHaveBeenCalledWith(
      FAKE_REPO,
      "list1",
      new Set([uri]),
      expect.anything(),
    );
  });
});
