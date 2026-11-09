import type { OAuthSession } from "@atproto/oauth-client-node";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const user = "did:plc:ewvi7nxzyoun6zhxrhs64oiz";
const org = "did:plc:aaaaaaaaaaaaaaaaaaaaaaaa";

/** A session whose PDS mints numbered tokens, recording what it was asked for. */
function fakeSession(minted: URLSearchParams[], fail = false) {
  let n = 0;
  return {
    did: user,
    fetchHandler: async (path: string) => {
      const url = new URL(path, "https://pds.example");
      expect(url.pathname).toBe("/xrpc/com.atproto.server.getServiceAuth");
      minted.push(url.searchParams);
      return fail
        ? Response.json({ error: "AuthRequired" }, { status: 401 })
        : Response.json({ token: `token-${++n}` });
    },
  } as unknown as OAuthSession;
}

describe("CGS calls", () => {
  const cgsRequests: Request[] = [];

  beforeEach(() => {
    cgsRequests.length = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      cgsRequests.push(request);
      const cursor = new URL(request.url).searchParams.get("cursor");
      return Response.json(
        cursor
          ? { groups: [{ groupDid: org, role: "admin", joinedAt: "2026-11-01T00:00:00.000Z" }] }
          : {
              groups: [{ groupDid: user, role: "member", joinedAt: "2026-11-01T00:00:00.000Z" }],
              cursor: "next",
            },
      );
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("lists memberships across pages, each call with its own single-method token", async () => {
    const { listMemberships } = await import("./cgs");
    const minted: URLSearchParams[] = [];
    const memberships = await listMemberships(fakeSession(minted));

    expect(memberships).toEqual([
      { groupDid: user, role: "member" },
      { groupDid: org, role: "admin" },
    ]);
    expect(minted.map((p) => [p.get("aud"), p.get("lxm")])).toEqual([
      ["did:web:groups.certified.app", "app.certified.groups.membership.list"],
      ["did:web:groups.certified.app", "app.certified.groups.membership.list"],
    ]);
    expect(cgsRequests.map((r) => r.headers.get("authorization"))).toEqual([
      "Bearer token-1",
      "Bearer token-2",
    ]);
    const url = new URL(cgsRequests[0].url);
    expect(url.origin + url.pathname).toBe(
      "https://groups.certified.app/xrpc/app.certified.groups.membership.list",
    );
  });

  it("lets admins and owners manage an organization, not members", async () => {
    const { canManage } = await import("./cgs");
    expect(await canManage(fakeSession([]), org)).toBe(true);
    expect(await canManage(fakeSession([]), user)).toBe(false);
  });

  it("reports a token the PDS refused as CgsAuthError, without calling CGS", async () => {
    const { CgsAuthError, listMemberships } = await import("./cgs");
    await expect(listMemberships(fakeSession([], true))).rejects.toBeInstanceOf(CgsAuthError);
    expect(cgsRequests).toHaveLength(0);
  });
});
