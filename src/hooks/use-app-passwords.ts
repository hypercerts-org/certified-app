"use client";

import { useState, useEffect, useCallback } from "react";
import { authFetch } from "@/lib/auth/fetch";
import type { AppPassword, CreateAppPasswordResponse, ListAppPasswordsResponse } from "@/lib/types/api";

export function useAppPasswords() {
  const [passwords, setPasswords] = useState<AppPassword[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPasswords = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await authFetch("/api/xrpc/com/atproto/server/listAppPasswords");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Failed to load app passwords");
      }
      const data: ListAppPasswordsResponse = await res.json();
      setPasswords(data.passwords ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load app passwords");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPasswords();
  }, [fetchPasswords]);

  const createPassword = useCallback(async (name: string): Promise<CreateAppPasswordResponse> => {
    const res = await authFetch("/api/xrpc/com/atproto/server/createAppPassword", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data as { error?: string }).error || "Failed to create app password");
    }
    const data: CreateAppPasswordResponse = await res.json();
    // Refresh the list
    await fetchPasswords();
    return data;
  }, [fetchPasswords]);

  const revokePassword = useCallback(async (name: string): Promise<void> => {
    const res = await authFetch("/api/xrpc/com/atproto/server/revokeAppPassword", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data as { error?: string }).error || "Failed to revoke app password");
    }
    // Refresh the list
    await fetchPasswords();
  }, [fetchPasswords]);

  return { passwords, isLoading, error, createPassword, revokePassword, refetch: fetchPasswords };
}
