import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup, waitFor } from "@testing-library/react";
import React from "react";

// Guards on the /api/auth/login response handling. A platform-level outage
// (Vercel 502/504) returns HTML, not JSON, so the error branches must not
// surface a raw `Unexpected token '<'...` SyntaxError to the sign-in modal;
// and a 200 body without a `url` must read as "Unexpected login response"
// rather than reaching `new URL(undefined)`.
//
// Setup mirrors safe-redirect-test-env.test.tsx: heavy AuthProvider
// dependencies not under test are stubbed to inert defaults.

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

function mockLogin(response: Response) {
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/auth/session")) {
      return new Response(JSON.stringify({ did: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("/api/auth/login")) {
      return response.clone();
    }
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;
}

const htmlBadGateway = () =>
  new Response("<html><body>Bad Gateway</body></html>", {
    status: 502,
    headers: { "Content-Type": "text/html" },
  });

async function mountAuth() {
  const rendered = renderHook(() => useAuth(), { wrapper });
  await waitFor(() => {
    expect(rendered.result.current.isLoading).toBe(false);
  });
  return rendered;
}

describe("login response guards", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("submitEmail surfaces a usable message on a non-JSON 502 body", async () => {
    mockLogin(htmlBadGateway());
    const { result } = await mountAuth();

    await act(async () => {
      await result.current.submitEmail("user@example.com");
    });

    expect(result.current.error).toBe("Failed to sign in");
  });

  it("submitHandle (handleLoginResponse) surfaces a usable message on a non-JSON 502 body", async () => {
    mockLogin(htmlBadGateway());
    const { result } = await mountAuth();

    await act(async () => {
      await result.current.submitHandle("alice.example.com");
    });

    expect(result.current.error).toBe("Failed to sign in");
  });

  it("submitEmail rejects a 200 body without a url instead of redirecting", async () => {
    mockLogin(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const { result } = await mountAuth();

    await act(async () => {
      await result.current.submitEmail("user@example.com");
    });

    expect(result.current.error).toBe("Unexpected login response");
  });

  it("still surfaces the server-provided error from a JSON error body", async () => {
    mockLogin(
      new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const { result } = await mountAuth();

    await act(async () => {
      await result.current.submitEmail("user@example.com");
    });

    expect(result.current.error).toBe("Rate limit exceeded");
  });
});
