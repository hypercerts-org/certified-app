"use client"

type AuthFetchListener = () => void
let onUnauthorized: AuthFetchListener | null = null

export function setOnUnauthorized(listener: AuthFetchListener | null) {
  onUnauthorized = listener
}

/**
 * Wrapper around fetch that detects 401 responses and triggers re-authentication.
 * Use this for all /api/xrpc/ calls.
 */
export async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init)
  if (res.status === 401 && onUnauthorized) {
    onUnauthorized()
  }
  return res
}
