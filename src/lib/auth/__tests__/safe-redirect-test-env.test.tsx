import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, cleanup, waitFor } from "@testing-library/react";
import React from "react";

// `safeRedirect` (auth-context.tsx) is module-private, so it is exercised
// through the public `submitEmail` flow on `AuthProvider`, which calls
// `safeRedirect(data.url)` with the URL returned by /api/auth/login.
//
// The defect: the http: allowance was gated on NODE_ENV === "development"
// while the rest of the module gates on NODE_ENV !== "production". Under
// vitest, NODE_ENV === "test", so an http: loopback redirect URL was
// rejected ("Invalid redirect URL") even though http should be permitted
// outside production. After the fix (NODE_ENV !== "production") the http:
// redirect is allowed in the test environment.
//
// Heavy dependencies that AuthProvider pulls in but that are not under
// test are stubbed to inert defaults so the provider mounts cleanly.

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

const HTTP_REDIRECT = "http://127.0.0.1:9999/oauth/authorize?x=1";

// Child that exposes the auth context to the test harness.
let captured: ReturnType<typeof useAuth> | null = null;
function Capture() {
  captured = useAuth();
  return null;
}

describe("safeRedirect http allowance under NODE_ENV=test", () => {
  let hrefSetTo: string | null;

  beforeEach(() => {
    // Sanity: the whole point of this test is the test-env case.
    expect(process.env.NODE_ENV).toBe("test");

    hrefSetTo = null;
    captured = null;

    // Capture writes to window.location.href without navigating jsdom.
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        origin: "http://localhost",
        href: "http://localhost/",
        assign: vi.fn(),
      },
    });
    Object.defineProperty(window.location, "href", {
      configurable: true,
      get: () => "http://localhost/",
      set: (v: string) => {
        hrefSetTo = v;
      },
    });

    // Mount path fetches /api/auth/session; login path fetches /api/auth/login.
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/auth/session")) {
        return new Response(JSON.stringify({ did: null }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/api/auth/login")) {
        return new Response(JSON.stringify({ url: HTTP_REDIRECT }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("permits an http: redirect URL (no 'Invalid redirect URL' error)", async () => {
    render(
      <AuthProvider>
        <Capture />
      </AuthProvider>,
    );

    // Wait for the mount-time refreshSession to settle.
    await waitFor(() => {
      expect(captured).not.toBeNull();
      expect(captured!.isLoading).toBe(false);
    });

    await act(async () => {
      await captured!.submitEmail("user@example.com");
    });

    // After the fix: http: is allowed under NODE_ENV=test, so the redirect
    // is performed and no error is surfaced.
    expect(hrefSetTo).toBe(HTTP_REDIRECT);
    expect(captured!.error).toBeNull();
  });
});
