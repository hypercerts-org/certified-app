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
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authorizeUrl, setAuthorizeUrl] = useState<string | null>(null);
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

  // Listen for switch-provider postMessage from PDS OAuth UI iframe
  useEffect(() => {
    const handleSwitchProvider = async (event: MessageEvent) => {
      // Accept messages from any origin (the PDS iframe could be on any domain)
      if (event.data?.type !== "switch-provider") return;
      const input = event.data.input;
      if (!input || typeof input !== "string") return;

      // Show the full-screen overlay before closing the modal
      setIsRedirectingToProvider(true);

      // Close the iframe modal
      setIsSigningIn(false);
      setAuthorizeUrl(null);

      // Do a full-page redirect OAuth flow to the selected provider
      try {
        const client = getOAuthClient();
        const trimmedInput = input.trim();

        // If it already has a protocol, use as-is
        if (
          trimmedInput.startsWith("http://") ||
          trimmedInput.startsWith("https://")
        ) {
          await client.signIn(trimmedInput, {
            scope: "atproto transition:generic",
          });
          return;
        }

        // If it starts with did:, use as-is (it's a DID)
        if (trimmedInput.startsWith("did:")) {
          await client.signIn(trimmedInput, {
            scope: "atproto transition:generic",
          });
          return;
        }

        // Otherwise: try as handle first, fall back to hosting provider URL
        try {
          await client.signIn(trimmedInput, {
            scope: "atproto transition:generic",
          });
        } catch (handleErr) {
          // Handle resolution failed — try as a hosting provider URL
          try {
            await client.signIn("https://" + trimmedInput, {
              scope: "atproto transition:generic",
            });
          } catch {
            // Both failed — throw the handle error (more useful to the user)
            throw handleErr;
          }
        }
        // signIn does window.location.href = ... so this line is never reached
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

  // Listen for postMessage from iframe callback
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== "oauth-callback-complete") return;

      const { sub } = event.data;
      if (!sub) return;

      try {
        const client = getOAuthClient();
        const oauthSession = await client.restore(sub, false);
        const newAgent = new Agent(oauthSession);
        setSession(oauthSession);
        setAgent(newAgent);
        setDid(oauthSession.did);
        const resolvedPdsUrl = await resolvePdsUrl(oauthSession.did);
        setPdsUrl(resolvedPdsUrl);
      } catch (err) {
        console.error("Session restore error:", err);
        setError(
          err instanceof Error ? err.message : "Failed to complete sign in",
        );
      } finally {
        setIsSigningIn(false);
        setAuthorizeUrl(null);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const signIn = useCallback(async () => {
    try {
      setError(null);
      const client = getOAuthClient();
      const url = await client.authorize(PDS_URL, {
        scope: "atproto transition:generic",
        display: "page",
        prompt: "login",
      });
      setAuthMode("sign-in");
      setAuthorizeUrl(url.href);
      setIsSigningIn(true);
    } catch (err) {
      console.error("Sign in error:", err);
      setError(err instanceof Error ? err.message : "Failed to sign in");
    }
  }, []);

  const signUp = useCallback(async () => {
    try {
      setError(null);
      const client = getOAuthClient();
      const url = await client.authorize(PDS_URL, {
        scope: "atproto transition:generic",
        display: "page",
        prompt: "create",
      });
      setAuthMode("sign-up");
      setAuthorizeUrl(url.href);
      setIsSigningIn(true);
    } catch (err) {
      console.error("Sign up error:", err);
      setError(err instanceof Error ? err.message : "Failed to sign up");
    }
  }, []);

  const closeSignIn = useCallback(() => {
    setIsSigningIn(false);
    setAuthorizeUrl(null);
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
    isSigningIn,
    isRedirectingToProvider,
    authorizeUrl,
    authMode,
    signIn,
    signUp,
    signOut,
    closeSignIn,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
      {isRedirectingToProvider && <ProviderRedirectOverlay />}
      <SignInModal
        isOpen={isSigningIn}
        authorizeUrl={authorizeUrl}
        authMode={authMode}
        onClose={closeSignIn}
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
