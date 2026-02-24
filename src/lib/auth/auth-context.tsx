"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { Agent } from "@atproto/api";
import type { OAuthSession } from "@atproto/oauth-client-browser";
import { getOAuthClient } from "./oauth-client";
import type { AuthState } from "./types";
import { resolvePdsUrl } from "@/lib/atproto/did";
import SignInModal from "@/components/ui/sign-in-modal";
import ProviderRedirectOverlay from "@/components/ui/provider-redirect-overlay";

const AuthContext = createContext<AuthState | undefined>(undefined);

const PDS_URL = process.env.NEXT_PUBLIC_PDS_URL || "https://otp.certs.network";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState<OAuthSession | null>(null);
  const [agent, setAgent] = useState<Agent | null>(null);
  const [did, setDid] = useState<string | null>(null);
  const [pdsUrl, setPdsUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [isRedirectingToProvider, setIsRedirectingToProvider] = useState(false);

  // Initialize auth on mount
  useEffect(() => {
    const initAuth = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const client = getOAuthClient();
        const result = await client.init();

        if (result?.session) {
          const newAgent = new Agent(result.session);
          setSession(result.session);
          setAgent(newAgent);
          setDid(result.session.did);
          const resolvedPdsUrl = await resolvePdsUrl(result.session.did);
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

  // Flow 1: Submit email to ePDS with login_hint on the redirect URL
  const submitEmail = useCallback(async (email: string) => {
    try {
      setError(null);
      const client = getOAuthClient();
      const prompt = authMode === "sign-up" ? "create" : "login";
      const url = await client.authorize(PDS_URL, {
        scope: "atproto transition:generic",
        display: "page",
        prompt,
      });
      // Append login_hint to the authorize URL (NOT the PAR body)
      // This tells the ePDS auth server to skip the email form and go straight to OTP
      url.searchParams.set("login_hint", email);
      setIsModalOpen(false);
      window.location.href = url.href;
    } catch (err) {
      console.error("Email sign-in error:", err);
      setError(err instanceof Error ? err.message : "Failed to sign in");
    }
  }, [authMode]);

  // ATProto handle sign-in: resolve the handle and redirect to that provider
  const submitHandle = useCallback(async (handle: string) => {
    try {
      setError(null);
      setIsRedirectingToProvider(true);
      setIsModalOpen(false);
      const client = getOAuthClient();
      const trimmedHandle = handle.trim();

      // Try as handle first, then as URL
      if (
        trimmedHandle.startsWith("http://") ||
        trimmedHandle.startsWith("https://")
      ) {
        await client.signIn(trimmedHandle, {
          scope: "atproto transition:generic",
        });
        return;
      }

      if (trimmedHandle.startsWith("did:")) {
        await client.signIn(trimmedHandle, {
          scope: "atproto transition:generic",
        });
        return;
      }

      try {
        await client.signIn(trimmedHandle, {
          scope: "atproto transition:generic",
        });
      } catch (handleErr) {
        try {
          await client.signIn("https://" + trimmedHandle, {
            scope: "atproto transition:generic",
          });
        } catch {
          throw handleErr;
        }
      }
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
    try {
      setError(null);
      if (session) {
        await session.signOut();
      }
      setSession(null);
      setAgent(null);
      setDid(null);
      setPdsUrl(null);
    } catch (err) {
      console.error("Sign out error:", err);
      setError(err instanceof Error ? err.message : "Failed to sign out");
    }
  }, [session]);

  const value: AuthState = {
    isLoading,
    session,
    agent,
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
