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
import { clearAllDraftsForViewer } from "@/lib/utils/swap-drafts";
import { clearSessionCache, peekSessionHandle } from "@/hooks/use-session";
import {
  recordPreSigninLocation,
  resolvePostSigninPath,
} from "./post-signin";

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
        // Route the user back to where they were before sign-in. The
        // `/profile/<old-handle>` segment (if present in the saved
        // path) gets rewritten to the new identity's DID so the URL
        // resolves to the new viewer rather than rendering blank
        // panels (e.g. the settings tab, gated on isViewerThisEntity).
        const newSub = typeof event.data?.sub === "string" ? event.data.sub : null;
        const target = resolvePostSigninPath(newSub);
        if (target && target !== "/") {
          window.location.assign(target);
        }
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

  // Shared logic: handle the login API response (restored session or redirect URL)
  const handleLoginResponse = useCallback(async (res: Response) => {
    if (!res.ok) {
      const data = await res.json() as { error?: string };
      throw new Error(data.error ?? "Failed to sign in");
    }
    const data = await res.json() as { restored?: boolean; url?: string; did?: string };
    if (data.restored && data.did) {
      setIsRedirectingToProvider(false);
      await refreshSession();
    } else if (data.url) {
      safeRedirect(data.url);
    } else {
      throw new Error("Unexpected login response");
    }
  }, [refreshSession]);

  // Listen for switch-provider postMessage from PDS OAuth UI iframe
  useEffect(() => {
    const handleSwitchProvider = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== "switch-provider") return;
      const input = event.data.input;
      if (!input || typeof input !== "string") return;

      setIsRedirectingToProvider(true);
      setIsModalOpen(false);

      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input: sanitizeHandle(input), mode: "handle" }),
        });
        await handleLoginResponse(res);
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
  }, [handleLoginResponse]);

  // Silent-default OAuth bounce: POST to /api/auth/login with no email
  // or handle. The server calls client.authorize(PDS_URL, ...) without
  // a login_hint, so the PDS's authorization server can return a code
  // immediately if the browser already has a session at the PDS (e.g.
  // from another partner app). Otherwise it shows its own login UI.
  // On any failure we fall back to opening the modal so the user can
  // still type an email or handle by hand.
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
      await handleLoginResponse(res);
    } catch (err) {
      console.error("Default sign-in error:", err);
      setIsRedirectingToProvider(false);
      setError(err instanceof Error ? err.message : "Failed to sign in");
      setIsModalOpen(true);
    }
  }, [handleLoginResponse]);

  const openSignIn = useCallback(async () => {
    // Stash the current pathname + handle so the post-signin handler
    // (iframe message OR `/oauth/callback` redirect) can put the user
    // back where they were instead of dropping them at `/`. Reading
    // the handle synchronously via the use-session cache avoids
    // having to thread it through every call site.
    recordPreSigninLocation(peekSessionHandle());
    await submitDefault();
  }, [submitDefault]);

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
      await handleLoginResponse(res);
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
  }, [handleLoginResponse]);

  const signOut = useCallback(async () => {
    // Clear local state immediately (optimistic sign-out).
    // Server-side session cleanup is best-effort; the client should always
    // clear its local state even if the fetch throws.
    clearSessionCache();
    // Purge any same-field-conflict drafts the viewer left in
    // localStorage (issue #71). Without this, a different user
    // signing in on the same browser would see the previous
    // viewer's pending drafts on the "Restore draft" affordance.
    const previousDid = did;
    if (previousDid) {
      clearAllDraftsForViewer(previousDid);
    }
    setIsAuthenticated(false);
    setDid(null);
    setPdsUrl(null);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch (err) {
      console.error("Sign out error (server-side cleanup failed):", err);
      // Local state already cleared — user is signed out client-side.
    }
  }, [did]);

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
    closeModal,
    submitEmail,
    submitHandle,
    signOut,
  }), [isLoading, isAuthenticated, did, pdsUrl, error, isModalOpen, isRedirectingToProvider, openSignIn, closeModal, submitEmail, submitHandle, signOut]);

  return (
    <AuthContext.Provider value={value}>
      {children}
      {isRedirectingToProvider && <ProviderRedirectOverlay />}
      <SignInModal
        isOpen={isModalOpen}
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
