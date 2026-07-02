"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { authFetch } from "@/lib/auth/fetch";

interface SessionData {
  handle: string | null;
  email: string | null;
}

// Module-level cache: one promise shared across all hook instances
let cachedPromise: Promise<SessionData> | null = null;
let cachedResult: SessionData | null = null;

// Subscribers re-sync when the cached session is patched in place (e.g. after
// an email change) so already-mounted readers update without a remount or a
// full refetch.
const listeners = new Set<() => void>();
function notifySessionListeners(): void {
  for (const listener of listeners) listener();
}

/**
 * Patch the cached session email in place and notify readers. Call after an
 * email change / confirmation so `useSession` consumers reflect the new
 * address immediately, instead of showing the pre-change one until a hard
 * refresh clears the cache.
 */
export function updateCachedSessionEmail(email: string): void {
  if (!cachedResult) return;
  cachedResult = { ...cachedResult, email };
  notifySessionListeners();
}

function fetchSession(): Promise<SessionData> {
  if (cachedPromise) return cachedPromise;
  cachedPromise = authFetch("/api/xrpc/com/atproto/server/getSession")
    .then((res) => {
      // Treat a non-OK status (500/503/401/…) like a network error: throw
      // so the .catch below resets cachedPromise (and does NOT cache the
      // null result), letting the next mount retry once the endpoint
      // recovers. Returning null here would pin cachedResult to
      // {null,null} for the life of the page.
      if (!res.ok) throw new Error(`getSession failed: ${res.status}`);
      return res.json();
    })
    .then((data: { handle?: string; email?: string } | null) => {
      const result: SessionData = {
        handle: data?.handle ?? null,
        email: data?.email ?? null,
      };
      cachedResult = result;
      return result;
    })
    .catch(() => {
      // Reset promise on error so a future mount can retry
      cachedPromise = null;
      return { handle: null, email: null };
    });
  return cachedPromise;
}

/**
 * Synchronous read of the cached session handle, if any. Used by the
 * sign-in flow to stash the old identity's handle before opening the
 * OAuth modal so the post-signin redirect can rewrite `/profile/<old>`
 * URLs to the new identity. Returns `null` until `useSession` (or
 * something else that has hit `/api/xrpc/com/atproto/server/getSession`)
 * has populated the cache.
 */
export function peekSessionHandle(): string | null {
  return cachedResult?.handle ?? null
}

export function useSession(): {
  handle: string | null;
  email: string | null;
  isLoading: boolean;
  error: string | null;
} {
  const { isAuthenticated } = useAuth();

  const [handle, setHandle] = useState<string | null>(
    isAuthenticated ? (cachedResult?.handle ?? null) : null
  );
  const [email, setEmail] = useState<string | null>(
    isAuthenticated ? (cachedResult?.email ?? null) : null
  );
  // Start as true when authenticated (spec requirement), false otherwise
  const [isLoading, setIsLoading] = useState<boolean>(
    isAuthenticated && cachedResult === null
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      cachedPromise = null;
      cachedResult = null;
      // Without these, long-lived components that mounted while
      // signed in keep returning the previous user's handle/email
      // after sign-out — the initial-state expressions at the top
      // of the hook only gate on `isAuthenticated` for FRESH mounts,
      // not existing ones.
      setHandle(null);
      setEmail(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    // Already have a cached result — use it immediately
    if (cachedResult) {
      setHandle(cachedResult.handle);
      setEmail(cachedResult.email);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    fetchSession()
      .then((data) => {
        setHandle(data.handle);
        setEmail(data.email);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to fetch session");
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [isAuthenticated]);

  // Re-sync when the cached session is patched in place (email change /
  // confirm) so this reader updates without needing to remount or refetch.
  useEffect(() => {
    const sync = () => {
      if (!cachedResult) return;
      setHandle(cachedResult.handle);
      setEmail(cachedResult.email);
    };
    listeners.add(sync);
    return () => {
      listeners.delete(sync);
    };
  }, []);

  return { handle, email, isLoading, error };
}

export function clearSessionCache(): void {
  cachedPromise = null;
  cachedResult = null;
}
