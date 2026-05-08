"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import type { AuthState } from "./types";
import { resolvePdsUrl } from "@/lib/atproto/did";
import { sanitizeEmail, sanitizeHandle } from "@/lib/utils/sanitize";
import SignInModal from "@/components/ui/sign-in-modal";
import ProviderRedirectOverlay from "@/components/ui/provider-redirect-overlay";
import { setOnUnauthorized } from "./fetch";
import { clearSessionCache } from "@/hooks/use-session";

/**
 * Validate and navigate to a URL returned by the auth API.
 * Only allows https: URLs (and http: in development). Prevents protocol injection.
 * Note: this intentionally allows cross-origin redirects because the OAuth flow
 * redirects to external PDS authorization servers.
 */
const safeRedirect = (url: string) => {
  const parsed = new URL(url);
  const allowHttp = process.env.NODE_ENV === "development";
  if (parsed.protocol !== "https:" && !(allowHttp && parsed.protocol === "http:")) {
    throw new Error("Invalid redirect URL");
  }
  window.location.href = parsed.href;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [did, setDid] = useState<string | null>(null);
  const [pdsUrl, setPdsUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalInitialView, setModalInitialView] = useState<"certified" | "atproto">("certified");
  const [isRedirectingToProvider, setIsRedirectingToProvider] = useState(false);

  // Shared session fetch — used by both init and OAuth callback
  const refreshSession = useCallback(async () => {
    const res = await fetch("/api/auth/session");
    if (!res.ok) {
      setIsAuthenticated(false);
      setDid(null);
      setPdsUrl(null);
      return;
    }
    const data = await res.json() as { did: string | null };
    if (data.did) {
      setIsAuthenticated(true);
      setDid(data.did);
      setPdsUrl(null); // Clear stale PDS URL before resolving new one
      const resolvedPdsUrl = await resolvePdsUrl(data.did);
      setPdsUrl(resolvedPdsUrl);
    } else {
      setIsAuthenticated(false);
      setDid(null);
      setPdsUrl(null);
    }
  }, []);

  // Initialize auth on mount by checking server-side session
  useEffect(() => {
    const initAuth = async () => {
      try {
        setIsLoading(true);
        setError(null);
        await refreshSession();
      } catch (err) {
        console.error("Auth initialization error:", err);
        setError(
          err instanceof Error ? err.message : "Failed to initialize auth",
        );
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, [refreshSession]);

  // Listen for postMessage from iframe callback (oauth-callback-complete)
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== "oauth-callback-complete") return;

      try {
        await refreshSession();
      } catch (err) {
        console.error("Session refresh error:", err);
        setError(
          err instanceof Error ? err.message : "Failed to complete sign in",
        );
      } finally {
        setIsModalOpen(false);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [refreshSession]);

  // Listen for switch-provider postMessage from PDS OAuth UI iframe
  useEffect(() => {
    const handleSwitchProvider = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== "switch-provider") return;
      const input = event.data.input;
      if (!input || typeof input !== "string") return;

      // Show the full-screen overlay before closing the modal
      setIsRedirectingToProvider(true);
      setIsModalOpen(false);

      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input: sanitizeHandle(input), mode: "handle" }),
        });

        if (!res.ok) {
          const data = await res.json() as { error?: string };
          throw new Error(data.error ?? "Failed to sign in with external provider");
        }

        const data = await res.json() as { url: string };
        safeRedirect(data.url);
      } catch (err) {
        console.error("External provider sign-in error:", err);
        setIsRedirectingToProvider(false);
        setError(
          err instanceof Error
            ? err.message
            : "Failed to sign in with external provider",
        );
      }
    };

    window.addEventListener("message", handleSwitchProvider);
    return () => window.removeEventListener("message", handleSwitchProvider);
  }, []);

  // Trigger the default Certified-PDS OAuth flow with no login_hint.
  // If the PDS has an active session for this browser (e.g. from another partner
  // app), this returns silently with a code; otherwise the PDS shows its own UI.
  const submitDefault = useCallback(async () => {
    try {
      setError(null);
      setIsRedirectingToProvider(true);
      setIsModalOpen(false);

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "default" }),
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? "Failed to sign in");
      }

      const data = await res.json() as { url: string };
      safeRedirect(data.url);
    } catch (err) {
      console.error("Default sign-in error:", err);
      // Hide the redirect overlay and fall back to the modal so the user can
      // try email or an ATProto handle manually.
      setIsRedirectingToProvider(false);
      setError(err instanceof Error ? err.message : "Failed to sign in");
      setIsModalOpen(true);
    }
  }, []);

  // Primary public entry point. Triggers the silent-default flow above.
  const openSignIn = useCallback(async () => {
    await submitDefault();
  }, [submitDefault]);

  // Manual fallback — opens the modal so the user can pick email or a handle.
  const openSignInModal = useCallback((view: "certified" | "atproto" = "certified") => {
    setError(null);
    setModalInitialView(view);
    setIsModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    setError(null);
  }, []);

  // Flow 1: Submit email — calls /api/auth/login with mode "email" and redirects
  const submitEmail = useCallback(async (email: string) => {
    try {
      setError(null);
      // Show loading overlay immediately while we fetch the auth URL
      setIsRedirectingToProvider(true);
      setIsModalOpen(false);

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: sanitizeEmail(email), mode: "email" }),
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? "Failed to sign in");
      }

      const data = await res.json() as { url: string };
      safeRedirect(data.url);
    } catch (err) {
      console.error("Email sign-in error:", err);
      setIsRedirectingToProvider(false);
      setIsModalOpen(true);
      setError(err instanceof Error ? err.message : "Failed to sign in");
    }
  }, []);

  // ATProto handle sign-in: calls /api/auth/login with mode "handle" and redirects
  const submitHandle = useCallback(async (handle: string) => {
    try {
      setError(null);
      setIsRedirectingToProvider(true);
      setIsModalOpen(false);

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: sanitizeHandle(handle), mode: "handle" }),
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? "Failed to sign in with that handle");
      }

      const data = await res.json() as { url: string };
      safeRedirect(data.url);
    } catch (err) {
      console.error("Handle sign-in error:", err);
      setIsRedirectingToProvider(false);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to sign in with that handle",
      );
      setIsModalOpen(true);
    }
  }, []);

  const signOut = useCallback(async () => {
    // Clear local state immediately (optimistic sign-out).
    // Server-side session cleanup is best-effort; the client should always
    // clear its local state even if the fetch throws.
    clearSessionCache();
    setIsAuthenticated(false);
    setDid(null);
    setPdsUrl(null);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch (err) {
      console.error("Sign out error (server-side cleanup failed):", err);
      // Local state already cleared — user is signed out client-side.
    }
  }, []);

  // Register the 401 interceptor so authFetch can clear auth state on session expiry
  useEffect(() => {
    setOnUnauthorized(() => {
      // Clear auth state — user needs to sign in again
      setIsAuthenticated(false);
      setDid(null);
      setPdsUrl(null);
      setError("Your session has expired. Please sign in again.");
    });
    return () => setOnUnauthorized(null);
  }, []);

  const value = useMemo<AuthState>(() => ({
    isLoading,
    isAuthenticated,
    did,
    pdsUrl,
    error,
    isModalOpen,
    isRedirectingToProvider,
    openSignIn,
    openSignInModal,
    closeModal,
    submitEmail,
    submitHandle,
    signOut,
  }), [isLoading, isAuthenticated, did, pdsUrl, error, isModalOpen, isRedirectingToProvider, openSignIn, openSignInModal, closeModal, submitEmail, submitHandle, signOut]);

  return (
    <AuthContext.Provider value={value}>
      {children}
      {isRedirectingToProvider && <ProviderRedirectOverlay />}
      <SignInModal
        isOpen={isModalOpen}
        initialView={modalInitialView}
        error={error}
        onClose={closeModal}
        onSubmitEmail={submitEmail}
        onSubmitHandle={submitHandle}
      />
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
