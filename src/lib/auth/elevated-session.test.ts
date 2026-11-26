import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  callElevatedPds,
  endElevatedSession,
  establishElevatedSession,
  hasElevatedSession,
  verifyGroupPassword,
} from "./elevated-session";

const valkey = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  counters: new Map<string, number>(),
  down: false,
}));

const pdsMocks = vi.hoisted(() => ({
  getPdsUrl: vi.fn(async () => "https://pds.example"),
  safeFetch: vi.fn(),
}));

vi.mock("@/lib/auth/stores", () => ({
  jsonStore: (prefix: string) => ({
    get: async (key: string) => {
      if (valkey.down) throw new Error("Valkey down");
      return valkey.kv.get(prefix + key);
    },
    set: async (key: string, value: unknown) => {
      if (valkey.down) throw new Error("Valkey down");
      valkey.kv.set(prefix + key, value);
    },
    del: async (key: string) => {
      if (valkey.down) throw new Error("Valkey down");
      valkey.kv.delete(prefix + key);
    },
  }),
}));

vi.mock("@/lib/auth/valkey", () => ({
  storeKey: (k: string) => `test:${k}`,
  store: async <T>(fn: (r: unknown) => Promise<T>) => {
    if (valkey.down) throw new Error("Valkey down");
    const fakeRedis = {
      multi: () => {
        let lastKey = "";
        const api = {
          incr(key: string) {
            lastKey = key;
            valkey.counters.set(key, (valkey.counters.get(key) ?? 0) + 1);
            return api;
          },
          expire() {
            return api;
          },
          async exec() {
            return [valkey.counters.get(lastKey) ?? 0];
          },
        };
        return api;
      },
    };
    return fn(fakeRedis);
  },
}));

vi.mock("@/lib/identity", () => pdsMocks);
vi.mock("@/lib/log", () => ({ logError: () => {} }));

const alice = "did:plc:ewvi7nxzyoun6zhxrhs64oiz";
const group = "did:plc:aaaaaaaaaaaaaaaaaaaaaaaa";

describe("elevated PDS sessions", () => {
  beforeEach(() => {
    valkey.kv.clear();
    valkey.counters.clear();
    valkey.down = false;
    pdsMocks.getPdsUrl.mockResolvedValue("https://pds.example");
    pdsMocks.safeFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("refuses to store a session if the PDS returns a different DID than requested", async () => {
    pdsMocks.safeFetch.mockResolvedValueOnce(
      Response.json({ did: group, accessJwt: "acc", refreshJwt: "ref" }),
    );
    const res = await establishElevatedSession({ kind: "personal", callerDid: alice }, "secret");
    expect(res).toEqual({ status: "unavailable" });
    expect(await hasElevatedSession({ kind: "personal", callerDid: alice })).toBe(false);
  });

  it("fails closed when Valkey is down during unlock rate limiting", async () => {
    valkey.down = true;
    const res = await establishElevatedSession({ kind: "personal", callerDid: alice }, "secret");
    expect(res).toEqual({ status: "unavailable" });
    expect(pdsMocks.safeFetch).not.toHaveBeenCalled();
  });

  it("maps 2FA required, invalid code, and wrong password to distinct outcomes", async () => {
    pdsMocks.safeFetch
      .mockResolvedValueOnce(Response.json({ error: "AuthFactorTokenRequired" }, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ error: "InvalidToken" }, { status: 400 }))
      .mockResolvedValueOnce(Response.json({ error: "AuthenticationRequired" }, { status: 401 }));

    const scope = { kind: "personal" as const, callerDid: alice };
    expect(await establishElevatedSession(scope, "pw")).toEqual({ status: "twoFactorRequired" });
    expect(await establishElevatedSession(scope, "pw", "000000")).toEqual({
      status: "invalidCode",
    });
    expect(await establishElevatedSession(scope, "wrong")).toEqual({ status: "invalid" });
  });

  it("omits Content-Type and body on bodyless POST calls and refreshes once on 401", async () => {
    const scope = { kind: "personal" as const, callerDid: alice };
    pdsMocks.safeFetch.mockResolvedValueOnce(
      Response.json({ did: alice, accessJwt: "acc-1", refreshJwt: "ref-1" }),
    );
    expect(await establishElevatedSession(scope, "secret")).toEqual({ status: "ok" });

    // First call 401 -> refreshSession succeeds -> retry succeeds.
    pdsMocks.safeFetch
      .mockResolvedValueOnce(Response.json({ error: "ExpiredToken" }, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ accessJwt: "acc-2", refreshJwt: "ref-2" }))
      .mockResolvedValueOnce(Response.json({ tokenRequired: true }));

    const out = await callElevatedPds(scope, "com.atproto.server.requestEmailUpdate", {
      method: "POST",
    });
    expect(out.kind).toBe("ok");

    // Verify no Content-Type or body was sent to requestEmailUpdate.
    const [, firstInit] = pdsMocks.safeFetch.mock.calls[1] as [string, RequestInit];
    expect(firstInit.body).toBeUndefined();
    expect((firstInit.headers as Record<string, string>)["Content-Type"]).toBeUndefined();

    // Verify retry used refreshed accessJwt.
    const [, retryInit] = pdsMocks.safeFetch.mock.calls[3] as [string, RequestInit];
    expect((retryInit.headers as Record<string, string>).Authorization).toBe("Bearer acc-2");
  });

  it("revokes remote session and clears Valkey on endElevatedSession", async () => {
    const scope = { kind: "group" as const, callerDid: alice, groupDid: group };
    pdsMocks.safeFetch
      .mockResolvedValueOnce(Response.json({ did: group, accessJwt: "a", refreshJwt: "r" }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    await establishElevatedSession(scope, "group-pw");
    expect(await hasElevatedSession(scope)).toBe(true);

    await endElevatedSession(scope);
    expect(await hasElevatedSession(scope)).toBe(false);
    const [delUrl, delInit] = pdsMocks.safeFetch.mock.calls[1] as [string, RequestInit];
    expect(delUrl).toBe("https://pds.example/xrpc/com.atproto.server.deleteSession");
    expect((delInit.headers as Record<string, string>).Authorization).toBe("Bearer r");
  });

  it("verifies group password reset and cleans up the probe session", async () => {
    pdsMocks.safeFetch
      .mockResolvedValueOnce(Response.json({ did: group, accessJwt: "a", refreshJwt: "probe-ref" }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    expect(await verifyGroupPassword(group, "new-password")).toBe(true);
    expect(pdsMocks.safeFetch.mock.calls[1]?.[0]).toBe(
      "https://pds.example/xrpc/com.atproto.server.deleteSession",
    );

    // 2FA required still proves the password matches this group.
    pdsMocks.safeFetch.mockResolvedValueOnce(
      Response.json({ error: "AuthFactorTokenRequired" }, { status: 401 }),
    );
    expect(await verifyGroupPassword(group, "new-password")).toBe(true);

    // 401 without 2FA means a different account was reset.
    pdsMocks.safeFetch.mockResolvedValueOnce(
      Response.json({ error: "AuthenticationRequired" }, { status: 401 }),
    );
    expect(await verifyGroupPassword(group, "new-password")).toBe(false);
  });
});
