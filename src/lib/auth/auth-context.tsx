"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import type { AuthState } from "./types";
import { resolvePdsUrl } from "@/lib/atproto/did";
import SignInModal from "@/components/ui/sign-in-modal";
import ProviderRedirectOverlay from "@/components/ui/provider-redirect-overlay";
import { setOnUnauthorized } from "./fetch";

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [did, setDid] = useState<string | null>(null);
  const [pdsUrl, setPdsUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [isRedirectingToProvider, setIsRedirectingToProvider] = useState(false);

  // Initialize auth on mount by checking server-side session
  useEffect(() => {
    const initAuth = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const res = await fetch("/api/auth/session");
        const data = await res.json() as { did: string | null };

        if (data.did) {
          setIsAuthenticated(true);
          setDid(data.did);
          const resolvedPdsUrl = await resolvePdsUrl(data.did);
          setPdsUrl(resolvedPdsUrl);
        }
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
  }, []);

  // Listen for postMessage from iframe callback (oauth-callback-complete)
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== "oauth-callback-complete") return;

      try {
        const res = await fetch("/api/auth/session");
        const data = await res.json() as { did: string | null };

        if (data.did) {
          setIsAuthenticated(true);
          setDid(data.did);
          const resolvedPdsUrl = await resolvePdsUrl(data.did);
          setPdsUrl(resolvedPdsUrl);
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
  }, []);

  // Listen for switch-provider postMessage from PDS OAuth UI iframe
  useEffect(() => {
    const handleSwitchProvider = async (event: MessageEvent) => {
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
          body: JSON.stringify({ input: input.trim(), mode: "handle" }),
        });

        if (!res.ok) {
          const data = await res.json() as { error?: string };
          throw new Error(data.error ?? "Failed to sign in with external provider");
        }

        const data = await res.json() as { url: string };
        window.location.href = data.url;
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

  const openSignIn = useCallback(() => {
    setAuthMode("sign-in");
    setError(null);
    setIsModalOpen(true);
  }, []);

  const openSignUp = useCallback(() => {
    setAuthMode("sign-up");
    setError(null);
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
      const prompt = authMode === "sign-up" ? "create" : "login";

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: email, mode: "email", prompt }),
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? "Failed to sign in");
      }

      const data = await res.json() as { url: string };
      setIsModalOpen(false);
      window.location.href = data.url;
    } catch (err) {
      console.error("Email sign-in error:", err);
      setError(err instanceof Error ? err.message : "Failed to sign in");
    }
  }, [authMode]);

  // ATProto handle sign-in: calls /api/auth/login with mode "handle" and redirects
  const submitHandle = useCallback(async (handle: string) => {
    try {
      setError(null);
      setIsRedirectingToProvider(true);
      setIsModalOpen(false);

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: handle.trim(), mode: "handle" }),
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? "Failed to sign in with that handle");
      }

      const data = await res.json() as { url: string };
      window.location.href = data.url;
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

  const value: AuthState = {
    isLoading,
    isAuthenticated,
    did,
    pdsUrl,
    error,
    isModalOpen,
    isRedirectingToProvider,
    authMode,
    openSignIn,
    openSignUp,
    closeModal,
    submitEmail,
    submitHandle,
    signOut,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
      {isRedirectingToProvider && <ProviderRedirectOverlay />}
      <SignInModal
        isOpen={isModalOpen}
        authMode={authMode}
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
