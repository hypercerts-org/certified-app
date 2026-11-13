import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup, waitFor } from "@testing-library/react";
import React from "react";

// "Sign in with another account" must not take the silent-default bounce:
// with a PDS session already in the browser that bounce returns a code at
// once and signs the same account back in. It asks with `prompt: "login"`;
// plain "Sign in" keeps the silent bounce.

vi.mock("@/lib/atproto/did", () => ({
  resolvePdsUrl: vi.fn(async () => null),
}));

vi.mock("@/components/ui/sign-in-modal", () => ({
  default: () => null,
}));

vi.mock("@/components/ui/provider-redirect-overlay", () => ({
  default: () => null,
}));

import { AuthProvider, useAuth } from "@/lib/auth/auth-context";

function wrapper({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

const loginBodies: unknown[] = [];

function mockFetch() {
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/auth/session")) {
      return new Response(JSON.stringify({ did: "did:plc:me" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("/api/auth/login")) {
      loginBodies.push(JSON.parse(String(init?.body ?? "{}")));
      // A failed start keeps the test away from window.location.
      return new Response(JSON.stringify({ error: "nope" }), { status: 500 });
    }
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;
}

async function mountAuth() {
  const rendered = renderHook(() => useAuth(), { wrapper });
  await waitFor(() => {
    expect(rendered.result.current.isLoading).toBe(false);
  });
  return rendered;
}

describe("sign in with another account", () => {
  beforeEach(() => {
    loginBodies.length = 0;
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetch();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("asks the PDS who is signing in (prompt: login)", async () => {
    const { result } = await mountAuth();
    await act(async () => {
      await result.current.openSignInAnotherAccount();
    });
    expect(loginBodies).toEqual([{ mode: "default", prompt: "login" }]);
  });

  it("keeps the silent bounce for plain Sign in", async () => {
    const { result } = await mountAuth();
    await act(async () => {
      await result.current.openSignIn();
    });
    expect(loginBodies).toEqual([{ mode: "default" }]);
  });
});
