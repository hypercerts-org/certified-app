import type { OAuthSession } from "@atproto/oauth-client-node";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CgsAuthError, canEdit, listMemberships } from "./cgs";

const user = "did:plc:ewvi7nxzyoun6zhxrhs64oiz";
const org = "did:plc:aaaaaaaaaaaaaaaaaaaaaaaa";
const memberOf = "did:plc:bbbbbbbbbbbbbbbbbbbbbbbb";

/** A session whose PDS mints numbered service-auth tokens, recording each request. */
function fakeSession({ refuse = false } = {}) {
  const minted: URL[] = [];
  let n = 0;
  const session = {
    did: user,
    fetchHandler: async (path: string) => {
      minted.push(new URL(path, "https://pds.example"));
      return refuse
        ? Response.json({ error: "AuthRequired" }, { status: 401 })
        : Response.json({ token: `token-${++n}` });
    },
  } as unknown as OAuthSession;
  return { session, minted };
}

describe("CGS calls", () => {
  const requests: Request[] = [];

  beforeEach(() => {
    requests.length = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      requests.push(request);
      const joinedAt = "2026-11-01T00:00:00.000Z";
      return Response.json(
        new URL(request.url).searchParams.get("cursor")
          ? { groups: [{ groupDid: org, role: "admin", joinedAt }] }
          : { groups: [{ groupDid: memberOf, role: "member", joinedAt }], cursor: "next" },
      );
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("lists memberships across pages, each call with its own single-method token", async () => {
    const { session, minted } = fakeSession();
    expect(await listMemberships(session)).toEqual([
      { groupDid: memberOf, role: "member" },
      { groupDid: org, role: "admin" },
    ]);

    expect(minted.map((url) => url.pathname)).toEqual([
      "/xrpc/com.atproto.server.getServiceAuth",
      "/xrpc/com.atproto.server.getServiceAuth",
    ]);
    for (const url of minted) {
      expect(url.searchParams.get("aud")).toBe("did:web:groups.certified.app");
      expect(url.searchParams.get("lxm")).toBe("app.certified.groups.membership.list");
    }
    expect(requests.map((r) => r.headers.get("authorization"))).toEqual([
      "Bearer token-1",
      "Bearer token-2",
    ]);
    const url = new URL(requests[0].url);
    expect(url.origin + url.pathname).toBe(
      "https://groups.certified.app/xrpc/app.certified.groups.membership.list",
    );
  });

  it("lets the account itself and an organization's admins edit, not its members", async () => {
    expect(await canEdit(fakeSession().session, user)).toBe(true);
    expect(await canEdit(fakeSession().session, org)).toBe(true);
    expect(await canEdit(fakeSession().session, memberOf)).toBe(false);
    expect(await canEdit(fakeSession().session, "did:plc:cccccccccccccccccccccccc")).toBe(false);
  });

  it("reports a token the PDS refused as CgsAuthError, without calling CGS", async () => {
    const { session, minted } = fakeSession({ refuse: true });
    const err = await listMemberships(session).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CgsAuthError);
    expect((err as Error).message).toContain("AuthRequired");
    expect(minted).toHaveLength(1);
    expect(requests).toHaveLength(0);
  });
});
