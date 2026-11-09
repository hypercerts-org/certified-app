import type { OAuthSession } from "@atproto/oauth-client-node";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RecordSigner } from "@/lib/atproto/created-via";

vi.mock("server-only", () => ({}));

const user = "did:plc:ewvi7nxzyoun6zhxrhs64oiz";
const org = "did:plc:aaaaaaaaaaaaaaaaaaaaaaaa";
const ORG_PDS = "https://org-pds.example";
const CURRENT_CID = "bafyreicuwa5tbxixg3bh5r32w7kve4r4cuzdg6xtf5zqr3ovhm7m7psm44";

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

const session = {
  did: user,
  fetchHandler: async () => Response.json({ token: "token" }),
} as unknown as OAuthSession;

// Marks the record instead of signing it: what is checked here is the request.
const sign = (async (record) => ({ ...record, signatures: [] })) as RecordSigner;

describe("organization writes through CGS", () => {
  const requests: Request[] = [];
  let cgsAnswer: Response;

  beforeEach(() => {
    requests.length = 0;
    cgsAnswer = Response.json({
      uri: `at://${org}/app.certified.actor.profile/self`,
      cid: "bafynew",
    });
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      requests.push(request);
      if (request.url.startsWith(ORG_PDS)) {
        return Response.json({
          uri: `at://${org}/app.certified.actor.profile/self`,
          cid: CURRENT_CID,
          value: {
            $type: "app.certified.actor.profile",
            displayName: "Old",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        });
      }
      return cgsAnswer;
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("reads the organization's PDS and writes through CGS with repo and a putRecord token", async () => {
    const { organizationRepository, updateProfile } = await import("./writes");
    const repo = await organizationRepository(session, org);
    const saved = await updateProfile(
      repo,
      { displayName: "New", description: "" },
      CURRENT_CID,
      sign,
    );

    expect(saved).toMatchObject({ cid: "bafynew", displayName: "New" });
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
    const { organizationRepository, updateProfile, WriteConflictError } = await import("./writes");
    const repo = await organizationRepository(session, org);
    await expect(
      updateProfile(repo, { displayName: "New", description: "" }, "bafyolder", sign),
    ).rejects.toBeInstanceOf(WriteConflictError);
    expect(requests).toHaveLength(1);
  });

  it("reports CGS refusing the user's role as WriteForbiddenError", async () => {
    const { organizationRepository, updateProfile, WriteForbiddenError } = await import("./writes");
    cgsAnswer = Response.json(
      { error: "Forbidden", message: "Insufficient role" },
      { status: 403 },
    );
    const repo = await organizationRepository(session, org);
    await expect(
      updateProfile(repo, { displayName: "New", description: "" }, CURRENT_CID, sign),
    ).rejects.toBeInstanceOf(WriteForbiddenError);
  });
});
