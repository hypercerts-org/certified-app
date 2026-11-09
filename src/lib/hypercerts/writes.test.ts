import type { OAuthSession } from "@atproto/oauth-client-node";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RecordSigner } from "@/lib/atproto/created-via";
import { CgsAuthError } from "@/lib/cgs";
import { organizationRepository, ownRepository, updateProfile, WriteError } from "./writes";

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
  let cgsAnswer: () => Response;

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
    const repo = await organizationRepository(fakeSession(), org);
    expect(await updateProfile(repo, NEW, CURRENT_CID, sign)).toMatchObject({
      cid: "bafynew",
      displayName: "New",
    });

    const [read, write] = requests;
    expect(new URL(read.url).origin).toBe(ORG_PDS);
    expect(new URL(read.url).searchParams.get("repo")).toBe(org);
    expect(write.url).toBe("https://groups.certified.app/xrpc/app.certified.group.repo.putRecord");
    expect(write.headers.get("authorization")).toBe("Bearer token");
    expect(await write.json()).toMatchObject({
      repo: org,
      collection: "app.certified.actor.profile",
      rkey: "self",
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
