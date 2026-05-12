import { NextResponse } from "next/server"
import { logSafe } from "./log-safe"

/**
 * Extract a usable HTTP status from an unknown caught error and emit a
 * redacted server-side log. The returned `message` is always one of a
 * small set of generic strings — we never echo `err.message` to the
 * client because the atproto SDK and group-service error payloads can
 * embed upstream URLs, handles, and incidental detail that's unsafe to
 * expose. Callers should pass `prefix` so log lines are greppable.
 *
 * Status semantics:
 *   - 4xx upstream → returned to client as-is with the matching generic
 *     message; the raw cause is logged for diagnosis.
 *   - 5xx upstream OR a non-numeric status → returned as 500 "Internal
 *     server error" to the client; raw cause logged.
 */
export function extractRouteError(
  err: unknown,
  prefix = "[route] upstream error"
): { status: number; message: string } {
  let status = 500
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>
    const raw = typeof e.status === "number"
      ? e.status
      : typeof e.statusCode === "number"
        ? e.statusCode
        : 500
    status = raw
  }
  logSafe(prefix, err, { status })
  return { status, message: genericMessageFor(status) }
}

function genericMessageFor(status: number): string {
  if (status === 400) return "Bad request"
  if (status === 401) return "Not authenticated"
  if (status === 403) return "Forbidden"
  if (status === 404) return "Not found"
  if (status === 409) return "Conflict"
  if (status === 429) return "Too many requests"
  return "Internal server error"
}

/**
 * Build a record object by copying only the allowed fields from the
 * raw request body. Prevents mass assignment by rejecting keys that
 * are not in the allowlist.
 */
export function pickAllowedFields(
  body: Record<string, unknown>,
  allowedFields: readonly string[],
  $type: string
): Record<string, unknown> {
  const record: Record<string, unknown> = { $type }
  for (const key of allowedFields) {
    if (key in body && body[key] !== undefined) {
      record[key] = body[key]
    }
  }
  return record
}

type JsonBodyResult =
  | { ok: true; body: unknown }
  | { ok: false; response: NextResponse }

/**
 * Parse `request.json()` and surface the failure in a uniform way:
 *   - logs the parse error (via logSafe so caught secrets are redacted)
 *   - returns a 400 NextResponse the caller can return directly
 *
 * Without this, every POST route silently does `await request.json()`
 * and falls into the generic catch — a malformed body is indistinguishable
 * from a missing field, which is annoying to diagnose.
 */
export async function parseJsonBody(
  request: Request,
  prefix: string,
): Promise<JsonBodyResult> {
  try {
    const body = await request.json()
    return { ok: true, body }
  } catch (err) {
    logSafe(`${prefix} invalid JSON body`, err)
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Invalid JSON in request body" },
        { status: 400 },
      ),
    }
  }
}

/**
 * Extract an error message from a failed API response.
 * Attempts to parse JSON and look for an `error` field; falls back to `fallback`.
 */
export async function extractError(
  res: Response,
  fallback: string
): Promise<string> {
  try {
    const data = (await res.json()) as { error?: unknown }
    return typeof data.error === "string" ? data.error : fallback
  } catch {
    return fallback
  }
}
