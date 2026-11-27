// Shared cache headers and 503 error responses for internal GET Route Handlers.
// Every GET route uses `PUBLIC_CACHE_HEADERS` for public index reads or
// `PRIVATE_NO_STORE_HEADERS` for viewer-specific data, and wraps upstream calls
// with `apiUnavailable` so failures never leak stack traces or get CDN-cached.

import { SessionUnavailableError } from "@/lib/auth/dal";
import { logError } from "@/lib/log";

/** Brief CDN caching for public read-only JSON API routes. */
export const PUBLIC_CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=60, stale-while-revalidate=600",
} as const;

/** Private, uncached headers for per-viewer API routes and error responses. */
export const PRIVATE_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
} as const;

/**
 * Logs an unexpected API route failure (skipping expected session-store outages
 * already logged by the DAL) and returns an uncached 503 JSON response.
 */
export function apiUnavailable(
  prefix: string,
  err: unknown,
  options?: {
    error?: string;
    context?: Record<string, unknown>;
    headers?: HeadersInit;
  },
): Response {
  if (!(err instanceof SessionUnavailableError)) {
    logError(prefix, err, options?.context);
  }
  return Response.json(
    { error: options?.error ?? "Unavailable" },
    { status: 503, headers: options?.headers ?? PRIVATE_NO_STORE_HEADERS },
  );
}
