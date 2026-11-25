import type { OAuthSession } from "@atproto/oauth-client-node";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addGroupMember,
  CgsAuthError,
  canEdit,
  forgetGroupMembers,
  forgetMemberships,
  isMember,
  listGroupMembers,
  listGroupMembersForDisplay,
  listMemberships,
  listMembershipsForDisplay,
  registerGroup,
  removeGroupMember,
  setGroupMemberRole,
} from "./cgs";

// Valkey, as an in-memory map that can be made to fail.
const valkey = vi.hoisted(() => ({ data: new Map<string, unknown>(), down: false }));
vi.mock("@/lib/auth/stores", () => ({
  jsonStore: (prefix: string) => {
    const reach = async () => {
      if (valkey.down) throw new Error("Valkey unreachable");
    };
    return {
      get: async (key: string) => {
        await reach();
        return valkey.data.get(prefix + key);
      },
      set: async (key: string, value: unknown) => {
        await reach();
        valkey.data.set(prefix + key, value);
      },
      del: async (key: string) => {
        await reach();
        valkey.data.delete(prefix + key);
      },
    };
  },
}));
vi.mock("@/lib/log", () => ({ logError: () => {} }));

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
  afterEach(() => {
    vi.unstubAllGlobals();
    valkey.data.clear();
    valkey.down = false;
  });

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
      expect(url.searchParams.get("aud")).toBe(
        "did:web:groups.certified.app#certified_group_service",
      );
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

  it("lets the account itself and any organization member pass isMember live against CGS", async () => {
    expect(await isMember(fakeSession().session, user)).toBe(true);
    expect(await isMember(fakeSession().session, org)).toBe(true);
    expect(await isMember(fakeSession().session, memberOf)).toBe(true);
    expect(await isMember(fakeSession().session, "did:plc:cccccccccccccccccccccccc")).toBe(false);
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

  describe("memberships for display", () => {
    it("asks CGS once, then shows the cached list without a token or a CGS call", async () => {
      const { session, minted } = fakeSession();
      const first = await listMembershipsForDisplay(session);
      const callsAfterFirst = { minted: minted.length, requests: requests.length };
      expect(await listMembershipsForDisplay(session)).toEqual(first);
      expect({ minted: minted.length, requests: requests.length }).toEqual(callsAfterFirst);
    });

    it("asks CGS again once the user's cache is forgotten (sign-out)", async () => {
      const { session, minted } = fakeSession();
      await listMembershipsForDisplay(session);
      await forgetMemberships(user);
      await listMembershipsForDisplay(session);
      expect(minted).toHaveLength(4); // two pages, twice
    });

    it("falls back to CGS when Valkey is unreachable, rather than failing", async () => {
      valkey.down = true;
      expect(await listMembershipsForDisplay(fakeSession().session)).toEqual([
        { groupDid: memberOf, role: "member" },
        { groupDid: org, role: "admin" },
      ]);
    });

    it("never decides permissions: canEdit asks CGS even when the cache says owner", async () => {
      const { session } = fakeSession();
      await listMembershipsForDisplay(session);
      // A stale cache claiming more than CGS now grants.
      for (const [key] of valkey.data) {
        valkey.data.set(key, [{ groupDid: memberOf, role: "owner" }]);
      }
      expect(await canEdit(fakeSession().session, memberOf)).toBe(false);
    });
  });

  describe("group registration and member management", () => {
    it("registers a group and manages members with per-method service-auth tokens", async () => {
      vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(input, init);
        requests.push(request);
        const path = new URL(request.url).pathname;
        if (path.endsWith("group.register")) {
          return Response.json({
            groupDid: org,
            handle: "forest.certified.one",
            accountPassword: "pw",
          });
        }
        if (path.endsWith("member.list")) {
          return Response.json({
            members: [{ did: user, role: "owner", addedAt: "2026-11-01T00:00:00.000Z" }],
          });
        }
        if (path.endsWith("member.add")) {
          return Response.json({
            memberDid: memberOf,
            role: "admin",
            addedBy: user,
            addedAt: "2026-11-01T00:00:00.000Z",
          });
        }
        if (path.endsWith("role.set")) {
          return Response.json({
            memberDid: memberOf,
            role: "member",
            updatedAt: "2026-11-01T00:00:00.000Z",
          });
        }
        return Response.json({});
      });

      const { session, minted } = fakeSession();
      expect(await registerGroup(session, { handle: "forest.certified.one" })).toMatchObject({
        groupDid: org,
        handle: "forest.certified.one",
      });
      expect(await listGroupMembers(session, org)).toEqual([
        { did: user, role: "owner", addedBy: undefined, addedAt: "2026-11-01T00:00:00.000Z" },
      ]);
      await addGroupMember(session, org, memberOf, "admin");
      await setGroupMemberRole(session, org, memberOf, "member");
      await removeGroupMember(session, org, memberOf);

      expect(minted.map((url) => url.searchParams.get("lxm"))).toEqual([
        "app.certified.group.register",
        "app.certified.group.member.list",
        "app.certified.group.member.add",
        "app.certified.group.role.set",
        "app.certified.group.member.remove",
      ]);
    });

    it("caches group members for display and refreshes after forgetGroupMembers", async () => {
      vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push(new Request(input, init));
        return Response.json({
          members: [{ did: user, role: "owner", addedAt: "2026-11-01T00:00:00.000Z" }],
        });
      });

      const { session, minted } = fakeSession();
      const first = await listGroupMembersForDisplay(session, org);
      expect(await listGroupMembersForDisplay(session, org)).toEqual(first);
      expect(minted).toHaveLength(1);

      await forgetGroupMembers(org);
      await listGroupMembersForDisplay(session, org);
      expect(minted).toHaveLength(2);
    });
  });
});
