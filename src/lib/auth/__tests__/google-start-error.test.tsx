import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup, waitFor } from "@testing-library/react";
import React from "react";

// When Google sign-in fails to start, the message is a form error for the
// sign-in modal, not the field error that marks the email input invalid.
// The modal is stubbed to record the props AuthProvider passes it.

type ModalProps = {
  error: string | null;
  formError: string | null;
  onClearErrors: () => void;
};

const modal = vi.hoisted(() => ({ props: null as ModalProps | null }));

vi.mock("@/lib/atproto/did", () => ({
  resolvePdsUrl: vi.fn(async () => null),
}));

vi.mock("@/components/ui/sign-in-modal", () => ({
  default: (props: ModalProps) => {
    modal.props = props;
    return null;
  },
}));

vi.mock("@/components/ui/provider-redirect-overlay", () => ({
  default: () => null,
}));

import { AuthProvider, useAuth } from "@/lib/auth/auth-context";

function wrapper({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

describe("Google sign-in start failure", () => {
  beforeEach(() => {
    modal.props = null;
    vi.spyOn(console, "error").mockImplementation(() => {});
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/auth/session")) {
        return new Response(JSON.stringify({ did: null }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/api/auth/login")) {
        return new Response(JSON.stringify({ error: "Authentication failed" }), {
          status: 500,
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

  it("reopens the modal with a form error and no field error", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.submitGoogle();
    });

    expect(result.current.isModalOpen).toBe(true);
    expect(modal.props?.error).toBeNull();
    expect(modal.props?.formError).toBe(
      "Couldn't start Google sign-in. Try again, or continue with your email.",
    );

    act(() => modal.props?.onClearErrors());

    expect(modal.props?.formError).toBeNull();
  });
});
