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

function fetchSession(): Promise<SessionData> {
  if (cachedPromise) return cachedPromise;
  cachedPromise = authFetch("/api/xrpc/com/atproto/server/getSession")
    .then((res) => (res.ok ? res.json() : null))
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

  return { handle, email, isLoading, error };
}

export function clearSessionCache(): void {
  cachedPromise = null;
  cachedResult = null;
}
