import { type LexMap, parseCid, type TypedBlobRef } from "@atproto/lex";
import type { OAuthSession } from "@atproto/oauth-client-node";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RecordSigner } from "@/lib/atproto/created-via";
import { CgsAuthError } from "@/lib/cgs";
import {
  addItemsToList,
  deleteBadgeAward,
  deleteCollectionRecord,
  findEndorsementDefinition,
  organizationRepository,
  ownRepository,
  patchOrganization,
  patchProfile,
  type Repository,
  removeItemsFromList,
  updateListDetails,
  updateProfile,
  WriteError,
} from "./writes";

const user = "did:plc:ewvi7nxzyoun6zhxrhs64oiz";
const org = "did:plc:aaaaaaaaaaaaaaaaaaaaaaaa";
const ORG_PDS = "https://org-pds.example";
const CURRENT_CID = "bafyreicuwa5tbxixg3bh5r32w7kve4r4cuzdg6xtf5zqr3ovhm7m7psm44";
const NEW = { displayName: "New", description: "" };

// The organization's DID document, resolved through the OAuth client.
vi.mock("@/lib/auth/oauth-client", () => ({
  getOAuthClient: async () => ({
    identityResolver: {
      resolve: async () => ({
        didDoc: {
          id: org,
          service: [
            { id: "#atproto_pds", type: "AtprotoPersonalDataServer", serviceEndpoint: ORG_PDS },
          ],
        },
      }),
    },
    fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init),
  }),
}));

const storedProfile = (did: string) => ({
  uri: `at://${did}/app.certified.actor.profile/self`,
  cid: CURRENT_CID,
  value: {
    $type: "app.certified.actor.profile",
    displayName: "Old",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
});

/** A session whose PDS answers with `respond` (service-auth tokens by default). */
function fakeSession(respond?: (url: URL, init?: RequestInit) => Response) {
  return {
    did: user,
    fetchHandler: async (path: string, init?: RequestInit) => {
      const url = new URL(path, "https://pds.example");
      return respond?.(url, init) ?? Response.json({ token: "token" });
    },
  } as unknown as OAuthSession;
}

// Marks the record instead of signing it: what is checked here is the request.
const sign = (async (record) => ({ ...record, signatures: [] })) as RecordSigner;

const failureOf = (promise: Promise<unknown>) =>
  promise.then(
    () => undefined,
    (err) => err,
  );

describe("organization writes through CGS", () => {
  const requests: Request[] = [];
  let cgsAnswer: () => Response | Promise<Response>;

  beforeEach(() => {
    requests.length = 0;
    cgsAnswer = () =>
      Response.json({ uri: `at://${org}/app.certified.actor.profile/self`, cid: "bafynew" });
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      requests.push(request);
      return request.url.startsWith(ORG_PDS) ? Response.json(storedProfile(org)) : cgsAnswer();
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("reads the organization's PDS and writes through CGS with repo and a putRecord token", async () => {
    const minted: URL[] = [];
    const session = fakeSession((url) => {
      minted.push(url);
      return Response.json({ token: "token" });
    });
    const repo = await organizationRepository(session, org);
    expect(await updateProfile(repo, NEW, CURRENT_CID, sign)).toMatchObject({
      cid: "bafynew",
      displayName: "New",
    });

    const [read, write] = requests;
    expect(new URL(read.url).origin).toBe(ORG_PDS);
    expect(new URL(read.url).searchParams.get("repo")).toBe(org);
    expect(write.url).toBe("https://groups.certified.app/xrpc/app.certified.group.repo.putRecord");
    expect(write.headers.get("authorization")).toBe("Bearer token");
    expect(minted.map((url) => url.searchParams.get("lxm"))).toEqual([
      "app.certified.group.repo.putRecord",
    ]);
    expect(await write.json()).toMatchObject({
      repo: org,
      collection: "app.certified.actor.profile",
      rkey: "self",
      swapRecord: CURRENT_CID,
      record: { displayName: "New", createdAt: "2026-01-01T00:00:00.000Z", signatures: [] },
    });
  });

  it("refuses to write when the profile changed since it was loaded", async () => {
    const repo = await organizationRepository(fakeSession(), org);
    const err = await failureOf(updateProfile(repo, NEW, "bafyolder", sign));
    expect(err).toMatchObject({ name: "WriteError", reason: "conflict" });
    expect(requests).toHaveLength(1);
  });

  it("reports CGS refusing the user's role as forbidden", async () => {
    cgsAnswer = () => Response.json({ error: "Forbidden", message: "No" }, { status: 403 });
    const repo = await organizationRepository(fakeSession(), org);
    const err = await failureOf(updateProfile(repo, NEW, CURRENT_CID, sign));
    expect(err).toMatchObject({ name: "WriteError", reason: "forbidden" });
  });

  it("reports a 5xx from CGS as an unknown outcome, never as a refusal", async () => {
    cgsAnswer = () => Response.json({ error: "UpstreamFailure" }, { status: 502 });
    const repo = await organizationRepository(fakeSession(), org);
    const err = await failureOf(updateProfile(repo, NEW, CURRENT_CID, sign));
    expect(err).toMatchObject({ name: "WriteError", reason: "unknown" });
  });

  it("reports a write that got no answer as an unknown outcome", async () => {
    cgsAnswer = () => Promise.reject(new TypeError("fetch failed"));
    const repo = await organizationRepository(fakeSession(), org);
    const err = await failureOf(updateProfile(repo, NEW, CURRENT_CID, sign));
    expect(err).toMatchObject({ name: "WriteError", reason: "unknown" });
  });

  it("reports a success answer it can't read as an unknown outcome", async () => {
    cgsAnswer = () => new Response("<html>gateway</html>", { status: 200 });
    const repo = await organizationRepository(fakeSession(), org);
    const err = await failureOf(updateProfile(repo, NEW, CURRENT_CID, sign));
    expect(err).toMatchObject({ name: "WriteError", reason: "unknown" });
  });

  it("reports a token the PDS wouldn't mint as never sent, not as unknown", async () => {
    const session = fakeSession(() => Response.json({ error: "AuthRequired" }, { status: 401 }));
    const repo = await organizationRepository(session, org);
    const err = await failureOf(updateProfile(repo, NEW, CURRENT_CID, sign));
    expect(err).toBeInstanceOf(CgsAuthError);
    expect(requests.some((r) => r.url.includes("groups.certified.app"))).toBe(false);
  });
});

describe("own-repository writes", () => {
  it("treats a refused first-profile create as a conflict when a profile now exists", async () => {
    let reads = 0;
    const session = fakeSession((url) => {
      if (url.pathname.endsWith("getRecord")) {
        return reads++ === 0
          ? Response.json({ error: "RecordNotFound" }, { status: 400 })
          : Response.json(storedProfile(user));
      }
      return Response.json({ error: "InvalidRequest", message: "exists" }, { status: 400 });
    });
    const err = await failureOf(updateProfile(ownRepository(session), NEW, null, sign));
    expect(err).toBeInstanceOf(WriteError);
    expect(err).toMatchObject({ reason: "conflict" });
  });
});

describe("findEndorsementDefinition", () => {
  const defRecord = (
    rkey: string,
    overrides: Record<string, unknown> = {},
    did: string = user,
  ) => ({
    uri: `at://${did}/app.certified.badge.definition/${rkey}`,
    cid: `bafy${rkey}`,
    value: {
      $type: "app.certified.badge.definition",
      badgeType: "endorsement",
      title: "Endorsement",
      createdAt: "2026-06-01T00:00:00.000Z",
      ...overrides,
    },
  });

  function repoListing(
    pages: { records: ReturnType<typeof defRecord>[]; cursor?: string }[],
    did: string = user,
  ): Repository {
    let page = 0;
    return {
      did: did as Repository["did"],
      getRecord: async () => null,
      listRecords: async () => pages[page++] ?? { records: [] },
      putRecord: async () => ({ uri: "", cid: "" }),
      createRecord: async () => ({ uri: "", cid: "" }),
      deleteRecord: async () => {},
    };
  }

  it("returns null when the repository has no matching Endorsement definition", async () => {
    const repo = repoListing([
      {
        records: [
          defRecord("custom", { title: "Trusted Evaluator" }),
          defRecord("lowercase", { title: "endorsement" }),
          defRecord("other-type", { badgeType: "recognition", title: "Endorsement" }),
          defRecord("disallowed", { allowedIssuers: [{ did: org }] }),
          defRecord("empty-issuers", { allowedIssuers: [] }),
          defRecord("invalid", { createdAt: "not-a-datetime" }),
        ],
      },
    ]);
    expect(await findEndorsementDefinition(repo)).toBeNull();
  });

  it("matches title 'Endorsement' and badgeType 'endorsement' across pages, picking the oldest", async () => {
    const repo = repoListing([
      {
        records: [
          defRecord("custom", {
            title: "Trusted Evaluator",
            createdAt: "2025-01-01T00:00:00.000Z",
          }),
          defRecord("newer", { createdAt: "2026-08-01T00:00:00.000Z" }),
        ],
        cursor: "page2",
      },
      {
        records: [
          defRecord("older", {
            createdAt: "2026-02-01T00:00:00.000Z",
            allowedIssuers: [{ did: user }],
          }),
        ],
      },
    ]);
    expect(await findEndorsementDefinition(repo)).toBe(
      `at://${user}/app.certified.badge.definition/older`,
    );
  });
});

describe("deleteBadgeAward", () => {
  const requests: Request[] = [];
  let cgsAnswer: () => Response | Promise<Response>;

  beforeEach(() => {
    requests.length = 0;
    cgsAnswer = () => Response.json({});
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      requests.push(request);
      return cgsAnswer();
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("deletes an organization's award through CGS with a deleteRecord service-auth token", async () => {
    const minted: URL[] = [];
    const session = fakeSession((url) => {
      minted.push(url);
      return Response.json({ token: "token" });
    });
    const repo = await organizationRepository(session, org);
    await deleteBadgeAward(repo, "3k2a4b5c");

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe(
      "https://groups.certified.app/xrpc/app.certified.group.repo.deleteRecord",
    );
    expect(minted.map((url) => url.searchParams.get("lxm"))).toEqual([
      "app.certified.group.repo.deleteRecord",
    ]);
    expect(await requests[0].json()).toEqual({
      repo: org,
      collection: "app.certified.badge.award",
      rkey: "3k2a4b5c",
    });
  });

  it("treats an already-deleted award (RecordNotFound) as a no-op", async () => {
    const session = fakeSession(() =>
      Response.json({ error: "RecordNotFound", message: "missing" }, { status: 400 }),
    );
    await expect(deleteBadgeAward(ownRepository(session), "3k2a4b5c")).resolves.toBeUndefined();
  });

  it("maps CGS 403 to forbidden and 5xx to unknown", async () => {
    const repo = await organizationRepository(fakeSession(), org);
    cgsAnswer = () => Response.json({ error: "Forbidden" }, { status: 403 });
    expect(await failureOf(deleteBadgeAward(repo, "3k2a4b5c"))).toMatchObject({
      name: "WriteError",
      reason: "forbidden",
    });
    cgsAnswer = () => Response.json({ error: "UpstreamFailure" }, { status: 502 });
    expect(await failureOf(deleteBadgeAward(repo, "3k2a4b5c"))).toMatchObject({
      name: "WriteError",
      reason: "unknown",
    });
  });

  it("treats CGS 403 as a no-op when the record is already absent on the org PDS", async () => {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      return request.url.startsWith(ORG_PDS)
        ? Response.json({ error: "RecordNotFound" }, { status: 400 })
        : Response.json({ error: "Forbidden" }, { status: 403 });
    });
    const repo = await organizationRepository(fakeSession(), org);
    await expect(deleteBadgeAward(repo, "gone")).resolves.toBeUndefined();
    await expect(deleteCollectionRecord(repo, "gone")).resolves.toBeUndefined();
  });
});

describe("list record mutations", () => {
  const existingCollection = (items: { itemIdentifier: { uri: string; cid: string } }[] = []) => ({
    cid: CURRENT_CID,
    value: {
      $type: "org.hypercerts.collection",
      title: "Round 3",
      type: "list:certs",
      createdAt: "2026-01-01T00:00:00.000Z",
      ...(items.length > 0 && { items }),
    } as Record<string, unknown>,
  });

  function mockRepo(current: ReturnType<typeof existingCollection> | null) {
    const putRecord = vi.fn(async () => ({
      uri: `at://${user}/org.hypercerts.collection/list1`,
      cid: "bafyupdated",
    }));
    const deleteRecord = vi.fn(async () => {});
    const repo: Repository = {
      did: user,
      getRecord: async () => current as { cid: string; value: LexMap } | null,
      listRecords: async () => ({ records: [] }),
      putRecord,
      createRecord: async () => ({ uri: "", cid: "" }),
      deleteRecord,
    };
    return { repo, putRecord, deleteRecord };
  }

  it("updates title and description with compare-and-swap CID", async () => {
    const { repo, putRecord } = mockRepo(existingCollection());
    const saved = await updateListDetails(
      repo,
      "list1",
      { title: "Renamed", description: "New notes" },
      sign,
    );
    expect(saved.cid).toBe("bafyupdated");
    expect(putRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Renamed",
        type: "list:certs",
        description: { $type: "org.hypercerts.defs#descriptionString", value: "New notes" },
      }),
      "list1",
      CURRENT_CID,
    );
  });

  it("deduplicates added items and removes only matching item URIs", async () => {
    const a1 = { uri: `at://${user}/org.hypercerts.claim.activity/a1`, cid: CURRENT_CID };
    const a2 = { uri: `at://${user}/org.hypercerts.claim.activity/a2`, cid: CURRENT_CID };
    const { repo, putRecord } = mockRepo(existingCollection([{ itemIdentifier: a1 }]));

    const added = await addItemsToList(repo, "list1", [a1, a2], sign);
    expect(added).toMatchObject({ added: 1, skipped: 1 });
    expect(putRecord).toHaveBeenCalledWith(
      expect.objectContaining({ items: [{ itemIdentifier: a1 }, { itemIdentifier: a2 }] }),
      "list1",
      CURRENT_CID,
    );

    const { repo: repo2, putRecord: put2 } = mockRepo(
      existingCollection([{ itemIdentifier: a1 }, { itemIdentifier: a2 }]),
    );
    const removed = await removeItemsFromList(repo2, "list1", new Set([a1.uri]), sign);
    expect(removed).toMatchObject({ removed: 1 });
    expect(put2).toHaveBeenCalledWith(
      expect.objectContaining({ items: [{ itemIdentifier: a2 }] }),
      "list1",
      CURRENT_CID,
    );
  });
});

describe("patchProfile and patchOrganization", () => {
  const BLOB_REF: TypedBlobRef = {
    $type: "blob",
    ref: parseCid("bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku"),
    mimeType: "image/png",
    size: 1234,
  };

  function makeRepo(current: { cid: string; value: LexMap } | null) {
    const putRecord = vi.fn(async (_record: LexMap, _rkey: string, _swap?: string) => ({
      uri: `at://${user}/app.certified.actor.profile/self`,
      cid: "bafypatched",
    }));
    const createRecord = vi.fn(async () => ({
      uri: `at://${user}/app.certified.actor.organization/self`,
      cid: "bafycreated",
    }));
    const repo: Repository = {
      did: user,
      getRecord: async () => current,
      listRecords: async () => ({ records: [] }),
      putRecord,
      createRecord,
      deleteRecord: async () => {},
    };
    return { repo, putRecord, createRecord };
  }

  it("patches selected profile fields while preserving untouched fields and supporting blob set/clear", async () => {
    const { repo, putRecord } = makeRepo({
      cid: CURRENT_CID,
      value: {
        $type: "app.certified.actor.profile",
        displayName: "Keep Me",
        pronouns: "they/them",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    });

    const saved = await patchProfile(
      repo,
      { website: "https://example.org", langs: ["en", "sv"], avatar: BLOB_REF },
      CURRENT_CID,
      sign,
    );

    expect(saved.cid).toBe("bafypatched");
    expect(saved.displayName).toBe("Keep Me");
    expect(saved.pronouns).toBe("they/them");
    expect(saved.website).toBe("https://example.org");
    expect(saved.langs).toEqual(["en", "sv"]);
    expect(saved.avatarUrl).toContain(
      "bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku",
    );
    expect(putRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        displayName: "Keep Me",
        pronouns: "they/them",
        website: "https://example.org",
        langs: ["en", "sv"],
        avatar: { $type: "org.hypercerts.defs#smallImage", image: BLOB_REF },
      }),
      "self",
      CURRENT_CID,
    );
  });

  it("refuses patchProfile on compare-and-swap CID mismatch", async () => {
    const { repo, putRecord } = makeRepo({
      cid: CURRENT_CID,
      value: { $type: "app.certified.actor.profile", createdAt: "2026-01-01T00:00:00.000Z" },
    });
    const err = await failureOf(patchProfile(repo, { pronouns: "she/her" }, "bafystale", sign));
    expect(err).toMatchObject({ name: "WriteError", reason: "conflict" });
    expect(putRecord).not.toHaveBeenCalled();
  });

  it("creates an organization record with foundedDate, urls, longDescription, visibility, and logo", async () => {
    const { repo, createRecord } = makeRepo(null);
    const saved = await patchOrganization(
      repo,
      {
        legalName: "Forest Collective",
        publicEmail: "hello@forest.org",
        organizationType: ["nonprofit", "community"],
        foundedDate: "2021-05-10",
        urls: [{ url: "https://forest.org/donate", label: "Donate" }],
        longDescription: "Long form mission statement.",
        visibility: "unlisted",
        langs: ["en"],
        logo: BLOB_REF,
      },
      null,
      sign,
    );

    expect(saved).toMatchObject({
      exists: true,
      cid: "bafycreated",
      legalName: "Forest Collective",
      publicEmail: "hello@forest.org",
      organizationType: ["nonprofit", "community"],
      foundedDate: "2021-05-10",
      urls: [{ url: "https://forest.org/donate", label: "Donate" }],
      longDescription: "Long form mission statement.",
      visibility: "unlisted",
      langs: ["en"],
    });
    expect(createRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        $type: "app.certified.actor.organization",
        legalName: "Forest Collective",
        foundedDate: "2021-05-10T00:00:00.000Z",
        longDescription: {
          $type: "org.hypercerts.defs#descriptionString",
          value: "Long form mission statement.",
        },
        visibility: "unlisted",
        logo: { $type: "org.hypercerts.defs#smallImage", image: BLOB_REF },
      }),
      "self",
    );
  });
});
